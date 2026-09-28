import type { createClient } from "@/lib/supabase/server";
import { fetchAllPages, ID_CHUNK } from "@/lib/paged";

// Shared between page.tsx and export/route.ts so filters can't drift.

export const MOVEMENT_TYPES = [
  "intake",
  "transfer_out",
  "transfer_in",
  "sale",
  "return",
  "repair_in",
  "repair_out",
  "adjustment",
] as const;
export type MovementType = (typeof MOVEMENT_TYPES)[number];

export type MovementFilters = {
  from: string;
  to: string;
  type: string; // "" = all
  branch: string; // "" = all visible
  serial: string; // "" = no serial filter
};

function isoDate(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function parseMovementFilters(params: {
  from?: string;
  to?: string;
  type?: string;
  branch?: string;
  serial?: string;
}): MovementFilters {
  const now = new Date();
  const defaultFrom = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
  return {
    from: params.from?.trim() || isoDate(defaultFrom),
    to: params.to?.trim() || isoDate(now),
    type: params.type?.trim() ?? "",
    branch: params.branch?.trim() ?? "",
    serial: params.serial?.trim() ?? "",
  };
}

export type MovementRow = {
  id: number;
  occurred_at: string;
  movement_type: MovementType;
  quantity: number;
  branch_id: string | null;
  counterparty_branch_id: string | null;
  stock_id: string;
  product_id: string | null;
  serial_number: string | null;
  reference_type: string | null;
  reference_id: string | null;
  note: string | null;
};

type Supabase = Awaited<ReturnType<typeof createClient>>;

// Resolves a serial search into stock ids through stock_visible, so the
// lookup stays branch-scoped and cost-private the same way the rest of the
// app reads stock. Capped at ID_CHUNK: this is a narrow serial lookup (a
// handful of matches expected), not a bulk export — keeping the id list
// bounded keeps the follow-up .in() filter URL-length safe.
async function resolveSerialStockIds(
  supabase: Supabase,
  serial: string,
): Promise<string[]> {
  const { data } = await supabase
    .from("stock_visible")
    .select("id")
    .ilike("serial_number", `%${serial}%`)
    .limit(ID_CHUNK);
  return ((data as { id: string }[] | null) ?? []).map(
    (row: { id: string }) => row.id,
  );
}

// List-page fetch (one page at a time, `range` supplied by the caller).
// Order includes `id` as a tiebreaker after occurred_at, since timestamps
// aren't guaranteed unique — without it, paging could duplicate or skip
// rows that share a timestamp.
export async function fetchMovements(
  supabase: Supabase,
  filters: MovementFilters,
  range?: { from: number; to: number },
): Promise<{ rows: MovementRow[]; count: number }> {
  let query = supabase
    .from("movements_ledger")
    .select(
      "id, occurred_at, movement_type, quantity, branch_id, counterparty_branch_id, stock_id, product_id, serial_number, reference_type, reference_id, note",
      { count: "exact" },
    )
    .gte("occurred_at", filters.from)
    // occurred_at is a timestamp; make the "to" date inclusive.
    .lt("occurred_at", `${filters.to}T23:59:59.999`)
    .order("occurred_at", { ascending: false })
    .order("id", { ascending: false });
  if (filters.type) query = query.eq("movement_type", filters.type);
  if (filters.branch) query = query.eq("branch_id", filters.branch);
  if (filters.serial) {
    const stockIds = await resolveSerialStockIds(supabase, filters.serial);
    if (stockIds.length === 0) return { rows: [], count: 0 };
    query = query.in("stock_id", stockIds);
  }
  if (range) query = query.range(range.from, range.to);
  const { data, count } = await query;
  return { rows: (data as MovementRow[] | null) ?? [], count: count ?? 0 };
}

// Export fetch: unlike fetchMovements (one list page), this pages through
// *every* matching row. A date range spanning enough movement activity can
// easily exceed the 1000-row PostgREST cap, which previously silently
// truncated the export to the newest ~1000 movements.
export async function fetchAllMovements(
  supabase: Supabase,
  filters: MovementFilters,
): Promise<MovementRow[]> {
  let stockIds: string[] | null = null;
  if (filters.serial) {
    stockIds = await resolveSerialStockIds(supabase, filters.serial);
    if (stockIds.length === 0) return [];
  }
  return fetchAllPages<MovementRow>((from: number, to: number) => {
    let query = supabase
      .from("movements_ledger")
      .select(
        "id, occurred_at, movement_type, quantity, branch_id, counterparty_branch_id, stock_id, product_id, serial_number, reference_type, reference_id, note",
      )
      .gte("occurred_at", filters.from)
      .lt("occurred_at", `${filters.to}T23:59:59.999`)
      .order("occurred_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, to);
    if (filters.type) query = query.eq("movement_type", filters.type);
    if (filters.branch) query = query.eq("branch_id", filters.branch);
    if (stockIds) query = query.in("stock_id", stockIds);
    return query;
  });
}
