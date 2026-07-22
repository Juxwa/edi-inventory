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
import {
  EarmoldsTable,
  type EarmoldRowData,
} from "@/components/earmolds/earmolds-table";
import { EARMOLD_STATUSES, type EarmoldStatus } from "@/lib/validators/earmold";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

type EarmoldsPageProps = {
  searchParams: Promise<{
    status?: string;
    q?: string;
    page?: string;
  }>;
};

type EarmoldQueryRow = {
  id: string;
  patient_name: string;
  hearing_aid_model: string | null;
  side: string | null;
  requesting_branch_id: string | null;
  status: EarmoldStatus;
  created_at: string;
};

export default async function EarmoldsPage({ searchParams }: EarmoldsPageProps) {
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

  const branchesResult = await supabase.from("branches").select("id, name");
  const branchNameById = new Map<string, string>(
    (branchesResult.data ?? []).map((branch: { id: string; name: string }) => [
      branch.id,
      branch.name,
    ]),
  );

  let query = supabase
    .from("earmold_requests")
    .select(
      "id, patient_name, hearing_aid_model, side, requesting_branch_id, status, created_at",
      { count: "exact" },
    )
    .is("voided_at", null)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (statusParam) query = query.eq("status", statusParam);
  if (q) {
    query = query.or(`patient_name.ilike.%${q}%,serial_no.ilike.%${q}%`);
  }

  const { data, count } = await query;
  const rows: EarmoldQueryRow[] = (data as EarmoldQueryRow[] | null) ?? [];

  const earmolds: EarmoldRowData[] = rows.map((row: EarmoldQueryRow) => ({
    id: row.id,
    patient_name: row.patient_name,
    hearing_aid_model: row.hearing_aid_model,
    side: row.side,
    branch_name: row.requesting_branch_id
      ? (branchNameById.get(row.requesting_branch_id) ?? "—")
      : "—",
    status: row.status,
    created_at: row.created_at,
  }));

  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function buildPageHref(targetPage: number): string {
    const next = new URLSearchParams();
    if (statusParam) next.set("status", statusParam);
    if (q) next.set("q", q);
    next.set("page", String(targetPage));
    return `/earmolds?${next.toString()}`;
  }

  const canCreate = profile.role !== "top_mgmt";
  const hasFilters = statusParam || q;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Earmold requests</h1>
          <p className="text-sm text-muted-foreground">
            Track custom earmold orders from request to delivery.
          </p>
        </div>
        {canCreate ? (
          <Button asChild>
            <Link href="/earmolds/new">
              <PlusIcon className="size-4" />
              New request
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
              {EARMOLD_STATUSES.map((status: EarmoldStatus) => (
                <SelectItem key={status} value={status} className="capitalize">
                  {status.charAt(0).toUpperCase() + status.slice(1)}
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
            placeholder="Patient name or serial"
            className="w-56"
          />
        </div>
        <Button type="submit" variant="secondary">
          Apply
        </Button>
        {hasFilters ? (
          <Button asChild variant="ghost">
            <Link href="/earmolds">Clear</Link>
          </Button>
        ) : null}
      </form>

      <EarmoldsTable rows={earmolds} />

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
