import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/supabase/profile";
import { toCsv, csvResponse, type CsvColumn } from "@/lib/csv";
import { formatDate } from "@/lib/format";
import {
  parseAnalyticsFilters,
  fetchCustomerSales,
  fetchCustomerSalesAllTime,
  aggregateCustomers,
  type CustomerAgg,
} from "../../query";

export const dynamic = "force-dynamic";

type CustomerExportRow = CustomerAgg & { all_time_value: number };

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
  const [customerRows, customerRowsAllTime] = await Promise.all([
    fetchCustomerSales(supabase, filters),
    fetchCustomerSalesAllTime(supabase, filters),
  ]);

  const customers = aggregateCustomers(customerRows).slice(0, 20);
  const allTimeByCustomer = new Map(
    aggregateCustomers(customerRowsAllTime).map((c: CustomerAgg) => [c.customer_id, c.total_value]),
  );
  const rows: CustomerExportRow[] = customers.map((customer: CustomerAgg) => ({
    ...customer,
    all_time_value: allTimeByCustomer.get(customer.customer_id) ?? customer.total_value,
  }));

  const columns: CsvColumn<CustomerExportRow>[] = [
    { header: "Customer", value: (row) => row.customer_name },
    { header: "Branch", value: (row) => row.branch_name },
    { header: "Value (period)", value: (row) => row.total_value },
    { header: "Value (all-time)", value: (row) => row.all_time_value },
    { header: "Sales", value: (row) => row.sale_count },
    { header: "Last purchase", value: (row) => formatDate(row.last_purchase_date) },
  ];

  const today = new Date().toISOString().slice(0, 10);
  return csvResponse(`analytics-vip-customers-${today}.csv`, toCsv(rows, columns));
}
