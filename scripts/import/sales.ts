import { readCsv, clean, toBool, toNum, parseBubbleDate, writeExceptions,
         serviceClient, batchUpsert, fetchAll, Exception } from './lib';

type Row = Record<string, string>;

export type SaleGroup = { key: string; rows: { row: Row; index: number }[] };

export type StockMatch = { id: string; product_id: string };

export type SaleCtx = {
  branches: Map<string, string>;
  stockBySerial: Map<string, StockMatch>;
  productsByName: Map<string, string>;
  services: Map<string, string>;
  customers: Map<string, string>;
};

export const AFTER_SALES_STATUS_MAP: Record<string, string> = {
  'Sold': 'sold',
  'For Repair': 'for_repair',
  'Replaced': 'replaced',
  'In Use': 'in_use',
  'Returned': 'returned',
  'Partially Returned': 'partially_returned',
};

export function groupSaleRows(rows: Row[]): SaleGroup[] {
  const groups = new Map<string, SaleGroup>();
  const order: string[] = [];
  rows.forEach((row: Row, index: number) => {
    const or = clean(row['OR/CSI/CI v2']);
    const key = or ? `${clean(row['BranchSold']) ?? ''}|${or}` : `row:${index}`;
    let group = groups.get(key);
    if (!group) {
      group = { key, rows: [] };
      groups.set(key, group);
      order.push(key);
    }
    group.rows.push({ row, index });
  });
  return order.map((key: string) => groups.get(key)!);
}

function isServiceLine(row: Row): boolean {
  return clean(row['Service Name']) !== null || clean(row['Stock/Service']) === 'Service';
}

export type MapSaleGroupResult = {
  header: object;
  lines: object[];
  exceptions: Exception[];
  zeroPriceCount: number;
  unresolvedCustomerName: string | null;
};

export function mapSaleGroup(group: SaleGroup, ctx: SaleCtx): MapSaleGroupResult {
  const exceptions: Exception[] = [];
  let zeroPriceCount = 0;
  const firstRow = group.rows[0].row;
  const firstIndex = group.rows[0].index;

  const branchName = clean(firstRow['BranchSold']);
  const branch_id = branchName ? ctx.branches.get(branchName) : undefined;
  if (!branch_id) {
    exceptions.push({ row: firstIndex + 2,
      reason: `unknown branch: ${firstRow['BranchSold']}`, data: JSON.stringify(firstRow) });
    return { header: {}, lines: [], exceptions, zeroPriceCount, unresolvedCustomerName: null };
  }

  const customerName = clean(firstRow['Customer Name']);
  let customer_id: string | null = null;
  let unresolvedCustomerName: string | null = null;
  if (customerName) {
    const id = ctx.customers.get(customerName);
    if (id) customer_id = id;
    else unresolvedCustomerName = customerName;
  }

  const or_no = clean(firstRow['OR/CSI/CI v2']);
  const discount = toNum(firstRow['Discount']) ?? 0;
  const is_paid = toBool(firstRow['Paid']);
  const sale_date = parseBubbleDate(firstRow['SaleDate']);
  const referred_by = clean(firstRow['Referred By']);
  const legacy_id = `sale:${clean(firstRow['unique id']) ?? String(firstIndex)}`;

  const header = {
    legacy_id,
    branch_id,
    customer_id,
    sale_date,
    or_no,
    csi_no: null,
    ci_no: null,
    referred_by,
    discount,
    is_paid,
    transaction_reference: clean(firstRow['Transaction Reference']),
  };

  const lines: object[] = [];
  for (const { row, index } of group.rows) {
    const qty = toNum(row['quantity']) ?? 0;
    if (qty <= 0) {
      exceptions.push({ row: index + 2, reason: `invalid quantity: ${row['quantity']}`,
        data: JSON.stringify(row) });
      continue;
    }
    const totalSale = toNum(row['Total Sale']);
    let unit_price = 0;
    if (totalSale !== null && qty > 0) unit_price = totalSale / qty;
    if (unit_price === 0) zeroPriceCount += 1;

    const afterStatusRaw = clean(row['After Sales Status']);
    const after_sales_status = afterStatusRaw
      ? (AFTER_SALES_STATUS_MAP[afterStatusRaw] ?? 'sold')
      : 'sold';

    if (isServiceLine(row)) {
      const serviceName = clean(row['Service Name']);
      const service_id = serviceName ? ctx.services.get(serviceName) : undefined;
      if (!service_id) {
        exceptions.push({ row: index + 2, reason: `unknown service: ${row['Service Name']}`,
          data: JSON.stringify(row) });
        continue;
      }
      lines.push({
        legacy_id: clean(row['unique id']),
        line_type: 'service',
        service_id,
        stock_id: null,
        product_id: null,
        quantity: qty,
        unit_price,
        warranty_expiry: null,
        after_sales_status,
      });
    } else {
      const serial = clean(row['SerialNumber']);
      const stockMatch = serial ? ctx.stockBySerial.get(serial) : undefined;
      let stock_id: string | null = null;
      let product_id: string | null = null;
      if (stockMatch) {
        stock_id = stockMatch.id;
        product_id = stockMatch.product_id;
      } else {
        const productName = clean(row['Product Name']);
        const pid = productName ? ctx.productsByName.get(productName) : undefined;
        if (!pid) {
          exceptions.push({ row: index + 2,
            reason: `unresolved stock line: no serial match and unknown product ${row['Product Name']}`,
            data: JSON.stringify(row) });
          continue;
        }
        product_id = pid;
      }
      lines.push({
        legacy_id: clean(row['unique id']),
        line_type: 'stock',
        stock_id,
        product_id,
        quantity: qty,
        unit_price,
        warranty_expiry: parseBubbleDate(row['WarrantyExpiryDate']),
        after_sales_status,
      });
    }
  }

  return { header, lines, exceptions, zeroPriceCount, unresolvedCustomerName };
}

