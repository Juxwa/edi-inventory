import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { parse } from 'csv-parse/sync';
import { createClient } from '@supabase/supabase-js';

const MONTHS: Record<string, string> = {
  jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',
  jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12',
};

export function parseBubbleDate(s: string | undefined): string | null {
  if (!s || !s.trim()) return null;
  const m = s.trim().match(/^([A-Za-z]{3})\w* (\d{1,2}), (\d{4})/);
  if (!m) return null;
  const mm = MONTHS[m[1].toLowerCase()];
  if (!mm) return null;
  return `${m[3]}-${mm}-${m[2].padStart(2, '0')}`;
}

export const toBool = (s?: string) => (s ?? '').trim().toLowerCase() === 'yes';
export const toNum = (s?: string) => {
  const t = (s ?? '').replace(/,/g, '').trim();
  return t === '' ? null : Number(t);
};
export const clean = (s?: string) => {
  const t = (s ?? '').trim();
  return t === '' ? null : t;
};

export function readCsv(path: string): Record<string, string>[] {
  return parse(readFileSync(path, 'utf-8'), {
    columns: true, bom: true, skip_empty_lines: true, relax_column_count: true,
  });
}

export type Exception = { row: number; reason: string; data: string };

export function writeExceptions(entity: string, exceptions: Exception[]) {
  mkdirSync('data/import-reports', { recursive: true });
  const path = `data/import-reports/${entity}-exceptions.csv`;
  const lines = ['row,reason,data',
    ...exceptions.map(e => `${e.row},"${e.reason}","${e.data.replace(/"/g, '""')}"`)];
  writeFileSync(path, lines.join('\n'));
  console.log(`${entity}: ${exceptions.length} exceptions -> ${path}`);
}

export function serviceClient() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } });
}

export async function fetchAll(
  client: ReturnType<typeof serviceClient>, table: string, columns: string,
): Promise<Record<string, any>[]> {
  const out: Record<string, any>[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await client.from(table).select(columns).range(from, from + 999);
    if (error) throw new Error(`${table} fetch: ${error.message}`);
    out.push(...data!);
    if (data!.length < 1000) break;
  }
  return out;
}

export async function batchUpsert(
  client: ReturnType<typeof serviceClient>,
  table: string, rows: object[], onConflict = 'legacy_id',
) {
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await client.from(table)
      .upsert(rows.slice(i, i + 500), { onConflict });
    if (error) throw new Error(`${table} batch ${i}: ${error.message}`);
  }
}
