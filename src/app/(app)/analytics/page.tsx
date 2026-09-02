import Link from "next/link";
import { redirect } from "next/navigation";
import { DownloadIcon } from "lucide-react";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KpiRow, type Kpi } from "@/components/analytics/kpi-row";
import { SkuTable } from "@/components/analytics/sku-table";
import { ServiceTable } from "@/components/analytics/service-table";
import { BranchTable } from "@/components/analytics/branch-table";
import { TrendChart } from "@/components/analytics/trend-chart";
import { LegacyDataNote } from "@/components/analytics/legacy-note";
import { VipCustomerTable } from "@/components/analytics/vip-customer-table";
import { GrowthDriverTable } from "@/components/analytics/growth-driver-table";
import { RepairsByProductTable } from "@/components/analytics/repairs-by-product-table";
import { formatCurrency } from "@/lib/format";
import {
  parseAnalyticsFilters,
  previousPeriod,
  fetchProductSales,
  fetchServiceSales,
  fetchSaleCount,
  fetchCustomerSales,
  fetchCustomerSalesAllTime,
  fetchRepairsByProduct,
  aggregateSkus,
  sortSkus,
  aggregateServices,
  aggregateBranches,
  rankByBranch,
  aggregateCustomers,
  aggregateRepairsByProduct,
  computeGrowthDrivers,
  computeTotals,
  monthlyTrend,
  buildTrendSeries,
  type AnalyticsFilters,
} from "./query";

export const dynamic = "force-dynamic";

type AnalyticsPageProps = {
  searchParams: Promise<{
    from?: string;
    to?: string;
    branch?: string;
    category?: string;
    sort?: string;
  }>;
};

