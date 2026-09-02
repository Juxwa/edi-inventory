import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/supabase/profile";
import {
  SaleForm,
  type SaleCustomerOption,
  type SaleStockOption,
  type SaleServiceOption,
} from "@/components/sales/sale-form";

export const dynamic = "force-dynamic";

// Starter list only — the picker searches the full directory server-side.
// Most recently added customers first: likeliest to be picked again soon.
const CUSTOMER_CAP = 50;

type NewSalePageProps = {
  searchParams: Promise<{ branch?: string }>;
};

function firstOrNull<T>(value: T | T[] | null): T | null {
  if (value == null) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export default async function NewSalePage({ searchParams }: NewSalePageProps) {
  const profile = await getProfile();
  if (!profile || (profile.role !== "admin" && profile.role !== "branch_rep")) {
    redirect("/");
  }

  const { branch: branchParam } = await searchParams;
  const branch = Array.isArray(branchParam) ? branchParam[0] : branchParam;
  const supabase = await createClient();

  const lockedBranchId = profile.role === "branch_rep" ? profile.branch_id : null;

  let branches: { id: string; name: string }[] = [];
  if (profile.role === "admin") {
    const branchesResult = await supabase
      .from("branches")
      .select("id, name")
      .eq("is_active", true)
      .order("name");
    branches = branchesResult.data ?? [];
  }

  const activeBranchId =
    lockedBranchId ?? (branch && branch.length > 0 ? branch : (branches[0]?.id ?? null));

  const [customersResult, servicesResult, servicePricingResult, productsResult] =
    await Promise.all([
      supabase
        .from("customers")
        .select("id, name, mobile_no")
        .order("created_at", { ascending: false })
        .limit(CUSTOMER_CAP),
      supabase.from("services").select("id, name").order("name"),
      activeBranchId
        ? supabase
            .from("service_pricing")
            .select("service_id, price")
            .eq("branch_id", activeBranchId)
        : Promise.resolve({ data: [] as { service_id: string; price: number }[] }),
      supabase.from("products").select("id, srp"),
    ]);

  const customers: SaleCustomerOption[] = customersResult.data ?? [];

  type ServiceRow = { id: string; name: string };
  const services: ServiceRow[] = servicesResult.data ?? [];
  type PricingRow = { service_id: string; price: number };
  const pricingRows: PricingRow[] = servicePricingResult.data ?? [];
  const priceByServiceId = new Map<string, number>(
    pricingRows.map((row: PricingRow) => [row.service_id, row.price]),
  );
  const serviceOptions: SaleServiceOption[] = services.map((service: ServiceRow) => ({
    id: service.id,
    name: service.name,
    price: priceByServiceId.get(service.id) ?? 0,
  }));

  type ProductRow = { id: string; srp: number | null };
  const products: ProductRow[] = productsResult.data ?? [];
  const srpByProductId = new Map<string, number | null>(
    products.map((product: ProductRow) => [product.id, product.srp]),
  );

  let stockOptions: SaleStockOption[] = [];
  if (activeBranchId) {
    const { data: stockRows } = await supabase
      .from("stock_visible")
      .select("id, serial_number, quantity, product_id, products(name)")
      .eq("branch_id", activeBranchId)
      .eq("status", "available")
      .gt("quantity", 0);

    type StockJoinRow = {
      id: string;
      serial_number: string | null;
      quantity: number;
      product_id: string;
      products: { name: string } | { name: string }[] | null;
    };
    const rows: StockJoinRow[] = (stockRows as StockJoinRow[] | null) ?? [];
    stockOptions = rows.map((row: StockJoinRow) => ({
      id: row.id,
      serial_number: row.serial_number,
      quantity: row.quantity,
      product_id: row.product_id,
      product_name: firstOrNull(row.products)?.name ?? "—",
      srp: srpByProductId.get(row.product_id) ?? null,
    }));
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold">Record sale</h1>
        <p className="text-sm text-muted-foreground">
          Record a mixed stock/service sale. Stock lines are pulled from
          available inventory at the selling branch.
        </p>
      </div>

      {profile.role === "admin" && branches.length > 0 ? (
        <form method="get" className="flex items-end gap-2">
          <div className="grid gap-1.5">
            <label htmlFor="branch" className="text-sm font-medium">
              Selling branch
            </label>
            <select
              id="branch"
              name="branch"
              defaultValue={activeBranchId ?? undefined}
              className="flex h-9 w-56 items-center rounded-md border border-input bg-transparent px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {branches.map((branchOption: { id: string; name: string }) => (
                <option key={branchOption.id} value={branchOption.id}>
                  {branchOption.name}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            className="inline-flex h-9 items-center rounded-md bg-secondary px-3 text-sm font-medium text-secondary-foreground hover:bg-secondary/80"
          >
            Load stock
          </button>
        </form>
      ) : null}

      <div className="max-w-4xl">
        {activeBranchId ? (
          <SaleForm
            branches={branches}
            lockedBranchId={lockedBranchId}
            customers={customers}
            stockOptions={stockOptions}
            serviceOptions={serviceOptions}
            role={profile.role}
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            Select a branch to load its available stock.
          </p>
        )}
      </div>
    </div>
  );
}
