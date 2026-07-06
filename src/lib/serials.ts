// Parses a "one serial per line" textarea value into a clean, ordered,
// deduplicated list of serial numbers.
export function parseSerials(text: string): string[] {
  const lines = text.split(/\r?\n/);
  const seen = new Set<string>();
  const result: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }

  return result;
}
