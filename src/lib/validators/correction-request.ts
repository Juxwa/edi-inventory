import { z } from "zod";

// Void / return requests (correction_requests, migration 0062): a branch
// files a request with a reason, head office approves or rejects it.

export type RequestActionState = {
  ok: boolean;
  error?: string;
};

export const initialRequestState: RequestActionState = { ok: false };

export const REQUEST_KINDS = ["sale_void", "sale_return_line"] as const;
export type RequestKind = (typeof REQUEST_KINDS)[number];

export const REQUEST_STATUSES = ["pending", "approved", "rejected", "cancelled"] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const REQUEST_KIND_LABEL: Record<RequestKind, string> = {
  sale_void: "Void sale",
  sale_return_line: "Return line",
};

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

export const requestSaleVoidSchema = z.object({
  sale_id: requiredUuid,
  reason: requiredReason,
});

export const requestSaleReturnSchema = z.object({
  sale_id: requiredUuid,
  line_id: requiredUuid,
  quantity: z.preprocess((value: unknown) => {
    const text = toOptionalText(value);
    return text === null ? null : Number.parseFloat(text);
  }, z.number({ invalid_type_error: "Enter a quantity." }).positive("Quantity must be greater than zero")),
  reason: requiredReason,
});

export const decideRequestSchema = z
  .object({
    request_id: requiredUuid,
    decision: z.enum(["approve", "reject"], {
      errorMap: () => ({ message: "Choose approve or reject." }),
    }),
    note: z.preprocess(toOptionalText, z.string().nullable()),
  })
  .superRefine((data, ctx) => {
    if (data.decision === "reject" && !data.note) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A note is required to reject a request.",
        path: ["note"],
      });
    }
  });

export const cancelRequestSchema = z.object({
  request_id: requiredUuid,
});

// Shape written by correction_request_create into correction_requests.snapshot.
export type RequestSnapshotLine = {
  id: string;
  item: string;
  line_type: "stock" | "service";
  serial: string | null;
  quantity: number;
  returned_quantity: number;
  unit_price: number;
};

export type RequestSnapshot = {
  sale_date: string | null;
  or_no: string | null;
  csi_no: string | null;
  ci_no: string | null;
  customer_id: string | null;
  branch: string | null;
  discount: number | null;
  gross: number | null;
  lines: RequestSnapshotLine[];
};
