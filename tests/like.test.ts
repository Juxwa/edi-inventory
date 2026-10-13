import { describe, it, expect } from 'vitest';
import { containsPattern } from '../src/lib/like';

describe('containsPattern (search box text -> ILIKE pattern)', () => {
  it('wraps plain text for a contains match', () => {
    expect(containsPattern('TR-00042')).toBe('%TR-00042%');
    expect(containsPattern('  lbc  ')).toBe('%lbc%');
  });

  it('escapes LIKE wildcards so they match literally', () => {
    expect(containsPattern('AB_12')).toBe('%AB\\_12%');
    expect(containsPattern('100%')).toBe('%100\\%%');
    expect(containsPattern('a\\b')).toBe('%a\\\\b%');
  });

  it('drops the PostgREST * wildcard', () => {
    expect(containsPattern('SN*7')).toBe('%SN7%');
  });

  it('keeps commas and parentheses', () => {
    expect(containsPattern('J&T, Express (Cebu)')).toBe('%J&T, Express (Cebu)%');
  });

  it('returns null when nothing searchable is left', () => {
    expect(containsPattern('')).toBeNull();
    expect(containsPattern('   ')).toBeNull();
    expect(containsPattern('**')).toBeNull();
    expect(containsPattern(null)).toBeNull();
    expect(containsPattern(undefined)).toBeNull();
  });
});
