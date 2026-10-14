import { useState, type FormEvent } from 'react';
import { api } from '@/api';
import { useI18n } from '@/i18n';
import { formatPercent, jobLines, lineNumberMap, linesNeedingReview } from '@/lib/job';
import { useAppStore } from '@/store/useAppStore';
import { useToasts } from '@/store/useToasts';
import type { Job, OcrLine } from '@/types';

interface ReviewItemProps {
  job: Job;
  line: OcrLine;
  number: number;
}

function ReviewItem({ job, line, number }: ReviewItemProps) {
  const { t } = useI18n();
  const push = useToasts((s) => s.push);
  const chooseLine = useAppStore((s) => s.chooseLine);
  const [custom, setCustom] = useState('');

  const apply = (corrected: string) => {
    const value = corrected.trim();
    if (!value) return;
    chooseLine(job.id, line.id, value);
    setCustom('');
    if (value !== line.text) {
      // Corrections are training signal for the model; failures here must never block the user.
      api
        .sendFeedback({
          jobId: job.id,
          lineId: line.id,
          original: line.text,
          corrected: value,
          mode: job.mode,
          textType: job.textType,
        })
        .then(() => push(t('rev.sent'), 'success'))
        .catch(() => undefined);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    apply(custom);
  };

  const options = [line.text, ...line.alternatives];

  return (
    <div className="review__item">
      <div className="review__head">
        <h3 className="review__title">{t('rev.title', { n: number })}</h3>
        <span className="review__score">{formatPercent(line.confidence)}</span>
      </div>
      <p className="review__pick">{t('rev.pick')}</p>
      <div className="review__options">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            lang="kn"
            className={`review__option${option === line.text ? ' is-current' : ''}`}
            onClick={() => apply(option)}
          >
            {option}
          </button>
        ))}
      </div>
      <form className="review__custom" onSubmit={submit}>
        <label className="sr-only" htmlFor={`custom-${line.id}`}>
          {t('rev.custom')}
        </label>
        <input
          id={`custom-${line.id}`}
          className="input input--dark"
          lang="kn"
          placeholder={t('rev.custom')}
          value={custom}
          onChange={(event) => setCustom(event.target.value)}
        />
        <button type="submit" className="btn btn--primary btn--sm" disabled={custom.trim() === ''}>
          {t('rev.apply')}
        </button>
      </form>
    </div>
  );
}

interface ReviewCardProps {
  job: Job;
  selectedLineId: string | null;
}

/** Lists low-confidence lines (plus the line selected in the viewer) with alternatives to pick from. */
export function ReviewCard({ job, selectedLineId }: ReviewCardProps) {
  const { t } = useI18n();
  const needing = linesNeedingReview(job);
  const selected = selectedLineId ? jobLines(job).find((l) => l.id === selectedLineId) : undefined;
  const numbers = lineNumberMap(job.result);

  const lines = [...needing];
  if (selected && !lines.some((l) => l.id === selected.id)) lines.push(selected);

  if (job.editedText !== undefined) {
    return needing.length > 0 ? (
      <section className="panel review" aria-labelledby="review-title">
        <p className="hint">{t('rev.lockedByEdit')}</p>
      </section>
    ) : null;
  }
  if (lines.length === 0) return null;

  return (
    <section className="panel review" aria-labelledby="review-title">
      <h2 id="review-title" className="sr-only">
        {t('rev.pick')}
      </h2>
      {lines.map((line) => (
        <ReviewItem key={line.id} job={job} line={line} number={numbers.get(line.id) ?? 0} />
      ))}
      <p className="hint">{t('rev.help')}</p>
    </section>
  );
}
