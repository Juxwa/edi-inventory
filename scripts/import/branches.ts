import { readCsv, clean, writeExceptions, serviceClient, batchUpsert, Exception } from './lib';

type Row = Record<string, string>;

export function mapBranch(row: Row, n: number):
  { record: object } | { exception: Exception } {
  const name = clean(row['Branch Name']);
  const code = clean(row['Branch Code']);
  if (!name || !code) return { exception:
    { row: n, reason: 'missing name or code', data: JSON.stringify(row) } };
  return { record: {
    legacy_id: clean(row['unique id']),
    name, code,
    address: clean(row['Address']),
    email: clean(row['Email']),
    contact_no: clean(row['Contact No.']),
  }};
}

export async function importBranches(file: string) {
  const rows = readCsv(file);
  const records: object[] = []; const exceptions: Exception[] = [];
  rows.forEach((row, i) => {
    const r = mapBranch(row, i + 2);
    'record' in r ? records.push(r.record) : exceptions.push(r.exception);
  });
  await batchUpsert(serviceClient(), 'branches', records);
  writeExceptions('branches', exceptions);
  console.log(`branches: imported ${records.length}/${rows.length}`);
}
