import { describe, it, expect } from 'vitest';
import { mapStock, STATUS_MAP } from '../scripts/import/stock';

const products = new Map([['Arena P1', 'uuid-p1']]);
const branches = new Map([['EDI HQ', 'uuid-hq']]);
const suppliers = new Map([['WS Audiology Pte Ltd.', 'uuid-ws']]);

describe('mapStock', () => {
  it('maps a serialized available row', () => {
    const r = mapStock({
      'Product': 'Arena P1', 'Location': 'EDI HQ', 'Status': 'Available',
      'Quantity': '1', 'Serial Number': 'SN123', 'Cost Per Unit': '380000',
      'Total Cost': '380000', 'Supplier': 'WS Audiology Pte Ltd.',
      'Supplier Invoice No.': '211682',
      'Supplier Invoice Date': 'Sep 20, 2023 12:00 am',
      'Expiry Date': '', 'BranchDateReceived': '', 'Original Quantity': '',
      'Repair Pool': '', 'Office Assets': '', 'Return Date': '',
      'unique id': 'stock-1',
    }, 2, products, branches, suppliers);
    expect(r).toEqual({ record: {
      legacy_id: 'stock-1', product_id: 'uuid-p1', branch_id: 'uuid-hq',
      supplier_id: 'uuid-ws', quantity: 1, original_quantity: null,
      serial_number: 'SN123', status: 'available',
      cost_per_unit: 380000, total_cost: 380000,
      supplier_invoice_no: '211682', supplier_invoice_date: '2023-09-20',
      expiry_date: null, branch_date_received: null,
      is_repair_pool: false, is_office_asset: false, return_date: null,
    }});
  });
  it('exception on unknown location', () => {
    const r = mapStock({ 'Product': 'Arena P1', 'Location': 'Head Office Sales',
      'Status': 'Available', 'Quantity': '1', 'unique id': 's2' },
      3, products, branches, suppliers);
    expect('exception' in r).toBe(true);
  });
  it('STATUS_MAP covers export values', () => {
    expect(STATUS_MAP['Available']).toBe('available');
    expect(STATUS_MAP['Transferred']).toBe('transferred');
    expect(STATUS_MAP['Sold']).toBe('sold');
  });
});
