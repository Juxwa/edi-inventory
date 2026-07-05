import { readCsv, clean, toBool, toNum, writeExceptions,
         serviceClient, batchUpsert, Exception } from './lib';

type Row = Record<string, string>;

export function mapProduct(
  row: Row, n: number,
  categories: Map<string, number>, suppliers: Map<string, string>,
): { record: object } | { exception: Exception } {
  const name = clean(row['Product Name']);
  if (!name) return { exception:
    { row: n, reason: 'missing product name', data: JSON.stringify(row) } };
  const catName = clean(row['Product Category']);
  const category_id = catName ? categories.get(catName) : null;
  if (catName && !category_id) return { exception:
    { row: n, reason: `unknown category: ${catName}`, data: JSON.stringify(row) } };
  const supName = clean(row['Supplier']);
  const supplier_id = supName ? suppliers.get(supName) ?? null : null;
  if (supName && !supplier_id) return { exception:
    { row: n, reason: `unknown supplier: ${supName}`, data: JSON.stringify(row) } };
  return { record: {
    legacy_id: clean(row['unique id']),
    name, code: clean(row['Product Code']),
    category_id: category_id ?? null, supplier_id,
    srp: toNum(row['SRP']),
    has_serial: toBool(row['HasSerial']),
    is_active: toBool(row['is_Active']),
    description: clean(row['Description']),
    notes: clean(row['Notes']),
  }};
}

export async function importProducts(file: string) {
  const client = serviceClient();
  const rows = readCsv(file);

  const supplierNames = [...new Set(rows.map(r => clean(r['Supplier'])).filter(Boolean))];
  await batchUpsert(client, 'suppliers',
    supplierNames.map(name => ({ name, is_stub: true })), 'name');

  const { data: cats } = await client.from('product_categories').select('id,name');
  const { data: sups } = await client.from('suppliers').select('id,name');
  const categories = new Map(cats!.map(c => [c.name, c.id]));
  const suppliers = new Map(sups!.map(s => [s.name, s.id]));

  const records: object[] = []; const exceptions: Exception[] = [];
  rows.forEach((row, i) => {
    const r = mapProduct(row, i + 2, categories, suppliers);
    'record' in r ? records.push(r.record) : exceptions.push(r.exception);
  });
  await batchUpsert(client, 'products', records);
  writeExceptions('products', exceptions);
  console.log(`products: imported ${records.length}/${rows.length}`);
}
