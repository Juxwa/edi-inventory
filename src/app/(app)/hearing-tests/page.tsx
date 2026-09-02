import Link from "next/link";
import { redirect } from "next/navigation";
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
import { resolveAttachmentLinks } from "@/components/customers/visit-list";
import {
  HearingTestsTable,
  type HearingTestVisitRow,
  type CustomerSaleOption,
} from "@/components/hearing-tests/hearing-tests-table";
import {
  parseHearingTestFilters,
  fetchHearingTestVisits,
  type HearingTestVisitQueryRow,
} from "./query";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

type HearingTestsPageProps = {
  searchParams: Promise<{
    branch?: string;
    from?: string;
    to?: string;
    reviewed?: string;
    sale?: string;
    page?: string;
  }>;
};

type BranchRow = { id: string; name: string; is_active: boolean };
type CustomerIdRow = { id: string };
type CustomerRow = { id: string; name: string; branch_created_id: string | null };
type ProfileRow = { id: string; name: string | null };
type SaleOrNoRow = { id: string; or_no: string | null };
type CustomerSaleRow = {
  id: string;
  customer_id: string;
  sale_date: string;
  or_no: string | null;
};

export default async function HearingTestsPage({ searchParams }: HearingTestsPageProps) {
  const profile = await getProfile();
  if (!profile || (profile.role !== "admin" && profile.role !== "top_mgmt")) {
    redirect("/");
  }

  const params = await searchParams;
  const filters = parseHearingTestFilters(params);
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const supabase = await createClient();

  const [branchesResult, customerIds] = await Promise.all([
    supabase.from("branches").select("id, name, is_active").order("name"),
    (async (): Promise<string[] | null> => {
      if (!filters.branch) return null;
      const { data } = await supabase
        .from("customers")
        .select("id")
        .eq("branch_created_id", filters.branch);
      return ((data as CustomerIdRow[] | null) ?? []).map((row: CustomerIdRow) => row.id);
    })(),
  ]);

  const branches: BranchRow[] = branchesResult.data ?? [];
  const branchNameById = new Map<string, string>(
    branches.map((branch: BranchRow) => [branch.id, branch.name]),
  );

  const { rows, count } = await fetchHearingTestVisits(supabase, filters, customerIds, {
    from,
    to,
  });

  const visitCustomerIds = Array.from(
    new Set(rows.map((row: HearingTestVisitQueryRow) => row.customer_id)),
  );
  const reviewerIds = Array.from(
    new Set(
      rows
        .map((row: HearingTestVisitQueryRow) => row.reviewed_by)
        .filter((id: string | null): id is string => id !== null),
    ),
  );
  const linkedSaleIds = Array.from(
    new Set(
      rows
        .map((row: HearingTestVisitQueryRow) => row.resulted_in_sale_id)
        .filter((id: string | null): id is string => id !== null),
    ),
  );

  let customerById = new Map<string, CustomerRow>();
  if (visitCustomerIds.length > 0) {
    const { data } = await supabase
      .from("customers")
      .select("id, name, branch_created_id")
      .in("id", visitCustomerIds);
    customerById = new Map(
      ((data as CustomerRow[] | null) ?? []).map((row: CustomerRow) => [row.id, row]),
    );
  }

  let reviewerNameById = new Map<string, string>();
  if (reviewerIds.length > 0) {
    const { data } = await supabase.from("profiles").select("id, name").in("id", reviewerIds);
    reviewerNameById = new Map(
      ((data as ProfileRow[] | null) ?? []).map((row: ProfileRow) => [
        row.id,
        row.name ?? "—",
      ]),
    );
  }

  let saleOrNoById = new Map<string, string | null>();
  if (linkedSaleIds.length > 0) {
    const { data } = await supabase.from("sales").select("id, or_no").in("id", linkedSaleIds);
    saleOrNoById = new Map(
      ((data as SaleOrNoRow[] | null) ?? []).map((row: SaleOrNoRow) => [row.id, row.or_no]),
    );
  }

  // Every sale belonging to any customer on this page — powers the
  // per-row sale linker in the review dialog without a per-row fetch.
  let salesByCustomerId = new Map<string, CustomerSaleOption[]>();
  if (visitCustomerIds.length > 0) {
    const { data } = await supabase
      .from("sales")
      .select("id, customer_id, sale_date, or_no")
      .in("customer_id", visitCustomerIds)
      .order("sale_date", { ascending: false });
    const salesRows: CustomerSaleRow[] = (data as CustomerSaleRow[] | null) ?? [];
    salesByCustomerId = new Map();
    for (const sale of salesRows) {
      const list = salesByCustomerId.get(sale.customer_id) ?? [];
      list.push({ id: sale.id, sale_date: sale.sale_date, or_no: sale.or_no });
      salesByCustomerId.set(sale.customer_id, list);
    }
  }

  // Signed URLs for each visit's test-file attachment(s) — same helper
  // visit-list.tsx uses for a customer's visit history.
  const attachmentsByVisitId = new Map<
    string,
    { path: string; url: string | null; name: string }[]
  >();
  for (const row of rows) {
    if (!row.attachment_paths || row.attachment_paths.length === 0) continue;
    attachmentsByVisitId.set(row.id, await resolveAttachmentLinks(row.attachment_paths));
  }

  const visitRows: HearingTestVisitRow[] = rows.map(
    (row: HearingTestVisitQueryRow): HearingTestVisitRow => {
      const customer = customerById.get(row.customer_id);
      const branchId = customer?.branch_created_id ?? null;
      return {
        id: row.id,
        visit_date: row.visit_date,
        customer_id: row.customer_id,
        customer_name: customer?.name ?? "Unknown",
        branch_name: branchId ? (branchNameById.get(branchId) ?? "—") : "—",
        purchased_during_visit: row.purchased_during_visit,
        attachments: attachmentsByVisitId.get(row.id) ?? [],
        reviewed_at: row.reviewed_at,
        reviewed_by_name: row.reviewed_by
          ? (reviewerNameById.get(row.reviewed_by) ?? "—")
          : null,
        review_notes: row.review_notes,
        resulted_in_sale_id: row.resulted_in_sale_id,
        linked_sale_or_no: row.resulted_in_sale_id
          ? (saleOrNoById.get(row.resulted_in_sale_id) ?? null)
          : null,
        customer_sales: salesByCustomerId.get(row.customer_id) ?? [],
      };
    },
  );

  const total = count;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function buildPageHref(targetPage: number): string {
    const next = new URLSearchParams();
    if (filters.branch) next.set("branch", filters.branch);
    next.set("from", filters.from);
    next.set("to", filters.to);
    if (filters.reviewed !== "all") next.set("reviewed", filters.reviewed);
    if (filters.sale !== "all") next.set("sale", filters.sale);
    next.set("page", String(targetPage));
    return `/hearing-tests?${next.toString()}`;
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold">Hearing tests</h1>
        <p className="text-sm text-muted-foreground">
          Cross-branch review queue for patient hearing tests: view the test
          file, add notes, mark reviewed, and link the sale it resulted in.
        </p>
      </div>

      <form className="flex flex-wrap items-end gap-3" method="get">
        <div className="grid gap-1.5">
          <label htmlFor="branch" className="text-sm font-medium">
            Branch
          </label>
          <Select name="branch" defaultValue={filters.branch || undefined}>
            <SelectTrigger id="branch" className="w-44">
              <SelectValue placeholder="All branches" />
            </SelectTrigger>
            <SelectContent>
              {branches.map((branch: BranchRow) => (
                <SelectItem key={branch.id} value={branch.id}>
                  {branch.name}
                  {branch.is_active ? "" : " (closed)"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
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
          <label htmlFor="reviewed" className="text-sm font-medium">
            Reviewed
          </label>
          <Select name="reviewed" defaultValue={filters.reviewed}>
            <SelectTrigger id="reviewed" className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="reviewed">Reviewed</SelectItem>
              <SelectItem value="unreviewed">Unreviewed</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <label htmlFor="sale" className="text-sm font-medium">
            Sale
          </label>
          <Select name="sale" defaultValue={filters.sale}>
            <SelectTrigger id="sale" className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="with-sale">With sale</SelectItem>
              <SelectItem value="no-sale">No sale</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button type="submit" variant="secondary">
          Apply
        </Button>
        <Button asChild variant="ghost">
          <Link href="/hearing-tests">Reset</Link>
        </Button>
      </form>

      <HearingTestsTable rows={visitRows} />

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
              className={page >= totalPages ? "pointer-events-none opacity-50" : ""}
            >
              <Link href={buildPageHref(Math.min(totalPages, page + 1))}>Next</Link>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
