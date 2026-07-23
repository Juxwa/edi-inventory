import Link from "next/link";
import { redirect } from "next/navigation";
import { PlusIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/supabase/profile";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TransferTable, type TransferRowData } from "@/components/transfers/transfer-table";
import { TRANSFER_STATUSES, type TransferStatus } from "@/lib/validators/transfer";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

function formatStatusLabel(status: string): string {
  return status
    .split("_")
    .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

type TransfersPageProps = {
  searchParams: Promise<{
    status?: string;
    branch?: string;
    page?: string;
  }>;
};

type TransferQueryRow = {
  id: string;
  code: string;
  status: TransferStatus;
  from_branch_id: string;
  to_branch_id: string;
  transfer_date: string | null;
  received_date: string | null;
  courier: string | null;
  created_at: string;
  transfer_line_items: { count: number }[] | null;
};

export default async function TransfersPage({
  searchParams,
}: TransfersPageProps) {
  const profile = await getProfile();
  if (!profile || profile.role === "technical") {
    redirect("/");
  }
  const params = await searchParams;
  const statusParam = params.status?.trim() ?? "";
  const branchParam = params.branch?.trim() ?? "";
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const supabase = await createClient();
  const canFilterByBranch =
    profile.role === "admin" || profile.role === "top_mgmt";

  const branchesResult = await supabase
    .from("branches")
    .select("id, name")
    .order("name");
  const branches: { id: string; name: string }[] = branchesResult.data ?? [];

  let query = supabase
    .from("transfers")
    .select(
      "id, code, status, from_branch_id, to_branch_id, transfer_date, received_date, courier, created_at, transfer_line_items(count)",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range(from, to);

  if (statusParam) {
    query = query.eq("status", statusParam);
  }
  if (canFilterByBranch && branchParam) {
    query = query.or(
      `from_branch_id.eq.${branchParam},to_branch_id.eq.${branchParam}`,
    );
  }

  const { data, count } = await query;
  const rows: TransferQueryRow[] = (data as TransferQueryRow[] | null) ?? [];

  const branchNameById = new Map<string, string>(
    branches.map((branch: { id: string; name: string }) => [
      branch.id,
      branch.name,
    ]),
  );

  // Discrepancy lookup is a second, targeted query rather than a nested
  // embed (unreliable response shape without generated DB types) — fetch
  // just the transfer ids on this page that have at least one short line.
  const transferIds = rows.map((row: TransferQueryRow) => row.id);
  let discrepantTransferIds = new Set<string>();
  if (transferIds.length > 0) {
    const { data: discrepancyRows } = await supabase
      .from("transfer_line_items")
      .select("transfer_id, quantity, received_quantity")
      .in("transfer_id", transferIds)
      .not("received_quantity", "is", null);
    type DiscrepancyRow = {
      transfer_id: string;
      quantity: number;
      received_quantity: number | null;
    };
    const discrepancies: DiscrepancyRow[] = (discrepancyRows as DiscrepancyRow[] | null) ?? [];
    discrepantTransferIds = new Set(
      discrepancies
        .filter(
          (row: DiscrepancyRow) =>
            row.received_quantity !== null && row.received_quantity < row.quantity,
        )
        .map((row: DiscrepancyRow) => row.transfer_id),
    );
  }

  const transfers: TransferRowData[] = rows.map((row: TransferQueryRow) => ({
    id: row.id,
    code: row.code,
    from_branch_name: branchNameById.get(row.from_branch_id) ?? "—",
    to_branch_name: branchNameById.get(row.to_branch_id) ?? "—",
    status: row.status,
    line_count: row.transfer_line_items?.[0]?.count ?? 0,
    transfer_date: row.transfer_date,
    received_date: row.received_date,
    courier: row.courier,
    created_at: row.created_at,
    has_discrepancy: discrepantTransferIds.has(row.id),
  }));

  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function buildPageHref(targetPage: number): string {
    const next = new URLSearchParams();
    if (statusParam) next.set("status", statusParam);
    if (branchParam) next.set("branch", branchParam);
    next.set("page", String(targetPage));
    return `/transfers?${next.toString()}`;
  }

  const hasFilters = statusParam || branchParam;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Transfers</h1>
          <p className="text-sm text-muted-foreground">
            Stock transfers between branches.
          </p>
        </div>
        <Button asChild>
          <Link href="/transfers/new">
            <PlusIcon className="size-4" />
            New transfer
          </Link>
        </Button>
      </div>

      <form className="flex flex-wrap items-end gap-3" method="get">
        <div className="grid gap-1.5">
          <label htmlFor="status" className="text-sm font-medium">
            Status
          </label>
          <Select name="status" defaultValue={statusParam || undefined}>
            <SelectTrigger id="status" className="w-44">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              {TRANSFER_STATUSES.map((status: TransferStatus) => (
                <SelectItem key={status} value={status}>
                  {formatStatusLabel(status)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {canFilterByBranch && (
          <div className="grid gap-1.5">
            <label htmlFor="branch" className="text-sm font-medium">
              Branch
            </label>
            <Select name="branch" defaultValue={branchParam || undefined}>
              <SelectTrigger id="branch" className="w-48">
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
        )}
        <Button type="submit" variant="secondary">
          Apply
        </Button>
        {hasFilters && (
          <Button asChild variant="ghost">
            <Link href="/transfers">Clear</Link>
          </Button>
        )}
      </form>

      <TransferTable rows={transfers} />

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
