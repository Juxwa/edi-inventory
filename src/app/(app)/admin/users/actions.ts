"use server";

import { revalidatePath } from "next/cache";
import { getProfile } from "@/lib/supabase/profile";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  inviteUserSchema,
  updateUserSchema,
  setActiveSchema,
  type UserActionState,
} from "@/lib/validators/user";

function firstIssueMessage(issues: { message: string }[]): string {
  return issues[0]?.message ?? "Invalid input.";
}

// Every action re-verifies admin server-side before touching the
// service-role client — never trust the page-level gate alone.
async function requireAdmin(): Promise<UserActionState | null> {
  const profile = await getProfile();
  if (!profile || profile.role !== "admin" || !profile.is_active) {
    return { ok: false, error: "Not authorized." };
  }
  return null;
}

function siteUrl(): string {
  return process.env.SITE_URL ?? "http://localhost:3000";
}

export async function inviteUser(
  _prevState: UserActionState,
  formData: FormData,
): Promise<UserActionState> {
  const denied = await requireAdmin();
  if (denied) return denied;

  const parsed = inviteUserSchema.safeParse({
    email: formData.get("email"),
    name: formData.get("name"),
    role: formData.get("role"),
    branch_id: formData.get("branch_id"),
  });
  if (!parsed.success) {
    return { ok: false, error: firstIssueMessage(parsed.error.issues) };
  }

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.inviteUserByEmail(
    parsed.data.email,
    { redirectTo: `${siteUrl()}/reset-password` },
  );
  if (error || !data.user) {
    return { ok: false, error: error?.message ?? "Could not invite user." };
  }

  const { error: profileError } = await admin.from("profiles").upsert({
    id: data.user.id,
    name: parsed.data.name,
    role: parsed.data.role,
    branch_id: parsed.data.branch_id,
    is_active: true,
  });
  if (profileError) {
    return { ok: false, error: profileError.message };
  }

  revalidatePath("/admin/users");
  return { ok: true };
}

export async function updateUserProfile(
  _prevState: UserActionState,
  formData: FormData,
): Promise<UserActionState> {
  const denied = await requireAdmin();
  if (denied) return denied;

  const parsed = updateUserSchema.safeParse({
    user_id: formData.get("user_id"),
    name: formData.get("name"),
    role: formData.get("role"),
    branch_id: formData.get("branch_id"),
  });
  if (!parsed.success) {
    return { ok: false, error: firstIssueMessage(parsed.error.issues) };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({
      name: parsed.data.name,
      role: parsed.data.role,
      branch_id: parsed.data.branch_id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", parsed.data.user_id);
  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/admin/users");
  return { ok: true };
}

export async function setUserActive(
  _prevState: UserActionState,
  formData: FormData,
): Promise<UserActionState> {
  const denied = await requireAdmin();
  if (denied) return denied;

  const parsed = setActiveSchema.safeParse({
    user_id: formData.get("user_id"),
    active: formData.get("active"),
  });
  if (!parsed.success) {
    return { ok: false, error: firstIssueMessage(parsed.error.issues) };
  }

  const profile = await getProfile();
  if (profile && profile.id === parsed.data.user_id && !parsed.data.active) {
    return { ok: false, error: "You cannot deactivate your own account." };
  }

  const admin = createAdminClient();
  // Ban blocks sign-in AND token refresh, bounding a live session's lifetime.
  const { error: banError } = await admin.auth.admin.updateUserById(
    parsed.data.user_id,
    { ban_duration: parsed.data.active ? "none" : "876000h" },
  );
  if (banError) {
    return { ok: false, error: banError.message };
  }

  const { error } = await admin
    .from("profiles")
    .update({
      is_active: parsed.data.active,
      updated_at: new Date().toISOString(),
    })
    .eq("id", parsed.data.user_id);
  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/admin/users");
  return { ok: true };
}
