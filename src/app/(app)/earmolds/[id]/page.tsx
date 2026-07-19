import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/supabase/profile";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EarmoldStatusBadge } from "@/components/earmolds/earmolds-table";
import { EarmoldStatusButton } from "@/components/earmolds/status-buttons";
import { formatDate } from "@/lib/format";
import type { EarmoldStatus } from "@/lib/validators/earmold";

export const dynamic = "force-dynamic";

type EarmoldDetailPageProps = {
  params: Promise<{ id: string }>;
};

type EarmoldRow = {
  id: string;
  patient_name: string;
  contact_no: string | null;
  address: string | null;
  hearing_aid_model: string | null;
  side: string | null;
  serial_no: string | null;
  remarks: string | null;
  requesting_branch_id: string | null;
  requested_by: string | null;
  status: EarmoldStatus;
  created_at: string;
  updated_at: string;
};

export default async function EarmoldDetailPage({
  params,
}: EarmoldDetailPageProps) {
  const profile = await getProfile();
  if (!profile) {
    redirect("/");
  }

  const { id } = await params;
  const supabase = await createClient();

  const { data } = await supabase
    .from("earmold_requests")
    .select(
      "id, patient_name, contact_no, address, hearing_aid_model, side, serial_no, remarks, requesting_branch_id, requested_by, status, created_at, updated_at",
    )
    .eq("id", id)
    .maybeSingle();

  const earmold = data as EarmoldRow | null;
  if (!earmold) {
    notFound();
  }

  const [branchResult, requesterResult] = await Promise.all([
    earmold.requesting_branch_id
      ? supabase
          .from("branches")
          .select("name")
          .eq("id", earmold.requesting_branch_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    earmold.requested_by
      ? supabase
          .from("profiles")
          .select("name")
          .eq("id", earmold.requested_by)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const branchName = (branchResult.data as { name: string } | null)?.name;
  const requesterName = (requesterResult.data as { name: string } | null)?.name;
  const canManage = profile.role !== "top_mgmt";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold">{earmold.patient_name}</h1>
            <EarmoldStatusBadge status={earmold.status} />
          </div>
          <p className="text-sm text-muted-foreground">
            Requested {formatDate(earmold.created_at)}
            {branchName ? ` · ${branchName}` : ""}
          </p>
        </div>
        {canManage ? (
          <EarmoldStatusButton earmoldId={earmold.id} status={earmold.status} />
        ) : null}
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="text-sm">Details</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <dt className="text-muted-foreground">Contact no.</dt>
            <dd>{earmold.contact_no ?? "—"}</dd>
            <dt className="text-muted-foreground">Address</dt>
            <dd>{earmold.address ?? "—"}</dd>
            <dt className="text-muted-foreground">Hearing aid model</dt>
            <dd>{earmold.hearing_aid_model ?? "—"}</dd>
            <dt className="text-muted-foreground">Side</dt>
            <dd className="capitalize">{earmold.side ?? "—"}</dd>
            <dt className="text-muted-foreground">Serial no.</dt>
            <dd>{earmold.serial_no ?? "—"}</dd>
            <dt className="text-muted-foreground">Requested by</dt>
            <dd>{requesterName ?? "—"}</dd>
            <dt className="text-muted-foreground">Last updated</dt>
            <dd>{formatDate(earmold.updated_at)}</dd>
            {earmold.remarks ? (
              <>
                <dt className="text-muted-foreground">Remarks</dt>
                <dd className="col-span-2 -mt-2 pt-2">{earmold.remarks}</dd>
              </>
            ) : null}
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
