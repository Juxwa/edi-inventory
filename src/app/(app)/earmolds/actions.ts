"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  earmoldSchema,
  advanceEarmoldSchema,
  type EarmoldActionState,
} from "@/lib/validators/earmold";

function firstIssueMessage(issues: { message: string }[]): string {
  return issues[0]?.message ?? "Invalid input.";
}

type PostgresErrorLike = { message?: string } | null;

function rpcErrorMessage(error: PostgresErrorLike, fallback: string): string {
  if (error && typeof error.message === "string" && error.message.length > 0) {
    return error.message;
  }
  return fallback;
}

export async function createEarmold(
  _prevState: EarmoldActionState,
  formData: FormData,
): Promise<EarmoldActionState> {
  const parsed = earmoldSchema.safeParse({
    branch_id: formData.get("branch_id"),
    patient_name: formData.get("patient_name"),
    contact_no: formData.get("contact_no"),
    address: formData.get("address"),
    hearing_aid_model: formData.get("hearing_aid_model"),
    side: formData.get("side"),
    serial_no: formData.get("serial_no"),
    remarks: formData.get("remarks"),
  });

  if (!parsed.success) {
    return { ok: false, error: firstIssueMessage(parsed.error.issues) };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { branch_id, ...fields } = parsed.data;
  const { data, error } = await supabase
    .from("earmold_requests")
    .insert({
      ...fields,
      requesting_branch_id: branch_id,
      requested_by: user?.id ?? null,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { ok: false, error: rpcErrorMessage(error, "Could not create earmold request.") };
  }

  revalidatePath("/earmolds");
  redirect(`/earmolds/${data.id}`);
}

export async function advanceEarmold(
  _prevState: EarmoldActionState,
  formData: FormData,
): Promise<EarmoldActionState> {
  const parsed = advanceEarmoldSchema.safeParse({
    earmold_id: formData.get("earmold_id"),
    from_status: formData.get("from_status"),
    to_status: formData.get("to_status"),
  });

  if (!parsed.success) {
    return { ok: false, error: firstIssueMessage(parsed.error.issues) };
  }

  const supabase = await createClient();
  // Guard races: only advance from the status the user was looking at.
  const { data, error } = await supabase
    .from("earmold_requests")
    .update({ status: parsed.data.to_status, updated_at: new Date().toISOString() })
    .eq("id", parsed.data.earmold_id)
    .eq("status", parsed.data.from_status)
    .select("id");

  if (error) {
    return { ok: false, error: rpcErrorMessage(error, "Could not update status.") };
  }
  if (!data || data.length === 0) {
    return { ok: false, error: "Status changed elsewhere. Refresh and try again." };
  }

  revalidatePath(`/earmolds/${parsed.data.earmold_id}`);
  revalidatePath("/earmolds");
  return { ok: true };
}
