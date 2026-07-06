import { describe, it, expect } from 'vitest';
import { parseSerials } from '../src/lib/serials';

describe('parseSerials', () => {
  it('splits newline-separated serials', () => {
    expect(parseSerials('AAA\nBBB\nCCC')).toEqual(['AAA', 'BBB', 'CCC']);
  });

  it('trims whitespace around each serial', () => {
    expect(parseSerials('  AAA  \n\tBBB\t\n CCC ')).toEqual(['AAA', 'BBB', 'CCC']);
  });

  it('drops empty lines', () => {
    expect(parseSerials('AAA\n\n\nBBB\n   \nCCC')).toEqual(['AAA', 'BBB', 'CCC']);
  });

  it('dedupes while preserving first-seen order', () => {
    expect(parseSerials('AAA\nBBB\nAAA\nCCC\nBBB')).toEqual(['AAA', 'BBB', 'CCC']);
  });

  it('handles Windows-style CRLF line endings', () => {
    expect(parseSerials('AAA\r\nBBB\r\nCCC')).toEqual(['AAA', 'BBB', 'CCC']);
  });

  it('returns an empty array for blank input', () => {
    expect(parseSerials('')).toEqual([]);
    expect(parseSerials('   \n  \n')).toEqual([]);
  });

  it('treats differently-cased serials as distinct', () => {
    expect(parseSerials('abc\nABC')).toEqual(['abc', 'ABC']);
  });
});
