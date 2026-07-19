import { z } from "zod";

export type RepairActionState = {
  ok: boolean;
  error?: string;
};

export const initialRepairState: RepairActionState = { ok: false };

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

const optionalUuid = z.preprocess(toOptionalText, z.string().uuid().nullable());

const requiredText = z.preprocess(
  toOptionalText,
  z.string({ required_error: "Required" }).min(1, "Required"),
);

const optionalNonNegativeNumber = z.preprocess((value: unknown) => {
  const text = toOptionalText(value);
  if (text === null) return null;
  const parsed = Number.parseFloat(text);
  return Number.isNaN(parsed) ? text : parsed;
}, z.number().min(0, "Must be zero or greater").nullable());

const booleanFromFormString = z.preprocess((value: unknown) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.trim().toLowerCase() === "true";
  return false;
}, z.boolean());

export const REPAIR_STATUSES = [
  "pending",
  "in_progress",
  "for_replacement",
  "completed",
] as const;
export type RepairStatus = (typeof REPAIR_STATUSES)[number];

export const REPAIR_EVENT_STATUSES = [
  "received",
  "assessed",
  "in_repair",
  "ready",
  "returned",
] as const;
export type RepairEventStatus = (typeof REPAIR_EVENT_STATUSES)[number];

export const repairIntakeSchema = z
  .object({
    sar_no: optionalText,
    branch_id: requiredUuid,
    customer_id: optionalUuid,
    contact_no: requiredText,
    sale_line_item_id: optionalUuid,
    manual_serial: optionalText,
    issue_description: optionalText,
    assigned_to: optionalUuid,
    downpayment: optionalNonNegativeNumber,
    initial_note: optionalText,
  })
  .superRefine((data, ctx) => {
    // Mirrors the repair_requests check constraint: sale line XOR manual serial.
    if (!data.sale_line_item_id && !data.manual_serial) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Link a sold item or enter the serial number manually.",
        path: ["manual_serial"],
      });
    }
    if (data.sale_line_item_id && data.manual_serial) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Use either a sold item or a manual serial, not both.",
        path: ["manual_serial"],
      });
    }
  });
export type RepairIntakeInput = z.infer<typeof repairIntakeSchema>;

export const addEventSchema = z.object({
  repair_id: requiredUuid,
  status: z.enum(REPAIR_EVENT_STATUSES),
  note: optionalText,
  is_public: booleanFromFormString,
});
export type AddEventInput = z.infer<typeof addEventSchema>;

export const updateRepairSchema = z.object({
  repair_id: requiredUuid,
  assigned_to: optionalUuid,
  downpayment: optionalNonNegativeNumber,
  remarks: optionalText,
  for_replacement: booleanFromFormString,
});
export type UpdateRepairInput = z.infer<typeof updateRepairSchema>;
