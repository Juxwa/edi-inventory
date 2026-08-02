import { readCsv, clean, parseBubbleDate, writeExceptions,
         serviceClient, batchUpsert, fetchAll, Exception } from './lib';

type Row = Record<string, string>;

// NOTE: the "Requested Products" column in this Bubble export is a known
// export bug — it holds junk timestamps, not the actual requested line
// items (see Date Requested-shaped strings in that column instead of
// product/quantity data). Legacy request line items are unrecoverable;
// request_line_items is intentionally left empty for rows imported here.

export const STATUS_MAP: Record<string, string> = {
  'Pending': 'pending',
  'Processing': 'processing',
  'Served': 'served',
};

export function mapInventoryRequest(
  row: Row, n: number, branches: Map<string, string>,
): { record: object } | { exception: Exception } {
  const branchName = clean(row['Requesting Branch']);
  const requesting_branch_id = branchName ? branches.get(branchName) : undefined;
  if (!requesting_branch_id) return { exception:
    { row: n, reason: `unknown/missing requesting branch: ${row['Requesting Branch']}`,
      data: JSON.stringify(row) } };

  // requesting_branch_id is not-null in the schema; a blank/unrecognized
  // branch can't be satisfied and the row is skipped to exceptions above.

  const statusRaw = clean(row['Status']);
  // Blank status (1 row in this export) defaults to 'pending', matching the
  // column's own DB default; unrecognized non-blank values are exceptions.
  const status = statusRaw ? STATUS_MAP[statusRaw] : 'pending';
  if (!status) return { exception:
    { row: n, reason: `unknown status: ${row['Status']}`, data: JSON.stringify(row) } };

  const request_date = parseBubbleDate(row['Date Requested']) ?? parseBubbleDate(row['Creation Date']);
  if (!request_date) return { exception:
    { row: n, reason: 'no Date Requested or Creation Date', data: JSON.stringify(row) } };

  // requested_by (profiles FK) is nullable and always left null: legacy
  // requester profiles don't exist post-wipe. The requester's name is
  // preserved as text in notes instead.
  const requestedBy = clean(row['Requested By']);
  const noteParts: string[] = [];
  if (requestedBy) noteParts.push(`Requested By: ${requestedBy}`);
  const notesRaw = clean(row['Notes']);
  if (notesRaw) noteParts.push(notesRaw);

  return { record: {
    legacy_id: clean(row['unique id']),
    requesting_branch_id,
    requested_by: null,
    request_date,
    notes: noteParts.length > 0 ? noteParts.join('\n') : null,
    admin_notes: clean(row['Notes from Admin']),
    status,
  }};
}

export async function importInventoryRequests(file: string) {
  const client = serviceClient();
  const rows = readCsv(file);
  const branches = new Map(
    ((await fetchAll(client, 'branches', 'id,name')) as { id: string; name: string }[])
      .map((r: { id: string; name: string }) => [r.name, r.id]));

  const records: object[] = []; const exceptions: Exception[] = [];
  rows.forEach((row: Row, i: number) => {
    const r = mapInventoryRequest(row, i + 2, branches);
    'record' in r ? records.push(r.record) : exceptions.push(r.exception);
  });
  await batchUpsert(client, 'inventory_requests', records);
  writeExceptions('inventory-requests', exceptions);
  console.log(`inventory_requests: imported ${records.length}/${rows.length}`);
}
