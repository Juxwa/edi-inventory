// Turns free text typed into a search box into a safe ILIKE "contains"
// pattern for supabase-js `.ilike(column, pattern)`.
//
// - `%` and `_` are LIKE wildcards: escaped so they match literally (a serial
//   such as "AB_12" must not match "ABX12").
// - `*` is PostgREST's alias for `%` and cannot be escaped: removed.
// - `\` is the LIKE escape character itself: escaped first.
//
// Returns null when nothing searchable is left, so callers can skip the
// search instead of matching every row.
export function containsPattern(input: string | null | undefined): string | null {
  const term = (input ?? "").replace(/\*/g, "").trim();
  if (term.length === 0) return null;
  const escaped = term.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
  return `%${escaped}%`;
}
