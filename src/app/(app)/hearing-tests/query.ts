import type { createClient } from "@/lib/supabase/server";

// Shared filter parsing + fetch for the hearing-tests review page.

export type ReviewedFilter = "all" | "reviewed" | "unreviewed";
export type SaleFilter = "all" | "with-sale" | "no-sale";

export type HearingTestFilters = {
  branch: string; // "" = all branches
  from: string;
  to: string;
  reviewed: ReviewedFilter;
  sale: SaleFilter;
};

function isoDate(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function parseHearingTestFilters(params: {
  branch?: string;
  from?: string;
  to?: string;
  reviewed?: string;
  sale?: string;
}): HearingTestFilters {
  const now = new Date();
  const defaultFrom = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
  const reviewed: ReviewedFilter =
    params.reviewed === "reviewed" || params.reviewed === "unreviewed"
      ? params.reviewed
      : "all";
  const sale: SaleFilter =
    params.sale === "with-sale" || params.sale === "no-sale" ? params.sale : "all";
  return {
    branch: params.branch?.trim() ?? "",
    from: params.from?.trim() || isoDate(defaultFrom),
    to: params.to?.trim() || isoDate(now),
    reviewed,
    sale,
  };
}

export type HearingTestVisitQueryRow = {
  id: string;
  customer_id: string;
  visit_date: string;
  purchased_during_visit: boolean;
  attachment_paths: string[] | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  review_notes: string | null;
  resulted_in_sale_id: string | null;
};

type Supabase = Awaited<ReturnType<typeof createClient>>;

export async function fetchHearingTestVisits(
  supabase: Supabase,
  filters: HearingTestFilters,
  // Restrict to these customer ids when a branch filter is active; null
  // means no branch filter (all customers), [] means the branch filter
  // matched no customers at all.
  customerIds: string[] | null,
  range: { from: number; to: number },
): Promise<{ rows: HearingTestVisitQueryRow[]; count: number }> {
  if (customerIds !== null && customerIds.length === 0) {
    return { rows: [], count: 0 };
  }

  let query = supabase
    .from("visits")
    .select(
      "id, customer_id, visit_date, purchased_during_visit, attachment_paths, reviewed_at, reviewed_by, review_notes, resulted_in_sale_id",
      { count: "exact" },
    )
    .eq("is_hearing_test", true)
    .gte("visit_date", filters.from)
    .lte("visit_date", filters.to)
    .order("visit_date", { ascending: false });

  if (customerIds !== null) query = query.in("customer_id", customerIds);
  if (filters.reviewed === "reviewed") query = query.not("reviewed_at", "is", null);
  if (filters.reviewed === "unreviewed") query = query.is("reviewed_at", null);
  if (filters.sale === "with-sale") query = query.not("resulted_in_sale_id", "is", null);
  if (filters.sale === "no-sale") query = query.is("resulted_in_sale_id", null);

  query = query.range(range.from, range.to);

  const { data, count } = await query;
  return { rows: (data as HearingTestVisitQueryRow[] | null) ?? [], count: count ?? 0 };
}
