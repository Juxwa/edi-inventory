import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/supabase/profile";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DecisionDialog,
  CancelRequestButton,
} from "@/components/approvals/decision-dialog";
import { formatCurrency, formatDate } from "@/lib/format";
import {
  REQUEST_KIND_LABEL,
  type RequestKind,
  type RequestSnapshot,
  type RequestSnapshotLine,
  type RequestStatus,
} from "@/lib/validators/correction-request";

export const dynamic = "force-dynamic";

const HISTORY_LIMIT = 200;

type RequestRow = {
  id: string;
  kind: RequestKind;
  status: RequestStatus;
  sale_id: string;
  sale_line_id: string | null;
  quantity: number | null;
  reason: string;
  snapshot: RequestSnapshot;
  requested_by: string;
  requested_role: string;
  requested_at: string;
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
};

const REQUEST_COLUMNS =
  "id, kind, status, sale_id, sale_line_id, quantity, reason, snapshot, requested_by, requested_role, requested_at, decided_by, decided_at, decision_note";

const ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  branch_rep: "Branch Rep",
  top_mgmt: "Top Management",
  technical: "Technical",
  hq_staff: "HQ Staff",
  supervisor: "HQ Supervisor",
};

// Requests filed by head office itself can only be decided by the supervisor
// (mirrors correction_request_decide).
const SUPERVISOR_ONLY_ROLES = new Set(["hq_staff", "admin", "supervisor"]);

const STATUS_VARIANT: Record<RequestStatus, "warning" | "success" | "destructive" | "outline"> = {
  pending: "warning",
  approved: "success",
  rejected: "destructive",
  cancelled: "outline",
};

const STATUS_LABEL: Record<RequestStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

function saleReference(row: RequestRow): string {
  const snapshot = row.snapshot;
  return snapshot.or_no ?? snapshot.csi_no ?? snapshot.ci_no ?? row.sale_id.slice(0, 8);
}

function requestSummary(row: RequestRow): string {
  if (row.kind === "sale_void") return `Void sale ${saleReference(row)}`;
  const line = row.snapshot.lines.find(
    (candidate: RequestSnapshotLine) => candidate.id === row.sale_line_id,
  );
  return `Return ${row.quantity ?? ""} × ${line?.item ?? "item"} from sale ${saleReference(row)}`;
}

