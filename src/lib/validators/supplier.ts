import { z } from "zod";

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

export const supplierSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  contact_person: optionalText,
  contact_no: optionalText,
  email: optionalEmail,
  address: optionalText,
  payment_terms: optionalText,
  notes: optionalText,
  is_active: z.coerce.boolean().default(true),
});

export type SupplierInput = z.infer<typeof supplierSchema>;

export const supplierUpdateSchema = supplierSchema.extend({
  id: z.string().uuid(),
});

export type SupplierUpdateInput = z.infer<typeof supplierUpdateSchema>;
