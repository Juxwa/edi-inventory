import Link from "next/link";
import { redirect } from "next/navigation";
import {
  BoxIcon,
  Building2Icon,
  PackageIcon,
  TimerIcon,
  InboxIcon,
  TruckIcon,
  FileClockIcon,
} from "lucide-react";
import { getProfile, getBranchName } from "@/lib/supabase/profile";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type ActionItem = {
  href: string;
  primary: string;
  secondary: string;
};

type ActionPanel = {
  title: string;
  icon: typeof InboxIcon;
  count: number;
  items: ActionItem[];
  emptyText: string;
  viewAllHref: string;
};

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
        .from("stock_visible")
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

  const branchNameById = new Map<string, string>();
  try {
    const { data: allBranches } = await supabase.from("branches").select("id, name");
    (allBranches ?? []).forEach((b: { id: string; name: string }) => {
      branchNameById.set(b.id, b.name);
    });
  } catch {
    // panels degrade to ids
  }
  const nameOf = (id: string | null): string =>
    (id && branchNameById.get(id)) || "Unknown branch";

  type RequestRow = {
    id: string;
    request_date: string;
    requesting_branch_id: string;
    status: string;
  };
  type TransferRow = {
    id: string;
    code: string;
    from_branch_id: string;
    to_branch_id: string;
    status: string;
    created_at: string;
  };

  let pendingRequests: RequestRow[] = [];
  let inTransit: TransferRow[] = [];
  let staleDrafts: TransferRow[] = [];
  try {
    const staleCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const [reqRes, transitRes, draftRes] = await Promise.all([
      supabase
        .from("inventory_requests")
        .select("id, request_date, requesting_branch_id, status")
        .eq("status", "pending")
        .order("request_date", { ascending: false })
        .limit(5),
      supabase
        .from("transfers")
        .select("id, code, from_branch_id, to_branch_id, status, created_at")
        .eq("status", "in_transit")
        .order("transfer_date", { ascending: false })
        .limit(5),
      supabase
        .from("transfers")
        .select("id, code, from_branch_id, to_branch_id, status, created_at")
        .eq("status", "draft")
        .lt("created_at", staleCutoff)
        .order("created_at", { ascending: true })
        .limit(5),
    ]);
    pendingRequests = (reqRes.data as RequestRow[] | null) ?? [];
    inTransit = (transitRes.data as TransferRow[] | null) ?? [];
    staleDrafts = (draftRes.data as TransferRow[] | null) ?? [];
  } catch {
    // panels render empty on query failure
  }

  const panels: ActionPanel[] = [
    {
      title: "Pending stock requests",
      icon: InboxIcon,
      count: pendingRequests.length,
      emptyText: "No pending requests.",
      viewAllHref: "/requests?status=pending",
      items: pendingRequests.map((r: RequestRow) => ({
        href: `/requests/${r.id}`,
        primary: nameOf(r.requesting_branch_id),
        secondary: r.request_date,
      })),
    },
    {
      title: "Transfers awaiting receipt",
      icon: TruckIcon,
      count: inTransit.length,
      emptyText: "No transfers in transit.",
      viewAllHref: "/transfers?status=in_transit",
      items: inTransit.map((t: TransferRow) => ({
        href: `/transfers/${t.id}`,
        primary: t.code,
        secondary: `${nameOf(t.from_branch_id)} → ${nameOf(t.to_branch_id)}`,
      })),
    },
    {
      title: "Stale draft transfers (7d+)",
      icon: FileClockIcon,
      count: staleDrafts.length,
      emptyText: "No stale drafts.",
      viewAllHref: "/transfers?status=draft",
      items: staleDrafts.map((t: TransferRow) => ({
        href: `/transfers/${t.id}`,
        primary: t.code,
        secondary: `${nameOf(t.from_branch_id)} → ${nameOf(t.to_branch_id)}`,
      })),
    },
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

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {panels.map((panel) => (
            <Card key={panel.title}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-medium">
                  <panel.icon
                    className="size-4 text-muted-foreground"
                    aria-hidden="true"
                  />
                  {panel.title}
                </CardTitle>
                <Badge variant="secondary" className="tabular-nums">
                  {panel.count}
                </Badge>
              </CardHeader>
              <CardContent className="flex flex-col gap-1">
                {panel.items.length === 0 ? (
                  <p className="py-2 text-sm text-muted-foreground">
                    {panel.emptyText}
                  </p>
                ) : (
                  panel.items.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-muted"
                    >
                      <span className="font-medium">{item.primary}</span>
                      <span className="text-muted-foreground">
                        {item.secondary}
                      </span>
                    </Link>
                  ))
                )}
                <Link
                  href={panel.viewAllHref}
                  className="mt-1 text-xs font-medium text-muted-foreground underline-offset-2 hover:underline"
                >
                  View all
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
