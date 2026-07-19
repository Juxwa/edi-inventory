import { describe, it, expect } from 'vitest';
import { normalizePhone, verifyRepairAccess } from '../src/lib/repair-lookup';

describe('normalizePhone', () => {
  it('normalizes +63, 0-prefixed, spaced, and dashed formats to the same value', () => {
    expect(normalizePhone('+63 917 123 4567')).toBe('9171234567');
    expect(normalizePhone('09171234567')).toBe('9171234567');
    expect(normalizePhone('0917-123-4567')).toBe('9171234567');
    expect(normalizePhone('639171234567')).toBe('9171234567');
  });
});

describe('verifyRepairAccess', () => {
  const repair = { contact_no: '09171234567' };
  const customer = { name: 'Maria Santos', mobile_no: '+639998887766' };

  it('matches the repair contact number in any format', () => {
    expect(verifyRepairAccess(repair, customer, '+63 917 123 4567')).toBe(true);
    expect(verifyRepairAccess(repair, customer, '09171234567')).toBe(true);
  });

  it('matches the customer mobile as fallback', () => {
    expect(verifyRepairAccess(repair, customer, '09998887766')).toBe(true);
  });

  it('matches a whole word of the customer name, case-insensitive', () => {
    expect(verifyRepairAccess(repair, customer, 'santos')).toBe(true);
    expect(verifyRepairAccess(repair, customer, 'SANTOS')).toBe(true);
  });

  it('rejects wrong phone, partial names, and empty input', () => {
    expect(verifyRepairAccess(repair, customer, '09170000000')).toBe(false);
    expect(verifyRepairAccess(repair, customer, 'san')).toBe(false);
    expect(verifyRepairAccess(repair, customer, 'sant')).toBe(false);
    expect(verifyRepairAccess(repair, customer, '')).toBe(false);
    expect(verifyRepairAccess(repair, customer, '  ')).toBe(false);
  });

  it('rejects short digit strings that would over-match', () => {
    expect(verifyRepairAccess(repair, customer, '4567')).toBe(false);
  });

  it('handles missing customer', () => {
    expect(verifyRepairAccess(repair, null, '09171234567')).toBe(true);
    expect(verifyRepairAccess(repair, null, 'santos')).toBe(false);
  });

  it('handles repair without contact number', () => {
    expect(verifyRepairAccess({ contact_no: null }, customer, '09998887766')).toBe(true);
    expect(verifyRepairAccess({ contact_no: null }, null, '09171234567')).toBe(false);
  });
});
