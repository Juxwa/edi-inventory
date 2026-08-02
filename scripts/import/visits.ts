import { mkdirSync, writeFileSync } from 'node:fs';
import { readCsv, clean, toBool, parseBubbleDate, writeExceptions,
         serviceClient, batchUpsert, fetchAll, Exception } from './lib';

type Row = Record<string, string>;

export type FileRef = { visit_legacy_id: string; url: string; kind: string };

type CustomerRow = { id: string; name: string; created_at: string };

// Same "first by created_at wins" technique as sales.ts's firstByCreatedAt,
// so a duplicate customer name resolves to the same customer across importers.
function firstByCreatedAt(rows: CustomerRow[]): Map<string, string> {
  const sorted = [...rows].sort((a: CustomerRow, b: CustomerRow) =>
    a.created_at.localeCompare(b.created_at));
  const map = new Map<string, string>();
  for (const r of sorted) {
    if (!map.has(r.name)) map.set(r.name, r.id);
  }
  return map;
}

// Bubble file URLs in this export are protocol-relative ("//s3.amazonaws...");
// prepend https: so they're directly fetchable by migrate-visit-files.ts.
function normalizeFileUrl(u: string): string {
  return u.startsWith('//') ? `https:${u}` : u;
}

export function mapVisit(
  row: Row, n: number, customers: Map<string, string>,
): { record: object; files: FileRef[] } | { exception: Exception } {
  const name = clean(row['Customer/Patient']);
  if (!name) return { exception:
    { row: n, reason: 'missing customer/patient name', data: JSON.stringify(row) } };

  const customer_id = customers.get(name);
  if (!customer_id) return { exception:
    { row: n, reason: `unknown customer: ${name}`, data: JSON.stringify(row) } };

  const visit_date = parseBubbleDate(row['Date of Visit']);
  if (!visit_date) return { exception:
    { row: n, reason: 'missing/unparseable Date of Visit', data: JSON.stringify(row) } };

  const legacy_id = clean(row['unique id']);

  // File columns aren't stored on the visits row directly (no migration for
  // that here) — collected separately for migrate-visit-files.ts to
  // download/upload after the main import.
  const files: FileRef[] = [];
  if (legacy_id) {
    const testResultFile = clean(row['Test Result File']);
    const testResults = clean(row['Test Results']);
    if (testResultFile) files.push(
      { visit_legacy_id: legacy_id, url: normalizeFileUrl(testResultFile), kind: 'test_result_file' });
    if (testResults) files.push(
      { visit_legacy_id: legacy_id, url: normalizeFileUrl(testResults), kind: 'test_results' });
  }

  return {
    record: {
      legacy_id,
      customer_id,
      visit_date,
      purpose: clean(row['Purpose of Visit']),
      purchased_during_visit: toBool(row['PurchaseDuringVisit']),
      remarks: clean(row['Remarks']),
      branch_id: null,
      logged_by: null,
    },
    files,
  };
}

export async function importVisits(file: string) {
  const client = serviceClient();
  const rows = readCsv(file);
  const customers = firstByCreatedAt(
    (await fetchAll(client, 'customers', 'id,name,created_at')) as CustomerRow[]);

  const records: object[] = []; const exceptions: Exception[] = [];
  const allFiles: FileRef[] = [];
  rows.forEach((row: Row, i: number) => {
    const r = mapVisit(row, i + 2, customers);
    if ('exception' in r) { exceptions.push(r.exception); return; }
    records.push(r.record);
    allFiles.push(...r.files);
  });
  await batchUpsert(client, 'visits', records);
  writeExceptions('visits', exceptions);
  console.log(`visits: imported ${records.length}/${rows.length}`);

  mkdirSync('data/import-reports', { recursive: true });
  const reportPath = 'data/import-reports/visit-files-to-migrate.csv';
  const lines = ['visit_legacy_id,url,kind',
    ...allFiles.map((f) => `${f.visit_legacy_id},"${f.url.replace(/"/g, '""')}",${f.kind}`)];
  writeFileSync(reportPath, lines.join('\n'));
  console.log(`visits: ${allFiles.length} file URL(s) -> ${reportPath} `
    + `(run "npm run migrate-visit-files" manually after the import)`);
}
