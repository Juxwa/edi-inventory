"use server";

import { revalidatePath } from "next/cache";
import { getBackendAdminUser } from "@/lib/backend-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  BACKEND_EDIT_FIELD_PREFIX,
  backendEditSchema,
  isLockedColumn,
  type BackendEditActionState,
} from "@/lib/validators/backend-edit";

type RowData = Record<string, unknown>;

type Coerced = { ok: true; value: unknown } | { ok: false; error: string };

// There is no column-type metadata to hand here, so the shape of the value
// already in the row is the type oracle: a column currently holding a number
// only accepts a number, a boolean only accepts true/false. Empty input means
// null for every type. A column whose current value is null carries no type
// information, so it is passed through as text and Postgres does the final
// coercion — a bad value comes back as a database error, surfaced verbatim.
function coerceValue(column: string, raw: string, current: unknown): Coerced {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { ok: true, value: null };

  if (typeof current === "number") {
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) {
      return { ok: false, error: `${column} must be a number.` };
    }
    return { ok: true, value: parsed };
  }

  if (typeof current === "boolean") {
    if (trimmed === "true") return { ok: true, value: true };
    if (trimmed === "false") return { ok: true, value: false };
    return { ok: false, error: `${column} must be true or false.` };
  }

  if (current !== null && typeof current === "object") {
    return {
      ok: false,
      error: `${column} holds a structured value (array or JSON) and cannot be edited here.`,
    };
  }

  return { ok: true, value: trimmed };
}

type PostgresErrorLike = { message?: string } | null;

// Database errors are the useful signal here (enum out of range, foreign key
// violation, not-null) — surface them verbatim rather than a canned string,
// matching admin/corrections/actions.ts.
function dbErrorMessage(error: PostgresErrorLike, fallback: string): string {
  if (error && typeof error.message === "string" && error.message.length > 0) {
    return error.message;
  }
  return fallback;
}

export async function commitBackendEdit(
  _prevState: BackendEditActionState,
  formData: FormData,
): Promise<BackendEditActionState> {
  // Re-verified from the session, not from the page that rendered the form.
  const actor = await getBackendAdminUser();
  if (!actor) return { ok: false, error: "Not authorized." };

  const parsed = backendEditSchema.safeParse({
    table: formData.get("table"),
    id: formData.get("id"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  }
  const { table, id, reason } = parsed.data;

  const admin = createAdminClient();

  const { data: beforeData, error: fetchError } = await admin
    .from(table)
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (fetchError) {
    return { ok: false, error: dbErrorMessage(fetchError, "Could not load the row.") };
  }
  const before = beforeData as RowData | null;
  if (!before) return { ok: false, error: "No such row in that table." };

  const updates: RowData = {};
  const changedCols: string[] = [];

  for (const [key, raw] of formData.entries()) {
    if (!key.startsWith(BACKEND_EDIT_FIELD_PREFIX)) continue;
    if (typeof raw !== "string") continue;

    const column = key.slice(BACKEND_EDIT_FIELD_PREFIX.length);
    if (isLockedColumn(column)) {
      return { ok: false, error: `${column} cannot be changed.` };
    }
    // Unknown columns are rejected rather than ignored: the row we just
    // fetched is the authoritative column list, so anything not in it was
    // injected into the form.
    if (!Object.prototype.hasOwnProperty.call(before, column)) {
      return { ok: false, error: `Unknown column: ${column}.` };
    }

    const coerced = coerceValue(column, raw, before[column]);
    if (!coerced.ok) return { ok: false, error: coerced.error };
    if (coerced.value === before[column]) continue;

    updates[column] = coerced.value;
    changedCols.push(column);
  }

  if (changedCols.length === 0) {
    return { ok: false, error: "Nothing changed — no values differ from the current row." };
  }

  if (Object.prototype.hasOwnProperty.call(before, "updated_at")) {
    updates.updated_at = new Date().toISOString();
  }

  const { data: afterData, error: updateError } = await admin
    .from(table)
    .update(updates)
    .eq("id", id)
    .select("*")
    .single();
  if (updateError) {
    return { ok: false, error: dbErrorMessage(updateError, "Could not save the change.") };
  }
  const after = afterData as RowData | null;

  // Both logs are written explicitly. admin_corrections is the reason-carrying
  // record an org admin can read at /admin/corrections; activity_log is the
  // raw who/what/when. The update above went through the service-role client,
  // which carries no JWT, so log_activity() (0029) skips it — without this
  // insert the edit would be invisible in the activity log.
  const { error: correctionError } = await admin
    .from("admin_corrections")
    .insert({
      entity: table,
      entity_id: id,
      action: "backend_edit",
      before_data: before,
      after_data: after,
      reason,
      actor_id: actor.id,
    });

  const { error: activityError } = await admin.from("activity_log").insert({
    table_name: table,
    op: "UPDATE",
    row_id: id,
    actor_id: actor.id,
    old_data: before,
    new_data: after,
    changed_cols: changedCols,
    context: { source: "backend_editor", reason },
  });

  revalidatePath("/admin/edit");
  revalidatePath("/admin/activity");
  revalidatePath("/admin/corrections");

  // The row is already saved at this point. An audit write that failed is
  // reported rather than swallowed — a silent gap in the log is worse than a
  // noisy save.
  const auditFailures: string[] = [];
  if (correctionError) {
    auditFailures.push(`corrections log (${correctionError.message})`);
  }
  if (activityError) {
    auditFailures.push(`activity log (${activityError.message})`);
  }
  if (auditFailures.length > 0) {
    return {
      ok: true,
      warning: `Row saved, but the audit write failed: ${auditFailures.join("; ")}.`,
    };
  }

  return { ok: true };
}
