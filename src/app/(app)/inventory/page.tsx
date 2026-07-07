import Link from "next/link";
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
import { StockTable, type StockRowData } from "@/components/inventory/stock-table";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

const STOCK_STATUSES = [
  "available",
  "transferred",
  "sold",
  "under_repair",
  "for_replacement",
  "consignment",
  "returned",
] as const;

function formatStatusLabel(status: string): string {
  return status
    .split("_")
    .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

type InventoryPageProps = {
  searchParams: Promise<{
    q?: string;
    branch?: string;
    category?: string;
    status?: string;
    page?: string;
  }>;
};

type StockQueryRow = {
  id: string;
  quantity: number;
  serial_number: string | null;
  status: string;
  cost_per_unit: number | null;
  branch_date_received: string | null;
  products: { name: string } | { name: string }[] | null;
  branches: { name: string } | { name: string }[] | null;
};

function firstOrNull<T>(value: T | T[] | null): T | null {
  if (value == null) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export default async function InventoryPage({
  searchParams,
}: InventoryPageProps) {
  const params = await searchParams;
  const q = params.q?.trim() ?? "";
  const branchParam = params.branch?.trim() ?? "";
  const categoryParam = params.category?.trim() ?? "";
  const statusParam = params.status?.trim() ?? "";
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const supabase = await createClient();
  const profile = await getProfile();
  const canFilterByBranch =
    profile?.role === "admin" || profile?.role === "top_mgmt";

  const [branchesResult, categoriesResult] = await Promise.all([
    supabase.from("branches").select("id, name").order("name"),
    supabase.from("product_categories").select("id, name").order("name"),
  ]);

  const branches: { id: string; name: string }[] = branchesResult.data ?? [];
  const categories: { id: number; name: string }[] =
    categoriesResult.data ?? [];

  // Resolve product ids matching the free-text search independently from
  // the category filter so the two conditions don't leak into each other.
  let searchProductIds: string[] | null = null;
  if (q) {
    const { data: productMatches } = await supabase
      .from("products")
      .select("id")
      .ilike("name", `%${q}%`);
    searchProductIds = (productMatches ?? []).map(
      (row: { id: string }) => row.id,
    );
  }

  let categoryProductIds: string[] | null = null;
  if (categoryParam) {
    const { data: productMatches } = await supabase
      .from("products")
      .select("id")
      .eq("category_id", categoryParam);
    categoryProductIds = (productMatches ?? []).map(
      (row: { id: string }) => row.id,
    );
  }

  let query = supabase
    .from("stock_visible")
    .select(
      "id, quantity, serial_number, status, cost_per_unit, branch_date_received, products(name), branches(name)",
      { count: "exact" },
    )
    .order("branch_date_received", { ascending: false, nullsFirst: false })
    .range(from, to);

  if (q) {
    const productIdList = searchProductIds ?? [];
    if (productIdList.length > 0) {
      query = query.or(
        `serial_number.ilike.%${q}%,product_id.in.(${productIdList.join(",")})`,
      );
    } else {
      query = query.ilike("serial_number", `%${q}%`);
    }
  }
  if (categoryParam) {
    if (categoryProductIds && categoryProductIds.length > 0) {
      query = query.in("product_id", categoryProductIds);
    } else {
      query = query.eq("product_id", "00000000-0000-0000-0000-000000000000");
    }
  }
  if (canFilterByBranch && branchParam) {
    query = query.eq("branch_id", branchParam);
  }
  if (statusParam) {
    query = query.eq("status", statusParam);
  }

  const { data, count } = await query;
  const rows: StockQueryRow[] = (data as StockQueryRow[] | null) ?? [];

  const stock: StockRowData[] = rows.map((row: StockQueryRow) => ({
    id: row.id,
    product_name: firstOrNull(row.products)?.name ?? "—",
    serial_number: row.serial_number,
    branch_name: firstOrNull(row.branches)?.name ?? "—",
    quantity: row.quantity,
    status: row.status,
    cost_per_unit: row.cost_per_unit,
    branch_date_received: row.branch_date_received,
  }));

  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function buildPageHref(targetPage: number): string {
    const next = new URLSearchParams();
    if (q) next.set("q", q);
    if (branchParam) next.set("branch", branchParam);
    if (categoryParam) next.set("category", categoryParam);
    if (statusParam) next.set("status", statusParam);
    next.set("page", String(targetPage));
    return `/inventory?${next.toString()}`;
  }

  const hasFilters = q || branchParam || categoryParam || statusParam;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Stock</h1>
          <p className="text-sm text-muted-foreground">
            Current stock across branches.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/inventory/aging">View aging report</Link>
        </Button>
      </div>

      <form className="flex flex-wrap items-end gap-3" method="get">
        <div className="grid gap-1.5">
          <label htmlFor="q" className="text-sm font-medium">
            Search
          </label>
          <Input
            id="q"
            name="q"
            defaultValue={q}
            placeholder="Serial or product name"
            className="w-56"
          />
        </div>
        {canFilterByBranch && (
          <div className="grid gap-1.5">
            <label htmlFor="branch" className="text-sm font-medium">
              Branch
            </label>
            <Select name="branch" defaultValue={branchParam || undefined}>
              <SelectTrigger id="branch" className="w-48">
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
        )}
        <div className="grid gap-1.5">
          <label htmlFor="category" className="text-sm font-medium">
            Category
          </label>
          <Select name="category" defaultValue={categoryParam || undefined}>
            <SelectTrigger id="category" className="w-48">
              <SelectValue placeholder="All categories" />
            </SelectTrigger>
            <SelectContent>
              {categories.map((category: { id: number; name: string }) => (
                <SelectItem key={category.id} value={String(category.id)}>
                  {category.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <label htmlFor="status" className="text-sm font-medium">
            Status
          </label>
          <Select name="status" defaultValue={statusParam || undefined}>
            <SelectTrigger id="status" className="w-44">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              {STOCK_STATUSES.map((status: string) => (
                <SelectItem key={status} value={status}>
                  {formatStatusLabel(status)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button type="submit" variant="secondary">
          Apply
        </Button>
        {hasFilters && (
          <Button asChild variant="ghost">
            <Link href="/inventory">Clear</Link>
          </Button>
        )}
      </form>

      <StockTable rows={stock} showCost={canFilterByBranch} />

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
