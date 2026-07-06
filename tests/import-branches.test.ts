import { describe, it, expect } from 'vitest';
import { mapBranch } from '../scripts/import/branches';

describe('mapBranch', () => {
  it('maps a valid row', () => {
    const r = mapBranch({
      'Branch Name': 'EDI Iloilo', 'Branch Code': 'ILO', 'Address': 'Medicus Plaza, Iloilo',
      'Contact No.': '', 'Email': '', 'unique id': '169x1',
    }, 2);
    expect(r).toEqual({ record: {
      legacy_id: '169x1', name: 'EDI Iloilo', code: 'ILO',
      address: 'Medicus Plaza, Iloilo', email: null, contact_no: null,
    }});
  });
  it('rejects missing name', () => {
    const r = mapBranch({ 'Branch Name': '', 'Branch Code': 'X', 'unique id': '1' }, 3);
    expect('exception' in r).toBe(true);
  });
});
