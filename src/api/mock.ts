import { ApiError } from '@/api/errors';
import type { OcrApi } from '@/api/types';
import { SAMPLE_LINES, SAMPLE_TRANSLATION } from '@/lib/constants';
import { newId } from '@/lib/id';
import type { OcrLine, OcrMode, OcrPage, OcrResult } from '@/types';

/** Resolves after `ms`, rejecting with an AbortError if the signal fires first. */
function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const timer = window.setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      window.clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function samplePage(index: number, mode: OcrMode): OcrPage {
  const source = mode === 'word' ? [SAMPLE_LINES[2].split(' ')[0] ?? 'ಕನ್ನಡ'] : [...SAMPLE_LINES];
  // Geometry mirrors the canvas in lib/sample.ts (1200x520, 120px rows) so boxes sit on the text.
  const pageHeight = 160 + SAMPLE_LINES.length * 120;
  const lines: OcrLine[] = source.map((text, i) => ({
    id: `p${index}l${i}`,
    text,
    // The last line is intentionally uncertain so the review flow can be tried in demo mode.
    confidence: mode !== 'word' && i === source.length - 1 ? 0.62 : 0.94 - i * 0.03,
    box: { x: 0.05, y: (35 + i * 120) / pageHeight, w: mode === 'word' ? 0.3 : 0.9, h: 110 / pageHeight },
    alternatives:
      mode !== 'word' && i === source.length - 1
        ? ['ಕನ್ನಡ ಇದರ ಅಧಿಕೃತ ಭಾಷೆ', 'ಕನ್ನಡ ಇದರ ಅದಿಕೃತ ಭಾಷೆ.']
        : [],
  }));
  return { index, width: 1200, height: pageHeight, lines };
}

export const mockApi: OcrApi = {
  async recognize({ file, mode, signal }) {
    await delay(1400, signal);
    const pageCount = mode === 'page' && file.type === 'application/pdf' ? 2 : 1;
    const result: OcrResult = {
      id: newId(),
      pages: Array.from({ length: pageCount }, (_, i) => samplePage(i, mode)),
      modelVersion: 'demo-mock',
      durationMs: 1400,
    };
    return result;
  },

  async translate(text, signal) {
    await delay(700, signal);
    const normalized = text.replace(/\s+/g, ' ').trim();
    return normalized.startsWith(SAMPLE_LINES[0])
      ? SAMPLE_TRANSLATION
      : `[Demo translation] ${normalized.length > 80 ? `${normalized.slice(0, 80)}…` : normalized}`;
  },

  async sendFeedback() {
    await delay(200);
  },

  async exportPdf() {
    throw new ApiError('PDF export needs the backend', 'unsupported');
  },

  async speak() {
    // Demo mode has no speech backend; useSpeech falls back to the browser's voice.
    throw new ApiError('Speech needs the backend', 'unsupported');
  },

  async health() {
    return { online: true, modelVersion: 'demo-mock' };
  },
};
