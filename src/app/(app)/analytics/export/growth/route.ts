import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/supabase/profile";
import { toCsv, csvResponse, type CsvColumn } from "@/lib/csv";
import {
  parseAnalyticsFilters,
  previousPeriod,
  fetchProductSales,
  aggregateSkus,
  computeGrowthDrivers,
  type AnalyticsFilters,
  type GrowthDriverRow,
} from "../../query";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const profile = await getProfile();
  if (!profile || (profile.role !== "admin" && profile.role !== "top_mgmt")) {
    redirect("/");
  }

  const url = new URL(request.url);
  const filters = parseAnalyticsFilters({
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
    branch: url.searchParams.get("branch") ?? undefined,
    category: url.searchParams.get("category") ?? undefined,
  });
  const prev = previousPeriod(filters);
  const prevFilters: AnalyticsFilters = { ...filters, from: prev.from, to: prev.to };

  const supabase = await createClient();
  const [productRows, prevProductRows] = await Promise.all([
    fetchProductSales(supabase, filters),
    fetchProductSales(supabase, prevFilters),
  ]);

  const growthDrivers = computeGrowthDrivers(
    aggregateSkus(productRows),
    aggregateSkus(prevProductRows),
  );

  const columns: CsvColumn<GrowthDriverRow>[] = [
    { header: "Product", value: (row) => row.product_name },
    { header: "Category", value: (row) => row.category },
    { header: "Current period revenue", value: (row) => row.current_revenue },
    { header: "Previous period revenue", value: (row) => row.previous_revenue },
    { header: "Change", value: (row) => row.delta },
    { header: "Change %", value: (row) => row.delta_pct ?? "" },
  ];

  const today = new Date().toISOString().slice(0, 10);
  return csvResponse(`analytics-growth-drivers-${today}.csv`, toCsv(growthDrivers, columns));
}
