"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  repairIntakeSchema,
  addEventSchema,
  updateRepairSchema,
  type RepairActionState,
} from "@/lib/validators/repair";

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

export async function intakeRepair(
  _prevState: RepairActionState,
  formData: FormData,
): Promise<RepairActionState> {
  const parsed = repairIntakeSchema.safeParse({
    sar_no: formData.get("sar_no"),
    branch_id: formData.get("branch_id"),
    customer_id: formData.get("customer_id"),
    contact_no: formData.get("contact_no"),
    sale_line_item_id: formData.get("sale_line_item_id"),
    manual_serial: formData.get("manual_serial"),
    issue_description: formData.get("issue_description"),
    assigned_to: formData.get("assigned_to"),
    downpayment: formData.get("downpayment"),
    initial_note: formData.get("initial_note"),
  });

  if (!parsed.success) {
    return { ok: false, error: firstIssueMessage(parsed.error.issues) };
  }

  const data = parsed.data;
  const supabase = await createClient();

  const { data: repairId, error } = await supabase.rpc("repair_intake", {
    p_sar_no: data.sar_no,
    p_customer_id: data.customer_id,
    p_contact_no: data.contact_no,
    p_branch_id: data.branch_id,
    p_sale_line_item_id: data.sale_line_item_id,
    p_manual_serial: data.manual_serial,
    p_issue_description: data.issue_description,
    p_assigned_to: data.assigned_to,
    p_downpayment: data.downpayment,
    p_initial_note: data.initial_note,
  });

  if (error || typeof repairId !== "string") {
    return { ok: false, error: rpcErrorMessage(error, "Could not record repair.") };
  }

  revalidatePath("/repairs");
  redirect(`/repairs/${repairId}`);
}

export async function addRepairEvent(
  _prevState: RepairActionState,
  formData: FormData,
): Promise<RepairActionState> {
  const parsed = addEventSchema.safeParse({
    repair_id: formData.get("repair_id"),
    status: formData.get("status"),
    note: formData.get("note"),
    is_public: formData.get("is_public"),
  });

  if (!parsed.success) {
    return { ok: false, error: firstIssueMessage(parsed.error.issues) };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("repair_add_event", {
    p_repair_id: parsed.data.repair_id,
    p_status: parsed.data.status,
    p_note: parsed.data.note,
    p_is_public: parsed.data.is_public,
  });

  if (error) {
    return { ok: false, error: rpcErrorMessage(error, "Could not add status update.") };
  }

  revalidatePath(`/repairs/${parsed.data.repair_id}`);
  revalidatePath("/repairs");
  return { ok: true };
}

export async function updateRepair(
  _prevState: RepairActionState,
  formData: FormData,
): Promise<RepairActionState> {
  const parsed = updateRepairSchema.safeParse({
    repair_id: formData.get("repair_id"),
    assigned_to: formData.get("assigned_to"),
    downpayment: formData.get("downpayment"),
    remarks: formData.get("remarks"),
    for_replacement: formData.get("for_replacement"),
  });

  if (!parsed.success) {
    return { ok: false, error: firstIssueMessage(parsed.error.issues) };
  }

  const data = parsed.data;
  const supabase = await createClient();

  const update: Record<string, unknown> = {
    assigned_to: data.assigned_to,
    downpayment: data.downpayment,
    remarks: data.remarks,
    updated_at: new Date().toISOString(),
  };
  if (data.for_replacement) {
    update.status = "for_replacement";
  }

  const { error } = await supabase
    .from("repair_requests")
    .update(update)
    .eq("id", data.repair_id);

  if (error) {
    return { ok: false, error: rpcErrorMessage(error, "Could not update repair.") };
  }

  if (data.for_replacement) {
    const { data: userResult } = await supabase.auth.getUser();
    await supabase.from("repair_status_events").insert({
      repair_id: data.repair_id,
      status: "in_repair",
      note: "Marked for replacement",
      is_public: false,
      actor_id: userResult.user?.id ?? null,
    });
  }

  revalidatePath(`/repairs/${data.repair_id}`);
  revalidatePath("/repairs");
  return { ok: true };
}
