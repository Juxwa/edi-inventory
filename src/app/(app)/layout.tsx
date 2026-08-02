import { redirect } from "next/navigation";
import { getProfileContext, getBranchName } from "@/lib/supabase/profile";
import { AppShell } from "@/components/app-shell";
import { ViewAsBanner } from "@/components/admin/view-as-banner";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { profile, viewAs, isBackendAdmin } = await getProfileContext();

  // is_active and must_change_password are never overlaid by view-as, so both
  // checks below always run against the real account.
  if (!profile || !profile.is_active) {
    redirect("/login");
  }

  if (profile.must_change_password) {
    redirect("/reset-password");
  }

  const branchName = await getBranchName(profile.branch_id);

  return (
    <AppShell
      profile={profile}
      branchName={branchName}
      banner={isBackendAdmin ? <ViewAsBanner viewAs={viewAs} /> : null}
    >
      {children}
    </AppShell>
  );
}
