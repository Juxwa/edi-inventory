import { describe, it, expect } from 'vitest';
import { mapRepair } from '../scripts/import/repairs';

const branches = new Map([['EDI Gensan', 'uuid-gensan']]);

describe('mapRepair', () => {
  it('maps a valid row', () => {
    const r = mapRepair({
      'Assigned To': '', 'Downpayment': '500', 'Issue Description': 'dead',
      'Remarks': '', 'RequestDate': 'Jun 16, 2025 6:54 pm', 'Requested By': '',
      'Requesting Branch': 'EDI Gensan', 'Returned to Customer': '',
      'SAR No.': '324', 'Serial No.': 'CGM9383', 'Sold Stock': 'Arena HP 3',
      'Status': 'Pending', 'Creation Date': 'Jun 16, 2025 6:54 pm', 'unique id': 'rep-1',
    }, 2, branches);
    expect(r).toEqual({ record: {
      legacy_id: 'rep-1', sar_no: '324', requesting_branch_id: 'uuid-gensan',
      manual_serial: 'CGM9383', status: 'pending', downpayment: 500,
      request_date: '2025-06-16', returned_to_customer_at: null,
      issue_description: 'dead', remarks: null,
    }});
  });

  it('falls back to Creation Date when RequestDate is blank', () => {
    const r = mapRepair({
      'SAR No.': '328', 'Requesting Branch': 'EDI Gensan', 'Serial No.': 'ABC000',
      'Status': 'Pending', 'RequestDate': '', 'Creation Date': 'Jun 22, 2025 7:14 pm',
      'unique id': 'rep-6',
    }, 7, branches);
    expect('record' in r).toBe(true);
    expect((r as { record: { request_date: string } }).record.request_date).toBe('2025-06-22');
  });

  it('exception on missing serial', () => {
    const r = mapRepair({
      'SAR No.': '325', 'Requesting Branch': 'EDI Gensan', 'Serial No.': '',
      'Status': 'Pending', 'unique id': 'rep-2',
    }, 3, branches);
    expect('exception' in r).toBe(true);
  });

  it('exception on unknown status', () => {
    const r = mapRepair({
      'SAR No.': '326', 'Requesting Branch': 'EDI Gensan', 'Serial No.': 'ABC123',
      'Status': 'Weird', 'unique id': 'rep-3',
    }, 4, branches);
    expect('exception' in r).toBe(true);
  });

  it('exception on missing SAR No.', () => {
    const r = mapRepair({
      'SAR No.': '', 'Requesting Branch': 'EDI Gensan', 'Serial No.': 'ABC123',
      'Status': 'Pending', 'unique id': 'rep-4',
    }, 5, branches);
    expect('exception' in r).toBe(true);
  });

  it('exception on unknown branch', () => {
    const r = mapRepair({
      'SAR No.': '327', 'Requesting Branch': 'Nonexistent', 'Serial No.': 'ABC123',
      'Status': 'Pending', 'unique id': 'rep-5',
    }, 6, branches);
    expect('exception' in r).toBe(true);
  });
});
