export const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true';
export const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '/api').replace(/\/$/, '');

/**
 * Paths relative to API_BASE. Change these if your backend uses different routes.
 * (The response shape is normalised in normalize.ts.)
 */
export const ENDPOINTS = {
  ocr: '/ocr',
  translate: '/translate',
  feedback: '/feedback',
  exportPdf: '/export/pdf',
  tts: '/tts',
  health: '/health',
} as const;
