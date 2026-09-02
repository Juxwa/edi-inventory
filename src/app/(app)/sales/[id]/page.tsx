import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/supabase/profile";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ReturnDialog } from "@/components/sales/return-dialog";
import { PaymentsCard } from "@/components/sales/payments-card";
import { PrintButton } from "@/components/print-button";
import { VoidedBanner } from "@/components/admin/voided-banner";
import { VoidDialog } from "@/components/admin/void-dialog";
import { SerialCorrectDialog } from "@/components/admin/serial-correct-dialog";
import { SaleEditDialog } from "@/components/admin/sale-edit-dialog";
import { voidSale } from "@/app/(app)/admin/corrections/actions";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { AfterSalesStatus, DiscountType } from "@/lib/validators/sale";

export const dynamic = "force-dynamic";

type SaleDetailPageProps = {
  params: Promise<{ id: string }>;
};

type SaleDetailRow = {
  id: string;
  customer_id: string | null;
  branch_id: string;
  sale_date: string;
  or_no: string | null;
  csi_no: string | null;
  ci_no: string | null;
  referred_by: string | null;
  discount: number | null;
  vat_amount: number | null;
  vat_exempt: boolean | null;
  discount_type: DiscountType | null;
  discount_id_no: string | null;
  is_paid: boolean;
  voided_at: string | null;
  voided_by: string | null;
  void_reason: string | null;
};

const DISCOUNT_TYPE_LABELS: Record<DiscountType, string> = {
  none: "No discount",
  final_price: "Final sale price",
  custom_amount: "Discount amount",
  custom_percent: "Discount %",
  senior_citizen: "Senior Citizen 20%",
  pwd: "PWD 20%",
};

type CustomerRow = { id: string; name: string; mobile_no: string | null };

type LineRow = {
  id: string;
  line_type: "stock" | "service";
  stock_id: string | null;
  product_id: string | null;
  service_id: string | null;
  quantity: number;
  unit_price: number;
  serial_snapshot: string | null;
  warranty_expiry: string | null;
  after_sales_status: AfterSalesStatus | null;
  returned_quantity: number | null;
  is_freebie: boolean;
};

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
  }).format(value);
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function AfterSalesBadge({ status }: { status: AfterSalesStatus | null }) {
  if (!status) return <span className="text-muted-foreground">—</span>;
  const variant =
    status === "returned"
      ? "destructive"
      : status === "partially_returned"
        ? "warning"
        : status === "for_repair"
          ? "warning"
          : status === "replaced"
            ? "secondary"
            : "outline";
  const label = status
    .split("_")
    .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
  return <Badge variant={variant}>{label}</Badge>;
}

