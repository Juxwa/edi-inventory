"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  createTransferSchema,
  addLineSchema,
  removeLineSchema,
  reserveTransferSchema,
  dispatchTransferSchema,
  receiveLineSchema,
  deleteDraftSchema,
  generateTransferCode,
  type TransferActionState,
} from "@/lib/validators/transfer";

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

export async function createTransfer(
  _prevState: TransferActionState,
  formData: FormData,
): Promise<TransferActionState> {
  const parsed = createTransferSchema.safeParse({
    from_branch_id: formData.get("from_branch_id"),
    to_branch_id: formData.get("to_branch_id"),
  });

  if (!parsed.success) {
    return { ok: false, error: firstIssueMessage(parsed.error.issues) };
  }

  if (parsed.data.from_branch_id === parsed.data.to_branch_id) {
    return { ok: false, error: "From and to branches must be different." };
  }

  const supabase = await createClient();

  const { data: branches, error: branchesError } = await supabase
    .from("branches")
    .select("id, code")
    .in("id", [parsed.data.from_branch_id, parsed.data.to_branch_id]);

  if (branchesError || !branches) {
    return { ok: false, error: "Could not create transfer." };
  }

  const fromCode =
    branches.find((b) => b.id === parsed.data.from_branch_id)?.code ?? "";
  const toCode =
    branches.find((b) => b.id === parsed.data.to_branch_id)?.code ?? "";
  const code = generateTransferCode(fromCode, toCode);

  const { data, error } = await supabase
    .from("transfers")
    .insert({
      code,
      from_branch_id: parsed.data.from_branch_id,
      to_branch_id: parsed.data.to_branch_id,
      status: "draft",
    })
    .select("id")
    .single();

  if (error || !data) {
    return { ok: false, error: "Could not create transfer." };
  }

  revalidatePath("/transfers");
  redirect(`/transfers/${data.id}`);
}

export async function addLine(
  _prevState: TransferActionState,
  formData: FormData,
): Promise<TransferActionState> {
  const parsed = addLineSchema.safeParse({
    transfer_id: formData.get("transfer_id"),
    stock_id: formData.get("stock_id"),
    quantity: formData.get("quantity"),
  });

  if (!parsed.success) {
    return { ok: false, error: firstIssueMessage(parsed.error.issues) };
  }

  const supabase = await createClient();

  const { data: transfer, error: transferError } = await supabase
    .from("transfers")
    .select("id, status, from_branch_id")
    .eq("id", parsed.data.transfer_id)
    .single();

  if (transferError || !transfer) {
    return { ok: false, error: "Transfer not found." };
  }
  if (transfer.status !== "draft") {
    return { ok: false, error: "Lines can only be added while the transfer is a draft." };
  }

  const { data: stockRow, error: stockError } = await supabase
    .from("stock_visible")
    .select("id, branch_id, status, quantity, serial_number")
    .eq("id", parsed.data.stock_id)
    .single();

  if (stockError || !stockRow) {
    return { ok: false, error: "Stock item not found." };
  }
  if (stockRow.branch_id !== transfer.from_branch_id) {
    return { ok: false, error: "Stock does not belong to the from-branch." };
  }
  if (stockRow.status !== "available") {
    return { ok: false, error: "Stock is not available." };
  }
  if (parsed.data.quantity > stockRow.quantity) {
    return { ok: false, error: "Quantity exceeds available stock." };
  }

  const { error: insertError } = await supabase
    .from("transfer_line_items")
    .insert({
      transfer_id: parsed.data.transfer_id,
      stock_id: parsed.data.stock_id,
      quantity: stockRow.serial_number ? 1 : parsed.data.quantity,
      serial_snapshot: stockRow.serial_number,
    });

  if (insertError) {
    return { ok: false, error: "Could not add line." };
  }

  revalidatePath(`/transfers/${parsed.data.transfer_id}`);
  return { ok: true };
}

export async function removeLine(
  _prevState: TransferActionState,
  formData: FormData,
): Promise<TransferActionState> {
  const parsed = removeLineSchema.safeParse({
    line_id: formData.get("line_id"),
    transfer_id: formData.get("transfer_id"),
  });

  if (!parsed.success) {
    return { ok: false, error: firstIssueMessage(parsed.error.issues) };
  }

  const supabase = await createClient();

  const { data: transfer, error: transferError } = await supabase
    .from("transfers")
    .select("id, status")
    .eq("id", parsed.data.transfer_id)
    .single();

  if (transferError || !transfer) {
    return { ok: false, error: "Transfer not found." };
  }
  if (transfer.status !== "draft") {
    return { ok: false, error: "Lines can only be removed while the transfer is a draft." };
  }

  const { error } = await supabase
    .from("transfer_line_items")
    .delete()
    .eq("id", parsed.data.line_id)
    .eq("transfer_id", parsed.data.transfer_id);

  if (error) {
    return { ok: false, error: "Could not remove line." };
  }

  revalidatePath(`/transfers/${parsed.data.transfer_id}`);
  return { ok: true };
}

