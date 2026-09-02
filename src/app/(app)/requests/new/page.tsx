import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/supabase/profile";
import {
  NewRequestForm,
  type RequestProductOption,
  type RequestBranchOption,
} from "@/components/requests/new-request-form";

export const dynamic = "force-dynamic";

export default async function NewRequestPage() {
  const profile = await getProfile();
  if (
    !profile ||
    (profile.role !== "admin" &&
      profile.role !== "branch_rep" &&
      profile.role !== "technical")
  ) {
    redirect("/");
  }

  const supabase = await createClient();

  const [productsResult, branchesResult] = await Promise.all([
    supabase
      .from("products")
      .select("id, name, code")
      .eq("archived", false)
      .order("name"),
    supabase.from("branches").select("id, name").eq("is_active", true).order("name"),
  ]);

  const products: RequestProductOption[] = productsResult.data ?? [];
  const branches: RequestBranchOption[] = branchesResult.data ?? [];

  const lockedBranchId =
    profile.role === "branch_rep" || profile.role === "technical"
      ? profile.branch_id
      : null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold">New stock request</h1>
        <p className="text-sm text-muted-foreground">
          Request stock from another branch. An admin will review and serve
          this request.
        </p>
      </div>

      <div className="max-w-2xl">
        <NewRequestForm
          products={products}
          branches={branches}
          lockedBranchId={lockedBranchId}
        />
      </div>
    </div>
  );
}
