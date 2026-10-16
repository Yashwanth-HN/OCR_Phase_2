import { describe, expect, it } from 'vitest';
import { normalizeOcrResponse } from '@/api/normalize';

describe('normalizeOcrResponse', () => {
  it('handles the full pages contract', () => {
    const r = normalizeOcrResponse(
      { id: 'j1', model_version: 'v1', pages: [{ width: 100, height: 200, lines: [{ text: 'ಕ', confidence: 0.9, box: { x: 0.1, y: 0.2, w: 0.3, h: 0.1 } }] }] },
      'page',
    );
    expect(r.id).toBe('j1');
    expect(r.modelVersion).toBe('v1');
    expect(r.pages[0]?.lines[0]?.box.x).toBe(0.1);
  });
  it('converts pixel boxes and percent confidence', () => {
    const r = normalizeOcrResponse({ pages: [{ width: 100, height: 200, lines: [{ text: 'ಕ', confidence: 87, bbox: [10, 20, 50, 40] }] }] }, 'page');
    const l = r.pages[0]!.lines[0]!;
    expect(l.confidence).toBeCloseTo(0.87);
    expect(l.box).toEqual({ x: 0.1, y: 0.1, w: 0.5, h: 0.2 });
  });
  it('accepts a lines array', () => {
    const r = normalizeOcrResponse({ lines: [{ text: 'a' }, { text: 'b' }] }, 'paragraph');
    expect(r.pages[0]?.lines).toHaveLength(2);
    expect(r.pages[0]?.lines[0]?.box.h).toBeGreaterThan(0);
  });
  it('accepts a bare word result', () => {
    const r = normalizeOcrResponse({ text: 'ಕನ್ನಡ', confidence: 0.99 }, 'word');
    expect(r.pages[0]?.lines).toHaveLength(1);
    expect(r.pages[0]?.lines[0]?.text).toBe('ಕನ್ನಡ');
  });
  it('splits multi-line text for non-word modes', () => {
    const r = normalizeOcrResponse({ text: 'a\n\nb' }, 'page');
    expect(r.pages[0]?.lines.map((l) => l.text)).toEqual(['a', 'b']);
  });
  it('rejects garbage', () => {
    expect(() => normalizeOcrResponse(null, 'word')).toThrow();
    expect(() => normalizeOcrResponse({ foo: 1 }, 'word')).toThrow();
  });
});
