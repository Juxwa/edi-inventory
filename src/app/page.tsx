import Link from "next/link";
import { redirect } from "next/navigation";
import {
  BoxIcon,
  TimerIcon,
  InboxIcon,
  TruckIcon,
  FileClockIcon,
  WrenchIcon,
  EarIcon,
  BanknoteIcon,
  ClipboardListIcon,
  PackageIcon,
  UserIcon,
  HistoryIcon,
} from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/format";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RepairStatusBadge, RepairEventBadge } from "@/components/repairs/status-badge";
import { EarmoldStatusBadge } from "@/components/earmolds/earmolds-table";
import type { Profile } from "@/lib/supabase/profile";
import type { RepairStatus, RepairEventStatus } from "@/lib/validators/repair";
import type { EarmoldStatus } from "@/lib/validators/earmold";

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

  if (profile.role === "technical") {
    return (
      <AppShell profile={profile} branchName={branchName}>
        <TechnicalDashboard profile={profile} />
      </AppShell>
    );
  }

  const monthStart = new Date();
  const monthStartIso = `${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, "0")}-01`;

  const [availableStock, openRepairs, aging, netSalesRows] = await Promise.all([
    safeCount(async () => {
      const res = await supabase
        .from("stock_visible")
        .select("id", { count: "exact", head: true })
        .eq("status", "available");
      return { count: res.count, error: res.error };
    }),
    safeCount(async () => {
      const res = await supabase
        .from("repair_requests")
        .select("id", { count: "exact", head: true })
        .in("status", ["pending", "in_progress", "for_replacement"]);
      return { count: res.count, error: res.error };
    }),
    safeCount(async () => {
      const res = await supabase
        .from("stock_aging")
        .select("id", { count: "exact", head: true })
        .gt("days_on_hand", 180);
      return { count: res.count, error: res.error };
    }),
    supabase
      .from("sales_by_month")
      .select("net_sales")
      .eq("month", monthStartIso)
      .then(
        (res: { data: { net_sales: number }[] | null }) => res.data ?? [],
        () => [] as { net_sales: number }[],
      ),
  ]);

  const netSalesThisMonth = netSalesRows.reduce(
    (sum: number, row: { net_sales: number }) => sum + Number(row.net_sales),
    0,
  );

  const stats = [
    { label: "Available stock", value: availableStock.toLocaleString(), icon: BoxIcon },
    {
      label: "Net sales this month",
      value: formatCurrency(netSalesThisMonth),
      icon: BanknoteIcon,
    },
    { label: "Open repairs", value: openRepairs.toLocaleString(), icon: WrenchIcon },
    { label: "Aging over 180 days", value: aging.toLocaleString(), icon: TimerIcon },
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

  type RepairRow = {
    id: string;
    sar_no: string | null;
    requesting_branch_id: string | null;
    request_date: string;
  };
  type EarmoldRow = {
    id: string;
    patient_name: string;
    requesting_branch_id: string | null;
    created_at: string;
  };

  let pendingRequests: RequestRow[] = [];
  let inTransit: TransferRow[] = [];
  let staleDrafts: TransferRow[] = [];
  let openRepairRows: RepairRow[] = [];
  let pendingEarmolds: EarmoldRow[] = [];
  try {
    const staleCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const [reqRes, transitRes, draftRes, repairRes, earmoldRes] = await Promise.all([
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
      supabase
        .from("repair_requests")
        .select("id, sar_no, requesting_branch_id, request_date")
        .in("status", ["pending", "in_progress", "for_replacement"])
        .order("request_date", { ascending: true })
        .limit(5),
      supabase
        .from("earmold_requests")
        .select("id, patient_name, requesting_branch_id, created_at")
        .eq("status", "pending")
        .order("created_at", { ascending: true })
        .limit(5),
    ]);
    pendingRequests = (reqRes.data as RequestRow[] | null) ?? [];
    inTransit = (transitRes.data as TransferRow[] | null) ?? [];
    staleDrafts = (draftRes.data as TransferRow[] | null) ?? [];
    openRepairRows = (repairRes.data as RepairRow[] | null) ?? [];
    pendingEarmolds = (earmoldRes.data as EarmoldRow[] | null) ?? [];
  } catch {
    // panels render empty on query failure
  }

  function daysOpen(since: string): string {
    const days = Math.max(
      0,
      Math.floor((Date.now() - new Date(since).getTime()) / (24 * 60 * 60 * 1000)),
    );
    return days === 1 ? "1 day open" : `${days} days open`;
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
    {
      title: "Open repairs",
      icon: WrenchIcon,
      count: openRepairRows.length,
      emptyText: "No open repairs.",
      viewAllHref: "/repairs",
      items: openRepairRows.map((r: RepairRow) => ({
        href: `/repairs/${r.id}`,
        primary: r.sar_no ?? "No SAR",
        secondary: daysOpen(r.request_date),
      })),
    },
    {
      title: "Pending earmolds",
      icon: EarIcon,
      count: pendingEarmolds.length,
      emptyText: "No pending earmolds.",
      viewAllHref: "/earmolds?status=pending",
      items: pendingEarmolds.map((e: EarmoldRow) => ({
        href: `/earmolds/${e.id}`,
        primary: e.patient_name,
        secondary: daysOpen(e.created_at),
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
                  {stat.value}
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

async function TechnicalDashboard({ profile }: { profile: Profile }) {
  const supabase = await createClient();

  type WorkQueueRow = {
    id: string;
    sar_no: string | null;
    requesting_branch_id: string | null;
    issue_description: string | null;
    assigned_to: string | null;
    status: RepairStatus;
    request_date: string;
  };
  type RecentEarmoldRow = {
    id: string;
    patient_name: string;
    requesting_branch_id: string | null;
    status: EarmoldStatus;
    created_at: string;
  };
  type RecentEventRow = {
    id: number;
    repair_id: string;
    status: RepairEventStatus;
    created_at: string;
  };

  let pendingCount = 0;
  let myInProgressCount = 0;
  let forReplacementCount = 0;
  let unassignedCount = 0;
  let workQueue: WorkQueueRow[] = [];
  let recentEarmolds: RecentEarmoldRow[] = [];
  let recentEvents: RecentEventRow[] = [];

  try {
    const [
      pendingRes,
      myInProgressRes,
      forReplacementRes,
      unassignedRes,
      queueRes,
      earmoldsRes,
      eventsRes,
    ] = await Promise.all([
      supabase
        .from("repair_requests")
        .select("id", { count: "exact", head: true })
        .is("voided_at", null)
        .eq("status", "pending"),
      supabase
        .from("repair_requests")
        .select("id", { count: "exact", head: true })
        .is("voided_at", null)
        .eq("status", "in_progress")
        .eq("assigned_to", profile.id),
      supabase
        .from("repair_requests")
        .select("id", { count: "exact", head: true })
        .is("voided_at", null)
        .eq("status", "for_replacement"),
      supabase
        .from("repair_requests")
        .select("id", { count: "exact", head: true })
        .is("voided_at", null)
        .is("assigned_to", null)
        .in("status", ["pending", "in_progress", "for_replacement"]),
      supabase
        .from("repair_requests")
        .select(
          "id, sar_no, requesting_branch_id, issue_description, assigned_to, status, request_date",
        )
        .is("voided_at", null)
        .in("status", ["pending", "in_progress", "for_replacement"])
        .order("request_date", { ascending: true })
        .limit(25),
      supabase
        .from("earmold_requests")
        .select("id, patient_name, requesting_branch_id, status, created_at")
        .is("voided_at", null)
        .order("created_at", { ascending: false })
        .limit(5),
      supabase
        .from("repair_status_events")
        .select("id, repair_id, status, created_at")
        .order("created_at", { ascending: false })
        .limit(8),
    ]);

    pendingCount = pendingRes.count ?? 0;
    myInProgressCount = myInProgressRes.count ?? 0;
    forReplacementCount = forReplacementRes.count ?? 0;
    unassignedCount = unassignedRes.count ?? 0;
    workQueue = (queueRes.data as WorkQueueRow[] | null) ?? [];
    recentEarmolds = (earmoldsRes.data as RecentEarmoldRow[] | null) ?? [];
    recentEvents = (eventsRes.data as RecentEventRow[] | null) ?? [];
  } catch {
    // dashboard degrades to empty panels on query failure
  }

  const branchIds = Array.from(
    new Set(
      [
        ...workQueue.map((r) => r.requesting_branch_id),
        ...recentEarmolds.map((e) => e.requesting_branch_id),
      ].filter((id): id is string => id !== null),
    ),
  );
  const technicianIds = Array.from(
    new Set(
      workQueue.map((r) => r.assigned_to).filter((id): id is string => id !== null),
    ),
  );
  const repairIdsForEvents = Array.from(new Set(recentEvents.map((e) => e.repair_id)));

  let branchNameById = new Map<string, string>();
  let technicianNameById = new Map<string, string>();
  let sarNoByRepairId = new Map<string, string | null>();
  try {
    const [branchesRes, techniciansRes, repairsForEventsRes] = await Promise.all([
      branchIds.length > 0
        ? supabase.from("branches").select("id, name").in("id", branchIds)
        : Promise.resolve({ data: [] }),
      technicianIds.length > 0
        ? supabase.from("profiles").select("id, name").in("id", technicianIds)
        : Promise.resolve({ data: [] }),
      repairIdsForEvents.length > 0
        ? supabase.from("repair_requests").select("id, sar_no").in("id", repairIdsForEvents)
        : Promise.resolve({ data: [] }),
    ]);
    type NamedRow = { id: string; name: string };
    branchNameById = new Map(
      ((branchesRes.data as NamedRow[] | null) ?? []).map((b: NamedRow) => [b.id, b.name]),
    );
    technicianNameById = new Map(
      ((techniciansRes.data as NamedRow[] | null) ?? []).map((t: NamedRow) => [t.id, t.name]),
    );
    type SarRow = { id: string; sar_no: string | null };
    sarNoByRepairId = new Map(
      ((repairsForEventsRes.data as SarRow[] | null) ?? []).map((r: SarRow) => [
        r.id,
        r.sar_no,
      ]),
    );
  } catch {
    // name lookups degrade to raw dashes
  }

  function ageInDays(since: string): number {
    return Math.max(
      0,
      Math.floor((Date.now() - new Date(since).getTime()) / (24 * 60 * 60 * 1000)),
    );
  }

  const stats = [
    { label: "Pending repairs", value: pendingCount, icon: ClipboardListIcon },
    { label: "In progress (assigned to you)", value: myInProgressCount, icon: WrenchIcon },
    { label: "Awaiting parts / replacement", value: forReplacementCount, icon: PackageIcon },
    { label: "Unassigned open repairs", value: unassignedCount, icon: UserIcon },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold">Technical dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Your repair and earmold work queue across all branches.
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

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <WrenchIcon className="size-4 text-muted-foreground" aria-hidden="true" />
            Open repairs (oldest first)
          </CardTitle>
          <Badge variant="secondary" className="tabular-nums">
            {workQueue.length}
          </Badge>
        </CardHeader>
        <CardContent>
          {workQueue.length === 0 ? (
            <p className="py-2 text-sm text-muted-foreground">No open repairs.</p>
          ) : (
            <div className="rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>SAR no.</TableHead>
                    <TableHead>Branch</TableHead>
                    <TableHead>Issue</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Assigned tech</TableHead>
                    <TableHead>Age</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {workQueue.map((row: WorkQueueRow) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <Link
                          href={`/repairs/${row.id}`}
                          className="font-medium hover:underline"
                        >
                          {row.sar_no ?? "—"}
                        </Link>
                      </TableCell>
                      <TableCell>
                        {row.requesting_branch_id
                          ? (branchNameById.get(row.requesting_branch_id) ?? "—")
                          : "—"}
                      </TableCell>
                      <TableCell className="max-w-[240px] truncate">
                        {row.issue_description ?? "—"}
                      </TableCell>
                      <TableCell>
                        <RepairStatusBadge status={row.status} />
                      </TableCell>
                      <TableCell>
                        {row.assigned_to
                          ? (technicianNameById.get(row.assigned_to) ?? "—")
                          : "Unassigned"}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {ageInDays(row.request_date)}d
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          <Link
            href="/repairs"
            className="mt-3 inline-block text-xs font-medium text-muted-foreground underline-offset-2 hover:underline"
          >
            View all repairs
          </Link>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <EarIcon className="size-4 text-muted-foreground" aria-hidden="true" />
              Recent earmold requests
            </CardTitle>
            <Badge variant="secondary" className="tabular-nums">
              {recentEarmolds.length}
            </Badge>
          </CardHeader>
          <CardContent className="flex flex-col gap-1">
            {recentEarmolds.length === 0 ? (
              <p className="py-2 text-sm text-muted-foreground">
                No earmold requests yet.
              </p>
            ) : (
              recentEarmolds.map((e: RecentEarmoldRow) => (
                <Link
                  key={e.id}
                  href={`/earmolds/${e.id}`}
                  className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-muted"
                >
                  <span className="font-medium">{e.patient_name}</span>
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <EarmoldStatusBadge status={e.status} />
                    {formatDate(e.created_at)}
                  </span>
                </Link>
              ))
            )}
            <Link
              href="/earmolds"
              className="mt-1 text-xs font-medium text-muted-foreground underline-offset-2 hover:underline"
            >
              View all
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <HistoryIcon className="size-4 text-muted-foreground" aria-hidden="true" />
              Recent status events
            </CardTitle>
            <Badge variant="secondary" className="tabular-nums">
              {recentEvents.length}
            </Badge>
          </CardHeader>
          <CardContent className="flex flex-col gap-1">
            {recentEvents.length === 0 ? (
              <p className="py-2 text-sm text-muted-foreground">
                No status events yet.
              </p>
            ) : (
              recentEvents.map((event: RecentEventRow) => (
                <Link
                  key={event.id}
                  href={`/repairs/${event.repair_id}`}
                  className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-muted"
                >
                  <span className="font-medium">
                    {sarNoByRepairId.get(event.repair_id) ?? "—"}
                  </span>
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <RepairEventBadge status={event.status} />
                    {formatDate(event.created_at)}
                  </span>
                </Link>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
