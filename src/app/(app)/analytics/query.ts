import type { createClient } from "@/lib/supabase/server";

// Shared between page.tsx and the export/* routes so filters and aggregation
// can't drift between the on-screen tables and their CSV exports.

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type AnalyticsFilters = {
  from: string; // ISO date, inclusive (month-granularity views underneath)
  to: string;
  branch: string; // "" = all branches
  category: string; // "" = all categories (matches product_categories.name)
};

function isoDate(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function parseAnalyticsFilters(params: {
  from?: string;
  to?: string;
  branch?: string;
  category?: string;
}): AnalyticsFilters {
  const now = new Date();
  const defaultFrom = new Date(now.getFullYear(), now.getMonth() - 11, 1);
  return {
    from: params.from?.trim() || isoDate(defaultFrom),
    to: params.to?.trim() || isoDate(now),
    branch: params.branch?.trim() ?? "",
    category: params.category?.trim() ?? "",
  };
}

// Equal-length previous period, computed at month granularity (the views are
// grouped by month). E.g. current = Jan-Jun 2026 (6 months) -> previous =
// Jul-Dec 2025 (6 months immediately before).
export function previousPeriod(filters: AnalyticsFilters): {
  from: string;
  to: string;
} {
  const from = new Date(filters.from);
  const to = new Date(filters.to);
  const fromMonth = new Date(from.getFullYear(), from.getMonth(), 1);
  const toMonth = new Date(to.getFullYear(), to.getMonth(), 1);
  const numMonths =
    (toMonth.getFullYear() - fromMonth.getFullYear()) * 12 +
    (toMonth.getMonth() - fromMonth.getMonth()) +
    1;
  const prevToMonth = new Date(fromMonth.getFullYear(), fromMonth.getMonth() - 1, 1);
  const prevFromMonth = new Date(
    fromMonth.getFullYear(),
    fromMonth.getMonth() - numMonths,
    1,
  );
  return { from: isoDate(prevFromMonth), to: isoDate(prevToMonth) };
}

export type ProductSalesRow = {
  product_id: string;
  product_name: string | null;
  category: string | null;
  branch_id: string;
  branch_name: string | null;
  month: string;
  units: number;
  revenue: number;
  cost: number;
};

export type ServiceSalesRow = {
  service_id: string;
  service_name: string | null;
  branch_id: string;
  branch_name: string | null;
  month: string;
  units: number;
  revenue: number;
};

export async function fetchProductSales(
  supabase: Supabase,
  filters: AnalyticsFilters,
): Promise<ProductSalesRow[]> {
  let query = supabase
    .from("analytics_sales_by_product")
    .select(
      "product_id, product_name, category, branch_id, branch_name, month, units, revenue, cost",
    )
    .gte("month", filters.from)
    .lte("month", filters.to);
  if (filters.branch) query = query.eq("branch_id", filters.branch);
  if (filters.category) query = query.eq("category", filters.category);
  const { data } = await query;
  return (data as ProductSalesRow[] | null) ?? [];
}

export async function fetchServiceSales(
  supabase: Supabase,
  filters: AnalyticsFilters,
): Promise<ServiceSalesRow[]> {
  let query = supabase
    .from("analytics_sales_by_service")
    .select("service_id, service_name, branch_id, branch_name, month, units, revenue")
    .gte("month", filters.from)
    .lte("month", filters.to);
  if (filters.branch) query = query.eq("branch_id", filters.branch);
  const { data } = await query;
  return (data as ServiceSalesRow[] | null) ?? [];
}

// Total non-voided sales in the period, for the "average sale value" KPI.
// Category doesn't apply to a whole sale (it can mix categories), so this
// intentionally ignores the category filter.
export async function fetchSaleCount(
  supabase: Supabase,
  filters: AnalyticsFilters,
): Promise<number> {
  let query = supabase
    .from("sales")
    .select("id", { count: "exact", head: true })
    .is("voided_at", null)
    .gte("sale_date", filters.from)
    .lte("sale_date", filters.to);
  if (filters.branch) query = query.eq("branch_id", filters.branch);
  const { count } = await query;
  return count ?? 0;
}

export type SkuAgg = {
  product_id: string;
  product_name: string;
  category: string;
  units: number;
  revenue: number;
  cost: number;
  margin_pct: number | null;
};

export function aggregateSkus(rows: ProductSalesRow[]): SkuAgg[] {
  const map = new Map<string, SkuAgg>();
  for (const row of rows) {
    const existing = map.get(row.product_id);
    if (existing) {
      existing.units += Number(row.units);
      existing.revenue += Number(row.revenue);
      existing.cost += Number(row.cost);
    } else {
      map.set(row.product_id, {
        product_id: row.product_id,
        product_name: row.product_name ?? "Unknown product",
        category: row.category ?? "Uncategorized",
        units: Number(row.units),
        revenue: Number(row.revenue),
        cost: Number(row.cost),
        margin_pct: null,
      });
    }
  }
  const list = Array.from(map.values());
  for (const sku of list) {
    sku.margin_pct = sku.revenue > 0 ? ((sku.revenue - sku.cost) / sku.revenue) * 100 : null;
  }
  return list;
}

export function sortSkus(skus: SkuAgg[], sort: "units" | "revenue"): SkuAgg[] {
  return [...skus].sort((a: SkuAgg, b: SkuAgg) => b[sort] - a[sort]);
}

export type ServiceAgg = {
  service_id: string;
  service_name: string;
  units: number;
  revenue: number;
};

export function aggregateServices(rows: ServiceSalesRow[]): ServiceAgg[] {
  const map = new Map<string, ServiceAgg>();
  for (const row of rows) {
    const existing = map.get(row.service_id);
    if (existing) {
      existing.units += Number(row.units);
      existing.revenue += Number(row.revenue);
    } else {
      map.set(row.service_id, {
        service_id: row.service_id,
        service_name: row.service_name ?? "Unknown service",
        units: Number(row.units),
        revenue: Number(row.revenue),
      });
    }
  }
  return Array.from(map.values()).sort(
    (a: ServiceAgg, b: ServiceAgg) => b.revenue - a.revenue,
  );
}

export type BranchAgg = {
  branch_id: string;
  branch_name: string;
  revenue: number;
  units: number;
  cost: number;
  margin: number;
  share_pct: number;
  rank: number;
};

export function aggregateBranches(
  productRows: ProductSalesRow[],
  serviceRows: ServiceSalesRow[],
): BranchAgg[] {
  type Acc = { branch_id: string; branch_name: string; revenue: number; units: number; cost: number };
  const map = new Map<string, Acc>();
  for (const row of productRows) {
    const existing = map.get(row.branch_id);
    if (existing) {
      existing.revenue += Number(row.revenue);
      existing.units += Number(row.units);
      existing.cost += Number(row.cost);
    } else {
      map.set(row.branch_id, {
        branch_id: row.branch_id,
        branch_name: row.branch_name ?? "Unknown branch",
        revenue: Number(row.revenue),
        units: Number(row.units),
        cost: Number(row.cost),
      });
    }
  }
  for (const row of serviceRows) {
    const existing = map.get(row.branch_id);
    if (existing) {
      existing.revenue += Number(row.revenue);
      existing.units += Number(row.units);
    } else {
      map.set(row.branch_id, {
        branch_id: row.branch_id,
        branch_name: row.branch_name ?? "Unknown branch",
        revenue: Number(row.revenue),
        units: Number(row.units),
        cost: 0,
      });
    }
  }

  const accs = Array.from(map.values());
  const totalRevenue = accs.reduce((sum: number, acc: Acc) => sum + acc.revenue, 0);
  const sorted = accs.sort((a: Acc, b: Acc) => b.revenue - a.revenue);

  return sorted.map((acc: Acc, index: number) => ({
    branch_id: acc.branch_id,
    branch_name: acc.branch_name,
    revenue: acc.revenue,
    units: acc.units,
    cost: acc.cost,
    margin: acc.revenue - acc.cost,
    share_pct: totalRevenue > 0 ? (acc.revenue / totalRevenue) * 100 : 0,
    rank: index + 1,
  }));
}

// branch_id -> rank, for computing "vs previous period" movement in the UI.
export function rankByBranch(branches: BranchAgg[]): Map<string, number> {
  return new Map(branches.map((b: BranchAgg) => [b.branch_id, b.rank]));
}

export type PeriodTotals = {
  revenue: number;
  units: number;
  cost: number;
  margin: number;
  branchCount: number;
};

export function computeTotals(
  productRows: ProductSalesRow[],
  serviceRows: ServiceSalesRow[],
): PeriodTotals {
  let revenue = 0;
  let units = 0;
  let cost = 0;
  // "Branches with sales" = any branch with sale-line activity in the
  // period, matching the branch table's own inclusion rule below — counted
  // by activity, not by revenue > 0, so a branch whose only lines are the
  // known zero-price legacy rows still counts (rather than silently
  // disappearing from this KPI while still showing up in the branch table).
  const branchSet = new Set<string>();
  for (const row of productRows) {
    revenue += Number(row.revenue);
    units += Number(row.units);
    cost += Number(row.cost);
    branchSet.add(row.branch_id);
  }
  for (const row of serviceRows) {
    revenue += Number(row.revenue);
    units += Number(row.units);
    branchSet.add(row.branch_id);
  }
  return { revenue, units, cost, margin: revenue - cost, branchCount: branchSet.size };
}

export type MonthlyBranchPoint = {
  month: string;
  branch_id: string;
  branch_name: string;
  revenue: number;
};

export function monthlyTrend(
  productRows: ProductSalesRow[],
  serviceRows: ServiceSalesRow[],
): MonthlyBranchPoint[] {
  const map = new Map<string, MonthlyBranchPoint>();
  function add(month: string, branchId: string, branchName: string, revenue: number): void {
    const key = `${month}|${branchId}`;
    const existing = map.get(key);
    if (existing) existing.revenue += revenue;
    else map.set(key, { month, branch_id: branchId, branch_name: branchName, revenue });
  }
  for (const row of productRows) {
    add(row.month, row.branch_id, row.branch_name ?? "Unknown branch", Number(row.revenue));
  }
  for (const row of serviceRows) {
    add(row.month, row.branch_id, row.branch_name ?? "Unknown branch", Number(row.revenue));
  }
  return Array.from(map.values()).sort((a: MonthlyBranchPoint, b: MonthlyBranchPoint) =>
    a.month.localeCompare(b.month),
  );
}

export type TrendSeriesPoint = { month: string } & Record<string, string | number>;
export type TrendSeries = {
  points: TrendSeriesPoint[];
  branches: { key: string; name: string }[];
};

// Pivots the flat monthly/branch points into one row per month with a
// numeric column per branch (recharts-friendly), capped at the top N
// branches by total revenue with the rest folded into "Others".
export function buildTrendSeries(
  points: MonthlyBranchPoint[],
  maxBranches = 6,
): TrendSeries {
  const totalByBranch = new Map<string, { name: string; total: number }>();
  for (const point of points) {
    const existing = totalByBranch.get(point.branch_id);
    if (existing) existing.total += point.revenue;
    else totalByBranch.set(point.branch_id, { name: point.branch_name, total: point.revenue });
  }
  const ranked = Array.from(totalByBranch.entries()).sort(
    (a: [string, { name: string; total: number }], b: [string, { name: string; total: number }]) =>
      b[1].total - a[1].total,
  );
  const top = ranked.slice(0, maxBranches);
  const topIds = new Set(top.map(([id]: [string, { name: string; total: number }]) => id));
  const hasOthers = ranked.length > maxBranches;

  const branches: { key: string; name: string }[] = top.map(
    ([id, info]: [string, { name: string; total: number }]) => ({ key: id, name: info.name }),
  );
  if (hasOthers) branches.push({ key: "others", name: "Others" });

  const monthMap = new Map<string, TrendSeriesPoint>();
  for (const point of points) {
    let row = monthMap.get(point.month);
    if (!row) {
      row = { month: point.month };
      monthMap.set(point.month, row);
    }
    const key = topIds.has(point.branch_id) ? point.branch_id : "others";
    const current = typeof row[key] === "number" ? (row[key] as number) : 0;
    row[key] = current + point.revenue;
  }
  const monthPoints = Array.from(monthMap.values()).sort(
    (a: TrendSeriesPoint, b: TrendSeriesPoint) => a.month.localeCompare(b.month),
  );
  return { points: monthPoints, branches };
}
