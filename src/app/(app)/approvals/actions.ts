"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/supabase/profile";
import {
  requestSaleVoidSchema,
  requestSaleReturnSchema,
  decideRequestSchema,
  cancelRequestSchema,
  type RequestActionState,
} from "@/lib/validators/correction-request";

function firstIssueMessage(issues: { message: string }[]): string {
  return issues[0]?.message ?? "Invalid input.";
}

type PostgresErrorLike = { message?: string } | null;

// The RPC exception text is the useful part ("a void request is already
// pending for this sale", "only the HQ supervisor can decide this request")
// — surface it verbatim.
function rpcErrorMessage(error: PostgresErrorLike, fallback: string): string {
  if (error && typeof error.message === "string" && error.message.length > 0) {
    return error.message;
  }
  return fallback;
}

// Files a request to void a whole sale. Nothing changes on the sale until
// head office approves it (correction_request_decide). Every authorization
// rule lives in the RPC; the checks here only save a round trip.
export async function requestSaleVoid(
  _prevState: RequestActionState,
  formData: FormData,
): Promise<RequestActionState> {
  const parsed = requestSaleVoidSchema.safeParse({
    sale_id: formData.get("sale_id"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) {
    return { ok: false, error: firstIssueMessage(parsed.error.issues) };
  }

  const profile = await getProfile();
  if (!profile || !profile.is_active) {
    return { ok: false, error: "Not authenticated." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("correction_request_create", {
    p_kind: "sale_void",
    p_sale_id: parsed.data.sale_id,
    p_sale_line_id: null,
    p_quantity: null,
    p_reason: parsed.data.reason,
  });
  if (error) {
    return { ok: false, error: rpcErrorMessage(error, "Could not file the void request.") };
  }

  revalidatePath(`/sales/${parsed.data.sale_id}`);
  revalidatePath("/approvals");
  return { ok: true };
}

// Files a request to return (part of) one stock line of a sale.
export async function requestSaleReturn(
  _prevState: RequestActionState,
  formData: FormData,
): Promise<RequestActionState> {
  const parsed = requestSaleReturnSchema.safeParse({
    sale_id: formData.get("sale_id"),
    line_id: formData.get("line_id"),
    quantity: formData.get("quantity"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) {
    return { ok: false, error: firstIssueMessage(parsed.error.issues) };
  }

  const profile = await getProfile();
  if (!profile || !profile.is_active) {
    return { ok: false, error: "Not authenticated." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("correction_request_create", {
    p_kind: "sale_return_line",
    p_sale_id: parsed.data.sale_id,
    p_sale_line_id: parsed.data.line_id,
    p_quantity: parsed.data.quantity,
    p_reason: parsed.data.reason,
  });
  if (error) {
    return { ok: false, error: rpcErrorMessage(error, "Could not file the return request.") };
  }

  revalidatePath(`/sales/${parsed.data.sale_id}`);
  revalidatePath("/approvals");
  return { ok: true };
}

// Approve or reject. Approving applies the void/return in the same database
// transaction; if it can no longer be applied the call fails and the request
// stays pending.
export async function decideRequest(
  _prevState: RequestActionState,
  formData: FormData,
): Promise<RequestActionState> {
  const parsed = decideRequestSchema.safeParse({
    request_id: formData.get("request_id"),
    decision: formData.get("decision"),
    note: formData.get("note"),
  });
  if (!parsed.success) {
    return { ok: false, error: firstIssueMessage(parsed.error.issues) };
  }

  const profile = await getProfile();
  if (!profile || !profile.is_active || !profile.approver) {
    return { ok: false, error: "Not authorized." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("correction_request_decide", {
    p_request_id: parsed.data.request_id,
    p_approve: parsed.data.decision === "approve",
    p_note: parsed.data.note,
  });
  if (error) {
    return { ok: false, error: rpcErrorMessage(error, "Could not record the decision.") };
  }

  revalidatePath("/approvals");
  revalidatePath("/sales");
  return { ok: true };
}

// The requester withdraws a request that has not been decided yet.
export async function cancelRequest(
  _prevState: RequestActionState,
  formData: FormData,
): Promise<RequestActionState> {
  const parsed = cancelRequestSchema.safeParse({
    request_id: formData.get("request_id"),
  });
  if (!parsed.success) {
    return { ok: false, error: firstIssueMessage(parsed.error.issues) };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("correction_request_cancel", {
    p_request_id: parsed.data.request_id,
  });
  if (error) {
    return { ok: false, error: rpcErrorMessage(error, "Could not cancel the request.") };
  }

  revalidatePath("/approvals");
  revalidatePath("/sales");
  return { ok: true };
}
