import "server-only";

import type { createClient } from "@/lib/supabase/server";
import { ID_CHUNK, fetchAllPages } from "@/lib/paged";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// Transfer columns the search box looks in, besides line serial numbers.
const HEADER_COLUMNS = ["code", "courier", "tracking_code", "sis_no"] as const;

// Ids of every transfer the viewer can see (RLS applies) that matches the
// search pattern in its code, courier, tracking code or SIS no., or that
// carries a line with a matching serial number.
//
// Each column is its own `.ilike()` query rather than one `.or(...)` string:
// typed text can contain commas and parentheses, which are syntax inside a
// PostgREST or-filter. Every query is paged past the 1,000-row API cap.
export async function findTransferIdsMatching(
  supabase: SupabaseServerClient,
  pattern: string,
): Promise<Set<string>> {
  const headerQueries = HEADER_COLUMNS.map((column: (typeof HEADER_COLUMNS)[number]) =>
    fetchAllPages<{ id: string }>((from: number, to: number) =>
      supabase
        .from("transfers")
        .select("id")
        .ilike(column, pattern)
        .order("id")
        .range(from, to),
    ),
  );
  const lineQuery = fetchAllPages<{ transfer_id: string }>((from: number, to: number) =>
    supabase
      .from("transfer_line_items")
      .select("transfer_id")
      .ilike("serial_snapshot", pattern)
      .order("id")
      .range(from, to),
  );

  const [headerResults, lineRows] = await Promise.all([
    Promise.all(headerQueries),
    lineQuery,
  ]);

  const ids = new Set<string>();
  for (const rows of headerResults) {
    for (const row of rows) ids.add(row.id);
  }
  for (const row of lineRows) ids.add(row.transfer_id);
  return ids;
}

// Matches no row: keeps `.in("id", ...)` valid when a search finds nothing.
const NO_MATCH_ID = "00000000-0000-0000-0000-000000000000";

export type TransferListFilters = {
  // Exact transfer status, or "" for all.
  status: string;
  // Transfers sent from OR to this branch, or "" for all.
  branchId: string;
  // ILIKE pattern from containsPattern(), or null for no search.
  searchPattern: string | null;
};

// One page of the transfers list, newest first, plus the total number of
// transfers matching the filters. `columns` is the caller's select list.
//
// With a search, the matching transfer ids are resolved first and the page is
// taken from within them, so the total and Previous/Next stay correct.
export async function listTransfersPage<Row>(
  supabase: SupabaseServerClient,
  columns: string,
  filters: TransferListFilters,
  from: number,
  to: number,
): Promise<{ rows: Row[]; total: number }> {
  const branchFilter = filters.branchId
    ? `from_branch_id.eq.${filters.branchId},to_branch_id.eq.${filters.branchId}`
    : null;

  const matchedIds: string[] | null = filters.searchPattern
    ? Array.from(await findTransferIdsMatching(supabase, filters.searchPattern))
    : null;

  if (matchedIds !== null && matchedIds.length > ID_CHUNK) {
    // Too many matches to send as one id list. List every transfer that
    // passes the status/branch filters in display order, keep the matches,
    // and load only this page's rows.
    const matched = new Set<string>(matchedIds);
    const ordered = await fetchAllPages<{ id: string }>((rangeFrom: number, rangeTo: number) => {
      let idQuery = supabase
        .from("transfers")
        .select("id")
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(rangeFrom, rangeTo);
      if (filters.status) idQuery = idQuery.eq("status", filters.status);
      if (branchFilter) idQuery = idQuery.or(branchFilter);
      return idQuery;
    });
    const orderedMatches: string[] = ordered
      .map((row: { id: string }) => row.id)
      .filter((id: string) => matched.has(id));
    const pageIds: string[] = orderedMatches.slice(from, to + 1);
    if (pageIds.length === 0) return { rows: [], total: orderedMatches.length };

    const { data } = await supabase
      .from("transfers")
      .select(columns)
      .in("id", pageIds)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false });
    return { rows: (data as Row[] | null) ?? [], total: orderedMatches.length };
  }

  let query = supabase
    .from("transfers")
    .select(columns, { count: "exact" })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, to);
  if (filters.status) query = query.eq("status", filters.status);
  if (branchFilter) query = query.or(branchFilter);
  if (matchedIds !== null) {
    query = query.in("id", matchedIds.length > 0 ? matchedIds : [NO_MATCH_ID]);
  }

  const { data, count } = await query;
  return { rows: (data as Row[] | null) ?? [], total: count ?? 0 };
}
