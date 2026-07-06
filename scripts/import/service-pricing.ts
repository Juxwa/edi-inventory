import { readCsv, clean, toNum, writeExceptions,
         serviceClient, batchUpsert, fetchAll, Exception } from './lib';

type Row = Record<string, string>;

export function mapPricing(
  row: Row, n: number,
  branches: Map<string, string>, services: Map<string, string>,
): { record: object } | { exception: Exception } {
  const branch_id = branches.get(clean(row['Branch']) ?? '');
  const service_id = services.get(clean(row['Service']) ?? '');
  const price = toNum(row['Price']);
  if (!branch_id) return { exception:
    { row: n, reason: `unknown branch: ${row['Branch']}`, data: JSON.stringify(row) } };
  if (!service_id) return { exception:
    { row: n, reason: `unknown service: ${row['Service']}`, data: JSON.stringify(row) } };
  if (price === null) return { exception:
    { row: n, reason: 'missing price', data: JSON.stringify(row) } };
  return { record: { legacy_id: clean(row['unique id']), branch_id, service_id, price } };
}

export async function importServicePricing(file: string) {
  const client = serviceClient();
  const rows = readCsv(file);

  const serviceNames = [...new Set(rows.map(r => clean(r['Service'])).filter(Boolean))];
  await batchUpsert(client, 'services',
    serviceNames.map(name => ({ name, is_stub: true })), 'name');

  const branches = new Map((await fetchAll(client, 'branches', 'id,name')).map(r => [r.name, r.id]));
  const services = new Map((await fetchAll(client, 'services', 'id,name')).map(r => [r.name, r.id]));

  const records: object[] = []; const exceptions: Exception[] = [];
  rows.forEach((row, i) => {
    const r = mapPricing(row, i + 2, branches, services);
    'record' in r ? records.push(r.record) : exceptions.push(r.exception);
  });
  await batchUpsert(client, 'service_pricing', records);
  writeExceptions('service_pricing', exceptions);
  console.log(`service_pricing: imported ${records.length}/${rows.length}`);
}
