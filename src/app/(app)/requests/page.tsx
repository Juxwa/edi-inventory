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
import { RequestTable, type RequestRowData } from "@/components/requests/request-table";
import { REQUEST_STATUSES, type RequestStatus } from "@/lib/validators/request";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

function formatStatusLabel(status: string): string {
  return status
    .split("_")
    .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

type RequestsPageProps = {
  searchParams: Promise<{
    status?: string;
    page?: string;
  }>;
};

type RequestQueryRow = {
  id: string;
  requesting_branch_id: string;
  requested_by: string | null;
  request_date: string;
  notes: string | null;
  status: RequestStatus;
  created_at: string;
  request_line_items: { count: number }[] | null;
};

export default async function RequestsPage({ searchParams }: RequestsPageProps) {
  const profile = await getProfile();
  if (!profile || profile.role === "technical") {
    redirect("/");
  }

  const params = await searchParams;
  const statusParam = params.status?.trim() ?? "";
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const supabase = await createClient();

  const branchesResult = await supabase.from("branches").select("id, name").order("name");
  const branches: { id: string; name: string }[] = branchesResult.data ?? [];

  let query = supabase
    .from("inventory_requests")
    .select(
      "id, requesting_branch_id, requested_by, request_date, notes, status, created_at, request_line_items(count)",
      { count: "exact" },
    )
    .order("request_date", { ascending: false })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (statusParam) {
    query = query.eq("status", statusParam);
  }

  const { data, count } = await query;
  const rows: RequestQueryRow[] = (data as RequestQueryRow[] | null) ?? [];

  const requesterIds = rows
    .map((row: RequestQueryRow) => row.requested_by)
    .filter((id: string | null): id is string => id !== null);

  let nameByProfileId = new Map<string, string>();
  if (requesterIds.length > 0) {
    const { data: profileRows } = await supabase
      .from("profiles")
      .select("id, name")
      .in("id", requesterIds);
    type ProfileRow = { id: string; name: string | null };
    const profiles: ProfileRow[] = (profileRows as ProfileRow[] | null) ?? [];
    nameByProfileId = new Map(
      profiles.map((row: ProfileRow) => [row.id, row.name ?? "—"]),
    );
  }

  const branchNameById = new Map<string, string>(
    branches.map((branch: { id: string; name: string }) => [branch.id, branch.name]),
  );

  const requests: RequestRowData[] = rows.map((row: RequestQueryRow) => ({
    id: row.id,
    branch_name: branchNameById.get(row.requesting_branch_id) ?? "—",
    requested_by_name: row.requested_by
      ? (nameByProfileId.get(row.requested_by) ?? "—")
      : "—",
    request_date: row.request_date,
    line_count: row.request_line_items?.[0]?.count ?? 0,
    status: row.status,
    has_notes: row.notes !== null && row.notes.trim().length > 0,
  }));

  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function buildPageHref(targetPage: number): string {
    const next = new URLSearchParams();
    if (statusParam) next.set("status", statusParam);
    next.set("page", String(targetPage));
    return `/requests?${next.toString()}`;
  }

  const canCreate = profile.role === "admin" || profile.role === "branch_rep";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Stock requests</h1>
          <p className="text-sm text-muted-foreground">
            Branch requests for stock, reviewed and served by admin.
          </p>
        </div>
        {canCreate ? (
          <Button asChild>
            <Link href="/requests/new">
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
              {REQUEST_STATUSES.map((status: RequestStatus) => (
                <SelectItem key={status} value={status}>
                  {formatStatusLabel(status)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button type="submit" variant="secondary">
          Apply
        </Button>
        {statusParam ? (
          <Button asChild variant="ghost">
            <Link href="/requests">Clear</Link>
          </Button>
        ) : null}
      </form>

      <RequestTable rows={requests} />

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
