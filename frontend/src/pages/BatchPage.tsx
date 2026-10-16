import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Dropzone } from '@/components/Dropzone';
import { PageIcon } from '@/components/icons';
import { Segmented } from '@/components/Segmented';
import { StatusBadge } from '@/components/StatusBadge';
import { ACCEPT_ATTR } from '@/lib/constants';
import { useIngest } from '@/hooks/useIngest';
import { useI18n } from '@/i18n';
import { downloadBlob } from '@/lib/download';
import { buildExport, buildZip, type ExportFormat, type ExportSection } from '@/lib/export';
import { displayStatus, jobLines, jobText } from '@/lib/job';
import { useAppStore } from '@/store/useAppStore';
import { useToasts } from '@/store/useToasts';
import type { Job } from '@/types';

type ExportMode = 'single' | 'perFile';

function BatchRow({ job }: { job: Job }) {
  const { t } = useI18n();
  const runJob = useAppStore((s) => s.runJob);
  const cancelJob = useAppStore((s) => s.cancelJob);
  const removeJob = useAppStore((s) => s.removeJob);
  const status = displayStatus(job);
  const preview = job.state === 'ready' ? jobText(job) : '';

  return (
    <li className={`batch-row${job.state === 'processing' ? ' is-processing' : ''}`}>
      <span className="batch-row__thumb" aria-hidden="true">
        {job.previewUrl ? <img src={job.previewUrl} alt="" /> : <PageIcon size={22} />}
      </span>
      <span className="batch-row__name">
        <span className="batch-row__file" title={job.fileName}>
          {job.fileName}
        </span>
        {job.state === 'processing' ? (
          <span className="indeterminate" aria-hidden="true">
            <span />
          </span>
        ) : (
          <span className="muted">
            {job.state === 'ready'
              ? t('batch.lines', { n: jobLines(job).length })
              : job.state === 'error' && job.error === 'cancelled'
                ? t('batch.cancelled')
                : job.state === 'queued'
                  ? t('batch.queued')
                  : ''}
          </span>
        )}
      </span>
      <span className="batch-row__preview" lang="kn">
        {job.state === 'processing' ? t('batch.reading') : preview || '—'}
      </span>
      <StatusBadge status={status} />
      <span className="batch-row__actions">
        {job.state === 'ready' && (
          <Link className="link-btn" to={`/workspace/${job.id}`}>
            {t('common.open')}
          </Link>
        )}
        {job.state === 'processing' && (
          <button type="button" className="link-btn" onClick={() => cancelJob(job.id)}>
            {t('common.cancel')}
          </button>
        )}
        {job.state === 'error' && (
          <button type="button" className="link-btn" onClick={() => void runJob(job.id)}>
            {t('common.retry')}
          </button>
        )}
        {job.state !== 'processing' && (
          <button type="button" className="link-btn link-btn--muted" onClick={() => removeJob(job.id)}>
            {t('common.remove')}
          </button>
        )}
      </span>
    </li>
  );
}

export default function BatchPage() {
  const { t } = useI18n();
  const push = useToasts((s) => s.push);
  const { addToBatch } = useIngest();
  const batchIds = useAppStore((s) => s.batchIds);
  const jobsById = useAppStore((s) => s.jobs);
  const mode = useAppStore((s) => s.settings.mode);
  const inputRef = useRef<HTMLInputElement>(null);

  const [format, setFormat] = useState<ExportFormat>('docx');
  const [exportMode, setExportMode] = useState<ExportMode>('single');
  const [exporting, setExporting] = useState(false);

  const jobs = batchIds.map((id) => jobsById[id]).filter((j): j is Job => Boolean(j));
  const total = jobs.length;
  const ready = jobs.filter((j) => j.state === 'ready');
  const settled = jobs.filter((j) => j.state === 'ready' || j.state === 'error').length;
  const percent = total === 0 ? 0 : Math.round((settled / total) * 100);

  const exportAll = async () => {
    if (ready.length === 0) {
      push(t('batch.nothingToExport'), 'info');
      return;
    }
    setExporting(true);
    try {
      const sections: ExportSection[] = ready.map((job) => ({ title: job.fileName, text: jobText(job) }));
      if (exportMode === 'perFile') {
        downloadBlob(await buildZip(sections, format), 'kannada-ocr-batch.zip');
      } else {
        downloadBlob(await buildExport(sections, format), `kannada-ocr-batch.${format}`);
      }
      push(t('act.downloaded'), 'success');
    } catch {
      push(t('act.exportFailed'), 'error');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="container page">
      <div className="page__head">
        <div>
          <h1 className="page__title">{t('batch.title')}</h1>
          <p className="muted">{t('batch.summary', { n: total, mode: t(`mode.${mode}`) })}</p>
        </div>
        <div className="page__actions">
          <button type="button" className="btn btn--outline" onClick={() => inputRef.current?.click()}>
            {t('batch.add')}
          </button>
          <button type="button" className="btn btn--primary" onClick={exportAll} disabled={exporting || ready.length === 0}>
            {t('batch.exportAll')}
          </button>
          <input
            ref={inputRef}
            type="file"
            hidden
            multiple
            accept={ACCEPT_ATTR}
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              if (files.length > 0) addToBatch(files);
              event.target.value = '';
            }}
          />
        </div>
      </div>

      {total === 0 ? (
        <div className="empty">
          <p className="muted">{t('batch.empty')}</p>
          <Dropzone onFiles={addToBatch} compact />
        </div>
      ) : (
        <>
          <section className="panel progress-card" aria-label={t('batch.progress')}>
            <div className="progress-card__row">
              <span>{t('batch.progress')}</span>
              <span className="muted">{t('batch.doneCount', { done: ready.length, total })}</span>
            </div>
            <div
              className="progress"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
              aria-label={t('batch.progress')}
            >
              <span className="progress__fill" style={{ width: `${percent}%` }} />
            </div>
          </section>

          <ul className="batch-list">
            {jobs.map((job) => (
              <BatchRow key={job.id} job={job} />
            ))}
          </ul>

          <div className="export-options">
            <div className="export-options__group">
              <span className="muted">{t('batch.exportMode')}</span>
              <Segmented<ExportMode>
                label={t('batch.exportMode')}
                value={exportMode}
                onChange={setExportMode}
                options={[
                  { value: 'single', label: t('batch.single') },
                  { value: 'perFile', label: t('batch.perFile') },
                ]}
              />
            </div>
            <div className="export-options__group">
              <span className="muted">{t('batch.format')}</span>
              <Segmented<ExportFormat>
                label={t('batch.format')}
                value={format}
                onChange={setFormat}
                options={[
                  { value: 'docx', label: '.docx' },
                  { value: 'txt', label: '.txt' },
                ]}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
