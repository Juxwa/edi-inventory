import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/supabase/profile";
import { NewTransferForm } from "@/components/transfers/new-transfer-form";

export const dynamic = "force-dynamic";

export default async function NewTransferPage() {
  const profile = await getProfile();
  if (!profile || profile.role === "technical") {
    redirect("/");
  }

  const supabase = await createClient();
  const { data } = await supabase.from("branches").select("id, name").order("name");
  const branches: { id: string; name: string }[] = data ?? [];

  // branch_rep is pinned to their own branch as the origin — never a
  // Select. technical is redirected above and can't reach this line, so
  // profile.role is narrowed to admin/branch_rep/top_mgmt here.
  const lockedFromBranchId =
    profile.role === "branch_rep" ? profile.branch_id : null;
  // admin/top_mgmt keep a free choice of origin branch, but the Select
  // starts on their own branch (HQ for admin) instead of blank.
  const defaultFromBranchId = lockedFromBranchId ? null : profile.branch_id;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold">New transfer</h1>
        <p className="text-sm text-muted-foreground">
          Create a draft transfer, then add lines from the from-branch's
          available stock.
        </p>
      </div>

      <div className="max-w-lg">
        <NewTransferForm
          branches={branches}
          lockedFromBranchId={lockedFromBranchId}
          defaultFromBranchId={defaultFromBranchId}
        />
      </div>
    </div>
  );
}
