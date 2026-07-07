"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/supabase/profile";
import {
  createRequestSchema,
  updateAdminNotesSchema,
  serveRequestSchema,
  type RequestActionState,
  type RequestLineInput,
} from "@/lib/validators/request";

function firstIssueMessage(issues: { message: string }[]): string {
  return issues[0]?.message ?? "Invalid input.";
}

type PostgresErrorLike = { message?: string } | null;

function rpcErrorMessage(error: PostgresErrorLike, fallback: string): string {
  if (error && typeof error.message === "string" && error.message.length > 0) {
    return error.message;
  }
  return fallback;
}

export async function createRequest(
  _prevState: RequestActionState,
  formData: FormData,
): Promise<RequestActionState> {
  const parsed = createRequestSchema.safeParse({
    requesting_branch_id: formData.get("requesting_branch_id"),
    notes: formData.get("notes"),
    lines: formData.get("lines"),
  });

  if (!parsed.success) {
    return { ok: false, error: firstIssueMessage(parsed.error.issues) };
  }

  const profile = await getProfile();
  if (!profile) {
    return { ok: false, error: "Not signed in." };
  }

  const supabase = await createClient();

  const { data: request, error: requestError } = await supabase
    .from("inventory_requests")
    .insert({
      requesting_branch_id: parsed.data.requesting_branch_id,
      requested_by: profile.id,
      notes: parsed.data.notes,
      status: "pending",
    })
    .select("id")
    .single();

  if (requestError || !request) {
    return { ok: false, error: "Could not create request." };
  }

  const lineRows = parsed.data.lines.map((line: RequestLineInput) => ({
    request_id: request.id,
    product_id: line.product_id,
    quantity: line.quantity,
  }));

  const { error: linesError } = await supabase
    .from("request_line_items")
    .insert(lineRows);

  if (linesError) {
    return { ok: false, error: "Could not save request lines." };
  }

  revalidatePath("/requests");
  redirect("/requests");
}

export async function updateAdminNotes(
  _prevState: RequestActionState,
  formData: FormData,
): Promise<RequestActionState> {
  const parsed = updateAdminNotesSchema.safeParse({
    request_id: formData.get("request_id"),
    admin_notes: formData.get("admin_notes"),
  });

  if (!parsed.success) {
    return { ok: false, error: firstIssueMessage(parsed.error.issues) };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("inventory_requests")
    .update({ admin_notes: parsed.data.admin_notes, updated_at: new Date().toISOString() })
    .eq("id", parsed.data.request_id);

  if (error) {
    return { ok: false, error: "Could not save admin notes." };
  }

  revalidatePath("/requests");
  return { ok: true };
}

export async function serveRequest(
  _prevState: RequestActionState,
  formData: FormData,
): Promise<RequestActionState> {
  const parsed = serveRequestSchema.safeParse({
    request_id: formData.get("request_id"),
    from_branch_id: formData.get("from_branch_id"),
  });

  if (!parsed.success) {
    return { ok: false, error: firstIssueMessage(parsed.error.issues) };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("request_serve", {
    p_request_id: parsed.data.request_id,
    p_from_branch_id: parsed.data.from_branch_id,
  });

  if (error || typeof data !== "string") {
    return { ok: false, error: rpcErrorMessage(error, "Could not serve request.") };
  }

  revalidatePath("/requests");
  redirect(`/transfers/${data}`);
}
