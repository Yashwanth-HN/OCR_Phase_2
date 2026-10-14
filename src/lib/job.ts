import { HIGH_CONFIDENCE, LOW_CONFIDENCE } from '@/lib/constants';
import type { DisplayStatus, Job, OcrLine, OcrMode, OcrResult } from '@/types';

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export function confidenceLevel(confidence: number): ConfidenceLevel {
  if (confidence >= HIGH_CONFIDENCE) return 'high';
  if (confidence >= LOW_CONFIDENCE) return 'medium';
  return 'low';
}

export function formatPercent(confidence: number): string {
  return `${Math.round(Math.min(1, Math.max(0, confidence)) * 100)}%`;
}

/** All lines of a result with the user's per-line corrections applied. */
export function resolveLines(
  result: OcrResult | undefined,
  overrides: Record<string, string>,
): OcrLine[] {
  if (!result) return [];
  return result.pages.flatMap((page) =>
    page.lines.map((line) =>
      overrides[line.id] !== undefined ? { ...line, text: overrides[line.id] as string } : line,
    ),
  );
}

/**
 * Join lines into running text.
 * - word:      the single best line
 * - paragraph: lines are one flowing paragraph, joined by spaces
 * - page:      line breaks are kept, as the layout is meaningful
 */
export function joinLines(lines: OcrLine[], mode: OcrMode): string {
  const texts = lines.map((l) => l.text.trim()).filter(Boolean);
  if (mode === 'word') return texts[0] ?? '';
  if (mode === 'paragraph') return texts.join(' ');
  return texts.join('\n');
}

export function jobLines(job: Job): OcrLine[] {
  return resolveLines(job.result, job.lineOverrides);
}

export function jobText(job: Pick<Job, 'result' | 'lineOverrides' | 'editedText' | 'mode'>): string {
  if (job.editedText !== undefined) return job.editedText;
  return joinLines(resolveLines(job.result, job.lineOverrides), job.mode);
}

/** Lines that still need the user's attention (low confidence and not yet corrected). */
export function linesNeedingReview(job: Pick<Job, 'result' | 'lineOverrides'>): OcrLine[] {
  if (!job.result) return [];
  return job.result.pages.flatMap((page) =>
    page.lines.filter(
      (line) => line.confidence < LOW_CONFIDENCE && job.lineOverrides[line.id] === undefined,
    ),
  );
}

/** 1-based reading-order numbers for every line, across pages. */
export function lineNumberMap(result: OcrResult | undefined): Map<string, number> {
  const map = new Map<string, number>();
  let n = 1;
  for (const page of result?.pages ?? []) {
    for (const line of page.lines) map.set(line.id, n++);
  }
  return map;
}

export function averageConfidence(lines: OcrLine[]): number {
  if (lines.length === 0) return 0;
  return lines.reduce((sum, l) => sum + l.confidence, 0) / lines.length;
}

export function displayStatus(
  job: Pick<Job, 'state' | 'result' | 'lineOverrides' | 'editedText'>,
): DisplayStatus {
  if (job.state === 'queued') return 'queued';
  if (job.state === 'processing') return 'processing';
  if (job.state === 'error') return 'error';
  if (linesNeedingReview(job).length > 0 && job.editedText === undefined) return 'review';
  const edited = job.editedText !== undefined || Object.keys(job.lineOverrides).length > 0;
  return edited ? 'edited' : 'done';
}

export function baseName(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  return dot > 0 ? fileName.slice(0, dot) : fileName;
}
