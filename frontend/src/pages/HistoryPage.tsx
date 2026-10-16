import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { LockIcon, TrashIcon } from '@/components/icons';
import { StatusBadge } from '@/components/StatusBadge';
import { useI18n, type MessageKey } from '@/i18n';
import { toCsv } from '@/lib/csv';
import { downloadBlob } from '@/lib/download';
import { formatRelative } from '@/lib/time';
import { useAppStore } from '@/store/useAppStore';
import type { HistoryEntry, OcrMode } from '@/types';

type Filter = 'all' | OcrMode | 'review';

const FILTERS: Array<{ id: Filter; label: MessageKey }> = [
  { id: 'all', label: 'hist.all' },
  { id: 'word', label: 'hist.words' },
  { id: 'paragraph', label: 'hist.paragraphs' },
  { id: 'page', label: 'hist.pages' },
  { id: 'review', label: 'hist.needsReview' },
];

const MODE_LABEL: Record<OcrMode, MessageKey> = {
  word: 'mode.word',
  paragraph: 'mode.paragraph',
  page: 'mode.page',
};

function matches(entry: HistoryEntry, filter: Filter, query: string): boolean {
  if (filter === 'review' ? entry.status !== 'review' : filter !== 'all' && entry.mode !== filter) return false;
  if (!query) return true;
  const q = query.toLowerCase();
  return entry.text.toLowerCase().includes(q) || entry.fileName.toLowerCase().includes(q);
}

export default function HistoryPage() {
  const { t, locale } = useI18n();
  const history = useAppStore((s) => s.history);
  const deleteHistory = useAppStore((s) => s.deleteHistory);
  const clearHistory = useAppStore((s) => s.clearHistory);

  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);

  const visible = useMemo(
    () => history.filter((entry) => matches(entry, filter, query.trim())),
    [history, filter, query],
  );

  const exportCsv = () => {
    const rows = [
      [t('hist.type'), t('hist.text'), t('hist.file'), t('hist.status'), t('hist.time')],
      ...visible.map((e) => [
        t(MODE_LABEL[e.mode]),
        e.text,
        e.fileName,
        t(`status.${e.status}`),
        new Date(e.createdAt).toISOString(),
      ]),
    ];
    downloadBlob(new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' }), 'kannada-ocr-history.csv');
  };

  return (
    <div className="container page">
      <div className="page__head">
        <h1 className="page__title">{t('hist.title')}</h1>
        <div className="page__actions">
          <label className="sr-only" htmlFor="history-search">
            {t('hist.search')}
          </label>
          <input
            id="history-search"
            className="input"
            type="search"
            placeholder={t('hist.search')}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <button type="button" className="btn btn--outline" onClick={exportCsv} disabled={visible.length === 0}>
            {t('hist.exportCsv')}
          </button>
          <button type="button" className="btn btn--ghost" onClick={() => setConfirmClear(true)} disabled={history.length === 0}>
            {t('hist.clear')}
          </button>
        </div>
      </div>

      <div className="filters" role="group" aria-label={t('hist.title')}>
        {FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`filter${filter === item.id ? ' is-active' : ''}`}
            aria-pressed={filter === item.id}
            onClick={() => setFilter(item.id)}
          >
            {t(item.label)}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="empty">
          <p className="muted">{history.length === 0 ? t('hist.empty') : t('hist.noMatch')}</p>
        </div>
      ) : (
        <div className="table-card">
          <div className="history-head" aria-hidden="true">
            <span>{t('hist.type')}</span>
            <span>{t('hist.text')}</span>
            <span>{t('hist.file')}</span>
            <span>{t('hist.status')}</span>
            <span>{t('hist.time')}</span>
            <span />
          </div>
          <ul className="history-list">
            {visible.map((entry) => (
              <li key={entry.id} className="history-row">
                <Link to={`/workspace/${entry.id}`} className="history-row__link">
                  <span className={`type-tag type-tag--${entry.mode}`}>{t(MODE_LABEL[entry.mode])}</span>
                  <span className="history-row__text" lang="kn">
                    {entry.text || '—'}
                  </span>
                  <span className="history-row__file" title={entry.fileName}>
                    {entry.fileName}
                  </span>
                  <StatusBadge status={entry.status} />
                  <span className="history-row__time">{formatRelative(entry.createdAt, locale)}</span>
                </Link>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`${t('hist.deleteOne')}: ${entry.fileName}`}
                  onClick={() => deleteHistory(entry.id)}
                >
                  <TrashIcon size={18} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="privacy-note">
        <LockIcon size={16} />
        {t('hist.privacy')}
      </p>

      <ConfirmDialog
        open={confirmClear}
        title={t('hist.clear')}
        message={t('hist.clearConfirm')}
        confirmLabel={t('hist.clear')}
        onCancel={() => setConfirmClear(false)}
        onConfirm={() => {
          clearHistory();
          setConfirmClear(false);
        }}
      />
    </div>
  );
}
