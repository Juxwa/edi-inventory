"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { commitBackendEdit } from "@/app/(app)/admin/edit/actions";
import {
  BACKEND_EDIT_FIELD_PREFIX,
  initialBackendEditState,
  type BackendEditActionState,
} from "@/lib/validators/backend-edit";

export type BackendEditFieldKind =
  | "number"
  | "boolean"
  | "date"
  | "text"
  | "structured";

export type BackendEditField = {
  column: string;
  kind: BackendEditFieldKind;
  // Current value rendered as the string the input starts with.
  value: string;
  // Current value rendered for humans (distinguishes null from empty text).
  display: string;
};

const MIN_REASON_LENGTH = 10;

const INPUT_CLASS =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

function renderNext(field: BackendEditField, next: string): string {
  return next.trim().length === 0 ? "null" : next;
}

// Two-step editor: change values, then review an explicit old → new diff
// before anything is committed. The server recomputes the diff from the live
// row regardless, so this step is a confirmation, not the authority.
export function BackendEditForm({
  table,
  rowId,
  fields,
}: {
  table: string;
  rowId: string;
  fields: BackendEditField[];
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState("");
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      fields.map((field: BackendEditField) => [field.column, field.value]),
    ),
  );
  const [state, formAction, pending] = useActionState<
    BackendEditActionState,
    FormData
  >(commitBackendEdit, initialBackendEditState);

  useEffect(() => {
    if (state.ok) {
      if (state.warning) {
        toast.error(state.warning);
      } else {
        toast.success("Row updated and logged.");
      }
      setConfirming(false);
      setReason("");
      router.refresh();
    } else if (state.error) {
      toast.error(state.error);
    }
  }, [state, router]);

  const editable = useMemo(
    () =>
      fields.filter((field: BackendEditField) => field.kind !== "structured"),
    [fields],
  );

  const changed = useMemo(
    () =>
      editable.filter(
        (field: BackendEditField) => values[field.column] !== field.value,
      ),
    [editable, values],
  );

  const reasonTooShort = reason.trim().length < MIN_REASON_LENGTH;

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name="table" value={table} />
      <input type="hidden" name="id" value={rowId} />

      <div hidden={confirming} className="grid gap-4 sm:grid-cols-2">
        {fields.map((field: BackendEditField) => {
          const inputId = `backend-edit-${field.column}`;
          if (field.kind === "structured") {
            return (
              <div key={field.column} className="grid gap-1.5">
                <label htmlFor={inputId} className="text-sm font-medium">
                  {field.column}
                </label>
                <input
                  id={inputId}
                  readOnly
                  disabled
                  value={field.display}
                  className={INPUT_CLASS}
                />
                <p className="text-xs text-muted-foreground">
                  Structured value — not editable here.
                </p>
              </div>
            );
          }

          const name = `${BACKEND_EDIT_FIELD_PREFIX}${field.column}`;
          const current = values[field.column] ?? "";

          return (
            <div key={field.column} className="grid gap-1.5">
              <label htmlFor={inputId} className="text-sm font-medium">
                {field.column}
              </label>
              {field.kind === "boolean" ? (
                <select
                  id={inputId}
                  name={name}
                  value={current}
                  disabled={pending}
                  onChange={(event: React.ChangeEvent<HTMLSelectElement>) =>
                    setValues({ ...values, [field.column]: event.target.value })
                  }
                  className={INPUT_CLASS}
                >
                  <option value="">(null)</option>
                  <option value="true">true</option>
                  <option value="false">false</option>
                </select>
              ) : (
                <input
                  id={inputId}
                  name={name}
                  type={
                    field.kind === "number"
                      ? "number"
                      : field.kind === "date"
                        ? "date"
                        : "text"
                  }
                  step={field.kind === "number" ? "any" : undefined}
                  value={current}
                  disabled={pending}
                  onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                    setValues({ ...values, [field.column]: event.target.value })
                  }
                  className={INPUT_CLASS}
                />
              )}
              <p className="text-xs text-muted-foreground">
                Now: {field.display}
              </p>
            </div>
          );
        })}
      </div>

      {confirming ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/40">
          <p className="text-sm font-semibold">
            Confirm {changed.length} change{changed.length === 1 ? "" : "s"} to{" "}
            <span className="font-mono">{table}</span>
          </p>
          <ul className="mt-3 flex flex-col gap-2">
            {changed.map((field: BackendEditField) => (
              <li key={field.column} className="text-sm">
                <span className="font-medium">{field.column}</span>
                <div className="mt-0.5 flex flex-wrap items-center gap-2 font-mono text-xs">
                  <span className="rounded bg-background px-1.5 py-0.5 line-through opacity-70">
                    {field.display}
                  </span>
                  <span aria-hidden="true">to</span>
                  <span className="rounded bg-background px-1.5 py-0.5 font-semibold">
                    {renderNext(field, values[field.column] ?? "")}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="grid gap-1.5">
        <label htmlFor="backend-edit-reason" className="text-sm font-medium">
          Reason (required, at least {MIN_REASON_LENGTH} characters)
        </label>
        <textarea
          id="backend-edit-reason"
          name="reason"
          rows={2}
          disabled={pending}
          value={reason}
          onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) =>
            setReason(event.target.value)
          }
          placeholder="Why does this row need changing?"
          className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        />
      </div>

      {state.error ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {state.error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {confirming ? (
          <>
            <button
              type="submit"
              disabled={pending || reasonTooShort || changed.length === 0}
              className="h-9 rounded-md bg-destructive px-4 text-sm font-medium text-white hover:opacity-90 disabled:pointer-events-none disabled:opacity-50"
            >
              {pending ? "Saving..." : "Confirm and save"}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => setConfirming(false)}
              className="h-9 rounded-md border border-input px-4 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
            >
              Back to edit
            </button>
          </>
        ) : (
          <button
            type="button"
            disabled={changed.length === 0 || reasonTooShort}
            onClick={() => setConfirming(true)}
            className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:pointer-events-none disabled:opacity-50"
          >
            Review {changed.length} change{changed.length === 1 ? "" : "s"}
          </button>
        )}
        <span className="text-xs text-muted-foreground">
          Saved edits are written to the corrections log and the activity log
          under your real account.
        </span>
      </div>
    </form>
  );
}
