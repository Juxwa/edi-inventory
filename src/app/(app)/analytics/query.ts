import type { createClient } from "@/lib/supabase/server";
import { fetchAllPages } from "@/lib/paged";

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

// Paged: these are grouped-by views (product x branch x month, etc.) that
// can exceed the 1000-row PostgREST cap once a shop has enough SKUs/branches
// /history — an un-ranged select silently truncated to the newest rows.
// Ordered by the view's own grouping columns (a unique combination) so
// paging is deterministic.
export async function fetchProductSales(
  supabase: Supabase,
  filters: AnalyticsFilters,
): Promise<ProductSalesRow[]> {
  return fetchAllPages<ProductSalesRow>((from: number, to: number) => {
    let query = supabase
      .from("analytics_sales_by_product")
      .select(
        "product_id, product_name, category, branch_id, branch_name, month, units, revenue, cost",
      )
      .gte("month", filters.from)
      .lte("month", filters.to)
      .order("product_id", { ascending: true })
      .order("branch_id", { ascending: true })
      .order("month", { ascending: true })
      .range(from, to);
    if (filters.branch) query = query.eq("branch_id", filters.branch);
    if (filters.category) query = query.eq("category", filters.category);
    return query;
  });
}

export async function fetchServiceSales(
  supabase: Supabase,
  filters: AnalyticsFilters,
): Promise<ServiceSalesRow[]> {
  return fetchAllPages<ServiceSalesRow>((from: number, to: number) => {
    let query = supabase
      .from("analytics_sales_by_service")
      .select("service_id, service_name, branch_id, branch_name, month, units, revenue")
      .gte("month", filters.from)
      .lte("month", filters.to)
      .order("service_id", { ascending: true })
      .order("branch_id", { ascending: true })
      .order("month", { ascending: true })
      .range(from, to);
    if (filters.branch) query = query.eq("branch_id", filters.branch);
    return query;
  });
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

export type GrowthDriverRow = {
  product_id: string;
  product_name: string;
  category: string;
  current_revenue: number;
  previous_revenue: number;
  delta: number;
  delta_pct: number | null;
};

// Top revenue risers vs. the prior equal-length period. Reuses the SkuAgg
// maps already computed for the current and previous period (see
// aggregateSkus) rather than a new view or query.
export function computeGrowthDrivers(
  currentSkus: SkuAgg[],
  previousSkus: SkuAgg[],
  topN = 10,
): GrowthDriverRow[] {
  const currentByProduct = new Map(currentSkus.map((s: SkuAgg) => [s.product_id, s]));
  const previousByProduct = new Map(previousSkus.map((s: SkuAgg) => [s.product_id, s]));
  const ids = new Set([...currentByProduct.keys(), ...previousByProduct.keys()]);

  const rows: GrowthDriverRow[] = [];
  for (const id of ids) {
    const cur = currentByProduct.get(id);
    const prev = previousByProduct.get(id);
    const current_revenue = cur?.revenue ?? 0;
    const previous_revenue = prev?.revenue ?? 0;
    const delta = current_revenue - previous_revenue;
    rows.push({
      product_id: id,
      product_name: cur?.product_name ?? prev?.product_name ?? "Unknown product",
      category: cur?.category ?? prev?.category ?? "Uncategorized",
      current_revenue,
      previous_revenue,
      delta,
      delta_pct: previous_revenue === 0 ? null : (delta / previous_revenue) * 100,
    });
  }
  return rows.sort((a: GrowthDriverRow, b: GrowthDriverRow) => b.delta - a.delta).slice(0, topN);
}

export type CustomerSalesRow = {
  sale_id: string;
  customer_id: string;
  customer_name: string | null;
  branch_id: string | null;
  branch_name: string | null;
  sale_date: string;
  net_sales: number;
};

export async function fetchCustomerSales(
  supabase: Supabase,
  filters: AnalyticsFilters,
): Promise<CustomerSalesRow[]> {
  return fetchAllPages<CustomerSalesRow>((from: number, to: number) => {
    let query = supabase
      .from("analytics_sales_by_customer")
      .select("sale_id, customer_id, customer_name, branch_id, branch_name, sale_date, net_sales")
      .gte("sale_date", filters.from)
      .lte("sale_date", filters.to)
      .order("sale_id", { ascending: true })
      .range(from, to);
    if (filters.branch) query = query.eq("branch_id", filters.branch);
    return query;
  });
}

// All-time (unbounded) equivalent of fetchCustomerSales, for the VIP table's
// all-time value column. Same view, wide date bounds instead of a second
// query path — cheap at this data volume, same pattern the page already
// uses for the previous-period comparison queries.
export async function fetchCustomerSalesAllTime(
  supabase: Supabase,
  filters: Pick<AnalyticsFilters, "branch">,
): Promise<CustomerSalesRow[]> {
  return fetchCustomerSales(supabase, {
    from: "1900-01-01",
    to: "2999-12-31",
    branch: filters.branch,
    category: "",
  });
}

export type CustomerAgg = {
  customer_id: string;
  customer_name: string;
  branch_id: string | null;
  branch_name: string;
  total_value: number;
  sale_count: number;
  last_purchase_date: string;
};

// Aggregates per-sale rows to one row per customer. branch shown is the
// branch of that customer's most recent sale in the row set (a customer can
// buy from more than one branch; there's no single "their branch" field).
export function aggregateCustomers(rows: CustomerSalesRow[]): CustomerAgg[] {
  const map = new Map<string, CustomerAgg>();
  for (const row of rows) {
    const existing = map.get(row.customer_id);
    if (existing) {
      existing.total_value += Number(row.net_sales);
      existing.sale_count += 1;
      if (row.sale_date > existing.last_purchase_date) {
        existing.last_purchase_date = row.sale_date;
        existing.branch_id = row.branch_id;
        existing.branch_name = row.branch_name ?? "Unknown branch";
      }
    } else {
      map.set(row.customer_id, {
        customer_id: row.customer_id,
        customer_name: row.customer_name ?? "Unknown customer",
        branch_id: row.branch_id,
        branch_name: row.branch_name ?? "Unknown branch",
        total_value: Number(row.net_sales),
        sale_count: 1,
        last_purchase_date: row.sale_date,
      });
    }
  }
  return Array.from(map.values()).sort(
    (a: CustomerAgg, b: CustomerAgg) => b.total_value - a.total_value,
  );
}

export type RepairsByProductRow = {
  product_id: string;
  product_name: string | null;
  category: string | null;
  month: string;
  repair_count: number;
};

export async function fetchRepairsByProduct(
  supabase: Supabase,
  filters: AnalyticsFilters,
): Promise<RepairsByProductRow[]> {
  return fetchAllPages<RepairsByProductRow>((from: number, to: number) =>
    supabase
      .from("analytics_repairs_by_product")
      .select("product_id, product_name, category, month, repair_count")
      .gte("month", filters.from)
      .lte("month", filters.to)
      .order("product_id", { ascending: true })
      .order("month", { ascending: true })
      .range(from, to),
  );
}

export type RepairsByProductAgg = {
  product_id: string;
  product_name: string;
  category: string;
  repair_count: number;
};

export function aggregateRepairsByProduct(rows: RepairsByProductRow[]): RepairsByProductAgg[] {
  const map = new Map<string, RepairsByProductAgg>();
  for (const row of rows) {
    const existing = map.get(row.product_id);
    if (existing) {
      existing.repair_count += Number(row.repair_count);
    } else {
      map.set(row.product_id, {
        product_id: row.product_id,
        product_name: row.product_name ?? "Unknown product",
        category: row.category ?? "Uncategorized",
        repair_count: Number(row.repair_count),
      });
    }
  }
  return Array.from(map.values()).sort(
    (a: RepairsByProductAgg, b: RepairsByProductAgg) => b.repair_count - a.repair_count,
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
