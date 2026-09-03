"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/supabase/profile";
import {
  recordSaleSchema,
  returnSaleLineSchema,
  type SaleActionState,
  type ReturnActionState,
  type SaleLineInput,
  type RecordSaleInput,
} from "@/lib/validators/sale";
import {
  addSalePaymentSchema,
  deleteSalePaymentSchema,
} from "@/lib/validators/payment";

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
// are VAT-inclusive (12%). VAT is NEVER hand-typed: it's always final *
// 12/112, or 0 when the sale is VAT-exempt. Formulas (PH RA 9994 / RA 10754
// for SC/PWD):
//   none            : discount = 0; final = gross
//   final_price     : final = declared amount (caller must reject final >
//                      gross with "final price exceeds item total" BEFORE
//                      calling this — grossTotal isn't known to the caller
//                      until lines are summed); discount = gross - final
//   senior_citizen,
//   pwd             : vat_exempt_base = gross / 1.12
//                      discount = vat_exempt_base * 0.20 (net payable = vat_exempt_base - discount)
//                      always VAT-exempt (enforced again in the RPC)
//   custom_percent  : discount = gross * pct/100; final = gross - discount
//   custom_amount   : discount = min(typed amount, gross); final = gross - discount
// vat = vatExempt ? 0 : final * 12/112 for every mode except SC/PWD, which is
// always VAT-exempt regardless of the vatExempt argument.
function computeDiscountAndVat(
  grossTotal: number,
  discountType: RecordSaleInput["discount_type"],
  discountPercent: number | null,
  discountAmount: number | null,
  finalPrice: number | null,
  vatExempt: boolean,
): { discount: number; vatAmount: number; vatExempt: boolean } {
  switch (discountType) {
    case "senior_citizen":
    case "pwd": {
      const vatExemptBase = grossTotal / 1.12;
      return { discount: round2(vatExemptBase * 0.2), vatAmount: 0, vatExempt: true };
    }
    case "final_price": {
      const final = Math.min(finalPrice ?? 0, grossTotal);
      const discount = round2(Math.max(0, grossTotal - final));
      const vatAmount = vatExempt ? 0 : round2((final * 12) / 112);
      return { discount, vatAmount, vatExempt };
    }
    case "custom_percent": {
      const pct = (discountPercent ?? 0) / 100;
      const discount = round2(grossTotal * pct);
      const final = grossTotal - discount;
      const vatAmount = vatExempt ? 0 : round2((final * 12) / 112);
      return { discount, vatAmount, vatExempt };
    }
    case "custom_amount": {
      const discount = round2(Math.min(discountAmount ?? 0, grossTotal));
      const final = grossTotal - discount;
      const vatAmount = vatExempt ? 0 : round2((final * 12) / 112);
      return { discount, vatAmount, vatExempt };
    }
    case "none":
    default: {
      const vatAmount = vatExempt ? 0 : round2((grossTotal * 12) / 112);
      return { discount: 0, vatAmount, vatExempt };
    }
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
    final_price: formData.get("final_price"),
    vat_exempt: formData.get("vat_exempt"),
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

  const profile = await getProfile();
  if (!profile) {
    return { ok: false, error: "Not authenticated." };
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

  type PreparedLine = {
    line_type: "stock" | "service";
    stock_id: string | null;
    service_id: string | null;
    quantity: number;
    unit_price: number;
    warranty_expiry: string | null;
    is_freebie: boolean;
  };

  const lines: PreparedLine[] = data.lines.map((line: SaleLineInput) => ({
    line_type: line.line_type,
    stock_id: line.line_type === "stock" ? (line.stock_id ?? null) : null,
    service_id: line.line_type === "service" ? (line.service_id ?? null) : null,
    quantity: line.quantity,
    unit_price: line.unit_price,
    warranty_expiry: line.warranty_expiry ?? null,
    is_freebie: line.is_freebie ?? false,
  }));

  // Partner branches (branches.is_partner) run their own SRP, so their
  // branch_rep users are trusted to submit their own line prices — same as
  // admin. Derived from data.branch_id server-side (branch_rep can only ever
  // submit their own branch anyway, since the form hardcodes it for them).
  const { data: saleBranch } = await supabase
    .from("branches")
    .select("is_partner")
    .eq("id", data.branch_id)
    .single();
  const isPartnerBranch = saleBranch?.is_partner === true;

  // Line prices = SRP from the system. branch_rep at a company (non-partner)
  // branch cannot edit unit_price — the client already disables the input,
  // but that's UI-only, so the server re-derives every line's price from
  // products.srp / service_pricing for this role and overwrites whatever was
  // submitted. Admin (and other roles) stay trusted to submit their own line
  // prices, as do branch_rep users at partner branches.
  if (profile.role === "branch_rep" && !isPartnerBranch) {
    const stockIds = lines
      .filter((line: PreparedLine) => line.line_type === "stock" && line.stock_id)
      .map((line: PreparedLine) => line.stock_id as string);
    const serviceIds = lines
      .filter((line: PreparedLine) => line.line_type === "service" && line.service_id)
      .map((line: PreparedLine) => line.service_id as string);

    const [stockResult, servicePricingResult] = await Promise.all([
      stockIds.length > 0
        ? supabase.from("stock").select("id, product_id").in("id", stockIds)
        : Promise.resolve({ data: [] as { id: string; product_id: string }[] }),
      serviceIds.length > 0
        ? supabase
            .from("service_pricing")
            .select("service_id, price")
            .eq("branch_id", data.branch_id)
            .in("service_id", serviceIds)
        : Promise.resolve({ data: [] as { service_id: string; price: number }[] }),
    ]);

    type StockRow = { id: string; product_id: string };
    const stockRows: StockRow[] = (stockResult.data as StockRow[] | null) ?? [];
    const productIdByStockId = new Map<string, string>(
      stockRows.map((row: StockRow) => [row.id, row.product_id]),
    );
    const productIds: string[] = Array.from(
      new Set(stockRows.map((row: StockRow) => row.product_id)),
    );

    const productsResult =
      productIds.length > 0
        ? await supabase.from("products").select("id, srp").in("id", productIds)
        : { data: [] as { id: string; srp: number | null }[] };
    type ProductRow = { id: string; srp: number | null };
    const srpByProductId = new Map<string, number | null>(
      ((productsResult.data as ProductRow[] | null) ?? []).map((row: ProductRow) => [
        row.id,
        row.srp,
      ]),
    );

    type PricingRow = { service_id: string; price: number };
    const priceByServiceId = new Map<string, number>(
      ((servicePricingResult.data as PricingRow[] | null) ?? []).map((row: PricingRow) => [
        row.service_id,
        row.price,
      ]),
    );

    for (const line of lines) {
      if (line.line_type === "stock" && line.stock_id) {
        const productId = productIdByStockId.get(line.stock_id);
        const srp = productId ? srpByProductId.get(productId) : null;
        line.unit_price = srp ?? 0;
      } else if (line.line_type === "service" && line.service_id) {
        line.unit_price = priceByServiceId.get(line.service_id) ?? 0;
      }
    }
  }

  // Freebie lines are always priced at 0 — forced here regardless of role or
  // whatever unit_price was submitted (mirrors the branch_rep SRP guard
  // above: the client checkbox disables/zeroes the input, but that's UI
  // only, so this is the real trust boundary). The RPC also forces this
  // independently as defense in depth.
  for (const line of lines) {
    if (line.is_freebie) line.unit_price = 0;
  }

  const grossTotal = lines.reduce(
    (sum: number, line: PreparedLine) => sum + line.quantity * line.unit_price,
    0,
  );

  if (data.discount_type === "final_price") {
    const finalPrice = data.final_price ?? 0;
    // Small epsilon for floating-point line-total sums.
    if (finalPrice - grossTotal > 0.005) {
      return { ok: false, error: "final price exceeds item total" };
    }
  }

  const isScOrPwd = data.discount_type === "senior_citizen" || data.discount_type === "pwd";
  const effectiveVatExempt = isScOrPwd ? true : data.vat_exempt;

  const { discount, vatAmount, vatExempt } = computeDiscountAndVat(
    grossTotal,
    data.discount_type,
    data.discount_percent,
    data.discount_amount,
    data.final_price,
    effectiveVatExempt,
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
    p_vat_exempt: vatExempt,
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

export type PaymentActionState = {
  ok: boolean;
  error?: string;
};

// Records a partial payment (downpayment, installment, final payment)
// against an existing sale. The sale_add_payment RPC re-validates amount
// against the remaining balance and flips sales.is_paid when settled.
export async function addSalePayment(
  _prevState: PaymentActionState,
  formData: FormData,
): Promise<PaymentActionState> {
  const parsed = addSalePaymentSchema.safeParse({
    sale_id: formData.get("sale_id"),
    amount: formData.get("amount"),
    payment_date: formData.get("payment_date") ?? undefined,
    or_no: formData.get("or_no") ?? undefined,
    method: formData.get("method") ?? undefined,
    note: formData.get("note") ?? undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: firstIssueMessage(parsed.error.issues) };
  }

  const profile = await getProfile();
  if (!profile || !["admin", "branch_rep"].includes(profile.role)) {
    return { ok: false, error: "Not authorized." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("sale_add_payment", {
    p_sale_id: parsed.data.sale_id,
    p_amount: parsed.data.amount,
    p_payment_date: parsed.data.payment_date ?? null,
    p_or_no: parsed.data.or_no ?? null,
    p_method: parsed.data.method ?? null,
    p_note: parsed.data.note ?? null,
  });

  if (error) {
    return { ok: false, error: rpcErrorMessage(error, "Could not record payment.") };
  }

  revalidatePath(`/sales/${parsed.data.sale_id}`);
  revalidatePath("/sales");
  return { ok: true };
}

// Admin-only mistake correction; the RPC enforces the role at the DB level
// too and recomputes is_paid from the remaining payments.
export async function deleteSalePayment(
  _prevState: PaymentActionState,
  formData: FormData,
): Promise<PaymentActionState> {
  const parsed = deleteSalePaymentSchema.safeParse({
    payment_id: formData.get("payment_id"),
    sale_id: formData.get("sale_id"),
  });
  if (!parsed.success) {
    return { ok: false, error: firstIssueMessage(parsed.error.issues) };
  }

  const profile = await getProfile();
  if (!profile || profile.role !== "admin") {
    return { ok: false, error: "Only admins can delete payments." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("sale_delete_payment", {
    p_payment_id: parsed.data.payment_id,
  });

  if (error) {
    return { ok: false, error: rpcErrorMessage(error, "Could not delete payment.") };
  }

  revalidatePath(`/sales/${parsed.data.sale_id}`);
  revalidatePath("/sales");
  return { ok: true };
}
