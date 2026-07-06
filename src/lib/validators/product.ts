import { z } from "zod";

// Converts a possibly-empty form string into trimmed text or null.
function toOptionalText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

const optionalText = z.preprocess(toOptionalText, z.string().nullable());

const optionalCategoryId = z.preprocess((value: unknown) => {
  const text = toOptionalText(value);
  if (text === null) return null;
  const parsed = Number.parseInt(text, 10);
  return Number.isNaN(parsed) ? text : parsed;
}, z.number().int().positive().nullable());

const optionalUuid = z.preprocess(
  toOptionalText,
  z.string().uuid().nullable(),
);

const optionalSrp = z.preprocess((value: unknown) => {
  const text = toOptionalText(value);
  if (text === null) return null;
  const parsed = Number.parseFloat(text);
  return Number.isNaN(parsed) ? text : parsed;
}, z.number().nonnegative().nullable());

export const productSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  code: optionalText,
  category_id: optionalCategoryId,
  supplier_id: optionalUuid,
  srp: optionalSrp,
  has_serial: z.coerce.boolean().default(false),
  description: optionalText,
  notes: optionalText,
  is_active: z.coerce.boolean().default(true),
});

export type ProductInput = z.infer<typeof productSchema>;

export const productUpdateSchema = productSchema.extend({
  id: z.string().uuid(),
});

export type ProductUpdateInput = z.infer<typeof productUpdateSchema>;
