import Link from "next/link";
import { redirect } from "next/navigation";
import { PlusIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/supabase/profile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  CustomerTable,
  type CustomerRowData,
} from "@/components/customers/customer-table";
import { CustomerCreateDialog } from "@/components/customers/customer-dialog";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

type CustomersPageProps = {
  searchParams: Promise<{
    q?: string;
    page?: string;
  }>;
};

type CustomerQueryRow = {
  id: string;
  name: string;
  mobile_no: string | null;
  email: string | null;
  address: string | null;
  branch_created_id: string | null;
  created_at: string;
};

export default async function CustomersPage({ searchParams }: CustomersPageProps) {
  const profile = await getProfile();
  if (!profile || profile.role === "technical") {
    redirect("/");
  }

  const params = await searchParams;
  const q = params.q?.trim() ?? "";
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const supabase = await createClient();

  let query = supabase
    .from("customers")
    .select("id, name, mobile_no, email, address, branch_created_id, created_at", {
      count: "exact",
    })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (q) {
    query = query.or(`name.ilike.%${q}%,mobile_no.ilike.%${q}%`);
  }

  const { data, count } = await query;
  const rows: CustomerQueryRow[] = (data as CustomerQueryRow[] | null) ?? [];

  const branchesResult = await supabase.from("branches").select("id, name");
  const branches: { id: string; name: string }[] = branchesResult.data ?? [];
  const branchNameById = new Map<string, string>(
    branches.map((branch: { id: string; name: string }) => [branch.id, branch.name]),
  );

  const customers: CustomerRowData[] = rows.map((row: CustomerQueryRow) => ({
    id: row.id,
    name: row.name,
    mobile_no: row.mobile_no,
    email: row.email,
    address: row.address,
    branch_name: row.branch_created_id
      ? (branchNameById.get(row.branch_created_id) ?? "—")
      : "—",
    created_at: row.created_at,
  }));

  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function buildPageHref(targetPage: number): string {
    const next = new URLSearchParams();
    if (q) next.set("q", q);
    next.set("page", String(targetPage));
    return `/customers?${next.toString()}`;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Customers</h1>
          <p className="text-sm text-muted-foreground">
            Search patient records, log visits, and review purchase history.
          </p>
        </div>
        <CustomerCreateDialog
          trigger={
            <Button>
              <PlusIcon className="size-4" />
              New customer
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
            placeholder="Name or mobile no."
            className="w-64"
          />
        </div>
        <Button type="submit" variant="secondary">
          Apply
        </Button>
        {q && (
          <Button asChild variant="ghost">
            <Link href="/customers">Clear</Link>
          </Button>
        )}
      </form>

      <CustomerTable customers={customers} />

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