type CustomerRow = { id: string; name: string; created_at: string };

// First match by created order wins (per plan: "first match by created order = file
// order of customers import"); fetchAll gives no guaranteed order, so sort explicitly
// and only set a name's mapping the first time it's seen.
function firstByCreatedAt(rows: CustomerRow[]): Map<string, string> {
  const sorted = [...rows].sort((a: CustomerRow, b: CustomerRow) =>
    a.created_at.localeCompare(b.created_at));
  const map = new Map<string, string>();
  for (const r of sorted) {
    if (!map.has(r.name)) map.set(r.name, r.id);
  }
  return map;
}

export async function importSales(file: string) {
  const client = serviceClient();
  const rows = readCsv(file);

  const branches = new Map(
    ((await fetchAll(client, 'branches', 'id,name')) as { id: string; name: string }[]).map((r: { id: string; name: string }) => [r.name, r.id]));
  const products = new Map(
    ((await fetchAll(client, 'products', 'id,name')) as { id: string; name: string }[]).map((r: { id: string; name: string }) => [r.name, r.id]));

  const stockRows = await fetchAll(client, 'stock', 'id,product_id,serial_number') as
    { id: string; product_id: string; serial_number: string | null }[];
  const stockBySerial = new Map<string, StockMatch>();
  for (const s of stockRows) {
    if (s.serial_number) stockBySerial.set(s.serial_number, { id: s.id, product_id: s.product_id });
  }

  let customers = firstByCreatedAt(
    await fetchAll(client, 'customers', 'id,name,created_at') as CustomerRow[]);

  const groups = groupSaleRows(rows);

  // First pass: resolve unknown service names and stub-upsert them (like phase 1 pricing importer).
  const unknownServiceNames = new Set<string>();
  for (const group of groups) {
    for (const { row } of group.rows) {
      if (isServiceLine(row)) {
        const name = clean(row['Service Name']);
        if (name) unknownServiceNames.add(name);
      }
    }
  }
  const existingServices = new Map(
    ((await fetchAll(client, 'services', 'id,name')) as { id: string; name: string }[]).map((r: { id: string; name: string }) => [r.name, r.id]));
  const newServiceNames = [...unknownServiceNames].filter((n: string) => !existingServices.has(n));
  if (newServiceNames.length > 0) {
    await batchUpsert(client, 'services',
      newServiceNames.map((name: string) => ({ name, is_stub: true })), 'name');
  }
  const services = new Map(
    ((await fetchAll(client, 'services', 'id,name')) as { id: string; name: string }[]).map((r: { id: string; name: string }) => [r.name, r.id]));

  // Second pass: map with current customers map, collect unresolved customer names for auto-create.
  let ctx: SaleCtx = { branches, stockBySerial, productsByName: products, services, customers };
  let results = groups.map((group: SaleGroup) => mapSaleGroup(group, ctx));

  const unresolvedNames = [...new Set(
    results.map((r: MapSaleGroupResult) => r.unresolvedCustomerName)
      .filter((n: string | null): n is string => n !== null))];

  if (unresolvedNames.length > 0) {
    const autoCreateRecords = unresolvedNames.map((name: string) => {
      // Find the branch of the first group referencing this customer name, for branch_created_id.
      let branch_created_id: string | null = null;
      for (const group of groups) {
        const firstRow = group.rows[0].row;
        if (clean(firstRow['Customer Name']) === name) {
          const bId = ctx.branches.get(clean(firstRow['BranchSold']) ?? '');
          if (bId) branch_created_id = bId;
          break;
        }
      }
      return { legacy_id: `autocust:${name}`, name, branch_created_id };
    });
    await batchUpsert(client, 'customers', autoCreateRecords, 'legacy_id');
    customers = firstByCreatedAt(
      await fetchAll(client, 'customers', 'id,name,created_at') as CustomerRow[]);
    ctx = { branches, stockBySerial, productsByName: products, services, customers };
    results = groups.map((group: SaleGroup) => mapSaleGroup(group, ctx));
  }

  const headers: object[] = [];
  const allLines: { legacy_id: string; sale_legacy_id: string; line: Record<string, unknown> }[] = [];
  const exceptions: Exception[] = [];
  let zeroPriceCount = 0;

  for (const r of results) {
    exceptions.push(...r.exceptions);
    zeroPriceCount += r.zeroPriceCount;
    if (Object.keys(r.header).length === 0) continue; // branch resolution failed, header skipped
    headers.push(r.header);
    const saleLegacyId = (r.header as { legacy_id: string }).legacy_id;
    for (const line of r.lines) {
      allLines.push({
        legacy_id: (line as { legacy_id: string | null }).legacy_id ?? `${saleLegacyId}:line`,
        sale_legacy_id: saleLegacyId,
        line: line as Record<string, unknown>,
      });
    }
  }

  await batchUpsert(client, 'sales', headers);
  const salesByLegacyId = new Map(
    ((await fetchAll(client, 'sales', 'id,legacy_id')) as { id: string; legacy_id: string }[]).map((r: { id: string; legacy_id: string }) => [r.legacy_id, r.id]));

  const lineRecords = allLines.map(
    ({ legacy_id, sale_legacy_id, line }: { legacy_id: string; sale_legacy_id: string; line: Record<string, unknown> }) => {
      const sale_id = salesByLegacyId.get(sale_legacy_id);
      return { ...line, legacy_id, sale_id };
    }).filter((l: Record<string, unknown>) => l.sale_id !== undefined);

  await batchUpsert(client, 'sale_line_items', lineRecords);
  writeExceptions('sales', exceptions);
  console.log(`sales: imported ${headers.length} headers, ${lineRecords.length} lines `
    + `(${rows.length} source rows), zero_price lines: ${zeroPriceCount}, `
    + `auto-created customers: ${unresolvedNames.length}`);
}
