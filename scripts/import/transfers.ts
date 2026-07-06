import { readCsv, clean, parseBubbleDate, writeExceptions,
         serviceClient, batchUpsert, fetchAll, Exception } from './lib';

type Row = Record<string, string>;

export const CONF_MAP: Record<string, string> = {
  'Confirmed': 'confirmed', 'In Transit': 'in_transit', 'Pending': 'draft',
};

export function mapTransfer(
  row: Row, n: number, branches: Map<string, string>,
): { record: object } | { exception: Exception } {
  const from_branch_id = branches.get(clean(row['FromLocation']) ?? '');
  const to_branch_id = branches.get(clean(row['ToLocation']) ?? '');
  if (!from_branch_id || !to_branch_id) return { exception:
    { row: n, reason: `unknown branch: ${row['FromLocation']} -> ${row['ToLocation']}`,
      data: JSON.stringify(row) } };
  const code = clean(row['TransferCode']);
  if (!code) return { exception:
    { row: n, reason: 'missing transfer code', data: JSON.stringify(row) } };
  const status = CONF_MAP[clean(row['ConfirmationStatus']) ?? ''] ?? 'draft';
  return { record: {
    legacy_id: clean(row['unique id']),
    code, from_branch_id, to_branch_id, status,
    transfer_date: parseBubbleDate(row['TransferDate']),
    received_date: parseBubbleDate(row['Received Date']),
    sis_no: clean(row['SIS No.']),
    courier: null, tracking_code: null,
  }};
}

export async function importTransfers(file: string) {
  const client = serviceClient();
  const rows = readCsv(file);
  const branches = new Map((await fetchAll(client, 'branches', 'id,name')).map(r => [r.name, r.id]));
  const records: object[] = []; const exceptions: Exception[] = [];
  rows.forEach((row, i) => {
    const r = mapTransfer(row, i + 2, branches);
    'record' in r ? records.push(r.record) : exceptions.push(r.exception);
  });
  await batchUpsert(client, 'transfers', records);
  writeExceptions('transfers', exceptions);
  console.log(`transfers: imported ${records.length}/${rows.length}`);
}
