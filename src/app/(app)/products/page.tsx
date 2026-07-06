import Link from "next/link";
import { PlusIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ProductTable, type ProductRowData } from "@/components/products/product-table";
import { ProductCreateDialog } from "@/components/products/product-dialog";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

type ProductsPageProps = {
  searchParams: Promise<{
    q?: string;
    category?: string;
    archived?: string;
    page?: string;
  }>;
};

type ProductQueryRow = {
  id: string;
  name: string;
  code: string | null;
  srp: number | null;
  has_serial: boolean;
  is_active: boolean;
  archived: boolean;
  description: string | null;
  notes: string | null;
  category_id: number | null;
  supplier_id: string | null;
  product_categories: { name: string } | { name: string }[] | null;
  suppliers: { name: string } | { name: string }[] | null;
};

function firstOrNull<T>(value: T | T[] | null): T | null {
  if (value == null) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export default async function ProductsPage({
  searchParams,
}: ProductsPageProps) {
  const params = await searchParams;
  const q = params.q?.trim() ?? "";
  const categoryParam = params.category?.trim() ?? "";
  const showArchived = params.archived === "true";
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const supabase = await createClient();

  const [categoriesResult, suppliersResult] = await Promise.all([
    supabase.from("product_categories").select("id, name").order("name"),
    supabase
      .from("suppliers")
      .select("id, name")
      .eq("is_active", true)
      .order("name"),
  ]);

  const categories: { id: number; name: string }[] =
    categoriesResult.data ?? [];
  const suppliers: { id: string; name: string }[] = suppliersResult.data ?? [];

  let query = supabase
    .from("products")
    .select(
      "id, name, code, srp, has_serial, is_active, archived, description, notes, category_id, supplier_id, product_categories(name), suppliers(name)",
      { count: "exact" },
    )
    .eq("archived", showArchived)
    .order("name")
    .range(from, to);

  if (q) {
    query = query.or(`name.ilike.%${q}%,code.ilike.%${q}%`);
  }
  if (categoryParam) {
    query = query.eq("category_id", categoryParam);
  }

  const { data, count } = await query;
  const rows: ProductQueryRow[] = (data as ProductQueryRow[] | null) ?? [];

  const products: ProductRowData[] = rows.map((row: ProductQueryRow) => ({
    id: row.id,
    name: row.name,
    code: row.code,
    srp: row.srp,
    has_serial: row.has_serial,
    is_active: row.is_active,
    archived: row.archived,
    description: row.description,
    notes: row.notes,
    category_id: row.category_id,
    supplier_id: row.supplier_id,
    category_name: firstOrNull(row.product_categories)?.name ?? null,
    supplier_name: firstOrNull(row.suppliers)?.name ?? null,
  }));

  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function buildPageHref(targetPage: number): string {
    const next = new URLSearchParams();
    if (q) next.set("q", q);
    if (categoryParam) next.set("category", categoryParam);
    if (showArchived) next.set("archived", "true");
    next.set("page", String(targetPage));
    return `/products?${next.toString()}`;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Products</h1>
          <p className="text-sm text-muted-foreground">
            Manage the product catalog used across stock and sales.
          </p>
        </div>
        <ProductCreateDialog
          categories={categories}
          suppliers={suppliers}
          trigger={
            <Button>
              <PlusIcon className="size-4" />
              New product
            </Button>
          }
        />
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
            placeholder="Name or code"
            className="w-56"
          />
        </div>
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
        <div className="flex items-center gap-2 pb-2">
          <input
            type="checkbox"
            id="archived"
            name="archived"
            value="true"
            defaultChecked={showArchived}
            className="size-4 rounded border-input"
          />
          <label htmlFor="archived" className="text-sm font-medium">
            Show archived
          </label>
        </div>
        <Button type="submit" variant="secondary">
          Apply
        </Button>
        {(q || categoryParam || showArchived) && (
          <Button asChild variant="ghost">
            <Link href="/products">Clear</Link>
          </Button>
        )}
      </form>

      <ProductTable
        products={products}
        categories={categories}
        suppliers={suppliers}
      />

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
