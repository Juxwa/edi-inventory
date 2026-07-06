import { redirect } from "next/navigation";
import { BoxIcon, Building2Icon, PackageIcon, TimerIcon } from "lucide-react";
import { getProfile, getBranchName } from "@/lib/supabase/profile";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

async function safeCount(
  fn: () => Promise<{ count: number | null; error: unknown }>,
): Promise<number> {
  try {
    const { count, error } = await fn();
    if (error) return 0;
    return count ?? 0;
  } catch {
    return 0;
  }
}

export default async function HomePage() {
  const profile = await getProfile();

  if (!profile || !profile.is_active) {
    redirect("/login");
  }

  const [branchName, supabase] = await Promise.all([
    getBranchName(profile.branch_id),
    createClient(),
  ]);

  const [availableStock, branches, products, aging] = await Promise.all([
    safeCount(async () => {
      const res = await supabase
        .from("stock")
        .select("id", { count: "exact", head: true })
        .eq("status", "available");
      return { count: res.count, error: res.error };
    }),
    safeCount(async () => {
      const res = await supabase
        .from("branches")
        .select("id", { count: "exact", head: true });
      return { count: res.count, error: res.error };
    }),
    safeCount(async () => {
      const res = await supabase
        .from("products")
        .select("id", { count: "exact", head: true })
        .eq("archived", false);
      return { count: res.count, error: res.error };
    }),
    safeCount(async () => {
      const res = await supabase
        .from("stock_aging")
        .select("id", { count: "exact", head: true })
        .gt("days_on_hand", 180);
      return { count: res.count, error: res.error };
    }),
  ]);

  const stats = [
    { label: "Available stock", value: availableStock, icon: BoxIcon },
    { label: "Branches", value: branches, icon: Building2Icon },
    { label: "Active products", value: products, icon: PackageIcon },
    { label: "Aging over 180 days", value: aging, icon: TimerIcon },
  ];

  return (
    <AppShell profile={profile} branchName={branchName}>
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-lg font-semibold">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Snapshot of current inventory across all branches.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat) => (
            <Card key={stat.label}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {stat.label}
                </CardTitle>
                <stat.icon
                  className="size-4 text-muted-foreground"
                  aria-hidden="true"
                />
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold tabular-nums">
                  {stat.value.toLocaleString()}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
