import { z } from "zod";

export type SaleActionState = {
  ok: boolean;
  error?: string;
  saleId?: string;
};

export const initialSaleState: SaleActionState = { ok: false };

export type ReturnActionState = {
  ok: boolean;
  error?: string;
};

export const initialReturnState: ReturnActionState = { ok: false };

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

const optionalUuid = z.preprocess(
  toOptionalText,
  z.string().uuid().nullable(),
);

const requiredText = z.preprocess(
  toOptionalText,
  z.string({ required_error: "Required" }).min(1, "Required"),
);

const requiredDate = z.preprocess(
  toOptionalText,
  z.string({ required_error: "Required" }).min(1, "Required"),
);

const optionalDate = z.preprocess(toOptionalText, z.string().nullable());

const nonNegativeNumber = z.preprocess((value: unknown) => {
  const text = toOptionalText(value);
  if (text === null) return null;
  const parsed = Number.parseFloat(text);
  return Number.isNaN(parsed) ? text : parsed;
}, z.number().min(0, "Must be zero or greater"));

const positiveQuantity = z.preprocess((value: unknown) => {
  const text = toOptionalText(value);
  if (text === null) return null;
  const parsed = Number.parseFloat(text);
  return Number.isNaN(parsed) ? text : parsed;
}, z.number().positive("Quantity must be greater than zero"));

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

export const LINE_TYPES = ["stock", "service"] as const;
export type LineType = (typeof LINE_TYPES)[number];

const saleLineSchema = z
  .object({
    line_type: z.enum(LINE_TYPES),
    stock_id: z.string().uuid().nullable().optional(),
    service_id: z.string().uuid().nullable().optional(),
    quantity: z.number().positive("Quantity must be greater than zero"),
    unit_price: z.number().min(0, "Price must be zero or greater"),
    warranty_expiry: z.string().nullable().optional(),
  })
  .superRefine((line, ctx) => {
    if (line.line_type === "stock" && !line.stock_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Stock line requires a stock item",
        path: ["stock_id"],
      });
    }
    if (line.line_type === "service" && !line.service_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Service line requires a service",
        path: ["service_id"],
      });
    }
  });
export type SaleLineInput = z.infer<typeof saleLineSchema>;

// Lines arrive from the client as a JSON string (one hidden form field)
// since the dynamic add/remove line builder doesn't map cleanly onto
// repeated FormData keys without extra client bookkeeping.
function parseLinesJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export const recordSaleSchema = z.object({
  branch_id: requiredUuid,
  customer_id: optionalUuid,
  new_customer_name: optionalText,
  new_customer_mobile: optionalText,
  new_customer_email: optionalText,
  sale_date: requiredDate,
  or_no: optionalText,
  csi_no: optionalText,
  ci_no: optionalText,
  referred_by: optionalText,
  discount: nonNegativeNumber,
  vat_amount: optionalNonNegativeNumber,
  is_paid: booleanFromFormString,
  lines: z.preprocess(
    parseLinesJson,
    z.array(saleLineSchema).min(1, "Add at least one line"),
  ),
});
export type RecordSaleInput = z.infer<typeof recordSaleSchema>;

export const returnSaleLineSchema = z.object({
  line_id: requiredUuid,
  sale_id: requiredUuid,
  quantity: positiveQuantity,
  note: optionalText,
});
export type ReturnSaleLineInput = z.infer<typeof returnSaleLineSchema>;

export const AFTER_SALES_STATUSES = [
  "sold",
  "for_repair",
  "replaced",
  "in_use",
  "returned",
  "partially_returned",
] as const;
export type AfterSalesStatus = (typeof AFTER_SALES_STATUSES)[number];

export { requiredText, optionalDate };
