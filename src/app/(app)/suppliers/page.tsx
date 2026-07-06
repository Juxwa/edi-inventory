import Link from "next/link";
import { redirect } from "next/navigation";
import { PlusIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/supabase/profile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  SupplierTable,
  type SupplierRowData,
} from "@/components/suppliers/supplier-table";
import { SupplierCreateDialog } from "@/components/suppliers/supplier-dialog";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

type SuppliersPageProps = {
  searchParams: Promise<{
    q?: string;
    page?: string;
  }>;
};

export default async function SuppliersPage({
  searchParams,
}: SuppliersPageProps) {
  const profile = await getProfile();
  if (!profile || !["admin", "top_mgmt"].includes(profile.role)) {
    redirect("/");
  }
  const params = await searchParams;
  const q = params.q?.trim() ?? "";
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const supabase = await createClient();

  let query = supabase
    .from("suppliers")
    .select(
      "id, name, contact_person, contact_no, email, address, payment_terms, notes, is_active, is_stub",
      { count: "exact" },
    )
    .order("name")
    .range(from, to);

  if (q) {
    query = query.or(`name.ilike.%${q}%,contact_person.ilike.%${q}%`);
  }

  const { data, count } = await query;
  const suppliers: SupplierRowData[] = (data as SupplierRowData[] | null) ?? [];

  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function buildPageHref(targetPage: number): string {
    const next = new URLSearchParams();
    if (q) next.set("q", q);
    next.set("page", String(targetPage));
    return `/suppliers?${next.toString()}`;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Suppliers</h1>
          <p className="text-sm text-muted-foreground">
            Manage supplier records used across products and stock intake.
          </p>
        </div>
        <SupplierCreateDialog
          trigger={
            <Button>
              <PlusIcon className="size-4" />
              New supplier
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
            placeholder="Name or contact person"
            className="w-64"
          />
        </div>
        <Button type="submit" variant="secondary">
          Apply
        </Button>
        {q && (
          <Button asChild variant="ghost">
            <Link href="/suppliers">Clear</Link>
          </Button>
        )}
      </form>

      <SupplierTable suppliers={suppliers} />

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
