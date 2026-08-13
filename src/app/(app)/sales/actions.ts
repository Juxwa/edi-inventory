"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  recordSaleSchema,
  returnSaleLineSchema,
  type SaleActionState,
  type ReturnActionState,
  type SaleLineInput,
  type RecordSaleInput,
} from "@/lib/validators/sale";

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

// Rounds to 2dp for every stored/displayed amount, matching the sale form.
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

// Discount + VAT are always derived server-side from the lines total and the
// chosen template — the client never gets to submit its own totals. Prices
// are VAT-inclusive (12%). Formulas (PH RA 9994 / RA 10754 for SC/PWD):
//   none            : discount = 0; vat = gross * 12/112
//   senior_citizen,
//   pwd             : vat_exempt_base = gross / 1.12
//                      discount = vat_exempt_base * 0.20 (net payable = vat_exempt_base - discount)
//                      vat = 0 (sale is VAT-exempt by law; enforced again in the RPC)
//   custom_percent  : discount = gross * pct/100; vat = (gross - discount) * 12/112
//   custom_amount   : discount = min(typed amount, gross); vat = (gross - discount) * 12/112
function computeDiscountAndVat(
  grossTotal: number,
  discountType: RecordSaleInput["discount_type"],
  discountPercent: number | null,
  discountAmount: number | null,
): { discount: number; vatAmount: number } {
  switch (discountType) {
    case "senior_citizen":
    case "pwd": {
      const vatExemptBase = grossTotal / 1.12;
      return { discount: round2(vatExemptBase * 0.2), vatAmount: 0 };
    }
    case "custom_percent": {
      const pct = (discountPercent ?? 0) / 100;
      const discount = round2(grossTotal * pct);
      return { discount, vatAmount: round2(((grossTotal - discount) * 12) / 112) };
    }
    case "custom_amount": {
      const discount = round2(Math.min(discountAmount ?? 0, grossTotal));
      return { discount, vatAmount: round2(((grossTotal - discount) * 12) / 112) };
    }
    case "none":
    default:
      return { discount: 0, vatAmount: round2((grossTotal * 12) / 112) };
  }
}

export async function recordSale(
  _prevState: SaleActionState,
  formData: FormData,
): Promise<SaleActionState> {
  const parsed = recordSaleSchema.safeParse({
    branch_id: formData.get("branch_id"),
    customer_id: formData.get("customer_id"),
    new_customer_name: formData.get("new_customer_name"),
    new_customer_mobile: formData.get("new_customer_mobile"),
    new_customer_email: formData.get("new_customer_email"),
    sale_date: formData.get("sale_date"),
    or_no: formData.get("or_no"),
    csi_no: formData.get("csi_no"),
    ci_no: formData.get("ci_no"),
    referred_by: formData.get("referred_by"),
    discount_type: formData.get("discount_type"),
    discount_id_no: formData.get("discount_id_no"),
    discount_percent: formData.get("discount_percent"),
    discount_amount: formData.get("discount_amount"),
    is_paid: formData.get("is_paid"),
    lines: formData.get("lines"),
  });

  if (!parsed.success) {
    return { ok: false, error: firstIssueMessage(parsed.error.issues) };
  }

  const data = parsed.data;

  if (!data.customer_id && !data.new_customer_name) {
    return { ok: false, error: "Select a customer or enter a new customer name." };
  }

  const supabase = await createClient();

  let customerId = data.customer_id;

  if (!customerId && data.new_customer_name) {
    const { data: customer, error: customerError } = await supabase
      .from("customers")
      .insert({
        name: data.new_customer_name,
        mobile_no: data.new_customer_mobile,
        email: data.new_customer_email,
        branch_created_id: data.branch_id,
      })
      .select("id")
      .single();

    if (customerError || !customer) {
      return { ok: false, error: "Could not create customer." };
    }
    customerId = customer.id;
  }

  const lines = data.lines.map((line: SaleLineInput) => ({
    line_type: line.line_type,
    stock_id: line.line_type === "stock" ? line.stock_id : null,
    service_id: line.line_type === "service" ? line.service_id : null,
    quantity: line.quantity,
    unit_price: line.unit_price,
    warranty_expiry: line.warranty_expiry ?? null,
  }));

  const grossTotal = data.lines.reduce(
    (sum: number, line: SaleLineInput) => sum + line.quantity * line.unit_price,
    0,
  );
  const { discount, vatAmount } = computeDiscountAndVat(
    grossTotal,
    data.discount_type,
    data.discount_percent,
    data.discount_amount,
  );

  const { data: saleId, error } = await supabase.rpc("sale_record", {
    p_customer_id: customerId,
    p_branch_id: data.branch_id,
    p_sale_date: data.sale_date,
    p_or_no: data.or_no,
    p_csi_no: data.csi_no,
    p_ci_no: data.ci_no,
    p_referred_by: data.referred_by,
    p_discount: discount,
    p_vat_amount: vatAmount,
    p_is_paid: data.is_paid,
    p_lines: lines,
    p_discount_type: data.discount_type,
    p_discount_id_no: data.discount_id_no,
  });

  if (error || typeof saleId !== "string") {
    return { ok: false, error: rpcErrorMessage(error, "Could not record sale.") };
  }

  revalidatePath("/sales");
  redirect(`/sales/${saleId}`);
}

export async function returnSaleLine(
  _prevState: ReturnActionState,
  formData: FormData,
): Promise<ReturnActionState> {
  const parsed = returnSaleLineSchema.safeParse({
    line_id: formData.get("line_id"),
    sale_id: formData.get("sale_id"),
    quantity: formData.get("quantity"),
    note: formData.get("note"),
  });

  if (!parsed.success) {
    return { ok: false, error: firstIssueMessage(parsed.error.issues) };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("sale_return_line", {
    p_line_id: parsed.data.line_id,
    p_quantity: parsed.data.quantity,
    p_note: parsed.data.note,
  });

  if (error) {
    return { ok: false, error: rpcErrorMessage(error, "Could not return line.") };
  }

  revalidatePath(`/sales/${parsed.data.sale_id}`);
  revalidatePath("/sales");
  return { ok: true };
}
