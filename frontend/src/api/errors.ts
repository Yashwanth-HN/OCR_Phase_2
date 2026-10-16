export type ApiErrorCode = 'network' | 'timeout' | 'http' | 'invalid' | 'unsupported';

export class ApiError extends Error {
  readonly status?: number;
  readonly code: ApiErrorCode;

  constructor(message: string, code: ApiErrorCode, status?: number) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}
