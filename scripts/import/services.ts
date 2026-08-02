import { readCsv, clean, writeExceptions,
         serviceClient, batchUpsert, fetchAll, Exception } from './lib';

type Row = Record<string, string>;

// This export has no "unique id" column (Bubble's Service data type carries
// no legacy id here) — services never get a legacy_id from any import path.
// service-pricing.ts already stub-creates any service name it sees via
// upsert(onConflict: 'name'), also with no legacy_id. This importer matches
// that scheme: dedupe purely by name (case-insensitively against what's
// already in the DB, to avoid creating a case-variant duplicate row against
// the real `name` unique constraint), and upsert on 'name' too.

export type ExistingService = { id: string; name: string };

export function mapService(
  row: Row, n: number,
  seenLower: Set<string>, existingByLower: Map<string, ExistingService>,
): { record: object } | { exception: Exception } {
  const name = clean(row['Service Name']);
  if (!name) return { exception:
    { row: n, reason: 'missing service name', data: JSON.stringify(row) } };

  const lower = name.toLowerCase();
  if (seenLower.has(lower)) return { exception:
    { row: n, reason: `duplicate service name (first occurrence kept): ${name}`,
      data: JSON.stringify(row) } };
  seenLower.add(lower);

  // If a service with this name (any case) already exists — e.g. stub-created
  // by service-pricing.ts — upsert onto its exact existing name so we update
  // that row instead of colliding with the case-sensitive unique constraint.
  const existing = existingByLower.get(lower);
  const canonicalName = existing ? existing.name : name;

  return { record: {
    name: canonicalName,
    description: clean(row['Description']),
    is_stub: false,
  }};
}

export async function importServices(file: string) {
  const client = serviceClient();
  const rows = readCsv(file);

  const existing = (await fetchAll(client, 'services', 'id,name')) as ExistingService[];
  const existingByLower = new Map(existing.map((s) => [s.name.toLowerCase(), s]));

  const records: object[] = []; const exceptions: Exception[] = [];
  const seenLower = new Set<string>();
  rows.forEach((row: Row, i: number) => {
    const r = mapService(row, i + 2, seenLower, existingByLower);
    'record' in r ? records.push(r.record) : exceptions.push(r.exception);
  });
  await batchUpsert(client, 'services', records, 'name');
  writeExceptions('services', exceptions);
  console.log(`services: imported ${records.length}/${rows.length}`);
}
