import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/supabase/profile";
import { toCsv, csvResponse, type CsvColumn } from "@/lib/csv";

export const dynamic = "force-dynamic";

// Mirrors src/app/(app)/reports/sales/export/route.ts's pattern, but at
// per-sale-*line* grain (not per-sale accounting totals) and honouring the
// same filters as /sales (date range, branch, q) rather than the sales
// report's filters. Deliberately includes voided sales (flagged via the
// `voided` column) rather than silently excluding anything — accounting
// may need them. Deliberately excludes cost_per_unit/unit_cost: cost data
// is HQ-only (migration 0010) and this export is reachable by branch_rep.
type SaleQueryRow = {
  id: string;
  sale_date: string;
  or_no: string | null;
  csi_no: string | null;
  ci_no: string | null;
  customer_id: string | null;
  branch_id: string;
  sold_by: string | null;
  discount: number | null;
  is_paid: boolean;
  voided_at: string | null;
};

type LineRow = {
  id: string;
  sale_id: string;
  line_type: "stock" | "service";
  product_id: string | null;
  service_id: string | null;
  quantity: number;
  unit_price: number;
  serial_snapshot: string | null;
  after_sales_status: string | null;
  created_at: string;
};

type ExportRow = {
  sale: SaleQueryRow;
  line: LineRow;
  isFirstLineOfSale: boolean;
};

