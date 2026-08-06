import type { createClient } from "@/lib/supabase/server";
import { fetchAllPages } from "@/lib/paged";

// Shared between page.tsx and export/route.ts so filters can't drift.

export type SalesReportFilters = {
  from: string; // ISO date, inclusive
  to: string;
  branch: string; // "" = all visible branches
};

function isoDate(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function parseSalesFilters(params: {
  from?: string;
  to?: string;
  branch?: string;
}): SalesReportFilters {
  const now = new Date();
  const defaultFrom = new Date(now.getFullYear(), now.getMonth() - 11, 1);
  return {
    from: params.from?.trim() || isoDate(defaultFrom),
    to: params.to?.trim() || isoDate(now),
    branch: params.branch?.trim() ?? "",
  };
}

export type MonthlyRow = {
  branch_id: string;
  month: string;
  sale_count: number;
  gross: number;
  discount_total: number;
  net_sales: number;
  vat_total: number;
  net_of_vat: number;
  legacy_no_vat_count: number;
};

type Supabase = Awaited<ReturnType<typeof createClient>>;

// Paged: branch x month grouping can exceed the 1000-row PostgREST cap over
// a long enough date range — order includes branch_id as a tiebreaker so
// paging is deterministic.
export async function fetchMonthly(
  supabase: Supabase,
  filters: SalesReportFilters,
): Promise<MonthlyRow[]> {
  return fetchAllPages<MonthlyRow>((from: number, to: number) => {
    let query = supabase
      .from("sales_by_month")
      .select(
        "branch_id, month, sale_count, gross, discount_total, net_sales, vat_total, net_of_vat, legacy_no_vat_count",
      )
      .gte("month", filters.from)
      .lte("month", filters.to)
      .order("month", { ascending: true })
      .order("branch_id", { ascending: true })
      .range(from, to);
    if (filters.branch) query = query.eq("branch_id", filters.branch);
    return query;
  });
}

// Collapse branch rows into one row per month (chart + table grain).
export function rollUpByMonth(rows: MonthlyRow[]): Omit<MonthlyRow, "branch_id">[] {
  const byMonth = new Map<string, Omit<MonthlyRow, "branch_id">>();
  for (const row of rows) {
    const existing = byMonth.get(row.month);
    if (!existing) {
      byMonth.set(row.month, {
        month: row.month,
        sale_count: Number(row.sale_count),
        gross: Number(row.gross),
        discount_total: Number(row.discount_total),
        net_sales: Number(row.net_sales),
        vat_total: Number(row.vat_total),
        net_of_vat: Number(row.net_of_vat),
        legacy_no_vat_count: Number(row.legacy_no_vat_count),
      });
    } else {
      existing.sale_count += Number(row.sale_count);
      existing.gross += Number(row.gross);
      existing.discount_total += Number(row.discount_total);
      existing.net_sales += Number(row.net_sales);
      existing.vat_total += Number(row.vat_total);
      existing.net_of_vat += Number(row.net_of_vat);
      existing.legacy_no_vat_count += Number(row.legacy_no_vat_count);
    }
  }
  return Array.from(byMonth.values()).sort((a, b) =>
    a.month.localeCompare(b.month),
  );
}

export type PerSaleRow = {
  sale_id: string;
  branch_id: string;
  sale_date: string;
  is_paid: boolean;
  gross: number;
  discount: number;
  net_sales: number;
  vat_amount: number | null;
  net_of_vat: number;
};

// Per-sale accounting grain for CSV export. Paged: this is per-sale grain,
// which can easily exceed the 1000-row PostgREST cap over a long date range
// — order includes sale_id as a unique tiebreaker for deterministic paging.
export async function fetchPerSale(
  supabase: Supabase,
  filters: SalesReportFilters,
): Promise<PerSaleRow[]> {
  return fetchAllPages<PerSaleRow>((from: number, to: number) => {
    let query = supabase
      .from("sales_totals")
      .select(
        "sale_id, branch_id, sale_date, is_paid, gross, discount, net_sales, vat_amount, net_of_vat",
      )
      .gte("sale_date", filters.from)
      .lte("sale_date", filters.to)
      .order("sale_date", { ascending: true })
      .order("sale_id", { ascending: true })
      .range(from, to);
    if (filters.branch) query = query.eq("branch_id", filters.branch);
    return query;
  });
}
