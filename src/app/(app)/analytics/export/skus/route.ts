import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/supabase/profile";
import { toCsv, csvResponse, type CsvColumn } from "@/lib/csv";
import {
  parseAnalyticsFilters,
  fetchProductSales,
  aggregateSkus,
  sortSkus,
  type SkuAgg,
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
  const sort: "units" | "revenue" =
    url.searchParams.get("sort") === "units" ? "units" : "revenue";

  const supabase = await createClient();
  const productRows = await fetchProductSales(supabase, filters);
  const skus = sortSkus(aggregateSkus(productRows), sort);

  const columns: CsvColumn<SkuAgg>[] = [
    { header: "Product", value: (row) => row.product_name },
    { header: "Category", value: (row) => row.category },
    { header: "Units", value: (row) => row.units },
    { header: "Revenue", value: (row) => row.revenue },
    { header: "Cost", value: (row) => row.cost },
    { header: "Margin %", value: (row) => row.margin_pct ?? "" },
  ];

  const today = new Date().toISOString().slice(0, 10);
  return csvResponse(`analytics-skus-${today}.csv`, toCsv(skus, columns));
}
