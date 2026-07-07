import { describe, it, expect } from 'vitest';
import { mapCustomer } from '../scripts/import/customers';

const branches = new Map([['EDI HQ', 'uuid-hq'], ['EDI Iloilo', 'uuid-ilo']]);

describe('mapCustomer', () => {
  it('maps a full row', () => {
    const r = mapCustomer({
      'Name': 'Juan Dela Cruz', 'Address': '123 Rizal St.',
      'Branch Created': 'EDI HQ', 'Date of Birth': 'Jan 5, 1980 12:00 am',
      'Email': 'juan@example.com', 'Mobile No.': '09171234567',
      'unique id': 'cust-1',
    }, 2, branches);
    expect(r).toEqual({ record: {
      legacy_id: 'cust-1', name: 'Juan Dela Cruz', address: '123 Rizal St.',
      branch_created_id: 'uuid-hq', date_of_birth: '1980-01-05',
      email: 'juan@example.com', mobile_no: '09171234567',
    }});
  });

  it('exception on missing name', () => {
    const r = mapCustomer({
      'Name': '', 'Address': '', 'Branch Created': '', 'Date of Birth': '',
      'Email': '', 'Mobile No.': '', 'unique id': 'cust-2',
    }, 3, branches);
    expect('exception' in r).toBe(true);
  });

  it('blank branch created maps to null', () => {
    const r = mapCustomer({
      'Name': 'Maria Santos', 'Address': '', 'Branch Created': '', 'Date of Birth': '',
      'Email': '', 'Mobile No.': '', 'unique id': 'cust-3',
    }, 4, branches);
    expect(r).toEqual({ record: {
      legacy_id: 'cust-3', name: 'Maria Santos', address: null,
      branch_created_id: null, date_of_birth: null, email: null, mobile_no: null,
    }});
  });

  it('exception on unknown branch created', () => {
    const r = mapCustomer({
      'Name': 'Pedro Reyes', 'Address': '', 'Branch Created': 'Nonexistent Branch',
      'Date of Birth': '', 'Email': '', 'Mobile No.': '', 'unique id': 'cust-4',
    }, 5, branches);
    expect('exception' in r).toBe(true);
  });
});