export async function GET(request: Request): Promise<Response> {
  const profile = await getProfile();
  if (!profile || profile.role === "technical") {
    redirect("/");
  }

  const url = new URL(request.url);
  const fromDate = url.searchParams.get("from")?.trim() ?? "";
  const toDate = url.searchParams.get("to")?.trim() ?? "";
  const q = url.searchParams.get("q")?.trim() ?? "";

  const supabase = await createClient();

  const canFilterBranch = profile.role === "admin" || profile.role === "top_mgmt";
  const branchParam = canFilterBranch ? (url.searchParams.get("branch")?.trim() ?? "") : "";
  const lockedBranchId = !canFilterBranch ? profile.branch_id : null;

  let matchingSaleIds: string[] | null = null;
  if (q) {
    const [customerMatches, lineMatches] = await Promise.all([
      supabase.from("customers").select("id").ilike("name", `%${q}%`),
      supabase
        .from("sale_line_items")
        .select("sale_id")
        .ilike("serial_snapshot", `%${q}%`),
    ]);
    const customerIds: string[] = (customerMatches.data ?? []).map(
      (row: { id: string }) => row.id,
    );
    const saleIdsFromLines: string[] = (lineMatches.data ?? []).map(
      (row: { sale_id: string }) => row.sale_id,
    );

    let saleIdsFromCustomers: string[] = [];
    if (customerIds.length > 0) {
      const { data: salesByCustomer } = await supabase
        .from("sales")
        .select("id")
        .in("customer_id", customerIds);
      saleIdsFromCustomers = (salesByCustomer ?? []).map((row: { id: string }) => row.id);
    }

    matchingSaleIds = Array.from(new Set([...saleIdsFromCustomers, ...saleIdsFromLines]));
  }

  // Unlike /sales's list query, no `.is("voided_at", null)` here — voided
  // sales are exported too, flagged via the `voided` column.
  let salesQuery = supabase
    .from("sales")
    .select(
      "id, sale_date, or_no, csi_no, ci_no, customer_id, branch_id, sold_by, discount, is_paid, voided_at",
    )
    .order("sale_date", { ascending: false });

  if (fromDate) salesQuery = salesQuery.gte("sale_date", fromDate);
  if (toDate) salesQuery = salesQuery.lte("sale_date", toDate);
  if (lockedBranchId) salesQuery = salesQuery.eq("branch_id", lockedBranchId);
  else if (branchParam) salesQuery = salesQuery.eq("branch_id", branchParam);

  if (q) {
    const idList = matchingSaleIds ?? [];
    const orNoFilter = `or_no.ilike.%${q}%`;
    if (idList.length > 0) {
      salesQuery = salesQuery.or(`${orNoFilter},id.in.(${idList.join(",")})`);
    } else {
      salesQuery = salesQuery.or(orNoFilter);
    }
  }

  const { data: salesData } = await salesQuery;
  const sales: SaleQueryRow[] = (salesData as SaleQueryRow[] | null) ?? [];
  const saleById = new Map<string, SaleQueryRow>(
    sales.map((sale: SaleQueryRow) => [sale.id, sale]),
  );
  const saleIds = sales.map((sale: SaleQueryRow) => sale.id);

  let lines: LineRow[] = [];
  if (saleIds.length > 0) {
    const { data: lineData } = await supabase
      .from("sale_line_items")
      .select(
        "id, sale_id, line_type, product_id, service_id, quantity, unit_price, serial_snapshot, after_sales_status, created_at",
      )
      .in("sale_id", saleIds)
      .order("sale_id")
      .order("created_at");
    lines = (lineData as LineRow[] | null) ?? [];
  }

  const branchIds = Array.from(new Set(sales.map((sale: SaleQueryRow) => sale.branch_id)));
  const customerIds = sales
    .map((sale: SaleQueryRow) => sale.customer_id)
    .filter((id: string | null): id is string => id !== null);
  const soldByIds = sales
    .map((sale: SaleQueryRow) => sale.sold_by)
    .filter((id: string | null): id is string => id !== null);
  const productIds = lines
    .map((line: LineRow) => line.product_id)
    .filter((id: string | null): id is string => id !== null);
  const serviceIds = lines
    .map((line: LineRow) => line.service_id)
    .filter((id: string | null): id is string => id !== null);

  const [branchesResult, customersResult, profilesResult, productsResult, servicesResult] =
    await Promise.all([
      branchIds.length > 0
        ? supabase.from("branches").select("id, name").in("id", branchIds)
        : Promise.resolve({ data: [] as { id: string; name: string }[] }),
      customerIds.length > 0
        ? supabase.from("customers").select("id, name").in("id", customerIds)
        : Promise.resolve({ data: [] as { id: string; name: string }[] }),
      soldByIds.length > 0
        ? supabase.from("profiles").select("id, name").in("id", soldByIds)
        : Promise.resolve({ data: [] as { id: string; name: string | null }[] }),
      productIds.length > 0
        ? supabase.from("products").select("id, name").in("id", productIds)
        : Promise.resolve({ data: [] as { id: string; name: string }[] }),
      serviceIds.length > 0
        ? supabase.from("services").select("id, name").in("id", serviceIds)
        : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    ]);

  type NameRow = { id: string; name: string | null };
  const branchNameById = new Map<string, string>(
    ((branchesResult.data as NameRow[] | null) ?? []).map((row: NameRow) => [
      row.id,
      row.name ?? "",
    ]),
  );
  const customerNameById = new Map<string, string>(
    ((customersResult.data as NameRow[] | null) ?? []).map((row: NameRow) => [
      row.id,
      row.name ?? "",
    ]),
  );
  const profileNameById = new Map<string, string>(
    ((profilesResult.data as NameRow[] | null) ?? []).map((row: NameRow) => [
      row.id,
      row.name ?? "",
    ]),
  );
  const productNameById = new Map<string, string>(
    ((productsResult.data as NameRow[] | null) ?? []).map((row: NameRow) => [
      row.id,
      row.name ?? "",
    ]),
  );
  const serviceNameById = new Map<string, string>(
    ((servicesResult.data as NameRow[] | null) ?? []).map((row: NameRow) => [
      row.id,
      row.name ?? "",
    ]),
  );

  // Build one export row per sale line. Discount is header-level (per
  // sale, not per line) — printed on each sale's first line only so
  // summing the "Line total" column doesn't double-count it.
  const seenSale = new Set<string>();
  const exportRows: ExportRow[] = [];
  for (const line of lines) {
    const sale = saleById.get(line.sale_id);
    if (!sale) continue;
    const isFirstLineOfSale = !seenSale.has(sale.id);
    seenSale.add(sale.id);
    exportRows.push({ sale, line, isFirstLineOfSale });
  }
  // Sales with zero lines still get one row so nothing is silently
  // excluded from the export.
  for (const sale of sales) {
    if (seenSale.has(sale.id)) continue;
    exportRows.push({
      sale,
      line: {
        id: "",
        sale_id: sale.id,
        line_type: "service",
        product_id: null,
        service_id: null,
        quantity: 0,
        unit_price: 0,
        serial_snapshot: null,
        after_sales_status: null,
        created_at: "",
      },
      isFirstLineOfSale: true,
    });
  }

  function lineName(line: LineRow): string {
    if (line.id === "") return "(no lines)";
    if (line.line_type === "service") {
      return line.service_id ? (serviceNameById.get(line.service_id) ?? "—") : "—";
    }
    return line.product_id ? (productNameById.get(line.product_id) ?? "—") : "—";
  }

  const columns: CsvColumn<ExportRow>[] = [
    { header: "Sale date", value: (row) => row.sale.sale_date },
    { header: "OR no.", value: (row) => row.sale.or_no },
    { header: "CSI no.", value: (row) => row.sale.csi_no },
    { header: "CI no.", value: (row) => row.sale.ci_no },
    {
      header: "Customer",
      value: (row) =>
        row.sale.customer_id ? (customerNameById.get(row.sale.customer_id) ?? "—") : "Walk-in",
    },
    { header: "Branch", value: (row) => branchNameById.get(row.sale.branch_id) ?? "" },
    {
      header: "Sold by",
      value: (row) => (row.sale.sold_by ? (profileNameById.get(row.sale.sold_by) ?? "—") : ""),
    },
    { header: "Line type", value: (row) => (row.line.id === "" ? "" : row.line.line_type) },
    { header: "Product/service", value: (row) => lineName(row.line) },
    { header: "Serial", value: (row) => row.line.serial_snapshot },
    { header: "Quantity", value: (row) => (row.line.id === "" ? "" : row.line.quantity) },
    { header: "Unit price", value: (row) => (row.line.id === "" ? "" : row.line.unit_price) },
    {
      header: "Line total",
      value: (row) => (row.line.id === "" ? "" : row.line.quantity * row.line.unit_price),
    },
    {
      header: "Discount",
      value: (row) => (row.isFirstLineOfSale ? (row.sale.discount ?? 0) : ""),
    },
    { header: "Paid", value: (row) => (row.sale.is_paid ? "yes" : "no") },
    {
      header: "After-sales status",
      value: (row) => row.line.after_sales_status,
    },
    { header: "Voided", value: (row) => (row.sale.voided_at ? "yes" : "no") },
  ];

  const today = new Date().toISOString().slice(0, 10);
  return csvResponse(`sales-history-${today}.csv`, toCsv(exportRows, columns));
}
