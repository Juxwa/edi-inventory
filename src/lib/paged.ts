import "server-only";

export const PAGE_SIZE = 1000;
export const ID_CHUNK = 150;

export function chunkIds<T>(items: T[], size: number = ID_CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

// Fetches every page of a query. buildQuery must apply ALL filters and a
// DETERMINISTIC order (include a unique tiebreaker column), then the caller's
// range is applied per page.
export async function fetchAllPages<T>(
  buildQuery: (from: number, to: number) => PromiseLike<{ data: unknown }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data } = await buildQuery(from, from + PAGE_SIZE - 1);
    const page = (data as T[] | null) ?? [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
}
