import Link from "next/link";
import { redirect } from "next/navigation";
import { PlusIcon } from "lucide-react";
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
import {
  SalesTable,
  type SalesLineData,
  type SalesRowData,
} from "@/components/sales/sales-table";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

type SalesPageProps = {
  searchParams: Promise<{
    from?: string;
    to?: string;
    branch?: string;
    q?: string;
    page?: string;
  }>;
};

type SaleQueryRow = {
  id: string;
  sale_date: string;
  or_no: string | null;
  csi_no: string | null;
  ci_no: string | null;
  customer_id: string | null;
  branch_id: string;
  discount: number | null;
  is_paid: boolean;
};

export default async function SalesPage({ searchParams }: SalesPageProps) {
  const profile = await getProfile();
  if (!profile || profile.role === "technical") {
    redirect("/");
  }

  const params = await searchParams;
  const fromDate = params.from?.trim() ?? "";
  const toDate = params.to?.trim() ?? "";
  const q = params.q?.trim() ?? "";
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const supabase = await createClient();

  const canFilterBranch = profile.role === "admin" || profile.role === "top_mgmt";
  const branchParam = canFilterBranch ? (params.branch?.trim() ?? "") : "";
  const lockedBranchId = !canFilterBranch ? profile.branch_id : null;

  const branchesResult = await supabase.from("branches").select("id, name").order("name");
  const branches: { id: string; name: string }[] = branchesResult.data ?? [];
  const branchNameById = new Map<string, string>(
    branches.map((branch: { id: string; name: string }) => [branch.id, branch.name]),
  );

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

  let query = supabase
    .from("sales")
    .select("id, sale_date, or_no, csi_no, ci_no, customer_id, branch_id, discount, is_paid", {
      count: "exact",
    })
    .is("voided_at", null)
    .order("sale_date", { ascending: false })
    .range(from, to);

  if (fromDate) query = query.gte("sale_date", fromDate);
  if (toDate) query = query.lte("sale_date", toDate);
  if (lockedBranchId) query = query.eq("branch_id", lockedBranchId);
  else if (branchParam) query = query.eq("branch_id", branchParam);

  if (q) {
    const idList = matchingSaleIds ?? [];
    const receiptNoFilter = `or_no.ilike.%${q}%,csi_no.ilike.%${q}%,ci_no.ilike.%${q}%`;
    if (idList.length > 0) {
      query = query.or(`${receiptNoFilter},id.in.(${idList.join(",")})`);
    } else {
      query = query.or(receiptNoFilter);
    }
  }

  const { data, count } = await query;
  const rows: SaleQueryRow[] = (data as SaleQueryRow[] | null) ?? [];

  const customerIds = rows
    .map((row: SaleQueryRow) => row.customer_id)
    .filter((id: string | null): id is string => id !== null);

  let customerNameById = new Map<string, string>();
  if (customerIds.length > 0) {
    const { data: customerRows } = await supabase
      .from("customers")
      .select("id, name")
      .in("id", customerIds);
    type CustomerRow = { id: string; name: string };
    const customers: CustomerRow[] = (customerRows as CustomerRow[] | null) ?? [];
    customerNameById = new Map(
      customers.map((customer: CustomerRow) => [customer.id, customer.name]),
    );
  }

  const saleIds = rows.map((row: SaleQueryRow) => row.id);
  type LineRow = {
    sale_id: string;
    line_type: "stock" | "service";
    product_id: string | null;
    service_id: string | null;
    quantity: number;
    unit_price: number;
    serial_snapshot: string | null;
    warranty_expiry: string | null;
  };
  let lines: LineRow[] = [];
  if (saleIds.length > 0) {
    const { data: lineRows } = await supabase
      .from("sale_line_items")
      .select(
        "sale_id, line_type, product_id, service_id, quantity, unit_price, serial_snapshot, warranty_expiry",
      )
      .in("sale_id", saleIds);
    lines = (lineRows as LineRow[] | null) ?? [];
  }

  const productIds = lines
    .map((line: LineRow) => line.product_id)
    .filter((id: string | null): id is string => id !== null);
  const serviceIds = lines
    .map((line: LineRow) => line.service_id)
    .filter((id: string | null): id is string => id !== null);

  type NameRow = { id: string; name: string };
  const [productsResult, servicesResult] = await Promise.all([
    productIds.length > 0
      ? supabase.from("products").select("id, name").in("id", productIds)
      : Promise.resolve({ data: [] as NameRow[] }),
    serviceIds.length > 0
      ? supabase.from("services").select("id, name").in("id", serviceIds)
      : Promise.resolve({ data: [] as NameRow[] }),
  ]);
  const productNameById = new Map<string, string>(
    ((productsResult.data as NameRow[] | null) ?? []).map((row: NameRow) => [row.id, row.name]),
  );
  const serviceNameById = new Map<string, string>(
    ((servicesResult.data as NameRow[] | null) ?? []).map((row: NameRow) => [row.id, row.name]),
  );

  function lineName(line: LineRow): string {
    if (line.line_type === "service") {
      return line.service_id ? (serviceNameById.get(line.service_id) ?? "—") : "—";
    }
    return line.product_id ? (productNameById.get(line.product_id) ?? "—") : "—";
  }

  const lineTotalsBySaleId = new Map<string, { gross: number; lines: SalesLineData[] }>();
  for (const line of lines) {
    const existing = lineTotalsBySaleId.get(line.sale_id) ?? { gross: 0, lines: [] };
    existing.gross += line.quantity * line.unit_price;
    existing.lines.push({
      name: lineName(line),
      line_type: line.line_type,
      serial: line.serial_snapshot,
      warranty_expiry: line.warranty_expiry,
    });
    lineTotalsBySaleId.set(line.sale_id, existing);
  }

  const sales: SalesRowData[] = rows.map((row: SaleQueryRow) => {
    const totals = lineTotalsBySaleId.get(row.id) ?? { gross: 0, lines: [] };
    const net = Math.max(0, totals.gross - (row.discount ?? 0));
    return {
      id: row.id,
      sale_date: row.sale_date,
      or_no: row.or_no,
      csi_no: row.csi_no,
      ci_no: row.ci_no,
      customer_name: row.customer_id
        ? (customerNameById.get(row.customer_id) ?? "—")
        : "Walk-in",
      branch_name: branchNameById.get(row.branch_id) ?? "—",
      lines: totals.lines,
      net,
      is_paid: row.is_paid,
    };
  });

  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function buildPageHref(targetPage: number): string {
    const next = new URLSearchParams();
    if (fromDate) next.set("from", fromDate);
    if (toDate) next.set("to", toDate);
    if (branchParam) next.set("branch", branchParam);
    if (q) next.set("q", q);
    next.set("page", String(targetPage));
    return `/sales?${next.toString()}`;
  }

  const canRecord = profile.role === "admin" || profile.role === "branch_rep";
  const hasFilters = fromDate || toDate || branchParam || q;

  const exportParams = new URLSearchParams();
  if (fromDate) exportParams.set("from", fromDate);
  if (toDate) exportParams.set("to", toDate);
  if (branchParam) exportParams.set("branch", branchParam);
  if (q) exportParams.set("q", q);
  const exportHref = `/sales/export${exportParams.toString() ? `?${exportParams.toString()}` : ""}`;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Sales history</h1>
          <p className="text-sm text-muted-foreground">
            Browse recorded sales, filter by date, branch, or customer.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline">
            <Link href={exportHref}>Export CSV</Link>
          </Button>
          {canRecord ? (
            <Button asChild>
              <Link href="/sales/new">
                <PlusIcon className="size-4" />
                Record sale
              </Link>
            </Button>
          ) : null}
        </div>
      </div>

      <form className="flex flex-wrap items-end gap-3" method="get">
        <div className="grid gap-1.5">
          <label htmlFor="from" className="text-sm font-medium">
            From
          </label>
          <Input id="from" name="from" type="date" defaultValue={fromDate} className="w-40" />
        </div>
        <div className="grid gap-1.5">
          <label htmlFor="to" className="text-sm font-medium">
            To
          </label>
          <Input id="to" name="to" type="date" defaultValue={toDate} className="w-40" />
        </div>
        {canFilterBranch ? (
          <div className="grid gap-1.5">
            <label htmlFor="branch" className="text-sm font-medium">
              Branch
            </label>
            <Select name="branch" defaultValue={branchParam || undefined}>
              <SelectTrigger id="branch" className="w-44">
                <SelectValue placeholder="All branches" />
              </SelectTrigger>
              <SelectContent>
                {branches.map((branch: { id: string; name: string }) => (
                  <SelectItem key={branch.id} value={branch.id}>
                    {branch.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
        <div className="grid gap-1.5">
          <label htmlFor="q" className="text-sm font-medium">
            Search
          </label>
          <Input
            id="q"
            name="q"
            defaultValue={q}
            placeholder="Customer, OR no., or serial"
            className="w-56"
          />
        </div>
        <Button type="submit" variant="secondary">
          Apply
        </Button>
        {hasFilters ? (
          <Button asChild variant="ghost">
            <Link href="/sales">Clear</Link>
          </Button>
        ) : null}
      </form>

      <SalesTable rows={sales} />

      {total > 0 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Showing {from + 1}
            {"–"}
            {Math.min(to + 1, total)} of {total}
          </span>
          <div className="flex gap-2">
            <Button
              asChild
              variant="outline"
              size="sm"
              disabled={page <= 1}
              className={page <= 1 ? "pointer-events-none opacity-50" : ""}
            >
              <Link href={buildPageHref(Math.max(1, page - 1))}>Previous</Link>
            </Button>
            <Button
              asChild
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              className={
                page >= totalPages ? "pointer-events-none opacity-50" : ""
              }
            >
              <Link href={buildPageHref(Math.min(totalPages, page + 1))}>
                Next
              </Link>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
