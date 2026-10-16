import { useI18n } from '@/i18n';
import { confidenceLevel, jobLines, lineNumberMap } from '@/lib/job';
import { LOW_CONFIDENCE } from '@/lib/constants';
import type { Job, OcrPage } from '@/types';

interface DocumentViewerProps {
  job: Job;
  pageIndex: number;
  zoom: number;
  showBoxes: boolean;
  selectedLineId: string | null;
  onSelectLine: (id: string) => void;
  onPageChange: (index: number) => void;
  onZoom: (zoom: number) => void;
  onToggleBoxes: () => void;
}

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.25;

function pageImageUrl(job: Job, page: OcrPage): string | undefined {
  if (page.previewUrl) return page.previewUrl;
  // A single-image upload only has one page, backed by the local file.
  return page.index === 0 ? job.previewUrl : undefined;
}

export function DocumentViewer({
  job,
  pageIndex,
  zoom,
  showBoxes,
  selectedLineId,
  onSelectLine,
  onPageChange,
  onZoom,
  onToggleBoxes,
}: DocumentViewerProps) {
  const { t } = useI18n();
  const pages = job.result?.pages ?? [];
  const page = pages[pageIndex];
  const numbers = lineNumberMap(job.result);
  const overridden = job.lineOverrides;
  const processing = job.state === 'processing';
  const imageUrl = page ? pageImageUrl(job, page) : undefined;
  const lineCount = jobLines(job).length;

  // Preview-only adjustments: 50 is neutral, 0 → 0.5×, 100 → 1.5×.
  const filter = `contrast(${0.5 + job.enhance.contrast / 100}) brightness(${0.5 + job.enhance.brightness / 100})`;

  return (
    <section className="viewer" aria-label={t('ws.layout', { n: lineCount })}>
      <div className="viewer__bar">
        <span className="viewer__title">{t('ws.layout', { n: lineCount })}</span>
        <div className="viewer__tools">
          <button
            type="button"
            className="btn btn--glass btn--sm"
            onClick={() => onZoom(Math.max(MIN_ZOOM, zoom - ZOOM_STEP))}
            disabled={zoom <= MIN_ZOOM}
          >
            {t('ws.zoomOut')}
          </button>
          <button
            type="button"
            className="btn btn--glass btn--sm"
            onClick={() => onZoom(Math.min(MAX_ZOOM, zoom + ZOOM_STEP))}
            disabled={zoom >= MAX_ZOOM}
          >
            {t('ws.zoomIn')}
          </button>
          <button
            type="button"
            className={`btn btn--sm ${showBoxes ? 'btn--primary' : 'btn--glass'}`}
            aria-pressed={showBoxes}
            onClick={onToggleBoxes}
          >
            {t('ws.boxes')}
          </button>
        </div>
      </div>

      <div className="viewer__scroll">
        <div className="viewer__page" style={{ width: `${zoom * 100}%` }}>
          {imageUrl ? (
            <img className="viewer__img" src={imageUrl} alt={job.fileName} style={{ filter }} draggable={false} />
          ) : (
            <div className="viewer__placeholder">
              <p className="viewer__note">{job.fileType === 'application/pdf' ? t('ws.pdfPreview') : t('ws.noImage')}</p>
              {page?.lines.map((line) => (
                <p key={line.id} lang="kn" className="viewer__placeholder-line">
                  {overridden[line.id] ?? line.text}
                </p>
              ))}
            </div>
          )}

          {imageUrl &&
            showBoxes &&
            page?.lines.map((line) => {
              const level = confidenceLevel(line.confidence);
              const resolved = overridden[line.id] !== undefined;
              const needsReview = line.confidence < LOW_CONFIDENCE && !resolved;
              const number = numbers.get(line.id) ?? 0;
              return (
                <button
                  key={line.id}
                  type="button"
                  className={`box${needsReview ? ' box--review' : ''}${selectedLineId === line.id ? ' is-selected' : ''}`}
                  data-level={level}
                  style={{
                    left: `${line.box.x * 100}%`,
                    top: `${line.box.y * 100}%`,
                    width: `${line.box.w * 100}%`,
                    height: `${line.box.h * 100}%`,
                  }}
                  aria-label={`${number}. ${resolved ? overridden[line.id] : line.text}`}
                  onClick={() => onSelectLine(line.id)}
                >
                  <span className="box__badge">{number}</span>
                </button>
              );
            })}

          {processing && (
            <div className="viewer__busy" role="status">
              <span className="viewer__scan" aria-hidden="true" />
              <span className="viewer__busy-label">{t('ws.processing')}</span>
            </div>
          )}
        </div>
      </div>

      <div className="viewer__footer">
        <ul className="legend">
          <li>
            <span className="legend__swatch" />
            {t('ws.legendOk')}
          </li>
          <li>
            <span className="legend__swatch legend__swatch--review" />
            {t('ws.legendReview')}
          </li>
        </ul>
        {pages.length > 1 && (
          <div className="page-thumbs" role="group" aria-label={t('ws.pages')}>
            {pages.map((p, i) => (
              <button
                key={p.index}
                type="button"
                className={`page-thumb${i === pageIndex ? ' is-active' : ''}`}
                aria-current={i === pageIndex ? 'page' : undefined}
                aria-label={t('ws.pageOf', { n: i + 1, total: pages.length })}
                onClick={() => onPageChange(i)}
              >
                {i + 1}
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
