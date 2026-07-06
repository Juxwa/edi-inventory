import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

type AgingBucket = "0-90" | "91-180" | "181-365" | "365+";

const BUCKETS: AgingBucket[] = ["0-90", "91-180", "181-365", "365+"];

function bucketFor(days: number): AgingBucket {
  if (days <= 90) return "0-90";
  if (days <= 180) return "91-180";
  if (days <= 365) return "181-365";
  return "365+";
}

const BUCKET_VARIANT: Record<AgingBucket, "success" | "secondary" | "warning" | "destructive"> = {
  "0-90": "success",
  "91-180": "secondary",
  "181-365": "warning",
  "365+": "destructive",
};

type StockAgingRow = {
  id: string;
  product_id: string;
  branch_id: string;
  serial_number: string | null;
  status: string;
  branch_date_received: string | null;
  days_on_hand: number;
};

type AgingPageProps = {
  searchParams: Promise<{ page?: string }>;
};

export default async function StockAgingPage({
  searchParams,
}: AgingPageProps) {
  const params = await searchParams;
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const supabase = await createClient();

  const { data: agingRows } = await supabase
    .from("stock_aging")
    .select("id, product_id, branch_id, serial_number, status, branch_date_received, days_on_hand")
    .order("days_on_hand", { ascending: false });

  const allRows: StockAgingRow[] = agingRows ?? [];

  const productIds = Array.from(
    new Set(allRows.map((row: StockAgingRow) => row.product_id)),
  );
  const branchIds = Array.from(
    new Set(allRows.map((row: StockAgingRow) => row.branch_id)),
  );

  let productRows: { id: string; name: string }[] = [];
  if (productIds.length > 0) {
    const { data } = await supabase
      .from("products")
      .select("id, name")
      .in("id", productIds);
    productRows = data ?? [];
  }

  let branchRows: { id: string; name: string }[] = [];
  if (branchIds.length > 0) {
    const { data } = await supabase
      .from("branches")
      .select("id, name")
      .in("id", branchIds);
    branchRows = data ?? [];
  }

  const productNameById = new Map<string, string>(
    productRows.map((product: { id: string; name: string }) => [
      product.id,
      product.name,
    ]),
  );
  const branchNameById = new Map<string, string>(
    branchRows.map((branch: { id: string; name: string }) => [
      branch.id,
      branch.name,
    ]),
  );

  // Summary: branch x bucket counts.
  const summary = new Map<string, Map<AgingBucket, number>>();
  for (const row of allRows) {
    const branchName = branchNameById.get(row.branch_id) ?? "Unknown branch";
    const bucket = bucketFor(row.days_on_hand);
    if (!summary.has(branchName)) {
      summary.set(
        branchName,
        new Map(BUCKETS.map((b: AgingBucket) => [b, 0])),
      );
    }
    const bucketCounts = summary.get(branchName)!;
    bucketCounts.set(bucket, (bucketCounts.get(bucket) ?? 0) + 1);
  }
  const summaryRows = Array.from(summary.entries()).sort(
    ([a]: [string, Map<AgingBucket, number>], [b]: [string, Map<AgingBucket, number>]) =>
      a.localeCompare(b),
  );

  const total = allRows.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageRows = allRows.slice(from, to + 1);

  function buildPageHref(targetPage: number): string {
    const next = new URLSearchParams();
    next.set("page", String(targetPage));
    return `/inventory/aging?${next.toString()}`;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Stock aging</h1>
          <p className="text-sm text-muted-foreground">
            Days on hand for available stock, bucketed by age.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/inventory">Back to stock</Link>
        </Button>
      </div>

      <div className="rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Branch</TableHead>
              {BUCKETS.map((bucket: AgingBucket) => (
                <TableHead key={bucket} className="text-right">
                  {bucket} days
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {summaryRows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={BUCKETS.length + 1}
                  className="text-center text-muted-foreground"
                >
                  No available stock.
                </TableCell>
              </TableRow>
            ) : (
              summaryRows.map(
                ([branchName, bucketCounts]: [
                  string,
                  Map<AgingBucket, number>,
                ]) => (
                  <TableRow key={branchName}>
                    <TableCell className="font-medium">{branchName}</TableCell>
                    {BUCKETS.map((bucket: AgingBucket) => (
                      <TableCell key={bucket} className="text-right tabular-nums">
                        {bucketCounts.get(bucket) ?? 0}
                      </TableCell>
                    ))}
                  </TableRow>
                ),
              )
            )}
          </TableBody>
        </Table>
      </div>

      <div className="rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead>Serial</TableHead>
              <TableHead>Branch</TableHead>
              <TableHead className="text-right">Days on hand</TableHead>
              <TableHead>Bucket</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  No aging stock to show.
                </TableCell>
              </TableRow>
            ) : (
              pageRows.map((row: StockAgingRow) => {
                const bucket = bucketFor(row.days_on_hand);
                return (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">
                      {productNameById.get(row.product_id) ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {row.serial_number ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {branchNameById.get(row.branch_id) ?? "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.days_on_hand}
                    </TableCell>
                    <TableCell>
                      <Badge variant={BUCKET_VARIANT[bucket]}>{bucket} days</Badge>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {total > 0 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Showing {from + 1}
            {"–"}
            {Math.min(to + 1, total)} of {total}
          </span>
          <div className="flex gap-2">
            <Button
              asChild
              variant="outline"
              size="sm"
              disabled={page <= 1}
              className={page <= 1 ? "pointer-events-none opacity-50" : ""}
            >
              <Link href={buildPageHref(Math.max(1, page - 1))}>Previous</Link>
            </Button>
            <Button
              asChild
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              className={
                page >= totalPages ? "pointer-events-none opacity-50" : ""
              }
            >
              <Link href={buildPageHref(Math.min(totalPages, page + 1))}>
                Next
              </Link>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
