import { readCsv, clean, toNum, writeExceptions,
         serviceClient, batchUpsert, fetchAll, Exception } from './lib';

type Row = Record<string, string>;

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

// "Mar 30, 2026 8:18 am" -> epoch minutes (timezone-agnostic; only used
// relatively, to pair lines with transfer records created around the same time)
export function parseTsMinutes(s: string | undefined): number | null {
  const m = (s ?? '').trim()
    .match(/^([A-Za-z]{3})\w* (\d{1,2}), (\d{4})\s+(\d{1,2}):(\d{2})\s*(am|pm)/i);
  if (!m) return null;
  const mon = MONTHS[m[1].toLowerCase()];
  if (mon === undefined) return null;
  let h = Number(m[4]) % 12;
  if (m[6].toLowerCase() === 'pm') h += 12;
  return Date.UTC(Number(m[3]), mon, Number(m[2]), h, Number(m[5])) / 60000;
}

export const norm = (s: string | undefined) =>
  (s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

// The line items export has no transfer reference (TransferCode is empty in
// every row), so lines are matched to transfer records heuristically:
// same route + nearest creation time, capacity-bounded by the names in the
// header's TransferLineItems display list. Validated against the full export:
// ~88% of lines assign; the rest go to the exceptions report.
const WINDOW = 7 * 24 * 60;

type Header = {
  legacyId: string; from: string; to: string; ts: number;
  need: Map<string, number>;
};

export function buildHeaders(transferRows: Row[]): Header[] {
  const out: Header[] = [];
  for (const r of transferRows) {
    const ts = parseTsMinutes(r['Creation Date']);
    const legacyId = clean(r['unique id']);
    if (ts === null || !legacyId) continue;
    const need = new Map<string, number>();
    // Bubble's list separator is " , "; bare commas belong to product names.
    for (const it of (r['TransferLineItems'] ?? '').split(/ , /).map(norm).filter(Boolean)) {
      need.set(it, (need.get(it) ?? 0) + 1);
    }
    out.push({
      legacyId, ts, need,
      from: norm(r['FromLocation']), to: norm(r['ToLocation']),
    });
  }
  return out;
}

type Line = {
  row: number; name: string; ts: number; from: string; to: string;
  serial: string | null; quantity: number;
};

export function matchLines(headers: Header[], lines: Line[]): Map<number, Header> {
  const byRoute = new Map<string, Header[]>();
  for (const h of headers) {
    const k = `${h.from}|${h.to}`;
    (byRoute.get(k) ?? byRoute.set(k, []).get(k)!).push(h);
  }
  const assigned = new Map<number, Header>();

  const take = (h: Header, l: Line) => {
    h.need.set(l.name, h.need.get(l.name)! - 1);
    assigned.set(l.row, h);
  };

  // Pass A: lines that carry a route -> nearest transfer on it needing the name.
  for (const l of [...lines].sort((a, b) => a.ts - b.ts)) {
    if (!l.from || !l.to) continue;
    const pool = byRoute.get(`${l.from}|${l.to}`);
    if (!pool) continue;
    let best: Header | null = null, bestDt = Infinity;
    for (const h of pool) {
      const dt = Math.abs(l.ts - h.ts);
      if (dt <= WINDOW && dt < bestDt && (h.need.get(l.name) ?? 0) > 0) {
        best = h; bestDt = dt;
      }
    }
    if (best) take(best, l);
  }

  // Pass B: route-less lines (old data) -> unique candidate by name+time,
  // tightest window first so unambiguous pairs lock in before wider sweeps.
  for (const win of [60, 12 * 60, 24 * 60, WINDOW]) {
    for (const l of lines) {
      if (assigned.has(l.row) || (l.from && l.to)) continue;
      let hit: Header | null = null, hits = 0;
      for (const h of headers) {
        if (Math.abs(l.ts - h.ts) > win) continue;
        if ((h.need.get(l.name) ?? 0) > 0) { hit = h; hits++; if (hits > 1) break; }
      }
      if (hits === 1 && hit) take(hit, l);
    }
  }
  return assigned;
}

export async function importTransferLineItems(lineFile: string, transferFile: string) {
  const client = serviceClient();
  const transferRows = readCsv(transferFile);
  const lineRows = readCsv(lineFile);

  const headers = buildHeaders(transferRows);
  const lines: Line[] = [];
  const exceptions: Exception[] = [];
  lineRows.forEach((r, i) => {
    const ts = parseTsMinutes(r['Creation Date']);
    const name = norm(r['Stock']);
    if (ts === null || !name) {
      exceptions.push({ row: i + 2, reason: ts === null ? 'bad creation date' : 'no stock name',
        data: JSON.stringify(r) });
      return;
    }
    lines.push({
      row: i + 2, name, ts,
      from: norm(r['FromLocation']), to: norm(r['ToLocation']),
      serial: clean(r['Serial No.']), quantity: toNum(r['Quantity']) ?? 1,
    });
  });

  const assigned = matchLines(headers, lines);

  // DB lookups
  const transfers = await fetchAll(client,
    'transfers', 'id, legacy_id, status, from_branch_id, received_date');
  const transferByLegacy = new Map(transfers.map(t => [t.legacy_id, t]));
  const products = await fetchAll(client, 'products', 'id, name');
  const productByName = new Map(products.map(p => [norm(p.name), p.id]));
  const stock = await fetchAll(client, 'stock', 'id, product_id, branch_id, serial_number');
  type StockRef = { id: string; product_id: string; branch_id: string };
  const stockBySerial = new Map<string, StockRef[]>();
  for (const s of stock) {
    const ser = norm(s.serial_number);
    if (!ser) continue;
    (stockBySerial.get(ser) ?? stockBySerial.set(ser, []).get(ser)!).push(s as StockRef);
  }

  const records: object[] = [];
  let noTransfer = 0, noProduct = 0, stockLinked = 0;
  for (const l of lines) {
    const header = assigned.get(l.row);
    const transfer = header ? transferByLegacy.get(header.legacyId) : undefined;
    if (!transfer) {
      noTransfer++;
      exceptions.push({ row: l.row,
        reason: header ? `transfer ${header.legacyId} not in db` : 'no matching transfer',
        data: JSON.stringify(lineRows[l.row - 2]) });
      continue;
    }

    const productId = productByName.get(l.name) ?? null;
    if (!productId) noProduct++;

    // stock link: same serial + same product, preferring the origin branch
    let stockId: string | null = null;
    if (l.serial && productId) {
      const candidates = (stockBySerial.get(norm(l.serial)) ?? [])
        .filter(s => s.product_id === productId);
      const atOrigin = candidates.filter(s => s.branch_id === transfer.from_branch_id);
      const pick = atOrigin.length === 1 ? atOrigin
        : candidates.length === 1 ? candidates : [];
      if (pick.length === 1) { stockId = pick[0].id; stockLinked++; }
    }

    const received = transfer.status === 'confirmed';
    records.push({
      legacy_id: `tli:${l.row}`,
      transfer_id: transfer.id,
      stock_id: stockId,
      product_id: productId,
      quantity: l.quantity,
      serial_snapshot: l.serial,
      received_confirmed: received,
      received_quantity: received ? l.quantity : null,
      received_at: received && transfer.received_date ? transfer.received_date : null,
    });
  }

  await batchUpsert(client, 'transfer_line_items', records);
  writeExceptions('transfer-line-items', exceptions);
  console.log(`transfer line items: imported ${records.length}/${lineRows.length}` +
    ` (stock-linked ${stockLinked}, product unresolved ${noProduct},` +
    ` unmatched ${noTransfer})`);
}
