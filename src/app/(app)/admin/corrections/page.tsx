import Link from "next/link";
import { redirect } from "next/navigation";
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
  CorrectionsTable,
  type CorrectionRowData,
} from "@/components/admin/corrections-table";
import {
  CORRECTION_ENTITIES,
  type CorrectionEntity,
} from "@/lib/validators/correction";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

type CorrectionsPageProps = {
  searchParams: Promise<{
    entity?: string;
    from?: string;
    to?: string;
    page?: string;
  }>;
};

type CorrectionQueryRow = {
  id: number;
  entity: string;
  entity_id: string;
  action: string;
  before_data: unknown;
  after_data: unknown;
  reason: string;
  actor_id: string | null;
  created_at: string;
};

function formatEntityLabel(entity: string): string {
  return entity
    .split("_")
    .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export default async function CorrectionsPage({
  searchParams,
}: CorrectionsPageProps) {
  const profile = await getProfile();
  if (!profile || profile.role !== "admin") {
    redirect("/");
  }

  const params = await searchParams;
  const entityParam = params.entity?.trim() ?? "";
  const fromDate = params.from?.trim() ?? "";
  const toDate = params.to?.trim() ?? "";
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const supabase = await createClient();

  let query = supabase
    .from("admin_corrections")
    .select(
      "id, entity, entity_id, action, before_data, after_data, reason, actor_id, created_at",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range(from, to);

  if (entityParam) query = query.eq("entity", entityParam);
  if (fromDate) query = query.gte("created_at", `${fromDate}T00:00:00`);
  if (toDate) query = query.lte("created_at", `${toDate}T23:59:59`);

  const { data, count } = await query;
  const rows: CorrectionQueryRow[] = (data as CorrectionQueryRow[] | null) ?? [];

  const actorIds = Array.from(
    new Set(
      rows
        .map((row: CorrectionQueryRow) => row.actor_id)
        .filter((id: string | null): id is string => id !== null),
    ),
  );
  let actorNameById = new Map<string, string>();
  if (actorIds.length > 0) {
    const { data: profileRows } = await supabase
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

  const corrections: CorrectionRowData[] = rows.map((row: CorrectionQueryRow) => ({
    id: row.id,
    entity: row.entity,
    entity_id: row.entity_id,
    action: row.action,
    before_data: row.before_data,
    after_data: row.after_data,
    reason: row.reason,
    actor_name: row.actor_id ? (actorNameById.get(row.actor_id) ?? "—") : "—",
    created_at: row.created_at,
  }));

  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function buildPageHref(targetPage: number): string {
    const next = new URLSearchParams();
    if (entityParam) next.set("entity", entityParam);
    if (fromDate) next.set("from", fromDate);
    if (toDate) next.set("to", toDate);
    next.set("page", String(targetPage));
    return `/admin/corrections?${next.toString()}`;
  }

  const hasFilters = entityParam || fromDate || toDate;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold">Corrections log</h1>
        <p className="text-sm text-muted-foreground">
          Every admin void, reversal, and serial correction, with before/after
          snapshots.
        </p>
      </div>

      <form className="flex flex-wrap items-end gap-3" method="get">
        <div className="grid gap-1.5">
          <label htmlFor="entity" className="text-sm font-medium">
            Entity
          </label>
          <Select name="entity" defaultValue={entityParam || undefined}>
            <SelectTrigger id="entity" className="w-44">
              <SelectValue placeholder="All entities" />
            </SelectTrigger>
            <SelectContent>
              {CORRECTION_ENTITIES.map((entity: CorrectionEntity) => (
                <SelectItem key={entity} value={entity}>
                  {formatEntityLabel(entity)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
            <Link href="/admin/corrections">Clear</Link>
          </Button>
        ) : null}
      </form>

      <CorrectionsTable rows={corrections} />

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