// null = no meaningful percentage vs a zero (or missing) previous-period base.
function deltaPct(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

export default async function AnalyticsPage({ searchParams }: AnalyticsPageProps) {
  const profile = await getProfile();
  if (!profile || (profile.role !== "admin" && profile.role !== "top_mgmt")) {
    redirect("/");
  }

  const params = await searchParams;
  const filters = parseAnalyticsFilters({
    from: params.from,
    to: params.to,
    branch: params.branch,
    category: params.category,
  });
  const sort: "units" | "revenue" = params.sort === "units" ? "units" : "revenue";
  const prev = previousPeriod(filters);
  const prevFilters: AnalyticsFilters = { ...filters, from: prev.from, to: prev.to };

  const supabase = await createClient();

  const [
    branchesResult,
    categoriesResult,
    productRows,
    serviceRows,
    saleCount,
    prevProductRows,
    prevServiceRows,
    prevSaleCount,
    customerRows,
    customerRowsAllTime,
    repairRows,
  ] = await Promise.all([
    supabase.from("branches").select("id, name, is_active").order("name"),
    supabase.from("product_categories").select("id, name").order("name"),
    fetchProductSales(supabase, filters),
    fetchServiceSales(supabase, filters),
    fetchSaleCount(supabase, filters),
    fetchProductSales(supabase, prevFilters),
    fetchServiceSales(supabase, prevFilters),
    fetchSaleCount(supabase, prevFilters),
    fetchCustomerSales(supabase, filters),
    fetchCustomerSalesAllTime(supabase, filters),
    fetchRepairsByProduct(supabase, filters),
  ]);

  const branches: { id: string; name: string; is_active: boolean }[] = branchesResult.data ?? [];
  const categories: { id: number; name: string }[] = categoriesResult.data ?? [];

  const totals = computeTotals(productRows, serviceRows);
  const prevTotals = computeTotals(prevProductRows, prevServiceRows);

  const avgSaleValue = saleCount > 0 ? totals.revenue / saleCount : 0;
  const prevAvgSaleValue = prevSaleCount > 0 ? prevTotals.revenue / prevSaleCount : 0;

  const kpis: Kpi[] = [
    {
      label: "Total revenue",
      value: formatCurrency(totals.revenue),
      deltaPct: deltaPct(totals.revenue, prevTotals.revenue),
    },
    {
      label: "Total units",
      value: totals.units.toLocaleString("en-PH"),
      deltaPct: deltaPct(totals.units, prevTotals.units),
    },
    {
      label: "Gross margin",
      value: formatCurrency(totals.margin),
      deltaPct: deltaPct(totals.margin, prevTotals.margin),
    },
    {
      label: "Branches with sales",
      value: String(totals.branchCount),
      deltaPct: deltaPct(totals.branchCount, prevTotals.branchCount),
    },
    {
      label: "Average sale value",
      value: formatCurrency(avgSaleValue),
      deltaPct: deltaPct(avgSaleValue, prevAvgSaleValue),
    },
  ];

  const allSkus = aggregateSkus(productRows);
  const skus = sortSkus(allSkus, sort).slice(0, 20);
  const services = aggregateServices(serviceRows);
  const branchAgg = aggregateBranches(productRows, serviceRows);
  const prevBranchAgg = aggregateBranches(prevProductRows, prevServiceRows);
  const prevRankByBranch = rankByBranch(prevBranchAgg);
  const trendSeries = buildTrendSeries(monthlyTrend(productRows, serviceRows));

  const vipCustomers = aggregateCustomers(customerRows).slice(0, 20);
  const allTimeByCustomer = new Map(
    aggregateCustomers(customerRowsAllTime).map((c) => [c.customer_id, c.total_value]),
  );
  const growthDrivers = computeGrowthDrivers(allSkus, aggregateSkus(prevProductRows));
  const repairsByProduct = aggregateRepairsByProduct(repairRows);

  function buildHref(nextSort: "units" | "revenue"): string {
    const next = new URLSearchParams();
    next.set("from", filters.from);
    next.set("to", filters.to);
    if (filters.branch) next.set("branch", filters.branch);
    if (filters.category) next.set("category", filters.category);
    next.set("sort", nextSort);
    return `/analytics?${next.toString()}`;
  }

  const exportParams = new URLSearchParams();
  exportParams.set("from", filters.from);
  exportParams.set("to", filters.to);
  if (filters.branch) exportParams.set("branch", filters.branch);
  if (filters.category) exportParams.set("category", filters.category);

  const skuExportParams = new URLSearchParams(exportParams);
  skuExportParams.set("sort", sort);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold">Analytics</h1>
        <p className="text-sm text-muted-foreground">
          Cross-branch sales performance for top management. Read-only.
        </p>
      </div>

      <LegacyDataNote />

      <form className="flex flex-wrap items-end gap-3" method="get">
        <div className="grid gap-1.5">
          <label htmlFor="from" className="text-sm font-medium">
            From
          </label>
          <Input id="from" name="from" type="date" defaultValue={filters.from} className="w-40" />
        </div>
        <div className="grid gap-1.5">
          <label htmlFor="to" className="text-sm font-medium">
            To
          </label>
          <Input id="to" name="to" type="date" defaultValue={filters.to} className="w-40" />
        </div>
        <div className="grid gap-1.5">
          <label htmlFor="branch" className="text-sm font-medium">
            Branch
          </label>
          <Select name="branch" defaultValue={filters.branch || undefined}>
            <SelectTrigger id="branch" className="w-44">
              <SelectValue placeholder="All branches" />
            </SelectTrigger>
            <SelectContent>
              {branches.map((branch: { id: string; name: string; is_active: boolean }) => (
                <SelectItem key={branch.id} value={branch.id}>
                  {branch.name}
                  {branch.is_active ? "" : " (closed)"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <label htmlFor="category" className="text-sm font-medium">
            Category
          </label>
          <Select name="category" defaultValue={filters.category || undefined}>
            <SelectTrigger id="category" className="w-44">
              <SelectValue placeholder="All categories" />
            </SelectTrigger>
            <SelectContent>
              {categories.map((category: { id: number; name: string }) => (
                <SelectItem key={category.id} value={category.name}>
                  {category.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <input type="hidden" name="sort" value={sort} />
        <Button type="submit" variant="secondary">
          Apply
        </Button>
        <Button asChild variant="ghost">
          <Link href="/analytics">Reset</Link>
        </Button>
      </form>

      <KpiRow kpis={kpis} />

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Monthly revenue trend</CardTitle>
        </CardHeader>
        <CardContent>
          <TrendChart series={trendSeries} />
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Best-selling SKUs</h2>
          <Button asChild variant="outline" size="sm">
            <a href={`/analytics/export/skus?${skuExportParams.toString()}`}>
              <DownloadIcon className="size-4" />
              Export CSV
            </a>
          </Button>
        </div>
        <SkuTable rows={skus} sort={sort} buildHref={buildHref} />
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Top services</h2>
          <Button asChild variant="outline" size="sm">
            <a href={`/analytics/export/services?${exportParams.toString()}`}>
              <DownloadIcon className="size-4" />
              Export CSV
            </a>
          </Button>
        </div>
        <ServiceTable rows={services} />
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Branch performance</h2>
          <Button asChild variant="outline" size="sm">
            <a href={`/analytics/export/branches?${exportParams.toString()}`}>
              <DownloadIcon className="size-4" />
              Export CSV
            </a>
          </Button>
        </div>
        <BranchTable rows={branchAgg} previousRankByBranch={prevRankByBranch} />
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">VIP customers</h2>
          <Button asChild variant="outline" size="sm">
            <a href={`/analytics/export/customers?${exportParams.toString()}`}>
              <DownloadIcon className="size-4" />
              Export CSV
            </a>
          </Button>
        </div>
        <VipCustomerTable rows={vipCustomers} allTimeByCustomer={allTimeByCustomer} />
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Growth drivers</h2>
          <Button asChild variant="outline" size="sm">
            <a href={`/analytics/export/growth?${exportParams.toString()}`}>
              <DownloadIcon className="size-4" />
              Export CSV
            </a>
          </Button>
        </div>
        <GrowthDriverTable rows={growthDrivers} />
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Repairs by product</h2>
          <Button asChild variant="outline" size="sm">
            <a href={`/analytics/export/repairs?${exportParams.toString()}`}>
              <DownloadIcon className="size-4" />
              Export CSV
            </a>
          </Button>
        </div>
        <RepairsByProductTable rows={repairsByProduct} />
      </div>
    </div>
  );
}
