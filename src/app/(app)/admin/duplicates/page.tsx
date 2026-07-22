import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/supabase/profile";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusBadge } from "@/components/inventory/stock-table";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

// Legacy Bubble data may contain stock rows sharing the same serial number
// (nothing in this app writes them going forward — see migration 0024,
// which added the duplicate check to stock_intake). This page lists them
// grouped by serial so an admin can clean them up manually.
type DuplicateRow = {
  id: string;
  serial_number: string;
  product_id: string;
  branch_id: string;
  status: string;
  quantity: number;
  branch_date_received: string | null;
  created_at: string;
};

export default async function DuplicateSerialsPage() {
  const profile = await getProfile();
  if (!profile || profile.role !== "admin") {
    redirect("/");
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from("stock_duplicate_serials")
    .select(
      "id, serial_number, product_id, branch_id, status, quantity, branch_date_received, created_at",
    );

  const rows: DuplicateRow[] = (data as DuplicateRow[] | null) ?? [];

  const productIds = Array.from(new Set(rows.map((row: DuplicateRow) => row.product_id)));
  const branchIds = Array.from(new Set(rows.map((row: DuplicateRow) => row.branch_id)));

  const [productsResult, branchesResult] = await Promise.all([
    productIds.length > 0
      ? supabase.from("products").select("id, name").in("id", productIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    branchIds.length > 0
      ? supabase.from("branches").select("id, name").in("id", branchIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);

  type NameRow = { id: string; name: string };
  const productNameById = new Map<string, string>(
    ((productsResult.data as NameRow[] | null) ?? []).map((row: NameRow) => [row.id, row.name]),
  );
  const branchNameById = new Map<string, string>(
    ((branchesResult.data as NameRow[] | null) ?? []).map((row: NameRow) => [row.id, row.name]),
  );

  const groupCount = new Set(
    rows.map((row: DuplicateRow) => row.serial_number.trim().toLowerCase()),
  ).size;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold">Duplicate serials</h1>
        <p className="text-sm text-muted-foreground">
          Stock rows sharing the same serial number (case-insensitive,
          trimmed) — mostly legacy imported data. New intakes reject
          duplicate serials automatically; these existing rows need manual
          review. {rows.length} row{rows.length === 1 ? "" : "s"} across{" "}
          {groupCount} serial{groupCount === 1 ? "" : "s"}.
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border py-16 text-center">
          <p className="text-sm font-medium">No duplicate serials found.</p>
        </div>
      ) : (
        <div className="rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Serial</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Branch</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead>Received</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row: DuplicateRow) => (
                <TableRow key={row.id}>
                  <TableCell className="font-mono text-sm">
                    {row.serial_number}
                  </TableCell>
                  <TableCell>{productNameById.get(row.product_id) ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {branchNameById.get(row.branch_id) ?? "—"}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={row.status} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.quantity}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(row.branch_date_received)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
