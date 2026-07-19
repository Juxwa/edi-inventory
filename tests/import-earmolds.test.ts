import { describe, it, expect } from 'vitest';
import { mapEarmold } from '../scripts/import/earmolds';

const branches = new Map([['EDI Gensan', 'uuid-gensan']]);

describe('mapEarmold', () => {
  it('maps a valid row', () => {
    const r = mapEarmold({
      'Address': 'NA', 'Branch Date Received': 'May 26, 2025 12:00 am',
      'Contact No': 'NA', 'Hearing Aid Model': 'MOSAIC HP 10', 'L/R': 'Right',
      'Patient Name': 'Juan Dela Cruz', 'Remarks': 'EARMOLD', 'requested by': 'Margie',
      'Requesting Branch': 'EDI Gensan', 'Serial No.': 'TGP4225', 'Status': 'Pending',
      'unique id': 'em-1',
    }, 2, branches);
    expect(r).toEqual({ record: {
      legacy_id: 'em-1', patient_name: 'Juan Dela Cruz', contact_no: 'NA',
      address: 'NA', hearing_aid_model: 'MOSAIC HP 10', side: 'right',
      serial_no: 'TGP4225', remarks: 'EARMOLD', requesting_branch_id: 'uuid-gensan',
      status: 'pending',
    }});
  });

  it('exception on missing patient name', () => {
    const r = mapEarmold({
      'Patient Name': '', 'Requesting Branch': 'EDI Gensan', 'unique id': 'em-2',
    }, 3, branches);
    expect('exception' in r).toBe(true);
  });

  it('unknown status defaults to pending', () => {
    const r = mapEarmold({
      'Patient Name': 'Maria Santos', 'Requesting Branch': 'EDI Gensan',
      'Status': 'Weird', 'unique id': 'em-3',
    }, 4, branches);
    expect(r).toEqual({ record: {
      legacy_id: 'em-3', patient_name: 'Maria Santos', contact_no: null,
      address: null, hearing_aid_model: null, side: null,
      serial_no: null, remarks: null, requesting_branch_id: 'uuid-gensan',
      status: 'pending',
    }});
  });

  it('side mapping: case-insensitive left/right/both, unknown -> null', () => {
    const base = { 'Patient Name': 'X', 'Requesting Branch': '', 'unique id': 'em-4' };
    expect(((mapEarmold({ ...base, 'L/R': 'left' }, 5, branches) as { record: { side: string | null } }).record).side).toBe('left');
    expect(((mapEarmold({ ...base, 'L/R': 'BOTH' }, 5, branches) as { record: { side: string | null } }).record).side).toBe('both');
    expect(((mapEarmold({ ...base, 'L/R': 'Right' }, 5, branches) as { record: { side: string | null } }).record).side).toBe('right');
    expect(((mapEarmold({ ...base, 'L/R': 'unknown' }, 5, branches) as { record: { side: string | null } }).record).side).toBe(null);
  });

  it('exception on unknown branch', () => {
    const r = mapEarmold({
      'Patient Name': 'X', 'Requesting Branch': 'Nonexistent', 'unique id': 'em-5',
    }, 6, branches);
    expect('exception' in r).toBe(true);
  });
});
