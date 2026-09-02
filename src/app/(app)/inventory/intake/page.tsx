import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/supabase/profile";
import {
  IntakeForm,
  type IntakeProductOption,
  type IntakeBranchOption,
  type IntakeSupplierOption,
} from "@/components/inventory/intake-form";

export const dynamic = "force-dynamic";

export default async function StockIntakePage() {
  const profile = await getProfile();
  if (!profile || profile.role !== "admin") {
    redirect("/");
  }
  const supabase = await createClient();

  const [productsResult, branchesResult, suppliersResult] = await Promise.all([
    supabase
      .from("products")
      .select("id, name, code, has_serial, supplier_id")
      .eq("archived", false)
      .order("name"),
    supabase.from("branches").select("id, name").eq("is_active", true).order("name"),
    supabase
      .from("suppliers")
      .select("id, name")
      .eq("is_active", true)
      .order("name"),
  ]);

  const products: IntakeProductOption[] = productsResult.data ?? [];
  const branches: IntakeBranchOption[] = branchesResult.data ?? [];
  const suppliers: IntakeSupplierOption[] = suppliersResult.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold">Add new inventory</h1>
        <p className="text-sm text-muted-foreground">
          Receive new stock into a branch. Serialized products require one
          serial number per unit; other products are received by quantity.
        </p>
      </div>

      <div className="max-w-2xl">
        <IntakeForm
          products={products}
          branches={branches}
          suppliers={suppliers}
          defaultBranchId={profile.branch_id}
        />
      </div>
    </div>
  );
}
