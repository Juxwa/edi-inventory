import { readCsv, clean, toNum, parseBubbleDate, writeExceptions,
         serviceClient, batchUpsert, fetchAll, Exception } from './lib';

type Row = Record<string, string>;

const STATUS_MAP: Record<string, string> = {
  'Pending': 'pending',
  'In Progress': 'in_progress',
  'For Replacement': 'for_replacement',
  'Completed': 'completed',
};

// Header status -> first synthetic repair_status_events.status for legacy rows.
const EVENT_STATUS_MAP: Record<string, string> = {
  pending: 'received',
  in_progress: 'in_repair',
  for_replacement: 'in_repair',
  completed: 'returned',
};

export function mapRepair(
  row: Row, n: number, branches: Map<string, string>,
): { record: object } | { exception: Exception } {
  const sar_no = clean(row['SAR No.']);
  if (!sar_no) return { exception:
    { row: n, reason: 'missing SAR No.', data: JSON.stringify(row) } };

  const branchName = clean(row['Requesting Branch']);
  let requesting_branch_id: string | null = null;
  if (branchName) {
    const id = branches.get(branchName);
    if (!id) return { exception:
      { row: n, reason: `unknown branch: ${row['Requesting Branch']}`, data: JSON.stringify(row) } };
    requesting_branch_id = id;
  }

  const manual_serial = clean(row['Serial No.']);
  if (!manual_serial) return { exception:
    { row: n, reason: 'no serial', data: JSON.stringify(row) } };

  const statusRaw = clean(row['Status']);
  const status = statusRaw ? STATUS_MAP[statusRaw] : undefined;
  if (!status) return { exception:
    { row: n, reason: `unknown status: ${row['Status']}`, data: JSON.stringify(row) } };

  return { record: {
    legacy_id: clean(row['unique id']),
    sar_no,
    requesting_branch_id,
    manual_serial,
    status,
    downpayment: toNum(row['Downpayment']),
    request_date: parseBubbleDate(row['RequestDate']) ?? parseBubbleDate(row['Creation Date']),
    returned_to_customer_at: parseBubbleDate(row['Returned to Customer']),
    issue_description: clean(row['Issue Description']),
    remarks: clean(row['Remarks']),
  }};
}

export async function importRepairs(file: string) {
  const client = serviceClient();
  const rows = readCsv(file);
  const branches = new Map(
    ((await fetchAll(client, 'branches', 'id,name')) as { id: string; name: string }[]).map((r: { id: string; name: string }) => [r.name, r.id]));

  const records: { sar_no: string }[] = []; const exceptions: Exception[] = [];
  const seenSar = new Set<string>();
  rows.forEach((row: Row, i: number) => {
    const r = mapRepair(row, i + 2, branches);
    if ('exception' in r) { exceptions.push(r.exception); return; }
    const rec = r.record as { sar_no: string };
    if (seenSar.has(rec.sar_no)) {
      exceptions.push({ row: i + 2,
        reason: `duplicate SAR No. (first occurrence kept): ${rec.sar_no}`,
        data: JSON.stringify(row) });
      return;
    }
    seenSar.add(rec.sar_no);
    records.push(rec);
  });
  await batchUpsert(client, 'repair_requests', records);
  writeExceptions('repairs', exceptions);
  console.log(`repairs: imported ${records.length}/${rows.length}`);

  // Legacy repairs carry no status_events history. Seed one synthetic event
  // per imported repair that has none yet, so the detail/portal timeline is
  // never empty. Idempotent: repairs that already have an event are skipped.
  const imported = (await fetchAll(
    client, 'repair_requests', 'id,status,legacy_id',
  )) as { id: string; status: string; legacy_id: string | null }[];
  const withLegacy = imported.filter((r) => r.legacy_id !== null);

  const existingEvents = (await fetchAll(
    client, 'repair_status_events', 'repair_id',
  )) as { repair_id: string }[];
  const haveEvents = new Set(existingEvents.map((e) => e.repair_id));

  const toInsert = withLegacy
    .filter((r) => !haveEvents.has(r.id))
    .map((r) => ({
      repair_id: r.id,
      status: EVENT_STATUS_MAP[r.status] ?? 'received',
      note: 'Imported from previous system',
      is_public: true,
    }));

  for (let i = 0; i < toInsert.length; i += 500) {
    const { error } = await client.from('repair_status_events').insert(toInsert.slice(i, i + 500));
    if (error) throw new Error(`repair_status_events batch ${i}: ${error.message}`);
  }
  console.log(`repairs: seeded ${toInsert.length} synthetic status events`);
}
