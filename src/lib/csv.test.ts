import { describe, expect, it } from 'vitest';
import { toCsv } from '@/lib/csv';

describe('toCsv', () => {
  it('prepends a BOM and joins with CRLF', () => {
    expect(toCsv([['a', 'b'], ['c', 'd']])).toBe('﻿a,b\r\nc,d');
  });
  it('quotes commas, quotes and newlines', () => {
    expect(toCsv([['x,y', 'say "hi"', 'l1\nl2']])).toBe('﻿"x,y","say ""hi""","l1\nl2"');
  });
  it('neutralises formula injection', () => {
    expect(toCsv([['=SUM(A1)', '+1', '-1', '@x']])).toBe("﻿'=SUM(A1),'+1,'-1,'@x");
  });
  it('keeps Kannada intact', () => {
    expect(toCsv([['ಕನ್ನಡ']])).toContain('ಕನ್ನಡ');
  });
});
