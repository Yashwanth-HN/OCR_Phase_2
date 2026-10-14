import { describe, expect, it } from 'vitest';
import {
  averageConfidence,
  confidenceLevel,
  formatPercent,
  joinLines,
  linesNeedingReview,
  lineNumberMap,
  resolveLines,
} from '@/lib/job';
import type { OcrLine, OcrResult } from '@/types';

const box = { x: 0, y: 0, w: 1, h: 1 };
const line = (id: string, text: string, confidence: number): OcrLine => ({ id, text, confidence, box, alternatives: [] });
const result: OcrResult = {
  id: 'r',
  pages: [
    { index: 0, width: 1, height: 1, lines: [line('a', 'ಒಂದು', 0.95), line('b', 'ಎರಡು', 0.5)] },
    { index: 1, width: 1, height: 1, lines: [line('c', 'ಮೂರು', 0.8)] },
  ],
};

describe('confidence helpers', () => {
  it('classifies levels at the thresholds', () => {
    expect(confidenceLevel(0.9)).toBe('high');
    expect(confidenceLevel(0.75)).toBe('medium');
    expect(confidenceLevel(0.74)).toBe('low');
  });
  it('formats and clamps percentages', () => {
    expect(formatPercent(0.926)).toBe('93%');
    expect(formatPercent(2)).toBe('100%');
    expect(formatPercent(-1)).toBe('0%');
  });
  it('averages', () => {
    expect(averageConfidence([])).toBe(0);
    expect(averageConfidence([line('x', '', 0.5), line('y', '', 1)])).toBe(0.75);
  });
});

describe('joinLines', () => {
  const lines = [line('1', ' ಅ ', 1), line('2', 'ಆ', 1), line('3', '', 1)];
  it('word uses the first line', () => expect(joinLines(lines, 'word')).toBe('ಅ'));
  it('paragraph joins with spaces', () => expect(joinLines(lines, 'paragraph')).toBe('ಅ ಆ'));
  it('page keeps line breaks', () => expect(joinLines(lines, 'page')).toBe('ಅ\nಆ'));
});

describe('review helpers', () => {
  it('applies overrides', () => {
    expect(resolveLines(result, { b: 'ಸರಿ' }).map((l) => l.text)).toEqual(['ಒಂದು', 'ಸರಿ', 'ಮೂರು']);
  });
  it('flags only uncorrected low-confidence lines', () => {
    expect(linesNeedingReview({ result, lineOverrides: {} }).map((l) => l.id)).toEqual(['b']);
    expect(linesNeedingReview({ result, lineOverrides: { b: 'x' } })).toEqual([]);
  });
  it('numbers lines across pages', () => {
    expect([...lineNumberMap(result).entries()]).toEqual([['a', 1], ['b', 2], ['c', 3]]);
  });
});
