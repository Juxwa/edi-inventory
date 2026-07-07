import { readCsv, clean, parseBubbleDate, writeExceptions,
         serviceClient, batchUpsert, fetchAll, Exception } from './lib';

type Row = Record<string, string>;

export function mapCustomer(
  row: Row, n: number, branches: Map<string, string>,
): { record: object } | { exception: Exception } {
  const name = clean(row['Name']);
  if (!name) return { exception:
    { row: n, reason: 'missing name', data: JSON.stringify(row) } };

  const branchName = clean(row['Branch Created']);
  let branch_created_id: string | null = null;
  if (branchName) {
    const id = branches.get(branchName);
    if (!id) return { exception:
      { row: n, reason: `unknown branch: ${row['Branch Created']}`, data: JSON.stringify(row) } };
    branch_created_id = id;
  }

  return { record: {
    legacy_id: clean(row['unique id']),
    name,
    address: clean(row['Address']),
    branch_created_id,
    date_of_birth: parseBubbleDate(row['Date of Birth']),
    email: clean(row['Email']),
    mobile_no: clean(row['Mobile No.']),
  }};
}

export async function importCustomers(file: string) {
  const client = serviceClient();
  const rows = readCsv(file);
  const branches = new Map(
    ((await fetchAll(client, 'branches', 'id,name')) as { id: string; name: string }[]).map((r: { id: string; name: string }) => [r.name, r.id]));

  const records: object[] = []; const exceptions: Exception[] = [];
  rows.forEach((row: Row, i: number) => {
    const r = mapCustomer(row, i + 2, branches);
    'record' in r ? records.push(r.record) : exceptions.push(r.exception);
  });
  await batchUpsert(client, 'customers', records);
  writeExceptions('customers', exceptions);
  console.log(`customers: imported ${records.length}/${rows.length}`);
}
