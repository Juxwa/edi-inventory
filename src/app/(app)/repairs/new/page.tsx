import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/supabase/profile";
import {
  RepairForm,
  type SoldItemOption,
  type RepairCustomerOption,
  type TechnicianOption,
} from "@/components/repairs/repair-form";

export const dynamic = "force-dynamic";

// Starter list only — the form searches the full directory server-side.
const CUSTOMER_CAP = 50;
// ponytail: newest 500 serialized sold lines preloaded for client filtering;
// switch to server-side search if intake regularly needs older sales.
const SOLD_ITEM_CAP = 500;

export default async function NewRepairPage() {
  const profile = await getProfile();
  if (!profile || profile.role === "top_mgmt") {
    redirect("/");
  }

  const supabase = await createClient();
  const lockedBranchId = profile.role === "branch_rep" ? profile.branch_id : null;

  const [branchesResult, customersResult, techniciansResult, linesResult] =
    await Promise.all([
      supabase.from("branches").select("id, name").order("name"),
      supabase
        .from("customers")
        .select("id, name, mobile_no")
        .order("created_at", { ascending: false })
        .limit(CUSTOMER_CAP),
      supabase
        .from("profiles")
        .select("id, name")
        .eq("role", "technical")
        .eq("is_active", true)
        .order("name"),
      supabase
        .from("sale_line_items")
        .select("id, serial_snapshot, product_id, sale_id")
        .not("serial_snapshot", "is", null)
        .order("created_at", { ascending: false })
        .limit(SOLD_ITEM_CAP),
    ]);

  const branches: { id: string; name: string }[] = branchesResult.data ?? [];
  const customers: RepairCustomerOption[] = customersResult.data ?? [];
  const technicians: TechnicianOption[] = techniciansResult.data ?? [];

  type LineRow = {
    id: string;
    serial_snapshot: string | null;
    product_id: string | null;
    sale_id: string;
  };
  const lines: LineRow[] = (linesResult.data as LineRow[] | null) ?? [];

  const saleIds = Array.from(new Set(lines.map((line: LineRow) => line.sale_id)));
  const productIds = Array.from(
    new Set(
      lines
        .map((line: LineRow) => line.product_id)
        .filter((id: string | null): id is string => id !== null),
    ),
  );

  const [salesResult, productsResult] = await Promise.all([
    saleIds.length > 0
      ? supabase
          .from("sales")
          .select("id, sale_date, customer_id")
          .in("id", saleIds)
      : Promise.resolve({ data: [] }),
    productIds.length > 0
      ? supabase.from("products").select("id, name").in("id", productIds)
      : Promise.resolve({ data: [] }),
  ]);

  type SaleRow = { id: string; sale_date: string; customer_id: string | null };
  const salesById = new Map<string, SaleRow>(
    ((salesResult.data as SaleRow[] | null) ?? []).map((row: SaleRow) => [
      row.id,
      row,
    ]),
  );
  type ProductRow = { id: string; name: string };
  const productNameById = new Map<string, string>(
    ((productsResult.data as ProductRow[] | null) ?? []).map(
      (row: ProductRow) => [row.id, row.name],
    ),
  );
  // Sold-item customers are fetched by id — the starter list is far too small
  // to cover whoever the recent sales belong to.
  const soldCustomerIds = Array.from(
    new Set(
      ((salesResult.data as SaleRow[] | null) ?? [])
        .map((row: SaleRow) => row.customer_id)
        .filter((id: string | null): id is string => id !== null),
    ),
  );
  const soldCustomersResult =
    soldCustomerIds.length > 0
      ? await supabase
          .from("customers")
          .select("id, name, mobile_no")
          .in("id", soldCustomerIds)
      : { data: [] as RepairCustomerOption[] };
  const customerById = new Map<string, RepairCustomerOption>(
    ((soldCustomersResult.data as RepairCustomerOption[] | null) ?? []).map(
      (customer: RepairCustomerOption) => [customer.id, customer],
    ),
  );

  const soldItems: SoldItemOption[] = lines.map((line: LineRow) => {
    const sale = salesById.get(line.sale_id);
    const customer = sale?.customer_id
      ? customerById.get(sale.customer_id)
      : undefined;
    return {
      id: line.id,
      serial: line.serial_snapshot ?? "—",
      product_name: line.product_id
        ? (productNameById.get(line.product_id) ?? "—")
        : "—",
      sale_date: sale?.sale_date ?? "—",
      customer_id: sale?.customer_id ?? null,
      customer_name: customer?.name ?? null,
      customer_mobile: customer?.mobile_no ?? null,
    };
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold">Repair intake</h1>
        <p className="text-sm text-muted-foreground">
          Log a unit for repair. Link it to the original sale when possible so
          warranty and customer details carry over.
        </p>
      </div>

      <div className="max-w-4xl">
        <RepairForm
          branches={branches}
          lockedBranchId={lockedBranchId}
          soldItems={soldItems}
          customers={customers}
          technicians={technicians}
        />
      </div>
    </div>
  );
}
