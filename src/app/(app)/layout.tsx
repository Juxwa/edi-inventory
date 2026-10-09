import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
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

  // The HQ supervisor role is approvals-only. Data is already closed to it by
  // RLS (it is in no role allowlist); this keeps the UI on the one page it
  // can use. x-pathname is set by the middleware. Layouts do not re-run on
  // client-side navigation, so AppShell also mounts a client guard.
  if (profile.role === "supervisor") {
    const pathname = (await headers()).get("x-pathname") ?? "";
    if (pathname !== "/approvals" && !pathname.startsWith("/approvals/")) {
      redirect("/approvals");
    }
  }

  const branchName = await getBranchName(profile.branch_id);

  let pendingApprovals = 0;
  if (profile.approver) {
    const supabase = await createClient();
    const { count } = await supabase
      .from("correction_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending");
    pendingApprovals = count ?? 0;
  }

  return (
    <AppShell
      profile={profile}
      branchName={branchName}
      pendingApprovals={pendingApprovals}
      banner={isBackendAdmin ? <ViewAsBanner viewAs={viewAs} /> : null}
    >
      {children}
    </AppShell>
  );
}
