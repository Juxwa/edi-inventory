import { describe, it, expect } from 'vitest';
import { mapTransfer, CONF_MAP } from '../scripts/import/transfers';

const branches = new Map([['EDI HQ', 'uuid-hq'], ['EDI Iloilo', 'uuid-ilo']]);

describe('mapTransfer', () => {
  it('maps confirmed transfer', () => {
    const r = mapTransfer({
      'TransferCode': 'HQ11/08/23ILO5635', 'FromLocation': 'EDI HQ',
      'ToLocation': 'EDI Iloilo', 'ConfirmationStatus': 'Confirmed',
      'TransferDate': 'Nov 8, 2023 12:00 am', 'Received Date': 'Nov 9, 2023 12:00 am',
      'SIS No.': '', 'unique id': 't1',
    }, 2, branches);
    expect(r).toEqual({ record: {
      legacy_id: 't1', code: 'HQ11/08/23ILO5635',
      from_branch_id: 'uuid-hq', to_branch_id: 'uuid-ilo',
      status: 'confirmed', transfer_date: '2023-11-08',
      received_date: '2023-11-09', sis_no: null, courier: null, tracking_code: null,
    }});
  });
  it('CONF_MAP covers export values', () => {
    expect(CONF_MAP['Confirmed']).toBe('confirmed');
    expect(CONF_MAP['In Transit']).toBe('in_transit');
    expect(CONF_MAP['Pending']).toBe('draft');
  });
});
