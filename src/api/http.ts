import { API_BASE, ENDPOINTS } from '@/api/config';
import { ApiError } from '@/api/errors';
import { normalizeOcrResponse } from '@/api/normalize';
import type { OcrApi } from '@/api/types';
import { REQUEST_TIMEOUT_MS } from '@/lib/constants';

async function request(
  path: string,
  init: RequestInit,
  outerSignal?: AbortSignal,
  timeoutMs: number = REQUEST_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const onOuterAbort = () => controller.abort();
  outerSignal?.addEventListener('abort', onOuterAbort, { once: true });

  try {
    const response = await fetch(`${API_BASE}${path}`, { ...init, signal: controller.signal });
    if (!response.ok) {
      let detail = `HTTP ${response.status}`;
      try {
        const body: unknown = await response.json();
        if (typeof body === 'object' && body !== null) {
          const rec = body as Record<string, unknown>;
          const message = rec.detail ?? rec.message ?? rec.error;
          if (typeof message === 'string') detail = message;
        }
      } catch {
        /* body is not JSON */
      }
      throw new ApiError(detail, 'http', response.status);
    }
    return response;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (outerSignal?.aborted) throw error; // caller cancelled: surface the AbortError untouched
    if (timedOut) throw new ApiError('Request timed out', 'timeout');
    throw new ApiError('Network error', 'network');
  } finally {
    window.clearTimeout(timer);
    outerSignal?.removeEventListener('abort', onOuterAbort);
  }
}

export const httpApi: OcrApi = {
  async recognize({ file, mode, textType, enhance, signal }) {
    const form = new FormData();
    form.append('file', file);
    form.append('mode', mode);
    form.append('text_type', textType);
    form.append('deskew', String(enhance.deskew));
    form.append('denoise', String(enhance.denoise));
    form.append('contrast', String(enhance.contrast));
    form.append('brightness', String(enhance.brightness));
    const response = await request(ENDPOINTS.ocr, { method: 'POST', body: form }, signal);
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new ApiError('Invalid OCR response', 'invalid');
    }
    return normalizeOcrResponse(body, mode);
  },

  async translate(text, signal) {
    const response = await request(
      ENDPOINTS.translate,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, source: 'kn', target: 'en' }),
      },
      signal,
      30_000,
    );
    const body = (await response.json()) as Record<string, unknown>;
    const translation = body.translation ?? body.text;
    if (typeof translation !== 'string') throw new ApiError('Invalid translation response', 'invalid');
    return translation;
  },

  async sendFeedback(payload) {
    await request(
      ENDPOINTS.feedback,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_id: payload.jobId,
          line_id: payload.lineId,
          original: payload.original,
          corrected: payload.corrected,
          mode: payload.mode,
          text_type: payload.textType,
        }),
      },
      undefined,
      15_000,
    );
  },

  async exportPdf({ title, text }) {
    const response = await request(
      ENDPOINTS.exportPdf,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, text }),
      },
      undefined,
      60_000,
    );
    return response.blob();
  },

  async speak(text, signal) {
    const response = await request(
      ENDPOINTS.tts,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      },
      signal,
      60_000,
    );
    return response.blob();
  },

  async health() {
    try {
      await request(ENDPOINTS.health, { method: 'GET' }, undefined, 5_000);
      return true;
    } catch {
      return false;
    }
  },
};
