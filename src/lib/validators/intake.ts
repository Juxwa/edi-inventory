import { z } from "zod";
import { parseSerials } from "@/lib/serials";

export type IntakeActionState = {
  ok: boolean;
  error?: string;
  count?: number;
};

export const initialIntakeState: IntakeActionState = { ok: false };

// Converts a possibly-empty form string into trimmed text or null.
function toOptionalText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

const optionalText = z.preprocess(toOptionalText, z.string().nullable());

const requiredUuid = z.preprocess(toOptionalText, z.string().uuid({
  message: "Required",
}));

const optionalDate = z.preprocess(toOptionalText, z.string().nullable());

const requiredDate = z.preprocess(
  toOptionalText,
  z.string({ required_error: "Required", invalid_type_error: "Required" }),
);

const nonNegativeCost = z.preprocess((value: unknown) => {
  const text = toOptionalText(value);
  if (text === null) return null;
  const parsed = Number.parseFloat(text);
  return Number.isNaN(parsed) ? text : parsed;
}, z.number().nonnegative("Cost must be zero or greater"));

const serialsArray = z.preprocess((value: unknown) => {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") return parseSerials(value);
  return [];
}, z.array(z.string().trim().min(1)));

const positiveQuantity = z.preprocess((value: unknown) => {
  const text = toOptionalText(value);
  if (text === null) return null;
  const parsed = Number.parseFloat(text);
  return Number.isNaN(parsed) ? text : parsed;
}, z.number().positive("Quantity must be greater than zero").nullable());

const baseIntakeSchema = z.object({
  product_id: requiredUuid,
  branch_id: requiredUuid,
  supplier_id: requiredUuid,
  has_serial: z.coerce.boolean(),
  serials_text: z.string().optional().default(""),
  quantity: positiveQuantity,
  cost_per_unit: nonNegativeCost,
  invoice_no: optionalText,
  invoice_date: requiredDate,
  expiry_date: optionalDate,
  repair_pool: z.coerce.boolean().default(false),
  office_asset: z.coerce.boolean().default(false),
});

export type IntakeFormInput = z.input<typeof baseIntakeSchema>;

export const intakeSchema = baseIntakeSchema.transform((data, ctx) => {
  if (data.has_serial) {
    const serials = serialsArray.parse(data.serials_text);
    if (serials.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Enter at least one serial number",
        path: ["serials_text"],
      });
      return z.NEVER;
    }
    return {
      product_id: data.product_id,
      branch_id: data.branch_id,
      supplier_id: data.supplier_id,
      serials,
      quantity: null,
      cost_per_unit: data.cost_per_unit,
      invoice_no: data.invoice_no,
      invoice_date: data.invoice_date,
      expiry_date: data.expiry_date,
      repair_pool: data.repair_pool,
      office_asset: data.office_asset,
    };
  }

  if (data.quantity == null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Quantity is required",
      path: ["quantity"],
    });
    return z.NEVER;
  }

  return {
    product_id: data.product_id,
    branch_id: data.branch_id,
    supplier_id: data.supplier_id,
    serials: null,
    quantity: data.quantity,
    cost_per_unit: data.cost_per_unit,
    invoice_no: data.invoice_no,
    invoice_date: data.invoice_date,
    expiry_date: data.expiry_date,
    repair_pool: data.repair_pool,
    office_asset: data.office_asset,
  };
});

export type IntakeInput = z.infer<typeof intakeSchema>;
