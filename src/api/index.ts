import { USE_MOCK } from '@/api/config';
import { httpApi } from '@/api/http';
import { mockApi } from '@/api/mock';
import type { OcrApi } from '@/api/types';

export const api: OcrApi = USE_MOCK ? mockApi : httpApi;
export { USE_MOCK } from '@/api/config';
export { ApiError, isAbortError } from '@/api/errors';
