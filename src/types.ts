export type Locale = 'kn' | 'en';
export type ThemePref = 'light' | 'dark' | 'system';

/** What the user is reading: a cropped word, a few lines, or a whole page. */
export type OcrMode = 'word' | 'paragraph' | 'page';
export type TextType = 'printed' | 'handwritten';

/** Normalised (0..1) rectangle relative to the page image. */
export interface BoundingBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface OcrLine {
  id: string;
  text: string;
  /** 0..1 */
  confidence: number;
  box: BoundingBox;
  /** Other candidate readings, best first (excluding `text`). */
  alternatives: string[];
}

export interface OcrPage {
  index: number;
  width: number;
  height: number;
  /** Optional preview rendered by the backend (used for PDFs). */
  previewUrl?: string;
  lines: OcrLine[];
}

export interface OcrResult {
  id: string;
  pages: OcrPage[];
  modelVersion?: string;
  durationMs?: number;
}

export interface EnhanceSettings {
  deskew: boolean;
  denoise: boolean;
  /** 0..100, 50 = unchanged */
  contrast: number;
  /** 0..100, 50 = unchanged */
  brightness: number;
}

export interface OcrRequest {
  file: File;
  mode: OcrMode;
  textType: TextType;
  enhance: EnhanceSettings;
  signal?: AbortSignal;
}

export interface FeedbackPayload {
  jobId: string;
  lineId: string;
  original: string;
  corrected: string;
  mode: OcrMode;
  textType: TextType;
}

/** Lifecycle of a job inside the app. */
export type JobState = 'queued' | 'processing' | 'ready' | 'error';

/** What the UI shows as a status badge. */
export type DisplayStatus = 'queued' | 'processing' | 'error' | 'done' | 'review' | 'edited';

export interface Job {
  id: string;
  fileName: string;
  fileType: string;
  /** In-memory only. Missing for jobs re-opened from history. */
  file?: File;
  previewUrl?: string;
  mode: OcrMode;
  textType: TextType;
  enhance: EnhanceSettings;
  state: JobState;
  result?: OcrResult;
  /** Per-line corrections picked in the review card. lineId -> text */
  lineOverrides: Record<string, string>;
  /** Free-text edit of the whole output; takes precedence over lines. */
  editedText?: string;
  error?: string;
  createdAt: number;
}

export interface HistoryEntry {
  id: string;
  fileName: string;
  fileType: string;
  mode: OcrMode;
  textType: TextType;
  enhance: EnhanceSettings;
  result: OcrResult;
  lineOverrides: Record<string, string>;
  editedText?: string;
  status: Extract<DisplayStatus, 'done' | 'review' | 'edited'>;
  text: string;
  lineCount: number;
  createdAt: number;
}
