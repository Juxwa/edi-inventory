"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { intakeSchema } from "@/lib/validators/intake";

import type { IntakeActionState } from "@/lib/validators/intake";

type PostgresErrorLike = { message?: string } | null;

// RPC exception messages are the whole point here (e.g. "serial % already
// in stock at % (%)") — surface them verbatim rather than a canned
// fallback, matching src/app/(app)/admin/corrections/actions.ts.
function rpcErrorMessage(error: PostgresErrorLike, fallback: string): string {
  if (error && typeof error.message === "string" && error.message.length > 0) {
    return error.message;
  }
  return fallback;
}

export async function submitIntake(
  _prevState: IntakeActionState,
  formData: FormData,
): Promise<IntakeActionState> {
  const parsed = intakeSchema.safeParse({
    product_id: formData.get("product_id"),
    branch_id: formData.get("branch_id"),
    supplier_id: formData.get("supplier_id"),
    has_serial: formData.get("has_serial") === "on",
    serials_text: formData.get("serials_text") ?? "",
    quantity: formData.get("quantity"),
    cost_per_unit: formData.get("cost_per_unit"),
    invoice_no: formData.get("invoice_no"),
    invoice_date: formData.get("invoice_date"),
    expiry_date: formData.get("expiry_date"),
    repair_pool: formData.get("repair_pool") === "on",
    office_asset: formData.get("office_asset") === "on",
  });

  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  }

  const data = parsed.data;

  const supabase = await createClient();
  const { data: ids, error } = await supabase.rpc("stock_intake", {
    p_product_id: data.product_id,
    p_branch_id: data.branch_id,
    p_supplier_id: data.supplier_id,
    p_serials: data.serials,
    p_quantity: data.quantity,
    p_cost_per_unit: data.cost_per_unit,
    p_invoice_no: data.invoice_no,
    p_invoice_date: data.invoice_date,
    p_expiry_date: data.expiry_date,
    p_repair_pool: data.repair_pool,
    p_office_asset: data.office_asset,
  });

  if (error) {
    return { ok: false, error: rpcErrorMessage(error, "Could not record stock intake.") };
  }

  const count = Array.isArray(ids)
    ? ids.length
    : data.serials
      ? data.serials.length
      : (data.quantity ?? 0);

  revalidatePath("/inventory");
  return { ok: true, count };
}
