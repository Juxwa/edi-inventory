import { describe, it, expect } from 'vitest';
import { mapPricing } from '../scripts/import/service-pricing';

const branches = new Map([['EDI Iloilo', 'uuid-ilo']]);
const services = new Map([['Hearing Test', 'uuid-ht']]);

describe('mapPricing', () => {
  it('maps valid row', () => {
    const r = mapPricing({ Branch: 'EDI Iloilo', Service: 'Hearing Test',
      Price: '500', 'unique id': '1x' }, 2, branches, services);
    expect(r).toEqual({ record: {
      legacy_id: '1x', branch_id: 'uuid-ilo', service_id: 'uuid-ht', price: 500,
    }});
  });
  it('exception on unknown branch', () => {
    const r = mapPricing({ Branch: 'Ghost', Service: 'Hearing Test',
      Price: '1', 'unique id': '2x' }, 3, branches, services);
    expect('exception' in r).toBe(true);
  });
});
