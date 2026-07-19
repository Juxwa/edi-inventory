import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/supabase/profile";
import { EarmoldForm } from "@/components/earmolds/earmold-form";

export const dynamic = "force-dynamic";

export default async function NewEarmoldPage() {
  const profile = await getProfile();
  if (!profile || profile.role === "top_mgmt") {
    redirect("/");
  }

  const supabase = await createClient();
  const lockedBranchId = profile.role === "branch_rep" ? profile.branch_id : null;

  const branchesResult = await supabase
    .from("branches")
    .select("id, name")
    .order("name");
  const branches: { id: string; name: string }[] = branchesResult.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold">New earmold request</h1>
        <p className="text-sm text-muted-foreground">
          Order a custom earmold for a patient.
        </p>
      </div>

      <div className="max-w-3xl">
        <EarmoldForm branches={branches} lockedBranchId={lockedBranchId} />
      </div>
    </div>
  );
}
