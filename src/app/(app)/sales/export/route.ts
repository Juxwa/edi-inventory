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
  referred_by: string | null;
  discount: number | null;
  discount_type: string | null;
  discount_id_no: string | null;
  vat_exempt: boolean | null;
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
  is_freebie: boolean;
};

type ExportRow = {
  sale: SaleQueryRow;
  line: LineRow;
  isFirstLineOfSale: boolean;
};

const PAGE = 1000;
const ID_CHUNK = 150;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

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
  // Paged: PostgREST caps un-ranged queries at 1000 rows, which silently
  // truncated large date ranges to the newest ~month of sales.
  const sales: SaleQueryRow[] = [];
  for (let from = 0; ; from += PAGE) {
    let salesQuery = supabase
      .from("sales")
      .select(
        "id, sale_date, or_no, csi_no, ci_no, customer_id, branch_id, sold_by, referred_by, discount, discount_type, discount_id_no, vat_exempt, is_paid, voided_at",
      )
      .order("sale_date", { ascending: false })
      .order("id", { ascending: false })
      .range(from, from + PAGE - 1);

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
    const pageRows: SaleQueryRow[] = (salesData as SaleQueryRow[] | null) ?? [];
    sales.push(...pageRows);
    if (pageRows.length < PAGE) break;
  }
  const saleById = new Map<string, SaleQueryRow>(
    sales.map((sale: SaleQueryRow) => [sale.id, sale]),
  );
  const saleIds = sales.map((sale: SaleQueryRow) => sale.id);

  // Chunked (URL-length safety) and paged (1000-row cap) line fetch.
  const lines: LineRow[] = [];
  for (const idChunk of chunk(saleIds, ID_CHUNK)) {
    for (let from = 0; ; from += PAGE) {
      const { data: lineData } = await supabase
        .from("sale_line_items")
        .select(
          "id, sale_id, line_type, product_id, service_id, quantity, unit_price, serial_snapshot, after_sales_status, created_at, is_freebie",
        )
        .in("sale_id", idChunk)
        .order("sale_id")
        .order("created_at")
        .range(from, from + PAGE - 1);
      const pageRows: LineRow[] = (lineData as LineRow[] | null) ?? [];
      lines.push(...pageRows);
      if (pageRows.length < PAGE) break;
    }
  }

  const branchIds = Array.from(new Set(sales.map((sale: SaleQueryRow) => sale.branch_id)));
  const customerIds = Array.from(
    new Set(
      sales
        .map((sale: SaleQueryRow) => sale.customer_id)
        .filter((id: string | null): id is string => id !== null),
    ),
  );
  const soldByIds = Array.from(
    new Set(
      sales
        .map((sale: SaleQueryRow) => sale.sold_by)
        .filter((id: string | null): id is string => id !== null),
    ),
  );
  const productIds = Array.from(
    new Set(
      lines
        .map((line: LineRow) => line.product_id)
        .filter((id: string | null): id is string => id !== null),
    ),
  );
  const serviceIds = Array.from(
    new Set(
      lines
        .map((line: LineRow) => line.service_id)
        .filter((id: string | null): id is string => id !== null),
    ),
  );

  // Chunked name lookups: a full-history export can reference 10k+ distinct
  // customers — a single .in() would blow the request URL and the row cap.
  async function fetchNames(table: string, ids: string[]): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    for (const idChunk of chunk(ids, ID_CHUNK)) {
      const { data } = await supabase.from(table).select("id, name").in("id", idChunk);
      type NameRow = { id: string; name: string | null };
      for (const row of ((data as NameRow[] | null) ?? [])) {
        map.set(row.id, row.name ?? "");
      }
    }
    return map;
  }

  const [branchNameById, customerNameById, profileNameById, productNameById, serviceNameById] =
    await Promise.all([
      fetchNames("branches", branchIds),
      fetchNames("customers", customerIds),
      fetchNames("profiles", soldByIds),
      fetchNames("products", productIds),
      fetchNames("services", serviceIds),
    ]);

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
        is_freebie: false,
      },
      isFirstLineOfSale: true,
    });
  }

  // Per-sale net sales = sum of that sale's line totals minus the
  // header-level discount, matching the sales_totals view
  // (0014_vat.sql: sum(unit_price * quantity) - discount). Printed on the
  // sale's first line only, like Discount, so summing the column doesn't
  // double-count.
  const grossBySaleId = new Map<string, number>();
  for (const line of lines) {
    grossBySaleId.set(
      line.sale_id,
      (grossBySaleId.get(line.sale_id) ?? 0) + line.quantity * line.unit_price,
    );
  }
  const netSalesBySaleId = new Map<string, number>();
  for (const sale of sales) {
    const gross = grossBySaleId.get(sale.id) ?? 0;
    netSalesBySaleId.set(sale.id, gross - (sale.discount ?? 0));
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
    { header: "Referred by", value: (row) => row.sale.referred_by },
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
      header: "Freebie",
      value: (row) => (row.line.id === "" ? "" : row.line.is_freebie ? "yes" : "no"),
    },
    {
      header: "Discount",
      value: (row) => (row.isFirstLineOfSale ? (row.sale.discount ?? 0) : ""),
    },
    {
      header: "Discount type",
      value: (row) => (row.isFirstLineOfSale ? (row.sale.discount_type ?? "none") : ""),
    },
    {
      header: "Discount ID no.",
      value: (row) => (row.isFirstLineOfSale ? row.sale.discount_id_no : ""),
    },
    {
      header: "VAT-exempt",
      value: (row) => (row.isFirstLineOfSale ? (row.sale.vat_exempt ? "yes" : "no") : ""),
    },
    {
      header: "Net sales",
      value: (row) => (row.isFirstLineOfSale ? (netSalesBySaleId.get(row.sale.id) ?? 0) : ""),
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
