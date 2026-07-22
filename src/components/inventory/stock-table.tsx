import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import type { VariantProps } from "class-variance-authority";
import type { badgeVariants } from "@/components/ui/badge";
import { SerialCorrectDialog } from "@/components/admin/serial-correct-dialog";
import { VoidDialog } from "@/components/admin/void-dialog";
import {
  StockEditDialog,
  type StockEditProductOption,
} from "@/components/admin/stock-edit-dialog";
import { voidIntake } from "@/app/(app)/admin/corrections/actions";

export type StockRowData = {
  id: string;
  product_id: string;
  product_name: string;
  serial_number: string | null;
  branch_name: string;
  quantity: number;
  status: string;
  cost_per_unit: number | null;
  branch_date_received: string | null;
  supplier_invoice_no: string | null;
  supplier_invoice_date: string | null;
  expiry_date: string | null;
  is_repair_pool: boolean;
  is_office_asset: boolean;
};

type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>["variant"]>;

const STATUS_VARIANTS: Record<string, BadgeVariant> = {
  available: "success",
  sold: "secondary",
  transferred: "default",
  under_repair: "warning",
  for_replacement: "outline",
  consignment: "outline",
  returned: "outline",
};

const currencyFormatter = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 2,
});

function formatCost(cost: number | null): string {
  if (cost == null) return "—";
  return currencyFormatter.format(cost);
}

function formatDate(date: string | null): string {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatStatusLabel(status: string): string {
  return status
    .split("_")
    .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function StatusBadge({ status }: { status: string }) {
  const variant = STATUS_VARIANTS[status] ?? "outline";
  return <Badge variant={variant}>{formatStatusLabel(status)}</Badge>;
}

export function StockTable({
  rows,
  showCost = true,
  showAdminActions = false,
  editableProducts = [],
}: {
  rows: StockRowData[];
  showCost?: boolean;
  showAdminActions?: boolean;
  editableProducts?: StockEditProductOption[];
}) {
  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border py-16 text-center">
        <p className="text-sm font-medium">No stock matches your filters.</p>
        <p className="text-sm text-muted-foreground">
          Try a different search term or filter.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Product</TableHead>
            <TableHead>Serial</TableHead>
            <TableHead>Branch</TableHead>
            <TableHead className="text-right">Qty</TableHead>
            <TableHead>Status</TableHead>
            {showCost ? (
              <TableHead className="text-right">Cost/unit</TableHead>
            ) : null}
            <TableHead>Received</TableHead>
            {showAdminActions ? <TableHead className="w-56" /> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row: StockRowData) => (
            <TableRow key={row.id}>
              <TableCell className="font-medium">{row.product_name}</TableCell>
              <TableCell className="text-muted-foreground">
                <div className="flex items-center gap-1">
                  {row.serial_number ?? "—"}
                  {showAdminActions ? (
                    <SerialCorrectDialog
                      scope="stock"
                      id={row.id}
                      currentSerial={row.serial_number}
                      returnPath="/inventory"
                    />
                  ) : null}
                </div>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {row.branch_name}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {row.quantity}
              </TableCell>
              <TableCell>
                <StatusBadge status={row.status} />
              </TableCell>
              {showCost ? (
                <TableCell className="text-right tabular-nums">
                  {formatCost(row.cost_per_unit)}
                </TableCell>
              ) : null}
              <TableCell className="text-muted-foreground">
                {formatDate(row.branch_date_received)}
              </TableCell>
              {showAdminActions ? (
                <TableCell>
                  <div className="flex items-center gap-2">
                    <StockEditDialog
                      stockId={row.id}
                      currentProductId={row.product_id}
                      currentProductLabel={row.product_name}
                      products={editableProducts}
                      costPerUnit={row.cost_per_unit}
                      invoiceNo={row.supplier_invoice_no}
                      invoiceDate={row.supplier_invoice_date}
                      expiryDate={row.expiry_date}
                      isRepairPool={row.is_repair_pool}
                      isOfficeAsset={row.is_office_asset}
                    />
                    <VoidDialog
                      action={voidIntake}
                      hiddenFields={{ stock_id: row.id }}
                      triggerLabel="Void intake"
                      title="Void this stock intake"
                      description="Only stock with no activity beyond its own intake can be voided. This deletes the stock row entirely."
                      confirmLabel="Void intake"
                      pendingLabel="Voiding..."
                      variant="outline"
                    />
                  </div>
                </TableCell>
              ) : null}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
