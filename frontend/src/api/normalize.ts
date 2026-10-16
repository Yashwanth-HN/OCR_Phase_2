import { ApiError } from '@/api/errors';
import { newId } from '@/lib/id';
import type { BoundingBox, OcrLine, OcrMode, OcrPage, OcrResult } from '@/types';

type Rec = Record<string, unknown>;

const isRecord = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const asString = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);
const asNumber = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined;
const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));

/** Accepts 0..1 or 0..100 (percent) confidence values. */
function normalizeConfidence(v: unknown, fallback: number): number {
  const n = asNumber(v);
  if (n === undefined) return fallback;
  return clamp01(n > 1 ? n / 100 : n);
}

/** Evenly stacked boxes, used when the backend does not return coordinates. */
function stackedBox(index: number, count: number): BoundingBox {
  const rowHeight = 0.8 / Math.max(count, 1);
  return { x: 0.08, y: 0.1 + index * rowHeight, w: 0.84, h: rowHeight * 0.8 };
}

function normalizeBox(raw: Rec, pageW: number, pageH: number, index: number, count: number): BoundingBox {
  let candidate: number[] | undefined;
  if (isRecord(raw.box)) {
    const b = raw.box;
    const [x, y, w, h] = [asNumber(b.x), asNumber(b.y), asNumber(b.w ?? b.width), asNumber(b.h ?? b.height)];
    if (x !== undefined && y !== undefined && w !== undefined && h !== undefined) candidate = [x, y, w, h];
  } else if (Array.isArray(raw.bbox) && raw.bbox.length === 4 && raw.bbox.every((n) => typeof n === 'number')) {
    candidate = raw.bbox as number[];
  }
  if (!candidate) return stackedBox(index, count);
  const [x, y, w, h] = candidate as [number, number, number, number];
  // Values above 1 are treated as pixels of the page image.
  const pixels = x > 1 || y > 1 || w > 1 || h > 1;
  return pixels
    ? { x: clamp01(x / pageW), y: clamp01(y / pageH), w: clamp01(w / pageW), h: clamp01(h / pageH) }
    : { x: clamp01(x), y: clamp01(y), w: clamp01(w), h: clamp01(h) };
}

function normalizeLine(raw: unknown, pageIndex: number, i: number, count: number, w: number, h: number): OcrLine | null {
  if (!isRecord(raw)) return null;
  const text = asString(raw.text);
  if (text === undefined) return null;
  const alternatives = Array.isArray(raw.alternatives)
    ? raw.alternatives.filter((a): a is string => typeof a === 'string' && a !== text)
    : [];
  return {
    id: asString(raw.id) ?? `p${pageIndex}l${i}`,
    text,
    confidence: normalizeConfidence(raw.confidence, 0.9),
    box: normalizeBox(raw, w, h, i, count),
    alternatives,
  };
}

function normalizePage(raw: unknown, index: number): OcrPage {
  const rec = isRecord(raw) ? raw : {};
  const width = asNumber(rec.width) ?? 1000;
  const height = asNumber(rec.height) ?? 1400;
  const rawLines = Array.isArray(rec.lines) ? rec.lines : [];
  const lines = rawLines
    .map((l, i) => normalizeLine(l, index, i, rawLines.length, width, height))
    .filter((l): l is OcrLine => l !== null);
  return {
    index: asNumber(rec.index) ?? index,
    width,
    height,
    previewUrl: asString(rec.preview_url ?? rec.previewUrl),
    lines,
  };
}

/**
 * Turns whatever the backend returns into an OcrResult.
 * Supported shapes:
 *  1. { pages: [{ lines: [{ text, confidence, box|bbox, alternatives }] }] }   (full contract)
 *  2. { lines: [...] }                                                          (single page)
 *  3. { text: "...", confidence?: 0.93 }                                        (word-level model)
 */
export function normalizeOcrResponse(raw: unknown, mode: OcrMode): OcrResult {
  if (!isRecord(raw)) throw new ApiError('Invalid OCR response', 'invalid');

  let rawPages: unknown[];
  if (Array.isArray(raw.pages)) {
    rawPages = raw.pages;
  } else if (Array.isArray(raw.lines)) {
    rawPages = [{ lines: raw.lines }];
  } else if (typeof raw.text === 'string') {
    const confidence = raw.confidence;
    const parts = mode === 'word' ? [raw.text] : raw.text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    rawPages = [{ lines: parts.map((text) => ({ text, confidence })) }];
  } else {
    throw new ApiError('Invalid OCR response', 'invalid');
  }

  return {
    id: asString(raw.id) ?? newId(),
    pages: rawPages.map((p, i) => normalizePage(p, i)),
    modelVersion: asString(raw.model_version ?? raw.modelVersion),
    durationMs: asNumber(raw.duration_ms ?? raw.durationMs),
  };
}
