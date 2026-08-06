import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchAllPages, chunkIds } from "@/lib/paged";
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
  // Paged: legacy Bubble data can carry more than 1000 duplicate-serial
  // rows across a multi-year history — an un-ranged select silently
  // truncated the page (and hid duplicates from cleanup). Order matches the
  // view's own grouping (serial, then received order) so duplicates still
  // land next to each other for manual review, with `id` appended as a
  // unique tiebreaker required for deterministic paging.
  const rows = await fetchAllPages<DuplicateRow>((from: number, to: number) =>
    supabase
      .from("stock_duplicate_serials")
      .select(
        "id, serial_number, product_id, branch_id, status, quantity, branch_date_received, created_at",
      )
      .order("serial_number", { ascending: true })
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to),
  );

  const productIds = Array.from(new Set(rows.map((row: DuplicateRow) => row.product_id)));
  const branchIds = Array.from(new Set(rows.map((row: DuplicateRow) => row.branch_id)));

  type NameRow = { id: string; name: string };
  // Chunked (URL-length safety) name lookups.
  const productNameById = new Map<string, string>();
  for (const idChunk of chunkIds(productIds)) {
    const { data } = await supabase.from("products").select("id, name").in("id", idChunk);
    for (const row of (data as NameRow[] | null) ?? []) productNameById.set(row.id, row.name);
  }
  const branchNameById = new Map<string, string>();
  for (const idChunk of chunkIds(branchIds)) {
    const { data } = await supabase.from("branches").select("id, name").in("id", idChunk);
    for (const row of (data as NameRow[] | null) ?? []) branchNameById.set(row.id, row.name);
  }

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