export async function reserveTransfer(
  _prevState: TransferActionState,
  formData: FormData,
): Promise<TransferActionState> {
  const parsed = reserveTransferSchema.safeParse({
    transfer_id: formData.get("transfer_id"),
  });

  if (!parsed.success) {
    return { ok: false, error: firstIssueMessage(parsed.error.issues) };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("transfer_reserve", {
    p_transfer_id: parsed.data.transfer_id,
  });

  if (error) {
    return { ok: false, error: rpcErrorMessage(error, "Could not reserve transfer.") };
  }

  revalidatePath(`/transfers/${parsed.data.transfer_id}`);
  revalidatePath("/transfers");
  return { ok: true };
}

export async function dispatchTransfer(
  _prevState: TransferActionState,
  formData: FormData,
): Promise<TransferActionState> {
  const parsed = dispatchTransferSchema.safeParse({
    transfer_id: formData.get("transfer_id"),
    courier: formData.get("courier"),
    tracking_code: formData.get("tracking_code"),
    sis_no: formData.get("sis_no"),
  });

  if (!parsed.success) {
    return { ok: false, error: firstIssueMessage(parsed.error.issues) };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("transfer_dispatch", {
    p_transfer_id: parsed.data.transfer_id,
    p_courier: parsed.data.courier,
    p_tracking_code: parsed.data.tracking_code,
    p_sis_no: parsed.data.sis_no,
  });

  if (error) {
    return { ok: false, error: rpcErrorMessage(error, "Could not dispatch transfer.") };
  }

  revalidatePath(`/transfers/${parsed.data.transfer_id}`);
  revalidatePath("/transfers");
  return { ok: true };
}

export async function receiveLine(
  _prevState: TransferActionState,
  formData: FormData,
): Promise<TransferActionState> {
  const parsed = receiveLineSchema.safeParse({
    line_id: formData.get("line_id"),
    received_quantity: formData.get("received_quantity"),
    note: formData.get("note"),
  });

  if (!parsed.success) {
    return { ok: false, error: firstIssueMessage(parsed.error.issues) };
  }

  const transferId = formData.get("transfer_id");

  const supabase = await createClient();
  const { error } = await supabase.rpc("transfer_receive_line", {
    p_line_id: parsed.data.line_id,
    p_received_quantity: parsed.data.received_quantity,
    p_note: parsed.data.note,
  });

  if (error) {
    return { ok: false, error: rpcErrorMessage(error, "Could not update line.") };
  }

  if (typeof transferId === "string" && transferId.length > 0) {
    revalidatePath(`/transfers/${transferId}`);
  }
  revalidatePath("/transfers");
  return { ok: true };
}

export async function deleteDraft(
  _prevState: TransferActionState,
  formData: FormData,
): Promise<TransferActionState> {
  const parsed = deleteDraftSchema.safeParse({
    transfer_id: formData.get("transfer_id"),
  });

  if (!parsed.success) {
    return { ok: false, error: firstIssueMessage(parsed.error.issues) };
  }

  const supabase = await createClient();

  const { data: transfer, error: transferError } = await supabase
    .from("transfers")
    .select("id, status")
    .eq("id", parsed.data.transfer_id)
    .single();

  if (transferError || !transfer) {
    return { ok: false, error: "Transfer not found." };
  }
  if (transfer.status !== "draft") {
    return { ok: false, error: "Only draft transfers can be deleted." };
  }

  const { error: lineError } = await supabase
    .from("transfer_line_items")
    .delete()
    .eq("transfer_id", parsed.data.transfer_id);

  if (lineError) {
    return { ok: false, error: "Could not delete transfer lines." };
  }

  const { error: deleteError } = await supabase
    .from("transfers")
    .delete()
    .eq("id", parsed.data.transfer_id);

  if (deleteError) {
    return { ok: false, error: "Could not delete transfer." };
  }

  revalidatePath("/transfers");
  redirect("/transfers");
}