export default async function SaleDetailPage({ params }: SaleDetailPageProps) {
  const profile = await getProfile();
  if (!profile || profile.role === "technical") {
    redirect("/");
  }

  const { id } = await params;
  const supabase = await createClient();

  const { data: sale, error: saleError } = await supabase
    .from("sales")
    .select(
      "id, customer_id, branch_id, sale_date, or_no, csi_no, ci_no, referred_by, discount, vat_amount, vat_exempt, discount_type, discount_id_no, is_paid, voided_at, voided_by, void_reason",
    )
    .eq("id", id)
    .single();

  if (saleError || !sale) {
    notFound();
  }

  const saleRow = sale as SaleDetailRow;

  const [branchResult, customerResult, lineResult, voidedByResult] = await Promise.all([
    supabase.from("branches").select("id, name").eq("id", saleRow.branch_id).single(),
    saleRow.customer_id
      ? supabase
          .from("customers")
          .select("id, name, mobile_no")
          .eq("id", saleRow.customer_id)
          .single()
      : Promise.resolve({ data: null }),
    supabase
      .from("sale_line_items")
      .select(
        "id, line_type, stock_id, product_id, service_id, quantity, unit_price, serial_snapshot, warranty_expiry, after_sales_status, returned_quantity, is_freebie",
      )
      .eq("sale_id", saleRow.id),
    saleRow.voided_by
      ? supabase.from("profiles").select("name").eq("id", saleRow.voided_by).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const branchName: string = (branchResult.data as { name: string } | null)?.name ?? "—";
  const customer = customerResult.data as CustomerRow | null;
  const voidedByName = (voidedByResult.data as { name: string } | null)?.name ?? null;

  const lines: LineRow[] = (lineResult.data as LineRow[] | null) ?? [];

  const productIds = lines
    .map((line: LineRow) => line.product_id)
    .filter((productId: string | null): productId is string => productId !== null);
  const serviceIds = lines
    .map((line: LineRow) => line.service_id)
    .filter((serviceId: string | null): serviceId is string => serviceId !== null);

  const [productsResult, servicesResult] = await Promise.all([
    productIds.length > 0
      ? supabase.from("products").select("id, name").in("id", productIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    serviceIds.length > 0
      ? supabase.from("services").select("id, name").in("id", serviceIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);

  type NameRow = { id: string; name: string };
  const productNameById = new Map<string, string>(
    ((productsResult.data as NameRow[] | null) ?? []).map((row: NameRow) => [row.id, row.name]),
  );
  const serviceNameById = new Map<string, string>(
    ((servicesResult.data as NameRow[] | null) ?? []).map((row: NameRow) => [row.id, row.name]),
  );

  type PaymentQueryRow = {
    id: string;
    payment_date: string;
    or_no: string | null;
    method: string | null;
    note: string | null;
    amount: number;
    received_by: string | null;
  };
  const { data: paymentData } = await supabase
    .from("sale_payments")
    .select("id, payment_date, or_no, method, note, amount, received_by")
    .eq("sale_id", saleRow.id)
    .order("payment_date")
    .order("created_at");
  const paymentRows: PaymentQueryRow[] = (paymentData as PaymentQueryRow[] | null) ?? [];

  const receiverIds = Array.from(
    new Set(
      paymentRows
        .map((row: PaymentQueryRow) => row.received_by)
        .filter((rid: string | null): rid is string => rid !== null),
    ),
  );
  let receiverNameById = new Map<string, string>();
  if (receiverIds.length > 0) {
    const { data: receiverRows } = await supabase
      .from("profiles")
      .select("id, name")
      .in("id", receiverIds);
    receiverNameById = new Map(
      ((receiverRows as NameRow[] | null) ?? []).map((row: NameRow) => [row.id, row.name]),
    );
  }

  function lineName(line: LineRow): string {
    if (line.line_type === "service") {
      return line.service_id ? (serviceNameById.get(line.service_id) ?? "—") : "—";
    }
    return line.product_id ? (productNameById.get(line.product_id) ?? "—") : "—";
  }

  const gross = lines.reduce(
    (sum: number, line: LineRow) => sum + line.quantity * line.unit_price,
    0,
  );
  const discount = saleRow.discount ?? 0;
  const net = Math.max(0, gross - discount);
  const discountType: DiscountType = saleRow.discount_type ?? "none";
  const isScOrPwd = discountType === "senior_citizen" || discountType === "pwd";
  // Same formula as the sale form / server: vat_exempt_base = gross / 1.12;
  // the VAT removed for SC/PWD is never stored (vat_amount is recorded as 0
  // to mean "exempt"), so it's re-derived here for display.
  const vatExemptBase = Math.round((gross / 1.12) * 100) / 100;
  const vatExemptRemoved = Math.round((gross - vatExemptBase) * 100) / 100;
  const netPayable = isScOrPwd ? Math.max(0, vatExemptBase - discount) : net;
  // vat_exempt is the authoritative flag (0049) — SC/PWD always sets it, but
  // other modes can too (VAT-exempt checkbox on the sale form).
  const isVatExempt = isScOrPwd || (saleRow.vat_exempt ?? false);

  const isVoided = saleRow.voided_at !== null;
  const canReturn =
    !isVoided && (profile.role === "admin" || profile.branch_id === saleRow.branch_id);
  const isAdmin = profile.role === "admin";

  // Payment math mirrors the sale_add_payment RPC / sales_balances view
  // (0053): net = max(0, (vat_exempt ? gross / 1.12 : gross) - discount).
  // A sale marked paid at recording with no payment rows counts as settled.
  const round2 = (value: number) => Math.round(value * 100) / 100;
  const paymentNet = Math.max(
    0,
    round2((saleRow.vat_exempt ? gross / 1.12 : gross) - discount),
  );
  const totalPaid = round2(
    paymentRows.reduce((sum: number, row: PaymentQueryRow) => sum + row.amount, 0),
  );
  const balanceDue =
    saleRow.is_paid && totalPaid === 0 ? 0 : Math.max(0, round2(paymentNet - totalPaid));
  const canRecordPayment =
    !isVoided &&
    (profile.role === "admin" ||
      (profile.role === "branch_rep" && profile.branch_id === saleRow.branch_id));
  const paymentCardRows = paymentRows.map((row: PaymentQueryRow) => ({
    id: row.id,
    payment_date: row.payment_date,
    or_no: row.or_no,
    method: row.method,
    note: row.note,
    amount: row.amount,
    received_by_name: row.received_by
      ? (receiverNameById.get(row.received_by) ?? null)
      : null,
  }));

  return (
    <div className="flex flex-col gap-6">
      {/* Print-only letterhead for the receipt */}
      <div className="hidden print:block">
        <p className="text-lg font-bold">Ear Diagnostics Inc.</p>
        <p className="text-sm">{branchName} · Sales receipt</p>
      </div>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold">Sale {saleRow.or_no ?? saleRow.id.slice(0, 8)}</h1>
          <p className="text-sm text-muted-foreground">
            Recorded {formatDate(saleRow.sale_date)} at {branchName}
          </p>
        </div>
        <span className="flex items-center gap-2 print:hidden">
          {isAdmin && !isVoided ? (
            <SaleEditDialog
              saleId={saleRow.id}
              currentOrNo={saleRow.or_no}
              currentCsiNo={saleRow.csi_no}
              currentCiNo={saleRow.ci_no}
              currentSaleDate={saleRow.sale_date}
              currentCustomer={customer}
              currentReferredBy={saleRow.referred_by}
              currentIsPaid={saleRow.is_paid}
            />
          ) : null}
          {isAdmin && !isVoided ? (
            <VoidDialog
              action={voidSale}
              hiddenFields={{ sale_id: saleRow.id }}
              triggerLabel="Void sale"
              title="Void this sale"
              description="Stock will be restored and the sale marked voided. This cannot be undone."
              confirmLabel="Void sale"
              pendingLabel="Voiding..."
            />
          ) : null}
          <PrintButton />
        </span>
      </div>

      {isVoided ? (
        <VoidedBanner reason={saleRow.void_reason} actorName={voidedByName} when={saleRow.voided_at} />
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
          <div>
            <p className="text-muted-foreground">Customer</p>
            <p className="font-medium">
              {customer ? (
                <Link href={`/customers/${customer.id}`} className="hover:underline">
                  {customer.name}
                </Link>
              ) : (
                "Walk-in"
              )}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Sale date</p>
            <p className="font-medium">{formatDate(saleRow.sale_date)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Branch</p>
            <p className="font-medium">{branchName}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Paid</p>
            <p className="font-medium">
              {saleRow.is_paid ? (
                <Badge variant="success">Paid</Badge>
              ) : (
                <Badge variant="warning">Unpaid</Badge>
              )}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">OR no.</p>
            <p className="font-medium">{saleRow.or_no ?? "—"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">CSI no.</p>
            <p className="font-medium">{saleRow.csi_no ?? "—"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">CI no.</p>
            <p className="font-medium">{saleRow.ci_no ?? "—"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Referred by</p>
            <p className="font-medium">{saleRow.referred_by ?? "—"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Discount</p>
            <p className="font-medium">{formatCurrency(discount)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Discount type</p>
            <p className="font-medium">{DISCOUNT_TYPE_LABELS[discountType]}</p>
          </div>
          <div>
            <p className="text-muted-foreground">VAT-exempt</p>
            <p className="font-medium">{isVatExempt ? "Yes" : "No"}</p>
          </div>
          {isScOrPwd ? (
            <div>
              <p className="text-muted-foreground">
                {discountType === "senior_citizen" ? "Senior Citizen ID no." : "PWD ID no."}
              </p>
              <p className="font-medium">{saleRow.discount_id_no ?? "—"}</p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Lines</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead>Serial</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Unit price</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Returned</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground">
                      No lines recorded.
                    </TableCell>
                  </TableRow>
                ) : (
                  lines.map((line: LineRow) => {
                    const returnedQty = line.returned_quantity ?? 0;
                    const remaining = line.quantity - returnedQty;
                    const canReturnLine =
                      line.line_type === "stock" && remaining > 0 && canReturn;
                    return (
                      <TableRow key={line.id}>
                        <TableCell className="font-medium">
                          {lineName(line)}
                          <span className="ml-2 text-xs text-muted-foreground">
                            {line.line_type === "stock" ? "Product" : "Service"}
                          </span>
                          {line.is_freebie ? (
                            <Badge variant="success" className="ml-2">
                              FREE
                            </Badge>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          <div className="flex items-center gap-1">
                            {line.serial_snapshot ?? "—"}
                            {isAdmin && line.line_type === "stock" ? (
                              <SerialCorrectDialog
                                scope="sale_line"
                                id={line.id}
                                currentSerial={line.serial_snapshot}
                                returnPath={`/sales/${saleRow.id}`}
                              />
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {line.quantity}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatCurrency(line.unit_price)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatCurrency(line.quantity * line.unit_price)}
                        </TableCell>
                        <TableCell>
                          <AfterSalesBadge status={line.after_sales_status} />
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {returnedQty > 0 ? returnedQty : "—"}
                        </TableCell>
                        <TableCell>
                          {canReturnLine ? (
                            <ReturnDialog
                              saleId={saleRow.id}
                              lineId={line.id}
                              itemLabel={lineName(line)}
                              remainingQuantity={remaining}
                            />
                          ) : null}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {isScOrPwd ? (
            <div className="flex flex-col items-end gap-2 text-sm">
              <div className="flex w-full max-w-xs items-center justify-between">
                <span className="text-muted-foreground">Gross (VAT-inc)</span>
                <span className="font-medium tabular-nums">{formatCurrency(gross)}</span>
              </div>
              <div className="flex w-full max-w-xs items-center justify-between">
                <span className="text-muted-foreground">Less: VAT (exempt)</span>
                <span className="font-medium tabular-nums">
                  -{formatCurrency(vatExemptRemoved)}
                </span>
              </div>
              <div className="flex w-full max-w-xs items-center justify-between border-t border-border pt-2">
                <span className="text-muted-foreground">VAT-exempt sale</span>
                <span className="font-medium tabular-nums">{formatCurrency(vatExemptBase)}</span>
              </div>
              <div className="flex w-full max-w-xs items-center justify-between">
                <span className="text-muted-foreground">Less: 20% discount</span>
                <span className="font-medium tabular-nums">-{formatCurrency(discount)}</span>
              </div>
              <div className="flex w-full max-w-xs items-center justify-between border-t border-border pt-2">
                <span className="font-semibold">Net payable</span>
                <span className="font-semibold tabular-nums">{formatCurrency(netPayable)}</span>
              </div>
              <div className="flex w-full max-w-xs items-center justify-between">
                <span className="text-muted-foreground">VAT recorded</span>
                <span className="font-medium tabular-nums">
                  {formatCurrency(saleRow.vat_amount ?? 0)}
                </span>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-end gap-2 text-sm">
              <div className="flex w-full max-w-xs items-center justify-between">
                <span className="text-muted-foreground">Gross</span>
                <span className="font-medium tabular-nums">{formatCurrency(gross)}</span>
              </div>
              <div className="flex w-full max-w-xs items-center justify-between">
                <span className="text-muted-foreground">Discount</span>
                <span className="font-medium tabular-nums">{formatCurrency(discount)}</span>
              </div>
              <div className="flex w-full max-w-xs items-center justify-between border-t border-border pt-2">
                <span className="font-semibold">Final price</span>
                <span className="font-semibold tabular-nums">{formatCurrency(net)}</span>
              </div>
              <div className="flex w-full max-w-xs items-center justify-between">
                <span className="text-muted-foreground">VAT</span>
                <span className="font-medium tabular-nums">
                  {isVatExempt
                    ? "VAT-exempt"
                    : saleRow.vat_amount !== null
                      ? formatCurrency(saleRow.vat_amount)
                      : "—"}
                </span>
              </div>
              <div className="flex w-full max-w-xs items-center justify-between">
                <span className="text-muted-foreground">Net of VAT</span>
                <span className="font-medium tabular-nums">
                  {saleRow.vat_amount !== null
                    ? formatCurrency(Math.max(0, net - saleRow.vat_amount))
                    : "—"}
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <PaymentsCard
        saleId={saleRow.id}
        payments={paymentCardRows}
        netPayable={paymentNet}
        paid={totalPaid}
        balance={balanceDue}
        canRecord={canRecordPayment}
        isAdmin={isAdmin}
      />
    </div>
  );
}
