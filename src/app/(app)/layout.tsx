import { redirect } from "next/navigation";
import { getProfile, getBranchName } from "@/lib/supabase/profile";
import { AppShell } from "@/components/app-shell";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await getProfile();

  if (!profile || !profile.is_active) {
    redirect("/login");
  }

  const branchName = await getBranchName(profile.branch_id);

  return (
    <AppShell profile={profile} branchName={branchName}>
      {children}
    </AppShell>
  );
}
