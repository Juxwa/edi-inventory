import type { createClient } from "@/lib/supabase/server";

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
}): MovementFilters {
  const now = new Date();
  const defaultFrom = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
  return {
    from: params.from?.trim() || isoDate(defaultFrom),
    to: params.to?.trim() || isoDate(now),
    type: params.type?.trim() ?? "",
    branch: params.branch?.trim() ?? "",
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
    .order("occurred_at", { ascending: false });
  if (filters.type) query = query.eq("movement_type", filters.type);
  if (filters.branch) query = query.eq("branch_id", filters.branch);
  if (range) query = query.range(range.from, range.to);
  const { data, count } = await query;
  return { rows: (data as MovementRow[] | null) ?? [], count: count ?? 0 };
}
