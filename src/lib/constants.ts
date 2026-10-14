import type { EnhanceSettings } from '@/types';

export const ACCEPTED_MIME = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'] as const;
export const ACCEPT_ATTR = '.png,.jpg,.jpeg,.webp,.pdf,image/png,image/jpeg,image/webp,application/pdf';

const parsedMax = Number(import.meta.env.VITE_MAX_FILE_MB ?? 20);
export const MAX_FILE_MB = Number.isFinite(parsedMax) && parsedMax > 0 ? parsedMax : 20;

/** Lines under this confidence are flagged for review. */
export const LOW_CONFIDENCE = 0.75;
export const HIGH_CONFIDENCE = 0.9;

export const HISTORY_LIMIT = 500;
export const BATCH_CONCURRENCY = 2;
export const REQUEST_TIMEOUT_MS = 120_000;

export const DEFAULT_ENHANCE: EnhanceSettings = {
  deskew: true,
  denoise: true,
  contrast: 50,
  brightness: 50,
};

/** Sample Kannada text used by the hero preview, sample image and demo API. */
export const SAMPLE_LINES = [
  'ಕರ್ನಾಟಕವು ಭಾರತದ ದಕ್ಷಿಣ ಭಾಗದಲ್ಲಿರುವ',
  'ಒಂದು ರಾಜ್ಯ. ಇದರ ರಾಜಧಾನಿ ಬೆಂಗಳೂರು.',
  'ಕನ್ನಡ ಇದರ ಅಧಿಕೃತ ಭಾಷೆ.',
] as const;

export const SAMPLE_TRANSLATION =
  'Karnataka is a state in southern India. Its capital is Bengaluru. Kannada is its official language.';

export const STORAGE_KEY = 'kannada-ocr:v1';
