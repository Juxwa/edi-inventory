import { z } from "zod";

// service_id/branch_id/price arrive as real values when called directly from
// a client component (not via FormData), but z.coerce keeps this tolerant of
// string inputs too (e.g. if ever wired through a <form> action instead).
export const setServicePriceSchema = z.object({
  service_id: z.string().uuid("Invalid service"),
  branch_id: z.string().uuid("Invalid branch"),
  price: z.coerce.number().min(0, "Price must be zero or greater"),
});
export type SetServicePriceInput = z.infer<typeof setServicePriceSchema>;

export const clearServicePriceSchema = z.object({
  service_id: z.string().uuid("Invalid service"),
  branch_id: z.string().uuid("Invalid branch"),
});
export type ClearServicePriceInput = z.infer<typeof clearServicePriceSchema>;
