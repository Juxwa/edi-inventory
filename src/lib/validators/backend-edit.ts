import { z } from "zod";

export type BackendEditActionState = {
  ok: boolean;
  error?: string;
  // Set when the row was saved but one of the two audit writes did not land.
  // The update cannot be rolled back from here (PostgREST calls are separate
  // transactions), so the failure has to be reported loudly instead.
  warning?: string;
};

export const initialBackendEditState: BackendEditActionState = { ok: false };

// WHITELIST. Flat tables only — rows whose columns stand alone and carry no
// cross-row invariant.
//
// Deliberately EXCLUDED: stock, sales, sale_line_items, transfers,
// transfer_line_items, stock_movements. Every one of those participates in the
// stock movement ledger, where a raw column write desyncs quantities from
// stock_movements and from the lines that reference them (e.g. dropping
// stock.quantity leaves the intake movement claiming units that no longer
// exist; editing a sale line's quantity leaves returned_quantity and the
// restored stock unreconcilable). Those tables have purpose-built,
// invariant-preserving RPCs instead — sale_void, intake_void,
// transfer_reverse, serial_correct (0022_admin_corrections.sql) and
// stock_edit (0025_stock_edit.sql), surfaced at /admin/corrections and on the
// /inventory row actions.
export const BACKEND_EDIT_TABLES = [
  "customers",
  "products",
  "suppliers",
  "services",
  "service_pricing",
  "branches",
  "visits",
  "profiles",
  "inventory_requests",
  "repair_requests",
  "earmold_requests",
] as const;
export type BackendEditTable = (typeof BACKEND_EDIT_TABLES)[number];

export const BACKEND_EDIT_EXCLUDED_TABLES = [
  "stock",
  "sales",
  "sale_line_items",
  "transfers",
  "transfer_line_items",
  "stock_movements",
] as const;

export function isBackendEditTable(value: string): value is BackendEditTable {
  return (BACKEND_EDIT_TABLES as readonly string[]).includes(value);
}

// Identity and audit columns are never editable: id anchors every foreign key
// and both audit logs, legacy_id is the import's idempotency key, and the
// timestamps are the record of when the row actually changed.
export const BACKEND_EDIT_LOCKED_COLUMNS = [
  "id",
  "legacy_id",
  "created_at",
  "updated_at",
] as const;

export function isLockedColumn(column: string): boolean {
  return (BACKEND_EDIT_LOCKED_COLUMNS as readonly string[]).includes(column);
}

// Column shown next to the id in the recent-rows shortlist. null where the
// table has no single human-readable identifier.
export const BACKEND_EDIT_LABEL_COLUMN: Record<
  BackendEditTable,
  string | null
> = {
  customers: "name",
  products: "name",
  suppliers: "name",
  services: "name",
  service_pricing: null,
  branches: "name",
  visits: "visit_date",
  profiles: "name",
  inventory_requests: "request_date",
  repair_requests: "sar_no",
  earmold_requests: "patient_name",
};

const trimmedString = z.preprocess((value: unknown) => {
  return typeof value === "string" ? value.trim() : value;
}, z.string());

export const backendEditSchema = z.object({
  table: z.enum(BACKEND_EDIT_TABLES, {
    errorMap: () => ({ message: "That table cannot be edited here." }),
  }),
  id: trimmedString.pipe(z.string().uuid({ message: "A valid row id is required." })),
  reason: trimmedString.pipe(
    z.string().min(10, "Give a reason of at least 10 characters."),
  ),
});
export type BackendEditInput = z.infer<typeof backendEditSchema>;

// Form field prefix for submitted column values, so the action can tell
// column inputs apart from the table/id/reason control fields.
export const BACKEND_EDIT_FIELD_PREFIX = "field:";
