import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusBadge } from "@/components/inventory/stock-table";
import { TransferStatusBadge } from "@/components/transfers/status-badge";
import type { TransferStatus } from "@/lib/validators/transfer";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

type StockDetailPageProps = {
  params: Promise<{ id: string }>;
};

type StockDetailQueryRow = {
  id: string;
  product_id: string;
  supplier_id: string | null;
  branch_id: string;
  quantity: number;
  original_quantity: number;
  serial_number: string | null;
  status: string;
  cost_per_unit: number | null;
  total_cost: number | null;
  supplier_invoice_no: string | null;
  supplier_invoice_date: string | null;
  expiry_date: string | null;
  branch_date_received: string | null;
  is_repair_pool: boolean;
  is_office_asset: boolean;
  products: { name: string } | { name: string }[] | null;
  branches: { name: string } | { name: string }[] | null;
  suppliers: { name: string } | { name: string }[] | null;
};

type StockMovementRow = {
  id: number;
  occurred_at: string;
  movement_type: string;
  quantity: number;
  from_branch_id: string | null;
  to_branch_id: string | null;
  note: string | null;
};

type TransferLineRow = {
  transfer_id: string;
  transfers:
    | { code: string; status: TransferStatus }
    | { code: string; status: TransferStatus }[]
    | null;
};

const OUTBOUND_TYPES = ["sale", "transfer_out", "repair_out"];

function firstOrNull<T>(value: T | T[] | null): T | null {
  if (value == null) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function formatTypeLabel(type: string): string {
  return type
    .split("_")
    .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
  }).format(value);
}

export default async function StockDetailPage({
  params,
}: StockDetailPageProps) {
  const { id } = await params;
  const supabase = await createClient();

  // stock_visible (not the base `stock` table) so branch scoping and cost
  // nulling for non-admin/top_mgmt stay identical to the inventory list.
  const { data: stockData, error: stockError } = await supabase
    .from("stock_visible")
    .select(
      "id, product_id, supplier_id, branch_id, quantity, original_quantity, serial_number, status, cost_per_unit, total_cost, supplier_invoice_no, supplier_invoice_date, expiry_date, branch_date_received, is_repair_pool, is_office_asset, products(name), branches(name), suppliers(name)",
    )
    .eq("id", id)
    .maybeSingle();

  if (stockError || !stockData) {
    notFound();
  }

  const stock = stockData as StockDetailQueryRow;
  const productName = firstOrNull(stock.products)?.name ?? "—";
  const branchName = firstOrNull(stock.branches)?.name ?? "—";
  const supplierName = firstOrNull(stock.suppliers)?.name ?? null;

  const [movementsResult, branchesResult, transferLinesResult] =
    await Promise.all([
      // Base stock_movements table (not a view): RLS already scopes rows to
      // movements where the caller's branch is the from- or to-branch, which
      // matches this page's access model without extra filtering here.
      supabase
        .from("stock_movements")
        .select(
          "id, occurred_at, movement_type, quantity, from_branch_id, to_branch_id, note",
        )
        .eq("stock_id", id)
        .order("occurred_at", { ascending: true })
        .order("id", { ascending: true }),
      supabase.from("branches").select("id, name"),
      supabase
        .from("transfer_line_items")
        .select("transfer_id, transfers(code, status)")
        .eq("stock_id", id),
    ]);

  const movements: StockMovementRow[] =
    (movementsResult.data as StockMovementRow[] | null) ?? [];
  const branches: { id: string; name: string }[] = branchesResult.data ?? [];
  const branchNameById = new Map<string, string>(
    branches.map((branch: { id: string; name: string }) => [
      branch.id,
      branch.name,
    ]),
  );

  const transferLines: TransferLineRow[] =
    (transferLinesResult.data as TransferLineRow[] | null) ?? [];
  const relatedTransfers = transferLines
    .map((line: TransferLineRow) => {
      const transfer = firstOrNull(line.transfers);
      if (!transfer) return null;
      return {
        id: line.transfer_id,
        code: transfer.code,
        status: transfer.status,
      };
    })
    .filter(
      (
        transfer,
      ): transfer is { id: string; code: string; status: TransferStatus } =>
        transfer !== null,
    );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold">{productName}</h1>
            <StatusBadge status={stock.status} />
            {stock.is_repair_pool ? (
              <Badge variant="warning">Repair pool</Badge>
            ) : null}
            {stock.is_office_asset ? (
              <Badge variant="outline">Office asset</Badge>
            ) : null}
          </div>
          <p className="text-sm text-muted-foreground">
            {stock.serial_number ?? "No serial"} · {branchName}
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/inventory">Back to stock</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
          <div>
            <p className="text-muted-foreground">Quantity</p>
            <p className="font-medium">{stock.quantity}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Original quantity</p>
            <p className="font-medium">{stock.original_quantity}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Received</p>
            <p className="font-medium">
              {formatDate(stock.branch_date_received)}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Expiry</p>
            <p className="font-medium">{formatDate(stock.expiry_date)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Supplier</p>
            <p className="font-medium">{supplierName ?? "—"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Invoice no.</p>
            <p className="font-medium">{stock.supplier_invoice_no ?? "—"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Invoice date</p>
            <p className="font-medium">
              {formatDate(stock.supplier_invoice_date)}
            </p>
          </div>
          {stock.cost_per_unit != null ? (
            <div>
              <p className="text-muted-foreground">Cost/unit</p>
              <p className="font-medium">
                {formatCurrency(stock.cost_per_unit)}
              </p>
            </div>
          ) : null}
          {stock.total_cost != null ? (
            <div>
              <p className="text-muted-foreground">Total cost</p>
              <p className="font-medium">
                {formatCurrency(stock.total_cost)}
              </p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Movement history</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 p-0">
          <div className="rounded-lg border-t border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead>From</TableHead>
                  <TableHead>To</TableHead>
                  <TableHead>Note</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {movements.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="text-center text-muted-foreground"
                    >
                      No recorded movements for this item.
                    </TableCell>
                  </TableRow>
                ) : (
                  movements.map((movement: StockMovementRow) => (
                    <TableRow key={movement.id}>
                      <TableCell>{formatDate(movement.occurred_at)}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            OUTBOUND_TYPES.includes(movement.movement_type)
                              ? "warning"
                              : "secondary"
                          }
                        >
                          {formatTypeLabel(movement.movement_type)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {movement.quantity}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {movement.from_branch_id
                          ? (branchNameById.get(movement.from_branch_id) ??
                            "—")
                          : "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {movement.to_branch_id
                          ? (branchNameById.get(movement.to_branch_id) ?? "—")
                          : "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {movement.note ?? "—"}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          <p className="px-4 pb-4 text-sm text-muted-foreground">
            History starts at the Aug 2026 migration; earlier Bubble activity
            isn&apos;t itemized.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Related transfers</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {relatedTransfers.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">
              This item has not been part of any transfer.
            </p>
          ) : (
            <div className="flex flex-col divide-y divide-border">
              {relatedTransfers.map(
                (transfer: {
                  id: string;
                  code: string;
                  status: TransferStatus;
                }) => (
                  <Link
                    key={transfer.id}
                    href={`/transfers/${transfer.id}`}
                    className="flex items-center justify-between p-4 text-sm hover:bg-muted/40"
                  >
                    <span className="font-medium hover:underline">
                      {transfer.code}
                    </span>
                    <TransferStatusBadge status={transfer.status} />
                  </Link>
                ),
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
