import { z } from "zod";

export type HearingTestActionState = {
  ok: boolean;
  error?: string;
};

export const initialHearingTestState: HearingTestActionState = { ok: false };

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

// "" (no sale picked / unlink) parses to null; a real value must be a uuid.
const optionalUuid = z.preprocess(toOptionalText, z.string().uuid().nullable());

export const reviewHearingTestSchema = z.object({
  visit_id: requiredUuid,
  review_notes: optionalText,
});
export type ReviewHearingTestInput = z.infer<typeof reviewHearingTestSchema>;

export const linkVisitSaleSchema = z.object({
  visit_id: requiredUuid,
  sale_id: optionalUuid,
});
export type LinkVisitSaleInput = z.infer<typeof linkVisitSaleSchema>;
