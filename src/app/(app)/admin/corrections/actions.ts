"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/supabase/profile";
import {
  saleVoidSchema,
  intakeVoidSchema,
  transferReverseSchema,
  serialCorrectSchema,
  repairVoidSchema,
  earmoldVoidSchema,
  type CorrectionActionState,
} from "@/lib/validators/correction";

function firstIssueMessage(issues: { message: string }[]): string {
  return issues[0]?.message ?? "Invalid input.";
}

type PostgresErrorLike = { message?: string } | null;

// RPC exception messages are the whole point here (e.g. "stock has
// activity — cannot void") — surface them verbatim rather than a canned
// fallback.
function rpcErrorMessage(error: PostgresErrorLike, fallback: string): string {
  if (error && typeof error.message === "string" && error.message.length > 0) {
    return error.message;
  }
  return fallback;
}

// Every action re-verifies admin server-side before calling the RPC —
// never trust the page-level gate alone. The RPCs themselves also guard,
// so this is belt-and-braces, matching src/app/(app)/admin/users/actions.ts.
async function requireAdmin(): Promise<CorrectionActionState | null> {
  const profile = await getProfile();
  if (!profile || profile.role !== "admin" || !profile.is_active) {
    return { ok: false, error: "Not authorized." };
  }
  return null;
}

export async function voidSale(
  _prevState: CorrectionActionState,
  formData: FormData,
): Promise<CorrectionActionState> {
  const denied = await requireAdmin();
  if (denied) return denied;

  const parsed = saleVoidSchema.safeParse({
    sale_id: formData.get("sale_id"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) {
    return { ok: false, error: firstIssueMessage(parsed.error.issues) };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("sale_void", {
    p_sale_id: parsed.data.sale_id,
    p_reason: parsed.data.reason,
  });
  if (error) {
    return { ok: false, error: rpcErrorMessage(error, "Could not void sale.") };
  }

  revalidatePath(`/sales/${parsed.data.sale_id}`);
  revalidatePath("/sales");
  revalidatePath("/admin/corrections");
  return { ok: true };
}

export async function voidIntake(
  _prevState: CorrectionActionState,
  formData: FormData,
): Promise<CorrectionActionState> {
  const denied = await requireAdmin();
  if (denied) return denied;

  const parsed = intakeVoidSchema.safeParse({
    stock_id: formData.get("stock_id"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) {
    return { ok: false, error: firstIssueMessage(parsed.error.issues) };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("intake_void", {
    p_stock_id: parsed.data.stock_id,
    p_reason: parsed.data.reason,
  });
  if (error) {
    return { ok: false, error: rpcErrorMessage(error, "Could not void stock intake.") };
  }

  revalidatePath("/inventory");
  revalidatePath("/admin/corrections");
  return { ok: true };
}

export async function reverseTransfer(
  _prevState: CorrectionActionState,
  formData: FormData,
): Promise<CorrectionActionState> {
  const denied = await requireAdmin();
  if (denied) return denied;

  const parsed = transferReverseSchema.safeParse({
    transfer_id: formData.get("transfer_id"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) {
    return { ok: false, error: firstIssueMessage(parsed.error.issues) };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("transfer_reverse", {
    p_transfer_id: parsed.data.transfer_id,
    p_reason: parsed.data.reason,
  });
  if (error) {
    return { ok: false, error: rpcErrorMessage(error, "Could not reverse transfer.") };
  }

  revalidatePath(`/transfers/${parsed.data.transfer_id}`);
  revalidatePath("/transfers");
  revalidatePath("/admin/corrections");
  return { ok: true };
}

export async function correctSerial(
  _prevState: CorrectionActionState,
  formData: FormData,
): Promise<CorrectionActionState> {
  const denied = await requireAdmin();
  if (denied) return denied;

  const parsed = serialCorrectSchema.safeParse({
    scope: formData.get("scope"),
    id: formData.get("id"),
    new_serial: formData.get("new_serial"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) {
    return { ok: false, error: firstIssueMessage(parsed.error.issues) };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("serial_correct", {
    p_scope: parsed.data.scope,
    p_id: parsed.data.id,
    p_new_serial: parsed.data.new_serial,
    p_reason: parsed.data.reason,
  });
  if (error) {
    return { ok: false, error: rpcErrorMessage(error, "Could not correct serial.") };
  }

  const returnPath = formData.get("return_path");
  if (typeof returnPath === "string" && returnPath.startsWith("/")) {
    revalidatePath(returnPath);
  }
  revalidatePath("/inventory");
  revalidatePath("/admin/corrections");
  return { ok: true };
}

export async function voidRepair(
  _prevState: CorrectionActionState,
  formData: FormData,
): Promise<CorrectionActionState> {
  const denied = await requireAdmin();
  if (denied) return denied;

  const parsed = repairVoidSchema.safeParse({
    repair_id: formData.get("repair_id"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) {
    return { ok: false, error: firstIssueMessage(parsed.error.issues) };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("repair_void", {
    p_repair_id: parsed.data.repair_id,
    p_reason: parsed.data.reason,
  });
  if (error) {
    return { ok: false, error: rpcErrorMessage(error, "Could not void repair.") };
  }

  revalidatePath(`/repairs/${parsed.data.repair_id}`);
  revalidatePath("/repairs");
  revalidatePath("/admin/corrections");
  return { ok: true };
}

export async function voidEarmold(
  _prevState: CorrectionActionState,
  formData: FormData,
): Promise<CorrectionActionState> {
  const denied = await requireAdmin();
  if (denied) return denied;

  const parsed = earmoldVoidSchema.safeParse({
    earmold_id: formData.get("earmold_id"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) {
    return { ok: false, error: firstIssueMessage(parsed.error.issues) };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("earmold_void", {
    p_earmold_id: parsed.data.earmold_id,
    p_reason: parsed.data.reason,
  });
  if (error) {
    return { ok: false, error: rpcErrorMessage(error, "Could not void earmold request.") };
  }

  revalidatePath(`/earmolds/${parsed.data.earmold_id}`);
  revalidatePath("/earmolds");
  revalidatePath("/admin/corrections");
  return { ok: true };
}
