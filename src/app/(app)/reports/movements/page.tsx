import Link from "next/link";
import { redirect } from "next/navigation";
import { DownloadIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/supabase/profile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/format";
import {
  parseMovementFilters,
  fetchMovements,
  MOVEMENT_TYPES,
  type MovementRow,
  type MovementType,
} from "./query";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

type MovementsPageProps = {
  searchParams: Promise<{
    from?: string;
    to?: string;
    type?: string;
    branch?: string;
    page?: string;
  }>;
};

function formatTypeLabel(type: string): string {
  return type
    .split("_")
    .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

const OUTBOUND: MovementType[] = ["sale", "transfer_out", "repair_out"];

export default async function MovementsReportPage({
  searchParams,
}: MovementsPageProps) {
  const profile = await getProfile();
  if (!profile || profile.role === "technical") {
    redirect("/");
  }

  const params = await searchParams;
  const canFilterBranch = profile.role === "admin" || profile.role === "top_mgmt";
  const filters = parseMovementFilters({
    from: params.from,
    to: params.to,
    type: params.type,
    branch: canFilterBranch ? params.branch : undefined,
  });
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const supabase = await createClient();

  const [branchesResult, { rows, count }] = await Promise.all([
    supabase.from("branches").select("id, name").order("name"),
    fetchMovements(supabase, filters, { from, to }),
  ]);
  const branches: { id: string; name: string }[] = branchesResult.data ?? [];
  const branchNameById = new Map<string, string>(
    branches.map((branch: { id: string; name: string }) => [branch.id, branch.name]),
  );

  const productIds = Array.from(
    new Set(
      rows
        .map((row: MovementRow) => row.product_id)
        .filter((id: string | null): id is string => id !== null),
    ),
  );
  let productNameById = new Map<string, string>();
  if (productIds.length > 0) {
    const { data: productRows } = await supabase
      .from("products")
      .select("id, name")
      .in("id", productIds);
    type ProductRow = { id: string; name: string };
    productNameById = new Map(
      ((productRows as ProductRow[] | null) ?? []).map((row: ProductRow) => [
        row.id,
        row.name,
      ]),
    );
  }

  const total = count;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function buildPageHref(targetPage: number): string {
    const next = new URLSearchParams();
    next.set("from", filters.from);
    next.set("to", filters.to);
    if (filters.type) next.set("type", filters.type);
    if (filters.branch) next.set("branch", filters.branch);
    next.set("page", String(targetPage));
    return `/reports/movements?${next.toString()}`;
  }

  const exportParams = new URLSearchParams();
  exportParams.set("from", filters.from);
  exportParams.set("to", filters.to);
  if (filters.type) exportParams.set("type", filters.type);
  if (filters.branch) exportParams.set("branch", filters.branch);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Stock movements</h1>
          <p className="text-sm text-muted-foreground">
            Every stock movement in the ledger: intakes, transfers, sales,
            returns, and adjustments.
          </p>
        </div>
        <Button asChild variant="outline">
          <a href={`/reports/movements/export?${exportParams.toString()}`}>
            <DownloadIcon className="size-4" />
            Export CSV
          </a>
        </Button>
      </div>

      <form className="flex flex-wrap items-end gap-3" method="get">
        <div className="grid gap-1.5">
          <label htmlFor="from" className="text-sm font-medium">
            From
          </label>
          <Input id="from" name="from" type="date" defaultValue={filters.from} className="w-40" />
        </div>
        <div className="grid gap-1.5">
          <label htmlFor="to" className="text-sm font-medium">
            To
          </label>
          <Input id="to" name="to" type="date" defaultValue={filters.to} className="w-40" />
        </div>
        <div className="grid gap-1.5">
          <label htmlFor="type" className="text-sm font-medium">
            Type
          </label>
          <Select name="type" defaultValue={filters.type || undefined}>
            <SelectTrigger id="type" className="w-40">
              <SelectValue placeholder="All types" />
            </SelectTrigger>
            <SelectContent>
              {MOVEMENT_TYPES.map((type: MovementType) => (
                <SelectItem key={type} value={type}>
                  {formatTypeLabel(type)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {canFilterBranch ? (
          <div className="grid gap-1.5">
            <label htmlFor="branch" className="text-sm font-medium">
              Branch
            </label>
            <Select name="branch" defaultValue={filters.branch || undefined}>
              <SelectTrigger id="branch" className="w-44">
                <SelectValue placeholder="All branches" />
              </SelectTrigger>
              <SelectContent>
                {branches.map((branch: { id: string; name: string }) => (
                  <SelectItem key={branch.id} value={branch.id}>
                    {branch.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
        <Button type="submit" variant="secondary">
          Apply
        </Button>
        <Button asChild variant="ghost">
          <Link href="/reports/movements">Reset</Link>
        </Button>
      </form>

      <div className="rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Product</TableHead>
              <TableHead>Serial</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead>Branch</TableHead>
              <TableHead>Counterparty</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  No movements match the current filters.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row: MovementRow) => (
                <TableRow key={row.id}>
                  <TableCell>{formatDate(row.occurred_at)}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        OUTBOUND.includes(row.movement_type) ? "warning" : "secondary"
                      }
                    >
                      {formatTypeLabel(row.movement_type)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {row.product_id
                      ? (productNameById.get(row.product_id) ?? "—")
                      : "—"}
                  </TableCell>
                  <TableCell>{row.serial_number ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.quantity}
                  </TableCell>
                  <TableCell>
                    {row.branch_id ? (branchNameById.get(row.branch_id) ?? "—") : "—"}
                  </TableCell>
                  <TableCell>
                    {row.counterparty_branch_id
                      ? (branchNameById.get(row.counterparty_branch_id) ?? "—")
                      : "—"}
                  </TableCell>
                </TableRow>
              ))
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
