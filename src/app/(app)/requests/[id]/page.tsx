import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/supabase/profile";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RequestStatusBadge } from "@/components/requests/request-table";
import {
  RequestLinesTable,
  AdminNotesEditor,
  type RequestLineRowData,
} from "@/components/requests/request-detail-dialog";
import { ServeDialog } from "@/components/requests/serve-dialog";
import type { RequestStatus } from "@/lib/validators/request";

export const dynamic = "force-dynamic";

type RequestDetailPageProps = {
  params: Promise<{ id: string }>;
};

type RequestDetailRow = {
  id: string;
  requesting_branch_id: string;
  requested_by: string | null;
  request_date: string;
  notes: string | null;
  admin_notes: string | null;
  status: RequestStatus;
};

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function firstOrNull<T>(value: T | T[] | null): T | null {
  if (value == null) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export default async function RequestDetailPage({
  params,
}: RequestDetailPageProps) {
  const profile = await getProfile();
  if (!profile) {
    redirect("/");
  }

  const { id } = await params;
  const supabase = await createClient();

  const { data: request, error: requestError } = await supabase
    .from("inventory_requests")
    .select(
      "id, requesting_branch_id, requested_by, request_date, notes, admin_notes, status",
    )
    .eq("id", id)
    .single();

  if (requestError || !request) {
    notFound();
  }

  const requestRow = request as RequestDetailRow;

  const [branchesResult, lineRows] = await Promise.all([
    supabase.from("branches").select("id, name").order("name"),
    supabase
      .from("request_line_items")
      .select("id, product_id, quantity, products(name)")
      .eq("request_id", requestRow.id),
  ]);

  const branches: { id: string; name: string }[] = branchesResult.data ?? [];
  const branchNameById = new Map<string, string>(
    branches.map((branch: { id: string; name: string }) => [branch.id, branch.name]),
  );

  type RawLineRow = {
    id: string;
    product_id: string;
    quantity: number;
    products: { name: string } | { name: string }[] | null;
  };
  const rawLines: RawLineRow[] = (lineRows.data as RawLineRow[] | null) ?? [];
  const lines: RequestLineRowData[] = rawLines.map((line: RawLineRow) => ({
    id: line.id,
    product_name: firstOrNull(line.products)?.name ?? "—",
    quantity: line.quantity,
  }));

  let requesterName = "—";
  if (requestRow.requested_by) {
    const { data: requesterRow } = await supabase
      .from("profiles")
      .select("id, name")
      .eq("id", requestRow.requested_by)
      .single();
    type RequesterRow = { id: string; name: string | null };
    requesterName = (requesterRow as RequesterRow | null)?.name ?? "—";
  }

  const isAdmin = profile.role === "admin";
  const canServe = isAdmin && requestRow.status === "pending";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold">
              Request — {formatDate(requestRow.request_date)}
            </h1>
            <RequestStatusBadge status={requestRow.status} />
          </div>
          <p className="text-sm text-muted-foreground">
            {branchNameById.get(requestRow.requesting_branch_id) ?? "—"}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {canServe ? (
            <ServeDialog
              requestId={requestRow.id}
              branches={branches}
              excludeBranchId={requestRow.requesting_branch_id}
            />
          ) : null}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
          <div>
            <p className="text-muted-foreground">Requested by</p>
            <p className="font-medium">{requesterName}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Date</p>
            <p className="font-medium">{formatDate(requestRow.request_date)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Notes</p>
            <p className="font-medium">{requestRow.notes ?? "—"}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Lines</CardTitle>
        </CardHeader>
        <CardContent>
          <RequestLinesTable lines={lines} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Admin notes</CardTitle>
        </CardHeader>
        <CardContent>
          {isAdmin ? (
            <AdminNotesEditor
              requestId={requestRow.id}
              initialNotes={requestRow.admin_notes}
            />
          ) : (
            // Read-only for branch reps/technical: admins reply to requests
            // here, so hiding it made those replies invisible to the requester.
            <p className="text-sm font-medium whitespace-pre-wrap">
              {requestRow.admin_notes?.trim() ? requestRow.admin_notes : "—"}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
