import { describe, it, expect } from 'vitest';
import { groupSaleRows, mapSaleGroup, AFTER_SALES_STATUS_MAP, SaleCtx } from '../scripts/import/sales';

type Row = Record<string, string>;

function row(overrides: Partial<Row>): Row {
  return {
    'After Sales Status': '', 'BranchSold': 'EDI HQ', 'Cost Per Unit': '', 'CSI/OR/CI': '',
    'CSI/OR/CI No.': '', 'Customer': '', 'Customer Name': 'Juan Dela Cruz', 'Discount': '',
    'Expiry Date': '', 'Net of VAT': '', 'Net Sales': '', 'OR/CSI/CI v2': '', 'Paid': '',
    'Product Category': '', 'Product Name': '', 'quantity': '1', 'Referred By': '',
    'RepairRequests': '', 'SaleDate': 'Jan 5, 2024 12:00 am', 'SerialNumber': '', 'Service': '',
    'Service Name': '', 'Sold By': '', 'Stock': '', 'Stock/Service': 'Stock', 'Supplier': '',
    'Supplier Invoice Date': '', 'Supplier Invoice No.': '', 'Total Sale': '', 'Transaction Reference': '',
    'WarrantyExpiryDate': '', 'Creation Date': '', 'Modified Date': '', 'Slug': '', 'Creator': '',
    'unique id': 'row-1',
    ...overrides,
  };
}

const branches = new Map([['EDI HQ', 'uuid-hq']]);
const services = new Map([['Hearing Test', 'uuid-svc-ht']]);
const customers = new Map([['Juan Dela Cruz', 'uuid-cust-1']]);
const productsByName = new Map([['Battery A13', 'uuid-prod-batt']]);
const stockBySerial = new Map([['SN-001', { id: 'uuid-stock-1', product_id: 'uuid-prod-ha' }]]);

const baseCtx: SaleCtx = { branches, stockBySerial, productsByName, services, customers };

describe('groupSaleRows', () => {
  it('groups rows sharing branch + OR/CSI/CI v2', () => {
    const rows = [
      row({ 'OR/CSI/CI v2': 'OR-100', 'unique id': 'r1' }),
      row({ 'OR/CSI/CI v2': 'OR-100', 'unique id': 'r2' }),
      row({ 'OR/CSI/CI v2': 'OR-200', 'unique id': 'r3' }),
    ];
    const groups = groupSaleRows(rows);
    expect(groups).toHaveLength(2);
    expect(groups[0].rows.map(r => r.row['unique id'])).toEqual(['r1', 'r2']);
    expect(groups[1].rows.map(r => r.row['unique id'])).toEqual(['r3']);
  });

  it('creates a singleton group for blank OR/CSI/CI v2', () => {
    const rows = [
      row({ 'OR/CSI/CI v2': '', 'unique id': 'r1' }),
      row({ 'OR/CSI/CI v2': '', 'unique id': 'r2' }),
    ];
    const groups = groupSaleRows(rows);
    expect(groups).toHaveLength(2);
    expect(groups[0].rows).toHaveLength(1);
    expect(groups[1].rows).toHaveLength(1);
  });

  it('AFTER_SALES_STATUS_MAP covers export values', () => {
    expect(AFTER_SALES_STATUS_MAP['Sold']).toBe('sold');
    expect(AFTER_SALES_STATUS_MAP['For Repair']).toBe('for_repair');
    expect(AFTER_SALES_STATUS_MAP['Replaced']).toBe('replaced');
    expect(AFTER_SALES_STATUS_MAP['In Use']).toBe('in_use');
    expect(AFTER_SALES_STATUS_MAP['Returned']).toBe('returned');
    expect(AFTER_SALES_STATUS_MAP['Partially Returned']).toBe('partially_returned');
  });
});

