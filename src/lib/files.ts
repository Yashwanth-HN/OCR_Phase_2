import { ACCEPTED_MIME, MAX_FILE_MB } from '@/lib/constants';

export type FileIssue = { kind: 'type' | 'size'; name: string };

const EXT_TO_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  pdf: 'application/pdf',
};

function effectiveMime(file: File): string {
  if (file.type) return file.type;
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  return EXT_TO_MIME[ext] ?? '';
}

export function validateFiles(
  files: File[],
  maxMb: number = MAX_FILE_MB,
): { valid: File[]; issues: FileIssue[] } {
  const valid: File[] = [];
  const issues: FileIssue[] = [];
  for (const file of files) {
    if (!(ACCEPTED_MIME as readonly string[]).includes(effectiveMime(file))) {
      issues.push({ kind: 'type', name: file.name });
    } else if (file.size > maxMb * 1024 * 1024) {
      issues.push({ kind: 'size', name: file.name });
    } else {
      valid.push(file);
    }
  }
  return { valid, issues };
}

export function isImageFile(file: { type: string }): boolean {
  return file.type.startsWith('image/');
}

/** Downloads an image from a URL in the browser. Fails when the remote server blocks CORS. */
export async function fileFromUrl(rawUrl: string): Promise<File> {
  const url = new URL(rawUrl);
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('Unsupported protocol');
  }
  const response = await fetch(url.toString());
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const blob = await response.blob();
  if (!(ACCEPTED_MIME as readonly string[]).includes(blob.type)) {
    throw new Error('Unsupported content type');
  }
  const last = url.pathname.split('/').filter(Boolean).pop() ?? 'image';
  const ext = blob.type.split('/')[1] ?? 'png';
  const name = last.includes('.') ? last : `${last}.${ext}`;
  return new File([blob], name, { type: blob.type });
}
