import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/supabase/profile";
import { toCsv, csvResponse, type CsvColumn } from "@/lib/csv";
import {
  parseAnalyticsFilters,
  fetchRepairsByProduct,
  aggregateRepairsByProduct,
  type RepairsByProductAgg,
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

  const supabase = await createClient();
  const repairRows = await fetchRepairsByProduct(supabase, filters);
  const repairsByProduct = aggregateRepairsByProduct(repairRows);

  const columns: CsvColumn<RepairsByProductAgg>[] = [
    { header: "Product", value: (row) => row.product_name },
    { header: "Category", value: (row) => row.category },
    { header: "Repairs", value: (row) => row.repair_count },
  ];

  const today = new Date().toISOString().slice(0, 10);
  return csvResponse(`analytics-repairs-by-product-${today}.csv`, toCsv(repairsByProduct, columns));
}
