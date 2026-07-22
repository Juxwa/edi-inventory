import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/supabase/profile";
import { toCsv, csvResponse, type CsvColumn } from "@/lib/csv";
import {
  parseAnalyticsFilters,
  fetchServiceSales,
  aggregateServices,
  type ServiceAgg,
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
  const serviceRows = await fetchServiceSales(supabase, filters);
  const services = aggregateServices(serviceRows);

  const columns: CsvColumn<ServiceAgg>[] = [
    { header: "Service", value: (row) => row.service_name },
    { header: "Units", value: (row) => row.units },
    { header: "Revenue", value: (row) => row.revenue },
  ];

  const today = new Date().toISOString().slice(0, 10);
  return csvResponse(`analytics-services-${today}.csv`, toCsv(services, columns));
}
