import { z } from "zod";

export type CustomerActionState = {
  ok: boolean;
  error?: string;
  customerId?: string;
};

export const initialCustomerState: CustomerActionState = { ok: false };

export type VisitActionState = {
  ok: boolean;
  error?: string;
  warning?: string;
};

export const initialVisitState: VisitActionState = { ok: false };

// Converts a possibly-empty form string into trimmed text or null.
function toOptionalText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

const optionalText = z.preprocess(toOptionalText, z.string().nullable());

const optionalEmail = z.preprocess(
  toOptionalText,
  z.string().email().nullable(),
);

const optionalDate = z.preprocess(toOptionalText, z.string().nullable());

const requiredUuid = z.preprocess(
  toOptionalText,
  z.string({ required_error: "Required" }).uuid({ message: "Required" }),
);

const requiredDate = z.preprocess(
  toOptionalText,
  z.string({ required_error: "Required" }).min(1, "Required"),
);

const booleanFromFormString = z.preprocess((value: unknown) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.trim().toLowerCase() === "true";
  return value === "on";
}, z.boolean());

export const customerSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  mobile_no: optionalText,
  email: optionalEmail,
  address: optionalText,
  date_of_birth: optionalDate,
});
export type CustomerInput = z.infer<typeof customerSchema>;

export const customerUpdateSchema = customerSchema.extend({
  id: z.string().uuid(),
});
export type CustomerUpdateInput = z.infer<typeof customerUpdateSchema>;

export const VISIT_PURPOSES = [
  "Consultation",
  "Hearing Test",
  "Fitting",
  "Follow-up",
  "Repair Drop-off",
  "Pickup",
  "Other",
] as const;
export type VisitPurpose = (typeof VISIT_PURPOSES)[number];

export const logVisitSchema = z.object({
  customer_id: requiredUuid,
  visit_date: requiredDate,
  purpose: optionalText,
  purchased_during_visit: booleanFromFormString,
  remarks: optionalText,
});
export type LogVisitInput = z.infer<typeof logVisitSchema>;
