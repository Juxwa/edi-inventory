import { describe, it, expect } from 'vitest';
import { mapProduct } from '../scripts/import/products';

const categories = new Map([['Hearing Aids', 1]]);
const suppliers = new Map([['WS Audiology Pte Ltd.', 'uuid-ws']]);

describe('mapProduct', () => {
  it('maps a valid row resolving FKs by name', () => {
    const r = mapProduct({
      'Product Name': 'Arena P1', 'Product Code': '10940399',
      'Product Category': 'Hearing Aids', 'Supplier': 'WS Audiology Pte Ltd.',
      'SRP': '21000', 'HasSerial': 'yes', 'is_Active': 'yes',
      'Description': '', 'Notes': '', 'unique id': '169x2',
    }, 2, categories, suppliers);
    expect(r).toEqual({ record: {
      legacy_id: '169x2', name: 'Arena P1', code: '10940399',
      category_id: 1, supplier_id: 'uuid-ws', srp: 21000,
      has_serial: true, is_active: true, description: null, notes: null,
    }});
  });
  it('exception on unknown category', () => {
    const r = mapProduct({ 'Product Name': 'X', 'Product Category': 'Nope',
      'unique id': '1' }, 3, categories, suppliers);
    expect('exception' in r).toBe(true);
  });
});
