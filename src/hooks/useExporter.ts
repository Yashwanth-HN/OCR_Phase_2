import { useCallback } from 'react';
import { api, USE_MOCK } from '@/api';
import { useI18n } from '@/i18n';
import { downloadBlob, safeFileName } from '@/lib/download';
import { buildDocx, buildTxt, printAsPdf } from '@/lib/export';
import { baseName, jobText } from '@/lib/job';
import { useToasts } from '@/store/useToasts';
import type { Job } from '@/types';

/** Copy / download actions for a single job's current text (including the user's edits). */
export function useExporter(job: Job | undefined) {
  const { t } = useI18n();
  const push = useToasts((s) => s.push);

  const text = job ? jobText(job) : '';
  const title = job ? baseName(job.fileName) : 'kannada-ocr';
  const fileBase = safeFileName(title);

  const copy = useCallback(async () => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      push(t('act.copied'), 'success');
    } catch {
      push(t('act.copyFailed'), 'error');
    }
  }, [text, push, t]);

  const downloadTxt = useCallback(() => {
    if (!text) return;
    downloadBlob(buildTxt([{ title, text }]), `${fileBase}.txt`);
    push(t('act.downloaded'), 'success');
  }, [text, title, fileBase, push, t]);

  const downloadDocx = useCallback(async () => {
    if (!text) return;
    try {
      downloadBlob(await buildDocx([{ title, text }]), `${fileBase}.docx`);
      push(t('act.downloaded'), 'success');
    } catch {
      push(t('act.exportFailed'), 'error');
    }
  }, [text, title, fileBase, push, t]);

  const downloadPdf = useCallback(async () => {
    if (!text) return;
    try {
      downloadBlob(await api.exportPdf({ title, text }), `${fileBase}.pdf`);
      push(t('act.downloaded'), 'success');
    } catch {
      // Demo mode has no PDF backend; fall back to the browser's "Save as PDF" print dialog.
      if (USE_MOCK && printAsPdf(title, text)) return;
      push(t('act.pdfBackend'), 'error');
    }
  }, [text, title, fileBase, push, t]);

  return { text, copy, downloadTxt, downloadDocx, downloadPdf };
}
