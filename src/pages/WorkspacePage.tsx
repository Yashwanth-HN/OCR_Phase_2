import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AudioPlayer } from '@/components/AudioPlayer';
import { DocumentViewer } from '@/components/DocumentViewer';
import { EnhancePanel } from '@/components/EnhancePanel';
import { ExportMenu } from '@/components/ExportMenu';
import { ReviewCard } from '@/components/ReviewCard';
import { Segmented } from '@/components/Segmented';
import { ShortcutsCard } from '@/components/ShortcutsCard';
import { TextPanel } from '@/components/TextPanel';
import { TranslationCard } from '@/components/TranslationCard';
import { useExporter } from '@/hooks/useExporter';
import { useShortcuts } from '@/hooks/useShortcuts';
import { useSpeech } from '@/hooks/useSpeech';
import { useTranslation } from '@/hooks/useTranslation';
import { useI18n } from '@/i18n';
import { jobText } from '@/lib/job';
import { useAppStore, useJob } from '@/store/useAppStore';
import type { EnhanceSettings, OcrMode, TextType } from '@/types';

export default function WorkspacePage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useI18n();
  const job = useJob(id);
  const openFromHistory = useAppStore((s) => s.openFromHistory);
  const updateJob = useAppStore((s) => s.updateJob);
  const runJob = useAppStore((s) => s.runJob);
  const changeMode = useAppStore((s) => s.changeMode);

  const [missing, setMissing] = useState(false);
  const [pageIndex, setPageIndex] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [showBoxes, setShowBoxes] = useState(true);
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);

  // Re-opened from History (or a reload): rebuild the job from the saved entry.
  useEffect(() => {
    if (!id) return;
    setMissing(!openFromHistory(id));
    setPageIndex(0);
    setSelectedLineId(null);
  }, [id, openFromHistory]);

  const text = job ? jobText(job) : '';
  const speech = useSpeech();
  const translation = useTranslation(text);
  const exporter = useExporter(job);

  useShortcuts({
    copy: () => void exporter.copy(),
    listen: () => speech.toggle(text),
    translate: translation.toggle,
  });

  // Speech for stale text makes no sense once the text changes.
  useEffect(() => {
    speech.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  if (!id || missing || !job) {
    return (
      <div className="page-center">
        <p>{t('ws.notFound')}</p>
        <Link to="/" className="btn btn--primary">
          {t('err.home')}
        </Link>
      </div>
    );
  }

  const busy = job.state === 'processing';
  const canRerun = Boolean(job.file);
  const pageCount = job.result?.pages.length ?? 0;

  const onEnhance = (patch: Partial<EnhanceSettings>) =>
    updateJob(job.id, { enhance: { ...job.enhance, ...patch } });
  const onTextType = (textType: TextType) => {
    updateJob(job.id, { textType });
  };

  return (
    <div className="workspace container page">
      <div className="workspace__bar">
        <div className="workspace__meta">
          <Link to="/" className="back-link">
            {t('ws.newUpload')}
          </Link>
          <h1 className="workspace__file" title={job.fileName}>
            {job.fileName}
          </h1>
          {pageCount > 1 && (
            <span className="muted">{t('ws.pageOf', { n: pageIndex + 1, total: pageCount })}</span>
          )}
        </div>
        <Segmented<OcrMode>
          className="workspace__mode"
          label={t('ws.modeLabel')}
          value={job.mode}
          disabled={busy || !canRerun}
          onChange={(mode) => void changeMode(job.id, mode)}
          options={[
            { value: 'word', label: t('mode.word') },
            { value: 'paragraph', label: t('mode.paragraph') },
            { value: 'page', label: t('mode.page') },
          ]}
        />
        <ExportMenu exporter={exporter} disabled={!text.trim()} />
      </div>

      {job.state === 'error' && (
        <div className="alert" role="alert">
          <span>{job.error === 'cancelled' ? t('ws.cancelled') : t('ws.failed')}</span>
          {canRerun && (
            <button type="button" className="btn btn--outline btn--sm" onClick={() => void runJob(job.id)}>
              {t('common.retry')}
            </button>
          )}
        </div>
      )}

      <div className="workspace__grid">
        <aside className="workspace__side">
          <EnhancePanel
            enhance={job.enhance}
            textType={job.textType}
            canRerun={canRerun}
            busy={busy}
            onEnhance={onEnhance}
            onTextType={onTextType}
            onRerun={() => void runJob(job.id)}
          />
          <ShortcutsCard />
        </aside>

        <DocumentViewer
          job={job}
          pageIndex={Math.min(pageIndex, Math.max(pageCount - 1, 0))}
          zoom={zoom}
          showBoxes={showBoxes}
          selectedLineId={selectedLineId}
          onSelectLine={setSelectedLineId}
          onPageChange={setPageIndex}
          onZoom={setZoom}
          onToggleBoxes={() => setShowBoxes((v) => !v)}
        />

        <div className="workspace__results">
          <TextPanel job={job} exporter={exporter} selectedLineId={selectedLineId} onSelectLine={setSelectedLineId} />
          <AudioPlayer text={text} speech={speech} />
          <TranslationCard disabled={!text.trim()} translation={translation} />
          <ReviewCard job={job} selectedLineId={selectedLineId} />
        </div>
      </div>
    </div>
  );
}
