import Link from "next/link";
import { requireBackendAdmin } from "@/lib/backend-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  BackendEditForm,
  type BackendEditField,
  type BackendEditFieldKind,
} from "@/components/admin/backend-edit-form";
import {
  BACKEND_EDIT_EXCLUDED_TABLES,
  BACKEND_EDIT_LABEL_COLUMN,
  BACKEND_EDIT_TABLES,
  isBackendEditTable,
  isLockedColumn,
  type BackendEditTable,
} from "@/lib/validators/backend-edit";

export const dynamic = "force-dynamic";

const RECENT_LIMIT = 15;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

type EditPageProps = {
  searchParams: Promise<{
    table?: string;
    id?: string;
  }>;
};

type RowData = Record<string, unknown>;

function fieldKind(value: unknown): BackendEditFieldKind {
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  if (value !== null && typeof value === "object") return "structured";
  if (typeof value === "string" && DATE_ONLY_PATTERN.test(value)) return "date";
  return "text";
}

function fieldValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function fieldDisplay(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "object") return JSON.stringify(value);
  if (value === "") return "(empty text)";
  return String(value);
}

function describeRow(row: RowData): BackendEditField[] {
  return Object.keys(row)
    .filter((column: string) => !isLockedColumn(column))
    .sort((a: string, b: string) => a.localeCompare(b))
    .map((column: string) => ({
      column,
      kind: fieldKind(row[column]),
      value: fieldValue(row[column]),
      display: fieldDisplay(row[column]),
    }));
}

export default async function BackendEditPage({ searchParams }: EditPageProps) {
  await requireBackendAdmin();

  const params = await searchParams;
  const tableParam = params.table?.trim() ?? "";
  const idParam = params.id?.trim() ?? "";
  const table: BackendEditTable | null = isBackendEditTable(tableParam)
    ? tableParam
    : null;

  const admin = createAdminClient();

  let recent: RowData[] = [];
  let row: RowData | null = null;
  let loadError: string | null = null;

  if (table) {
    const labelColumn = BACKEND_EDIT_LABEL_COLUMN[table];
    const selectList = labelColumn
      ? `id, created_at, ${labelColumn}`
      : "id, created_at";
    const { data: recentData } = await admin
      .from(table)
      .select(selectList)
      .order("created_at", { ascending: false })
      .limit(RECENT_LIMIT);
    recent = (recentData as RowData[] | null) ?? [];

    if (idParam.length > 0) {
      if (!UUID_PATTERN.test(idParam)) {
        loadError = "That is not a valid row id.";
      } else {
        const { data: rowData, error } = await admin
          .from(table)
          .select("*")
          .eq("id", idParam)
          .maybeSingle();
        if (error) {
          loadError = error.message;
        } else if (!rowData) {
          loadError = "No row with that id in this table.";
        } else {
          row = rowData as RowData;
        }
      }
    }
  } else if (tableParam.length > 0) {
    loadError = "That table cannot be edited here.";
  }

  const labelColumn = table ? BACKEND_EDIT_LABEL_COLUMN[table] : null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold">Data editor</h1>
        <p className="text-sm text-muted-foreground">
          Direct column edits on flat tables, with a required reason, a
          confirmation step, and an entry in both the corrections log and the
          activity log.
        </p>
      </div>

      <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm dark:border-amber-800 dark:bg-amber-950/40">
        <p className="font-medium">
          Ledger tables are not editable here:{" "}
          <span className="font-mono">
            {BACKEND_EDIT_EXCLUDED_TABLES.join(", ")}
          </span>
        </p>
        <p className="mt-1 text-muted-foreground">
          A raw column write on those desyncs quantities from the stock
          movement ledger and from the sale and transfer lines that reference
          them. Use the invariant-preserving corrections instead: void, reverse
          and serial correction from{" "}
          <Link href="/admin/corrections" className="underline underline-offset-2">
            the corrections log
          </Link>
          , and the Edit action on an{" "}
          <Link href="/inventory" className="underline underline-offset-2">
            inventory
          </Link>{" "}
          row for stock details.
        </p>
      </div>

      <form className="flex flex-wrap items-end gap-3" method="get">
        <div className="grid gap-1.5">
          <label htmlFor="table" className="text-sm font-medium">
            Table
          </label>
          <select
            id="table"
            name="table"
            defaultValue={table ?? ""}
            className="flex h-9 w-56 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">Choose a table</option>
            {BACKEND_EDIT_TABLES.map((name: BackendEditTable) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <label htmlFor="id" className="text-sm font-medium">
            Row id
          </label>
          <input
            id="id"
            name="id"
            defaultValue={idParam}
            placeholder="uuid"
            className="flex h-9 w-96 rounded-md border border-input bg-transparent px-3 py-1 font-mono text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <button
          type="submit"
          className="h-9 rounded-md border border-input px-4 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
        >
          Load row
        </button>
      </form>

      {loadError ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {loadError}
        </p>
      ) : null}

      {table && recent.length > 0 ? (
        <div className="rounded-lg border border-border">
          <p className="border-b border-border px-4 py-2 text-sm font-medium">
            Most recent rows in {table}
          </p>
          <ul className="flex flex-col divide-y divide-border">
            {recent.map((recentRow: RowData) => {
              const id = String(recentRow.id);
              const label = labelColumn ? fieldDisplay(recentRow[labelColumn]) : null;
              return (
                <li key={id}>
                  <Link
                    href={`/admin/edit?table=${table}&id=${id}`}
                    className="flex flex-wrap items-center gap-3 px-4 py-2 text-sm hover:bg-accent hover:text-accent-foreground"
                  >
                    <span className="font-mono text-xs text-muted-foreground">
                      {id.slice(0, 8)}
                    </span>
                    {label ? <span className="font-medium">{label}</span> : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {table && row ? (
        <div className="flex flex-col gap-4 rounded-lg border border-border p-4">
          <div>
            <h2 className="text-sm font-semibold">
              Editing {table}{" "}
              <span className="font-mono text-xs text-muted-foreground">
                {String(row.id)}
              </span>
            </h2>
            <p className="text-xs text-muted-foreground">
              id, legacy_id, created_at and updated_at are locked. Enum and
              foreign-key columns are free text — an invalid value comes back
              as a database error and nothing is written.
            </p>
          </div>
          <BackendEditForm
            table={table}
            rowId={String(row.id)}
            fields={describeRow(row)}
          />
        </div>
      ) : null}
    </div>
  );
}
