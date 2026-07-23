import { z } from "zod";

export type TransferActionState = {
  ok: boolean;
  error?: string;
  transferId?: string;
};

export const initialTransferState: TransferActionState = { ok: false };

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

const requiredText = z.preprocess(
  toOptionalText,
  z.string({ required_error: "Required" }).min(1, "Required"),
);

const positiveQuantity = z.preprocess((value: unknown) => {
  const text = toOptionalText(value);
  if (text === null) return null;
  const parsed = Number.parseFloat(text);
  return Number.isNaN(parsed) ? text : parsed;
}, z.number().positive("Quantity must be greater than zero"));

export const createTransferSchema = z.object({
  from_branch_id: requiredUuid,
  to_branch_id: requiredUuid,
});
export type CreateTransferInput = z.infer<typeof createTransferSchema>;

export const addLineSchema = z.object({
  transfer_id: requiredUuid,
  stock_id: requiredUuid,
  quantity: positiveQuantity,
});
export type AddLineInput = z.infer<typeof addLineSchema>;

export const removeLineSchema = z.object({
  line_id: requiredUuid,
  transfer_id: requiredUuid,
});
export type RemoveLineInput = z.infer<typeof removeLineSchema>;

export const reserveTransferSchema = z.object({
  transfer_id: requiredUuid,
});
export type ReserveTransferInput = z.infer<typeof reserveTransferSchema>;

export const dispatchTransferSchema = z.object({
  transfer_id: requiredUuid,
  courier: requiredText,
  tracking_code: optionalText,
  sis_no: optionalText,
});
export type DispatchTransferInput = z.infer<typeof dispatchTransferSchema>;

// Received quantity arrives either as a form string or, when the value is
// built client-side from state, as a real number — handle both.
const nonNegativeQuantity = z.preprocess((value: unknown) => {
  if (typeof value === "number") return value;
  const text = toOptionalText(value);
  if (text === null) return null;
  const parsed = Number.parseFloat(text);
  return Number.isNaN(parsed) ? text : parsed;
}, z.number({ required_error: "Required" }).min(0, "Received quantity must be zero or more"));

export const receiveLineSchema = z.object({
  line_id: requiredUuid,
  received_quantity: nonNegativeQuantity,
  note: optionalText,
});
export type ReceiveLineInput = z.infer<typeof receiveLineSchema>;

export const deleteDraftSchema = z.object({
  transfer_id: requiredUuid,
});
export type DeleteDraftInput = z.infer<typeof deleteDraftSchema>;

export function generateTransferCode(): string {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(2);
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `TR-${yy}${mm}${dd}-${random}`;
}

export const TRANSFER_STATUSES = [
  "draft",
  "reserved",
  "in_transit",
  "confirmed",
] as const;
export type TransferStatus = (typeof TRANSFER_STATUSES)[number];

export const STALE_DRAFT_DAYS = 7;
