import { readCsv, clean, toBool, toNum, parseBubbleDate, writeExceptions,
         serviceClient, batchUpsert, Exception } from './lib';

type Row = Record<string, string>;

export const STATUS_MAP: Record<string, string> = {
  'Available': 'available', 'Transferred': 'transferred', 'Sold': 'sold',
  'Under Repair': 'under_repair', 'For Replacement': 'for_replacement',
  'Consignment': 'consignment', 'Returned': 'returned',
};

export function mapStock(
  row: Row, n: number,
  products: Map<string, string>, branches: Map<string, string>,
  suppliers: Map<string, string>,
): { record: object } | { exception: Exception } {
  const product_id = products.get(clean(row['Product']) ?? '');
  if (!product_id) return { exception:
    { row: n, reason: `unknown product: ${row['Product']}`, data: JSON.stringify(row) } };
  const branch_id = branches.get(clean(row['Location']) ?? '');
  if (!branch_id) return { exception:
    { row: n, reason: `unknown location: ${row['Location']}`, data: JSON.stringify(row) } };
  const status = STATUS_MAP[clean(row['Status']) ?? ''];
  if (!status) return { exception:
    { row: n, reason: `unknown status: ${row['Status']}`, data: JSON.stringify(row) } };
  return { record: {
    legacy_id: clean(row['unique id']),
    product_id, branch_id,
    supplier_id: suppliers.get(clean(row['Supplier']) ?? '') ?? null,
    quantity: toNum(row['Quantity']) ?? 0,
    original_quantity: toNum(row['Original Quantity']),
    serial_number: clean(row['Serial Number']),
    status,
    cost_per_unit: toNum(row['Cost Per Unit']),
    total_cost: toNum(row['Total Cost']),
    supplier_invoice_no: clean(row['Supplier Invoice No.']),
    supplier_invoice_date: parseBubbleDate(row['Supplier Invoice Date']),
    expiry_date: parseBubbleDate(row['Expiry Date']),
    branch_date_received: parseBubbleDate(row['BranchDateReceived']),
    is_repair_pool: toBool(row['Repair Pool']),
    is_office_asset: toBool(row['Office Assets']),
    return_date: parseBubbleDate(row['Return Date']),
  }};
}

export async function importStock(file: string) {
  const client = serviceClient();
  const rows = readCsv(file);
  const { data: prods } = await client.from('products').select('id,name');
  const { data: brs } = await client.from('branches').select('id,name');
  const { data: sups } = await client.from('suppliers').select('id,name');
  const products = new Map(prods!.map(p => [p.name, p.id]));
  const branches = new Map(brs!.map(b => [b.name, b.id]));
  const suppliers = new Map(sups!.map(s => [s.name, s.id]));

  const records: object[] = []; const exceptions: Exception[] = [];
  rows.forEach((row, i) => {
    const r = mapStock(row, i + 2, products, branches, suppliers);
    'record' in r ? records.push(r.record) : exceptions.push(r.exception);
  });
  await batchUpsert(client, 'stock', records);
  writeExceptions('stock', exceptions);
  console.log(`stock: imported ${records.length}/${rows.length}`);
}
