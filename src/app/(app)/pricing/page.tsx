import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile, getBranchName } from "@/lib/supabase/profile";
import {
  ServicePricingTable,
  type ServicePricingRow,
} from "@/components/pricing/service-pricing-table";
import { AddServiceDialog } from "@/components/pricing/add-service-dialog";

export const dynamic = "force-dynamic";

const ALLOWED_ROLES = ["admin", "branch_rep", "technical"];

type PricingPageProps = {
  searchParams: Promise<{ branch?: string }>;
};

export default async function PricingPage({ searchParams }: PricingPageProps) {
  const profile = await getProfile();
  if (!profile || !ALLOWED_ROLES.includes(profile.role)) {
    redirect("/");
  }

  const supabase = await createClient();
  const isAdmin = profile.role === "admin";

  let branches: { id: string; name: string }[] = [];
  let activeBranchId: string | null = profile.branch_id;

  if (isAdmin) {
    const branchesResult = await supabase
      .from("branches")
      .select("id, name")
      .eq("is_active", true)
      .order("name");
    branches = branchesResult.data ?? [];
    const { branch: branchParam } = await searchParams;
    activeBranchId =
      branchParam && branchParam.length > 0 ? branchParam : (branches[0]?.id ?? null);
  }

  const [servicesResult, pricingResult] = await Promise.all([
    supabase.from("services").select("id, name").order("name"),
    activeBranchId
      ? supabase
          .from("service_pricing")
          .select("service_id, price")
          .eq("branch_id", activeBranchId)
      : Promise.resolve({ data: [] as { service_id: string; price: number }[] }),
  ]);

  type ServiceRow = { id: string; name: string };
  const services: ServiceRow[] = servicesResult.data ?? [];
  type PricingRow = { service_id: string; price: number };
  const priceByServiceId = new Map<string, number>(
    ((pricingResult.data as PricingRow[] | null) ?? []).map((row: PricingRow) => [
      row.service_id,
      row.price,
    ]),
  );

  const rows: ServicePricingRow[] = services.map((service: ServiceRow) => ({
    id: service.id,
    name: service.name,
    price: priceByServiceId.get(service.id) ?? null,
  }));

  const activeBranchName = isAdmin
    ? (branches.find((branch: { id: string; name: string }) => branch.id === activeBranchId)
        ?.name ?? null)
    : await getBranchName(profile.branch_id);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold">Service pricing</h1>
          <p className="text-sm text-muted-foreground">
            Prices set here prefill service lines on sales at your branch.
          </p>
        </div>
        {isAdmin ? <AddServiceDialog /> : null}
      </div>

      {isAdmin && branches.length > 0 ? (
        <form method="get" className="flex items-end gap-2">
          <div className="grid gap-1.5">
            <label htmlFor="branch" className="text-sm font-medium">
              Branch
            </label>
            <select
              id="branch"
              name="branch"
              defaultValue={activeBranchId ?? undefined}
              className="flex h-9 w-56 items-center rounded-md border border-input bg-transparent px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {branches.map((branch: { id: string; name: string }) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            className="inline-flex h-9 items-center rounded-md bg-secondary px-3 text-sm font-medium text-secondary-foreground hover:bg-secondary/80"
          >
            Load
          </button>
        </form>
      ) : (
        <p className="text-sm text-muted-foreground">
          Branch: <span className="font-medium text-foreground">{activeBranchName ?? "—"}</span>
        </p>
      )}

      {activeBranchId ? (
        <ServicePricingTable rows={rows} branchId={activeBranchId} />
      ) : (
        <p className="text-sm text-muted-foreground">
          {isAdmin ? "Select a branch to manage its pricing." : "No branch on this account."}
        </p>
      )}
    </div>
  );
}
