import Link from "next/link";
import { requireBackendAdmin } from "@/lib/backend-admin";
import { createAdminClient } from "@/lib/supabase/admin";
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
  ActivityTable,
  type ActivityRowData,
} from "@/components/admin/activity-table";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

const ACTIVITY_TABLES = [
  "stock",
  "sales",
  "sale_line_items",
  "transfers",
  "transfer_line_items",
  "inventory_requests",
  "request_line_items",
  "repair_requests",
  "repair_status_events",
  "earmold_requests",
  "customers",
  "visits",
  "profiles",
  "products",
  "suppliers",
  "services",
  "service_pricing",
  "branches",
  "admin_corrections",
  "auth_users",
] as const;

const ACTIVITY_OPS = ["INSERT", "UPDATE", "DELETE"] as const;

type ActivityPageProps = {
  searchParams: Promise<{
    table_name?: string;
    op?: string;
    row_id?: string;
    from?: string;
    to?: string;
    page?: string;
  }>;
};

type ActivityQueryRow = {
  id: number;
  occurred_at: string;
  table_name: string;
  op: "INSERT" | "UPDATE" | "DELETE";
  row_id: string | null;
  actor_id: string | null;
  old_data: unknown;
  new_data: unknown;
  changed_cols: string[] | null;
};

export default async function ActivityPage({ searchParams }: ActivityPageProps) {
  await requireBackendAdmin();

  const params = await searchParams;
  const tableParam = params.table_name?.trim() ?? "";
  const opParam = params.op?.trim() ?? "";
  const rowIdParam = params.row_id?.trim() ?? "";
  const fromDate = params.from?.trim() ?? "";
  const toDate = params.to?.trim() ?? "";
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const admin = createAdminClient();

  let query = admin
    .from("activity_log")
    .select(
      "id, occurred_at, table_name, op, row_id, actor_id, old_data, new_data, changed_cols",
      { count: "exact" },
    )
    .order("occurred_at", { ascending: false })
    .range(from, to);

  if (tableParam) query = query.eq("table_name", tableParam);
  if (opParam) query = query.eq("op", opParam);
  if (rowIdParam) query = query.eq("row_id", rowIdParam);
  if (fromDate) query = query.gte("occurred_at", `${fromDate}T00:00:00`);
  if (toDate) query = query.lte("occurred_at", `${toDate}T23:59:59`);

  const { data, count } = await query;
  const rows: ActivityQueryRow[] = (data as ActivityQueryRow[] | null) ?? [];

  const actorIds = Array.from(
    new Set(
      rows
        .map((row: ActivityQueryRow) => row.actor_id)
        .filter((id: string | null): id is string => id !== null),
    ),
  );
  let actorNameById = new Map<string, string>();
  if (actorIds.length > 0) {
    const { data: profileRows } = await admin
      .from("profiles")
      .select("id, name")
      .in("id", actorIds);
    type ProfileRow = { id: string; name: string };
    actorNameById = new Map(
      ((profileRows as ProfileRow[] | null) ?? []).map((row: ProfileRow) => [
        row.id,
        row.name,
      ]),
    );
  }

  const activity: ActivityRowData[] = rows.map((row: ActivityQueryRow) => ({
    id: row.id,
    occurred_at: row.occurred_at,
    table_name: row.table_name,
    op: row.op,
    row_id: row.row_id,
    actor_name: row.actor_id ? (actorNameById.get(row.actor_id) ?? "—") : "—",
    old_data: row.old_data,
    new_data: row.new_data,
    changed_cols: row.changed_cols,
  }));

  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function buildPageHref(targetPage: number): string {
    const next = new URLSearchParams();
    if (tableParam) next.set("table_name", tableParam);
    if (opParam) next.set("op", opParam);
    if (rowIdParam) next.set("row_id", rowIdParam);
    if (fromDate) next.set("from", fromDate);
    if (toDate) next.set("to", toDate);
    next.set("page", String(targetPage));
    return `/admin/activity?${next.toString()}`;
  }

  const hasFilters = tableParam || opParam || rowIdParam || fromDate || toDate;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold">Activity log</h1>
        <p className="text-sm text-muted-foreground">
          Every trigger-captured insert, update, and delete across the app, with
          before/after snapshots.
        </p>
      </div>

      <form className="flex flex-wrap items-end gap-3" method="get">
        <div className="grid gap-1.5">
          <label htmlFor="table_name" className="text-sm font-medium">
            Table
          </label>
          <Select name="table_name" defaultValue={tableParam || undefined}>
            <SelectTrigger id="table_name" className="w-48">
              <SelectValue placeholder="All tables" />
            </SelectTrigger>
            <SelectContent>
              {ACTIVITY_TABLES.map((table: string) => (
                <SelectItem key={table} value={table}>
                  {table}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <label htmlFor="op" className="text-sm font-medium">
            Operation
          </label>
          <Select name="op" defaultValue={opParam || undefined}>
            <SelectTrigger id="op" className="w-36">
              <SelectValue placeholder="All ops" />
            </SelectTrigger>
            <SelectContent>
              {ACTIVITY_OPS.map((op: string) => (
                <SelectItem key={op} value={op}>
                  {op}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <label htmlFor="row_id" className="text-sm font-medium">
            Row ID
          </label>
          <Input
            id="row_id"
            name="row_id"
            defaultValue={rowIdParam}
            className="w-44"
            placeholder="exact id"
          />
        </div>
        <div className="grid gap-1.5">
          <label htmlFor="from" className="text-sm font-medium">
            From
          </label>
          <Input id="from" name="from" type="date" defaultValue={fromDate} className="w-40" />
        </div>
        <div className="grid gap-1.5">
          <label htmlFor="to" className="text-sm font-medium">
            To
          </label>
          <Input id="to" name="to" type="date" defaultValue={toDate} className="w-40" />
        </div>
        <Button type="submit" variant="secondary">
          Apply
        </Button>
        {hasFilters ? (
          <Button asChild variant="ghost">
            <Link href="/admin/activity">Clear</Link>
          </Button>
        ) : null}
      </form>

      <ActivityTable rows={activity} />

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
