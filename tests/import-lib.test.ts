import { describe, it, expect } from 'vitest';
import { parseBubbleDate, toBool, toNum } from '../scripts/import/lib';

describe('parseBubbleDate', () => {
  it('parses "Oct 19, 2023 12:36 pm"', () => {
    expect(parseBubbleDate('Oct 19, 2023 12:36 pm')).toBe('2023-10-19');
  });
  it('parses "Sep 20, 2023 12:00 am"', () => {
    expect(parseBubbleDate('Sep 20, 2023 12:00 am')).toBe('2023-09-20');
  });
  it('returns null for empty', () => {
    expect(parseBubbleDate('')).toBeNull();
  });
});

describe('coercers', () => {
  it('toBool yes/no', () => {
    expect(toBool('yes')).toBe(true);
    expect(toBool('')).toBe(false);
  });
  it('toNum handles blanks', () => {
    expect(toNum('21000')).toBe(21000);
    expect(toNum('')).toBeNull();
  });
});