describe('mapSaleGroup', () => {
  it('maps mixed stock (serial match) + service line group with header totals', () => {
    const group = {
      key: 'EDI HQ|OR-100',
      rows: [
        { row: row({
            'OR/CSI/CI v2': 'OR-100', 'unique id': 'line-1',
            'Stock/Service': 'Stock', 'SerialNumber': 'SN-001', 'Product Name': 'Hearing Aid X',
            'quantity': '1', 'Total Sale': '50000', 'Discount': '1000', 'Paid': 'yes',
            'After Sales Status': 'Sold',
          }), index: 0 },
        { row: row({
            'OR/CSI/CI v2': 'OR-100', 'unique id': 'line-2',
            'Stock/Service': 'Service', 'Service Name': 'Hearing Test',
            'quantity': '1', 'Total Sale': '500', 'After Sales Status': '',
          }), index: 1 },
      ],
    };
    const result = mapSaleGroup(group, baseCtx);
    expect(result.exceptions).toEqual([]);
    expect(result.header).toMatchObject({
      legacy_id: 'sale:line-1', branch_id: 'uuid-hq', customer_id: 'uuid-cust-1',
      or_no: 'OR-100', discount: 1000, is_paid: true,
    });
    expect(result.lines).toHaveLength(2);
    const stockLine = result.lines.find((l: any) => l.line_type === 'stock') as any;
    expect(stockLine).toMatchObject({
      stock_id: 'uuid-stock-1', product_id: 'uuid-prod-ha', quantity: 1, unit_price: 50000,
      after_sales_status: 'sold',
    });
    const serviceLine = result.lines.find((l: any) => l.line_type === 'service') as any;
    expect(serviceLine).toMatchObject({
      service_id: 'uuid-svc-ht', quantity: 1, unit_price: 500, after_sales_status: 'sold',
    });
    expect(result.zeroPriceCount).toBe(0);
    expect(result.unresolvedCustomerName).toBeNull();
  });

  it('falls back to zero price when Total Sale is blank', () => {
    const group = {
      key: 'row:0',
      rows: [{ row: row({
        'Product Name': 'Battery A13', 'Stock/Service': 'Stock', 'SerialNumber': '',
        'quantity': '2', 'Total Sale': '',
      }), index: 0 }],
    };
    const result = mapSaleGroup(group, baseCtx);
    expect(result.exceptions).toEqual([]);
    const line = result.lines[0] as any;
    expect(line.unit_price).toBe(0);
    expect(line.product_id).toBe('uuid-prod-batt');
    expect(line.stock_id).toBeNull();
    expect(result.zeroPriceCount).toBe(1);
  });

  it('exception on unknown branch', () => {
    const group = {
      key: 'row:0',
      rows: [{ row: row({ 'BranchSold': 'Ghost Branch' }), index: 0 }],
    };
    const result = mapSaleGroup(group, baseCtx);
    expect(result.exceptions).toHaveLength(1);
    expect(result.exceptions[0].reason).toContain('unknown branch');
    expect(result.header).toEqual({});
    expect(result.lines).toEqual([]);
  });

  it('exception on stock line with no serial match and unknown product', () => {
    const group = {
      key: 'row:0',
      rows: [{ row: row({
        'Stock/Service': 'Stock', 'SerialNumber': '', 'Product Name': 'Unknown Widget',
      }), index: 0 }],
    };
    const result = mapSaleGroup(group, baseCtx);
    expect(result.exceptions).toHaveLength(1);
    expect(result.exceptions[0].reason).toContain('unresolved stock line');
    expect(result.lines).toEqual([]);
  });

  it('collects unresolved customer name when no match found', () => {
    const group = {
      key: 'row:0',
      rows: [{ row: row({ 'Customer Name': 'Unknown Customer' }), index: 0 }],
    };
    const result = mapSaleGroup(group, baseCtx);
    expect(result.unresolvedCustomerName).toBe('Unknown Customer');
    expect((result.header as any).customer_id).toBeNull();
  });
});
