import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/supabase/profile";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { RepairStatusBadge } from "@/components/repairs/status-badge";
import { EventTimeline, type RepairEventData } from "@/components/repairs/event-timeline";
import { EventForm } from "@/components/repairs/event-form";
import { EditRepairDialog } from "@/components/repairs/edit-repair-dialog";
import { CopyLinkButton } from "@/components/repairs/copy-link-button";
import { formatCurrency, formatDate } from "@/lib/format";
import type { RepairStatus, RepairEventStatus } from "@/lib/validators/repair";

export const dynamic = "force-dynamic";

type RepairDetailPageProps = {
  params: Promise<{ id: string }>;
};

type RepairRow = {
  id: string;
  sar_no: string | null;
  customer_id: string | null;
  contact_no: string | null;
  requesting_branch_id: string | null;
  requested_by: string | null;
  request_date: string;
  sale_line_item_id: string | null;
  manual_serial: string | null;
  issue_description: string | null;
  assigned_to: string | null;
  downpayment: number | null;
  status: RepairStatus;
  returned_to_customer_at: string | null;
  remarks: string | null;
};

export default async function RepairDetailPage({ params }: RepairDetailPageProps) {
  const profile = await getProfile();
  if (!profile) {
    redirect("/");
  }

  const { id } = await params;
  const supabase = await createClient();

  const { data } = await supabase
    .from("repair_requests")
    .select(
      "id, sar_no, customer_id, contact_no, requesting_branch_id, requested_by, request_date, sale_line_item_id, manual_serial, issue_description, assigned_to, downpayment, status, returned_to_customer_at, remarks",
    )
    .eq("id", id)
    .maybeSingle();

  const repair = data as RepairRow | null;
  if (!repair) {
    notFound();
  }

  const [
    customerResult,
    branchResult,
    lineResult,
    eventsResult,
    techniciansResult,
  ] = await Promise.all([
    repair.customer_id
      ? supabase
          .from("customers")
          .select("id, name, mobile_no")
          .eq("id", repair.customer_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    repair.requesting_branch_id
      ? supabase
          .from("branches")
          .select("id, name")
          .eq("id", repair.requesting_branch_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    repair.sale_line_item_id
      ? supabase
          .from("sale_line_items")
          .select("id, serial_snapshot, product_id, sale_id, warranty_expiry")
          .eq("id", repair.sale_line_item_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("repair_status_events")
      .select("id, status, note, is_public, actor_id, created_at")
      .eq("repair_id", repair.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("profiles")
      .select("id, name")
      .eq("role", "technical")
      .eq("is_active", true)
      .order("name"),
  ]);

  const customer = customerResult.data as {
    id: string;
    name: string;
    mobile_no: string | null;
  } | null;
  const branch = branchResult.data as { id: string; name: string } | null;
  const line = lineResult.data as {
    id: string;
    serial_snapshot: string | null;
    product_id: string | null;
    sale_id: string;
    warranty_expiry: string | null;
  } | null;
  const technicians: { id: string; name: string }[] =
    techniciansResult.data ?? [];

  type EventRow = {
    id: number;
    status: RepairEventStatus;
    note: string | null;
    is_public: boolean;
    actor_id: string | null;
    created_at: string;
  };
  const eventRows: EventRow[] = (eventsResult.data as EventRow[] | null) ?? [];

  let productName: string | null = null;
  if (line?.product_id) {
    const { data: product } = await supabase
      .from("products")
      .select("name")
      .eq("id", line.product_id)
      .maybeSingle();
    productName = (product as { name: string } | null)?.name ?? null;
  }

  const actorIds = Array.from(
    new Set(
      [
        ...eventRows.map((event: EventRow) => event.actor_id),
        repair.assigned_to,
        repair.requested_by,
      ].filter((value: string | null): value is string => value !== null),
    ),
  );
  let profileNameById = new Map<string, string>();
  if (actorIds.length > 0) {
    const { data: profileRows } = await supabase
      .from("profiles")
      .select("id, name")
      .in("id", actorIds);
    type ProfileRow = { id: string; name: string };
    profileNameById = new Map(
      ((profileRows as ProfileRow[] | null) ?? []).map((row: ProfileRow) => [
        row.id,
        row.name,
      ]),
    );
  }

  const events: RepairEventData[] = eventRows.map((event: EventRow) => ({
    id: event.id,
    status: event.status,
    note: event.note,
    is_public: event.is_public,
    actor_name: event.actor_id
      ? (profileNameById.get(event.actor_id) ?? null)
      : null,
    created_at: event.created_at,
  }));

  const serial = repair.manual_serial ?? line?.serial_snapshot ?? "—";
  const canManage = profile.role !== "top_mgmt";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold">
              {repair.sar_no ?? "Repair"}
            </h1>
            <RepairStatusBadge status={repair.status} />
          </div>
          <p className="text-sm text-muted-foreground">
            Requested {formatDate(repair.request_date)}
            {branch ? ` · ${branch.name}` : ""}
          </p>
        </div>
        <div className="flex gap-2">
          {repair.sar_no ? <CopyLinkButton sarNo={repair.sar_no} /> : null}
          {canManage ? (
            <EditRepairDialog
              repairId={repair.id}
              assignedTo={repair.assigned_to}
              downpayment={repair.downpayment}
              remarks={repair.remarks}
              isForReplacement={repair.status === "for_replacement"}
              technicians={technicians}
            />
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Details</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <dt className="text-muted-foreground">Customer</dt>
              <dd>
                {customer ? (
                  <Link
                    href={`/customers/${customer.id}`}
                    className="font-medium hover:underline"
                  >
                    {customer.name}
                  </Link>
                ) : (
                  "—"
                )}
              </dd>
              <dt className="text-muted-foreground">Contact no.</dt>
              <dd>{repair.contact_no ?? customer?.mobile_no ?? "—"}</dd>
              <dt className="text-muted-foreground">Serial</dt>
              <dd>{serial}</dd>
              <dt className="text-muted-foreground">Product</dt>
              <dd>{productName ?? "—"}</dd>
              {line ? (
                <>
                  <dt className="text-muted-foreground">Original sale</dt>
                  <dd>
                    <Link
                      href={`/sales/${line.sale_id}`}
                      className="font-medium hover:underline"
                    >
                      View sale
                    </Link>
                  </dd>
                  <dt className="text-muted-foreground">Warranty expiry</dt>
                  <dd>{formatDate(line.warranty_expiry)}</dd>
                </>
              ) : null}
              <dt className="text-muted-foreground">Technician</dt>
              <dd>
                {repair.assigned_to
                  ? (profileNameById.get(repair.assigned_to) ?? "—")
                  : "Unassigned"}
              </dd>
              <dt className="text-muted-foreground">Requested by</dt>
              <dd>
                {repair.requested_by
                  ? (profileNameById.get(repair.requested_by) ?? "—")
                  : "—"}
              </dd>
              <dt className="text-muted-foreground">Downpayment</dt>
              <dd>
                {repair.downpayment !== null
                  ? formatCurrency(repair.downpayment)
                  : "—"}
              </dd>
              <dt className="text-muted-foreground">Returned to customer</dt>
              <dd>{formatDate(repair.returned_to_customer_at)}</dd>
              <dt className="text-muted-foreground">Issue</dt>
              <dd className="col-span-2 -mt-2 pt-2">
                {repair.issue_description ?? "—"}
              </dd>
              {repair.remarks ? (
                <>
                  <dt className="text-muted-foreground">Remarks (internal)</dt>
                  <dd className="col-span-2 -mt-2 pt-2">{repair.remarks}</dd>
                </>
              ) : null}
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Status timeline</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <EventTimeline events={events} />
            {canManage ? (
              <div className="border-t border-border pt-4">
                <EventForm repairId={repair.id} />
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
