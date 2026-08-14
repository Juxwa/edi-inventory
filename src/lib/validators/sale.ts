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

// Line values arrive either as form strings or, when the line list is parsed
// from its JSON hidden field, as real numbers — coerce both shapes.
function toNumberOrNull(value: unknown): unknown {
  if (typeof value === "number") return value;
  const text = toOptionalText(value);
  if (text === null) return null;
  const parsed = Number.parseFloat(text);
  return Number.isNaN(parsed) ? text : parsed;
}

const positiveQuantity = z.preprocess(
  toNumberOrNull,
  z.number().positive("Quantity must be greater than zero"),
);

const optionalNonNegativeNumber = z.preprocess(
  toNumberOrNull,
  z.number().min(0, "Must be zero or greater").nullable(),
);

const optionalPercent = z.preprocess(
  toNumberOrNull,
  z
    .number()
    .min(0, "Must be zero or greater")
    .max(100, "Must be 100 or less")
    .nullable(),
);

const booleanFromFormString = z.preprocess((value: unknown) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.trim().toLowerCase() === "true";
  return false;
}, z.boolean());

export const LINE_TYPES = ["stock", "service"] as const;
export type LineType = (typeof LINE_TYPES)[number];

// PH discount templates (RA 9994 Senior Citizen / RA 10754 PWD 20%
// VAT-exempt discount, plus free-form custom templates, plus "final_price"
// where the rep types the receipt's final sale price and discount is
// derived). "none" is the default — plain text on the DB side (not an enum)
// so future templates don't need a migration; validated here instead. Order
// matches the client-requested Select order (rule 2 of the money-entry
// rework): No discount / Final sale price / Discount amount / Discount % /
// Senior Citizen 20% / PWD 20%.
export const DISCOUNT_TYPES = [
  "none",
  "final_price",
  "custom_amount",
  "custom_percent",
  "senior_citizen",
  "pwd",
] as const;
export type DiscountType = (typeof DISCOUNT_TYPES)[number];

const discountTypeSchema = z.preprocess((value: unknown) => {
  const text = toOptionalText(value);
  return text ?? "none";
}, z.enum(DISCOUNT_TYPES, { errorMap: () => ({ message: "Invalid discount type" }) }));

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

export const recordSaleSchema = z
  .object({
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
    // Discount templates replace the old free-text discount + manual VAT
    // override: the server derives both the discount and VAT amounts from
    // gross (lines total) + this template selection — see recordSale in
    // actions.ts for the formulas. discount_percent/discount_amount are the
    // raw operator inputs for the two "custom" templates only.
    discount_type: discountTypeSchema,
    discount_id_no: optionalText,
    discount_percent: optionalPercent,
    discount_amount: optionalNonNegativeNumber,
    // Raw operator input for "final_price" mode — the receipt's final sale
    // price. Discount is derived server-side (gross - final); final > gross
    // is rejected in the action, not here (gross isn't known until lines are
    // summed there).
    final_price: optionalNonNegativeNumber,
    // Always auto-computed server-side when unchecked; this only carries the
    // "VAT-exempt sale" checkbox. SC/PWD forces it true server-side
    // regardless of what's submitted (the checkbox is locked+on in the UI).
    vat_exempt: booleanFromFormString,
    is_paid: booleanFromFormString,
    lines: z.preprocess(
      parseLinesJson,
      z.array(saleLineSchema).min(1, "Add at least one line"),
    ),
  })
  .superRefine((data, ctx) => {
    if (
      (data.discount_type === "senior_citizen" || data.discount_type === "pwd") &&
      !data.discount_id_no
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "ID number is required for Senior Citizen / PWD discount",
        path: ["discount_id_no"],
      });
    }
    if (data.discount_type === "custom_percent" && data.discount_percent === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Enter a discount percentage",
        path: ["discount_percent"],
      });
    }
    if (data.discount_type === "custom_amount" && data.discount_amount === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Enter a discount amount",
        path: ["discount_amount"],
      });
    }
    if (data.discount_type === "final_price" && data.final_price === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Enter the final sale price",
        path: ["final_price"],
      });
    }
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
