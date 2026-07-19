import { z } from "zod";

export const chatMessageSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, "Message cannot be empty.")
    .max(2000, "Message is too long (2000 characters max)."),
});

export type ChatMessageInput = z.infer<typeof chatMessageSchema>;
