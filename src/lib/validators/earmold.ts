import { z } from "zod";

export type EarmoldActionState = {
  ok: boolean;
  error?: string;
};

export const initialEarmoldState: EarmoldActionState = { ok: false };

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

export const EARMOLD_STATUSES = ["pending", "processing", "served"] as const;
export type EarmoldStatus = (typeof EARMOLD_STATUSES)[number];

export const EAR_SIDES = ["left", "right", "both"] as const;
export type EarSide = (typeof EAR_SIDES)[number];

export const earmoldSchema = z.object({
  branch_id: requiredUuid,
  patient_name: requiredText,
  contact_no: optionalText,
  address: optionalText,
  hearing_aid_model: optionalText,
  side: z.preprocess(toOptionalText, z.enum(EAR_SIDES).nullable()),
  serial_no: optionalText,
  remarks: optionalText,
});
export type EarmoldInput = z.infer<typeof earmoldSchema>;

export const advanceEarmoldSchema = z.object({
  earmold_id: requiredUuid,
  from_status: z.enum(EARMOLD_STATUSES),
  to_status: z.enum(EARMOLD_STATUSES),
});
export type AdvanceEarmoldInput = z.infer<typeof advanceEarmoldSchema>;