export default async function ApprovalsPage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  // Technical staff do not work with sales; everyone else can follow the
  // requests RLS lets them see. Only approvers get the decision buttons.
  if (profile.role === "technical") redirect("/");

  const supabase = await createClient();
  const [pendingResult, historyResult] = await Promise.all([
    supabase
      .from("correction_requests")
      .select(REQUEST_COLUMNS)
      .eq("status", "pending")
      .order("requested_at", { ascending: true }),
    supabase
      .from("correction_requests")
      .select(REQUEST_COLUMNS)
      .neq("status", "pending")
      .order("decided_at", { ascending: false })
      .limit(HISTORY_LIMIT),
  ]);

  const pending: RequestRow[] = (pendingResult.data as RequestRow[] | null) ?? [];
  const history: RequestRow[] = (historyResult.data as RequestRow[] | null) ?? [];
  const loadError = pendingResult.error ?? historyResult.error;
  const all: RequestRow[] = [...pending, ...history];

  const profileIds: string[] = Array.from(
    new Set(
      all.flatMap((row: RequestRow) =>
        row.decided_by ? [row.requested_by, row.decided_by] : [row.requested_by],
      ),
    ),
  );
  const customerIds: string[] = Array.from(
    new Set(
      all
        .map((row: RequestRow) => row.snapshot.customer_id)
        .filter((id: string | null): id is string => id !== null),
    ),
  );

  // Customer names are read under the viewer's own RLS: customers of
  // isolated branches (0042) stay hidden from viewers who may not see them.
  const [profilesResult, customersResult] = await Promise.all([
    profileIds.length > 0
      ? supabase.from("profiles").select("id, name").in("id", profileIds)
      : Promise.resolve({ data: [] as { id: string; name: string | null }[] }),
    customerIds.length > 0
      ? supabase.from("customers").select("id, name").in("id", customerIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);
  type NameRow = { id: string; name: string | null };
  const profileNameById = new Map<string, string | null>(
    ((profilesResult.data as NameRow[] | null) ?? []).map((row: NameRow) => [row.id, row.name]),
  );
  const customerNameById = new Map<string, string | null>(
    ((customersResult.data as NameRow[] | null) ?? []).map((row: NameRow) => [row.id, row.name]),
  );

  const personName = (id: string | null): string =>
    id ? (profileNameById.get(id) ?? "Unknown") : "—";
  const customerName = (row: RequestRow): string => {
    const id = row.snapshot.customer_id;
    if (!id) return "—";
    return customerNameById.get(id) ?? "Hidden";
  };

  const isApprover = profile.approver !== null;
  // The supervisor role cannot open sale pages (approvals only).
  const canOpenSale = profile.role !== "supervisor";

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold">
          {isApprover ? "Approvals" : "Void & return requests"}
        </h1>
        <p className="text-sm text-muted-foreground">
          Sale voids and returns take effect only after head office approves the request.
        </p>
      </div>

      {loadError ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          Could not load requests: {loadError.message}
        </p>
      ) : null}

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">Waiting for a decision ({pending.length})</h2>
        {pending.length === 0 ? (
          <p className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
            No requests are waiting.
          </p>
        ) : (
          pending.map((row: RequestRow) => {
            const isOwn = row.requested_by === profile.id;
            const supervisorOnly = SUPERVISOR_ONLY_ROLES.has(row.requested_role);
            const canDecide =
              isApprover && !isOwn && (profile.approver === "supervisor" || !supervisorOnly);
            const shownLines: RequestSnapshotLine[] =
              row.kind === "sale_return_line"
                ? row.snapshot.lines.filter(
                    (line: RequestSnapshotLine) => line.id === row.sale_line_id,
                  )
                : row.snapshot.lines;
            const gross = row.snapshot.gross ?? 0;
            const discount = row.snapshot.discount ?? 0;
            return (
              <Card key={row.id}>
                <CardHeader className="flex flex-row items-start justify-between gap-4">
                  <div className="flex flex-col gap-1">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Badge variant={row.kind === "sale_void" ? "destructive" : "secondary"}>
                        {REQUEST_KIND_LABEL[row.kind]}
                      </Badge>
                      {canOpenSale ? (
                        <Link
                          href={`/sales/${row.sale_id}`}
                          className="text-primary hover:underline"
                        >
                          Sale {saleReference(row)}
                        </Link>
                      ) : (
                        <span>Sale {saleReference(row)}</span>
                      )}
                    </CardTitle>
                    <p className="text-sm text-muted-foreground">
                      {row.snapshot.branch ?? "—"} · sold {formatDate(row.snapshot.sale_date)} ·
                      customer {customerName(row)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {canDecide ? (
                      <>
                        <DecisionDialog
                          requestId={row.id}
                          decision="reject"
                          summary={requestSummary(row)}
                        />
                        <DecisionDialog
                          requestId={row.id}
                          decision="approve"
                          summary={requestSummary(row)}
                        />
                      </>
                    ) : isOwn ? (
                      <CancelRequestButton requestId={row.id} />
                    ) : isApprover && supervisorOnly ? (
                      <Badge variant="outline">Needs HQ supervisor</Badge>
                    ) : (
                      <Badge variant="warning">Pending</Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="flex flex-col gap-3 text-sm">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Reason
                    </p>
                    <p>{row.reason}</p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Requested by {personName(row.requested_by)} (
                    {ROLE_LABEL[row.requested_role] ?? row.requested_role}) on{" "}
                    {formatDate(row.requested_at)}
                    {isOwn && isApprover ? " — you cannot decide your own request" : ""}
                  </p>
                  <div className="rounded-lg border border-border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Item</TableHead>
                          <TableHead>Serial</TableHead>
                          <TableHead className="text-right">Sold</TableHead>
                          <TableHead className="text-right">
                            {row.kind === "sale_return_line" ? "To return" : "Already returned"}
                          </TableHead>
                          <TableHead className="text-right">Unit price</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {shownLines.map((line: RequestSnapshotLine) => (
                          <TableRow key={line.id}>
                            <TableCell className="font-medium">{line.item}</TableCell>
                            <TableCell className="text-muted-foreground">
                              {line.serial ?? "—"}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {line.quantity}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {row.kind === "sale_return_line"
                                ? (row.quantity ?? "—")
                                : line.returned_quantity}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {formatCurrency(line.unit_price)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  {row.kind === "sale_void" ? (
                    <p className="text-right text-sm">
                      Items total{" "}
                      <span className="font-medium tabular-nums">{formatCurrency(gross)}</span> ·
                      discount{" "}
                      <span className="font-medium tabular-nums">{formatCurrency(discount)}</span>
                    </p>
                  ) : null}
                </CardContent>
              </Card>
            );
          })
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">History</h2>
        <div className="rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Decided</TableHead>
                <TableHead>Request</TableHead>
                <TableHead>Branch</TableHead>
                <TableHead>Requested by</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Decided by</TableHead>
                <TableHead>Note</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground">
                    No decided requests yet.
                  </TableCell>
                </TableRow>
              ) : (
                history.map((row: RequestRow) => (
                  <TableRow key={row.id}>
                    <TableCell className="whitespace-nowrap">
                      {formatDate(row.decided_at)}
                    </TableCell>
                    <TableCell className="font-medium">
                      {canOpenSale ? (
                        <Link
                          href={`/sales/${row.sale_id}`}
                          className="text-primary hover:underline"
                        >
                          {requestSummary(row)}
                        </Link>
                      ) : (
                        requestSummary(row)
                      )}
                    </TableCell>
                    <TableCell>{row.snapshot.branch ?? "—"}</TableCell>
                    <TableCell>{personName(row.requested_by)}</TableCell>
                    <TableCell className="max-w-xs whitespace-normal">{row.reason}</TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[row.status]}>{STATUS_LABEL[row.status]}</Badge>
                    </TableCell>
                    <TableCell>{personName(row.decided_by)}</TableCell>
                    <TableCell className="max-w-xs whitespace-normal">
                      {row.decision_note ?? "—"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  );
}
