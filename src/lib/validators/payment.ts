import { z } from "zod";

// Partial payments on sales (downpayment + final payment, or any number of
// installments). Amount limits are re-checked server-side in the
// sale_add_payment RPC against the sale's remaining balance.
export const addSalePaymentSchema = z.object({
  sale_id: z.string().uuid("Invalid sale"),
  amount: z.coerce.number().positive("Amount must be greater than zero"),
  payment_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  or_no: z.string().trim().max(100, "OR number is too long").optional(),
  method: z.string().trim().max(100, "Method is too long").optional(),
  note: z.string().trim().max(1000, "Note is too long").optional(),
});
export type AddSalePaymentInput = z.infer<typeof addSalePaymentSchema>;

export const deleteSalePaymentSchema = z.object({
  payment_id: z.string().uuid("Invalid payment"),
  sale_id: z.string().uuid("Invalid sale"),
});
export type DeleteSalePaymentInput = z.infer<typeof deleteSalePaymentSchema>;
