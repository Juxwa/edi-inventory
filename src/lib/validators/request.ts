import { z } from "zod";

export type RequestActionState = {
  ok: boolean;
  error?: string;
  requestId?: string;
};

export const initialRequestState: RequestActionState = { ok: false };

// Converts a possibly-empty form string into trimmed text or null.
function toOptionalText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

const optionalText = z.preprocess(toOptionalText, z.string().nullable());

const requiredUuid = z.preprocess(
  toOptionalText,
  z.string({ required_error: "Required" }).uuid({ message: "Required" }),
);

// Values reach here either as form strings or, when the line list arrives as
// parsed JSON, as real numbers — handle both.
const positiveQuantity = z.preprocess((value: unknown) => {
  if (typeof value === "number") return value;
  const text = toOptionalText(value);
  if (text === null) return null;
  const parsed = Number.parseFloat(text);
  return Number.isNaN(parsed) ? text : parsed;
}, z.number().positive("Quantity must be greater than zero"));

const requestLineSchema = z.object({
  product_id: requiredUuid,
  quantity: positiveQuantity,
});
export type RequestLineInput = z.infer<typeof requestLineSchema>;

// Lines arrive from the client as a JSON string (one hidden form field)
// since a dynamic add/remove line list doesn't map cleanly onto repeated
// FormData keys without extra client bookkeeping.
function parseLinesJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export const createRequestSchema = z.object({
  requesting_branch_id: requiredUuid,
  notes: optionalText,
  lines: z.preprocess(
    parseLinesJson,
    z.array(requestLineSchema).min(1, "Add at least one line"),
  ),
});
export type CreateRequestInput = z.infer<typeof createRequestSchema>;

export const updateAdminNotesSchema = z.object({
  request_id: requiredUuid,
  admin_notes: optionalText,
});
export type UpdateAdminNotesInput = z.infer<typeof updateAdminNotesSchema>;

export const serveRequestSchema = z.object({
  request_id: requiredUuid,
  from_branch_id: requiredUuid,
});
export type ServeRequestInput = z.infer<typeof serveRequestSchema>;

export const REQUEST_STATUSES = ["pending", "processing", "served"] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];
