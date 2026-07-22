import { z } from "zod";

export type CorrectionActionState = {
  ok: boolean;
  error?: string;
};

export const initialCorrectionState: CorrectionActionState = { ok: false };

// Converts a possibly-empty form string into trimmed text or null.
function toOptionalText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

const requiredUuid = z.preprocess(
  toOptionalText,
  z.string({ required_error: "Required" }).uuid({ message: "Required" }),
);

const requiredReason = z.preprocess(
  toOptionalText,
  z.string({ required_error: "A reason is required." }).min(1, "A reason is required."),
);

const requiredSerial = z.preprocess(
  toOptionalText,
  z.string({ required_error: "New serial is required." }).min(1, "New serial is required."),
);

export const saleVoidSchema = z.object({
  sale_id: requiredUuid,
  reason: requiredReason,
});
export type SaleVoidInput = z.infer<typeof saleVoidSchema>;

export const intakeVoidSchema = z.object({
  stock_id: requiredUuid,
  reason: requiredReason,
});
export type IntakeVoidInput = z.infer<typeof intakeVoidSchema>;

export const transferReverseSchema = z.object({
  transfer_id: requiredUuid,
  reason: requiredReason,
});
export type TransferReverseInput = z.infer<typeof transferReverseSchema>;

export const SERIAL_CORRECT_SCOPES = [
  "stock",
  "sale_line",
  "transfer_line",
  "repair",
] as const;
export type SerialCorrectScope = (typeof SERIAL_CORRECT_SCOPES)[number];

export const serialCorrectSchema = z.object({
  scope: z.enum(SERIAL_CORRECT_SCOPES),
  id: requiredUuid,
  new_serial: requiredSerial,
  reason: requiredReason,
});
export type SerialCorrectInput = z.infer<typeof serialCorrectSchema>;

export const repairVoidSchema = z.object({
  repair_id: requiredUuid,
  reason: requiredReason,
});
export type RepairVoidInput = z.infer<typeof repairVoidSchema>;

export const earmoldVoidSchema = z.object({
  earmold_id: requiredUuid,
  reason: requiredReason,
});
export type EarmoldVoidInput = z.infer<typeof earmoldVoidSchema>;

export const CORRECTION_ENTITIES = [
  "sale",
  "stock_intake",
  "transfer",
  "repair",
  "earmold",
  "serial",
] as const;
export type CorrectionEntity = (typeof CORRECTION_ENTITIES)[number];
