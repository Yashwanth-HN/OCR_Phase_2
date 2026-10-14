import { useEffect, useId, useState } from 'react';
import { ConfidenceBar } from '@/components/ConfidenceBar';
import { LineList } from '@/components/LineList';
import type { useExporter } from '@/hooks/useExporter';
import { useI18n } from '@/i18n';
import { averageConfidence, jobLines, lineNumberMap } from '@/lib/job';
import { useAppStore } from '@/store/useAppStore';
import type { Job } from '@/types';

type Tab = 'text' | 'lines' | 'json';

interface TextPanelProps {
  job: Job;
  exporter: ReturnType<typeof useExporter>;
  selectedLineId: string | null;
  onSelectLine: (id: string) => void;
}

export function TextPanel({ job, exporter, selectedLineId, onSelectLine }: TextPanelProps) {
  const { t } = useI18n();
  const baseId = useId();
  const setEditedText = useAppStore((s) => s.setEditedText);
  const [tab, setTab] = useState<Tab>('text');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const lines = jobLines(job);
  const numbers = lineNumberMap(job.result);
  const resolvedIds = new Set(Object.keys(job.lineOverrides));
  const { text } = exporter;
  const hasText = text.trim().length > 0;

  // Leaving the page for a different result must not carry an open editor along.
  useEffect(() => {
    setEditing(false);
  }, [job.id]);

  const startEdit = () => {
    setDraft(text);
    setEditing(true);
  };
  const finishEdit = () => {
    // Only record an edit when the text really changed.
    if (draft !== text) setEditedText(job.id, draft);
    setEditing(false);
  };

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'text', label: t('tab.text') },
    { id: 'lines', label: t('tab.lines') },
    { id: 'json', label: t('tab.json') },
  ];

  const json = JSON.stringify(
    {
      id: job.result?.id,
      mode: job.mode,
      textType: job.textType,
      text,
      lines: lines.map((l) => ({ id: l.id, text: l.text, confidence: l.confidence, box: l.box })),
    },
    null,
    2,
  );

  return (
    <section className="panel panel--main" aria-label={t('text.label')}>
      <div className="tabs" role="tablist" aria-label={t('text.label')}>
        {tabs.map((item) => (
          <button
            key={item.id}
            id={`${baseId}-tab-${item.id}`}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            aria-controls={`${baseId}-panel-${item.id}`}
            className={`tabs__tab${tab === item.id ? ' is-active' : ''}`}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div
        id={`${baseId}-panel-${tab}`}
        role="tabpanel"
        aria-labelledby={`${baseId}-tab-${tab}`}
        className="tabs__panel"
      >
        {tab === 'text' && (
          <>
            {editing ? (
              <textarea
                className="reading reading--edit"
                lang="kn"
                aria-label={t('text.editLabel')}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                rows={Math.max(5, draft.split('\n').length + 1)}
                autoFocus
              />
            ) : hasText ? (
              <p className="reading" lang="kn">
                {text}
              </p>
            ) : (
              <p className="muted">{t('text.empty')}</p>
            )}

            {lines.length > 0 && (
              <div className="overall">
                <span>
                  {t('conf.overall')} · {t('conf.label')}
                </span>
                <ConfidenceBar value={averageConfidence(lines)} showLabel />
              </div>
            )}

            <div className="actions">
              <button type="button" className="btn btn--primary" onClick={exporter.copy} disabled={!hasText}>
                {t('act.copy')}
              </button>
              {editing ? (
                <button type="button" className="btn btn--outline" onClick={finishEdit}>
                  {t('act.done')}
                </button>
              ) : (
                <button type="button" className="btn btn--outline" onClick={startEdit} disabled={!job.result}>
                  {t('act.edit')}
                </button>
              )}
              {job.editedText !== undefined && !editing && (
                <button type="button" className="btn btn--ghost" onClick={() => setEditedText(job.id, undefined)}>
                  {t('act.reset')}
                </button>
              )}
              <button type="button" className="btn btn--outline btn--sm" onClick={exporter.downloadTxt} disabled={!hasText}>
                .txt
              </button>
              <button type="button" className="btn btn--outline btn--sm" onClick={exporter.downloadDocx} disabled={!hasText}>
                .docx
              </button>
              <button type="button" className="btn btn--outline btn--sm" onClick={exporter.downloadPdf} disabled={!hasText}>
                PDF
              </button>
            </div>
          </>
        )}

        {tab === 'lines' && (
          <LineList
            lines={lines}
            numbers={numbers}
            resolvedIds={resolvedIds}
            selectedId={selectedLineId}
            onSelect={onSelectLine}
          />
        )}

        {tab === 'json' && <pre className="code">{json}</pre>}
      </div>
    </section>
  );
}
