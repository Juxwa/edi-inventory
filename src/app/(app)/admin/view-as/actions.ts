"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { getBackendAdminUser } from "@/lib/backend-admin";
import {
  VIEW_AS_COOKIE,
  encodeViewAs,
  isViewAsRole,
  parseBranchId,
} from "@/lib/view-as";

// Setting the cookie is itself a privileged action, so the session — not the
// cookie already on the request — is re-verified here. The cookie only ever
// carries a role literal from the closed union plus an optional uuid; nothing
// downstream trusts it beyond that (see @/lib/view-as).
export async function setViewAs(formData: FormData): Promise<void> {
  if (!(await getBackendAdminUser())) return;

  const role = formData.get("role");
  if (typeof role !== "string" || !isViewAsRole(role)) return;
  const branchId = parseBranchId(formData.get("branch_id"));

  const cookieStore = await cookies();
  cookieStore.set(VIEW_AS_COOKIE, encodeViewAs(role, branchId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });

  revalidatePath("/", "layout");
}

// Unguarded on purpose: clearing only ever restores the real profile, so the
// escape hatch must work even if the env var or profile row is in a bad state.
export async function clearViewAs(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(VIEW_AS_COOKIE);
  revalidatePath("/", "layout");
}
