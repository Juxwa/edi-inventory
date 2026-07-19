import { readCsv, clean, writeExceptions,
         serviceClient, batchUpsert, fetchAll, Exception } from './lib';

type Row = Record<string, string>;

const STATUS_MAP: Record<string, string> = {
  'Pending': 'pending',
  'Processing': 'processing',
  'Served': 'served',
};

function mapSide(v: string | undefined): 'left' | 'right' | 'both' | null {
  const t = (v ?? '').trim().toLowerCase();
  if (t === 'left') return 'left';
  if (t === 'right') return 'right';
  if (t === 'both') return 'both';
  return null;
}

export function mapEarmold(
  row: Row, n: number, branches: Map<string, string>,
): { record: object } | { exception: Exception } {
  const patient_name = clean(row['Patient Name']);
  if (!patient_name) return { exception:
    { row: n, reason: 'missing patient name', data: JSON.stringify(row) } };

  const branchName = clean(row['Requesting Branch']);
  let requesting_branch_id: string | null = null;
  if (branchName) {
    const id = branches.get(branchName);
    if (!id) return { exception:
      { row: n, reason: `unknown branch: ${row['Requesting Branch']}`, data: JSON.stringify(row) } };
    requesting_branch_id = id;
  }

  const statusRaw = clean(row['Status']);
  const status = (statusRaw && STATUS_MAP[statusRaw]) || 'pending';

  return { record: {
    legacy_id: clean(row['unique id']),
    patient_name,
    contact_no: clean(row['Contact No']),
    address: clean(row['Address']),
    hearing_aid_model: clean(row['Hearing Aid Model']),
    side: mapSide(row['L/R']),
    serial_no: clean(row['Serial No.']),
    remarks: clean(row['Remarks']),
    requesting_branch_id,
    status,
  }};
}

export async function importEarmolds(file: string) {
  const client = serviceClient();
  const rows = readCsv(file);
  const branches = new Map(
    ((await fetchAll(client, 'branches', 'id,name')) as { id: string; name: string }[]).map((r: { id: string; name: string }) => [r.name, r.id]));

  const records: object[] = []; const exceptions: Exception[] = [];
  rows.forEach((row: Row, i: number) => {
    const r = mapEarmold(row, i + 2, branches);
    'record' in r ? records.push(r.record) : exceptions.push(r.exception);
  });
  await batchUpsert(client, 'earmold_requests', records);
  writeExceptions('earmolds', exceptions);
  console.log(`earmolds: imported ${records.length}/${rows.length}`);
}
