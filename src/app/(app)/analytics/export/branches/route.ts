import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/supabase/profile";
import { toCsv, csvResponse, type CsvColumn } from "@/lib/csv";
import {
  parseAnalyticsFilters,
  previousPeriod,
  fetchProductSales,
  fetchServiceSales,
  aggregateBranches,
  rankByBranch,
  type AnalyticsFilters,
  type BranchAgg,
} from "../../query";

export const dynamic = "force-dynamic";

type BranchExportRow = BranchAgg & { previous_rank: number | "" };

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
  const [productRows, serviceRows, prevProductRows, prevServiceRows] = await Promise.all([
    fetchProductSales(supabase, filters),
    fetchServiceSales(supabase, filters),
    fetchProductSales(supabase, prevFilters),
    fetchServiceSales(supabase, prevFilters),
  ]);

  const branches = aggregateBranches(productRows, serviceRows);
  const prevRankByBranch = rankByBranch(aggregateBranches(prevProductRows, prevServiceRows));
  const rows: BranchExportRow[] = branches.map((branch: BranchAgg) => ({
    ...branch,
    previous_rank: prevRankByBranch.get(branch.branch_id) ?? "",
  }));

  const columns: CsvColumn<BranchExportRow>[] = [
    { header: "Rank", value: (row) => row.rank },
    { header: "Branch", value: (row) => row.branch_name },
    { header: "Revenue", value: (row) => row.revenue },
    { header: "Units", value: (row) => row.units },
    { header: "Margin", value: (row) => row.margin },
    { header: "Share %", value: (row) => Number(row.share_pct.toFixed(1)) },
    { header: "Previous rank", value: (row) => row.previous_rank },
  ];

  const today = new Date().toISOString().slice(0, 10);
  return csvResponse(`analytics-branches-${today}.csv`, toCsv(rows, columns));
}
