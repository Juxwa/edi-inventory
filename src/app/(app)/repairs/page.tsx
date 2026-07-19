import Link from "next/link";
import { redirect } from "next/navigation";
import { PlusIcon } from "lucide-react";
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
import { RepairsTable, type RepairRowData } from "@/components/repairs/repairs-table";
import { formatStatusLabel } from "@/components/repairs/status-badge";
import { REPAIR_STATUSES, type RepairStatus } from "@/lib/validators/repair";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

type RepairsPageProps = {
  searchParams: Promise<{
    status?: string;
    q?: string;
    page?: string;
  }>;
};

type RepairQueryRow = {
  id: string;
  sar_no: string | null;
  customer_id: string | null;
  requesting_branch_id: string | null;
  sale_line_item_id: string | null;
  manual_serial: string | null;
  assigned_to: string | null;
  status: RepairStatus;
  request_date: string;
};

export default async function RepairsPage({ searchParams }: RepairsPageProps) {
  const profile = await getProfile();
  if (!profile) {
    redirect("/");
  }

  const params = await searchParams;
  const statusParam = params.status?.trim() ?? "";
  const q = params.q?.trim() ?? "";
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const supabase = await createClient();

  let matchingCustomerIds: string[] = [];
  if (q) {
    const { data: customerMatches } = await supabase
      .from("customers")
      .select("id")
      .ilike("name", `%${q}%`);
    matchingCustomerIds = (customerMatches ?? []).map((row: { id: string }) => row.id);
  }

  let query = supabase
    .from("repair_requests")
    .select(
      "id, sar_no, customer_id, requesting_branch_id, sale_line_item_id, manual_serial, assigned_to, status, request_date",
      { count: "exact" },
    )
    .order("request_date", { ascending: false })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (statusParam) query = query.eq("status", statusParam);

  if (q) {
    const filters = [`sar_no.ilike.%${q}%`, `manual_serial.ilike.%${q}%`];
    if (matchingCustomerIds.length > 0) {
      filters.push(`customer_id.in.(${matchingCustomerIds.join(",")})`);
    }
    query = query.or(filters.join(","));
  }

  const { data, count } = await query;
  const rows: RepairQueryRow[] = (data as RepairQueryRow[] | null) ?? [];

  const customerIds = rows
    .map((row: RepairQueryRow) => row.customer_id)
    .filter((id: string | null): id is string => id !== null);
  const profileIds = rows
    .map((row: RepairQueryRow) => row.assigned_to)
    .filter((id: string | null): id is string => id !== null);
  const lineIds = rows
    .map((row: RepairQueryRow) => row.sale_line_item_id)
    .filter((id: string | null): id is string => id !== null);

  const [branchesResult, customersResult, profilesResult, linesResult] =
    await Promise.all([
      supabase.from("branches").select("id, name"),
      customerIds.length > 0
        ? supabase.from("customers").select("id, name").in("id", customerIds)
        : Promise.resolve({ data: [] }),
      profileIds.length > 0
        ? supabase.from("profiles").select("id, name").in("id", profileIds)
        : Promise.resolve({ data: [] }),
      lineIds.length > 0
        ? supabase
            .from("sale_line_items")
            .select("id, serial_snapshot")
            .in("id", lineIds)
        : Promise.resolve({ data: [] }),
    ]);

  type NamedRow = { id: string; name: string };
  const branchNameById = new Map<string, string>(
    ((branchesResult.data as NamedRow[] | null) ?? []).map((row: NamedRow) => [
      row.id,
      row.name,
    ]),
  );
  const customerNameById = new Map<string, string>(
    ((customersResult.data as NamedRow[] | null) ?? []).map((row: NamedRow) => [
      row.id,
      row.name,
    ]),
  );
  const profileNameById = new Map<string, string>(
    ((profilesResult.data as NamedRow[] | null) ?? []).map((row: NamedRow) => [
      row.id,
      row.name,
    ]),
  );
  type LineRow = { id: string; serial_snapshot: string | null };
  const serialByLineId = new Map<string, string | null>(
    ((linesResult.data as LineRow[] | null) ?? []).map((row: LineRow) => [
      row.id,
      row.serial_snapshot,
    ]),
  );

  const repairs: RepairRowData[] = rows.map((row: RepairQueryRow) => ({
    id: row.id,
    sar_no: row.sar_no,
    customer_name: row.customer_id
      ? (customerNameById.get(row.customer_id) ?? "—")
      : "—",
    branch_name: row.requesting_branch_id
      ? (branchNameById.get(row.requesting_branch_id) ?? "—")
      : "—",
    serial:
      row.manual_serial ??
      (row.sale_line_item_id
        ? (serialByLineId.get(row.sale_line_item_id) ?? "—")
        : "—") ??
      "—",
    technician_name: row.assigned_to
      ? (profileNameById.get(row.assigned_to) ?? "—")
      : "Unassigned",
    status: row.status,
    request_date: row.request_date,
  }));

  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function buildPageHref(targetPage: number): string {
    const next = new URLSearchParams();
    if (statusParam) next.set("status", statusParam);
    if (q) next.set("q", q);
    next.set("page", String(targetPage));
    return `/repairs?${next.toString()}`;
  }

  const canIntake =
    profile.role === "admin" ||
    profile.role === "branch_rep" ||
    profile.role === "technical";
  const hasFilters = statusParam || q;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Repairs</h1>
          <p className="text-sm text-muted-foreground">
            Track repair requests from intake to return.
          </p>
        </div>
        {canIntake ? (
          <Button asChild>
            <Link href="/repairs/new">
              <PlusIcon className="size-4" />
              Repair intake
            </Link>
          </Button>
        ) : null}
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
              {REPAIR_STATUSES.map((status: RepairStatus) => (
                <SelectItem key={status} value={status}>
                  {formatStatusLabel(status)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <label htmlFor="q" className="text-sm font-medium">
            Search
          </label>
          <Input
            id="q"
            name="q"
            defaultValue={q}
            placeholder="SAR no., serial, or customer"
            className="w-56"
          />
        </div>
        <Button type="submit" variant="secondary">
          Apply
        </Button>
        {hasFilters ? (
          <Button asChild variant="ghost">
            <Link href="/repairs">Clear</Link>
          </Button>
        ) : null}
      </form>

      <RepairsTable rows={repairs} />

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
