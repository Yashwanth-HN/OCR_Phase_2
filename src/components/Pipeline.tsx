import { Fragment } from 'react';
import { ChevronRightIcon } from '@/components/icons';
import { useI18n, type MessageKey } from '@/i18n';

const STEPS: MessageKey[] = [
  'pipeline.upload',
  'pipeline.clean',
  'pipeline.lines',
  'pipeline.recognize',
  'pipeline.export',
];

export function Pipeline() {
  const { t } = useI18n();
  return (
    <section aria-labelledby="pipeline-title" className="section">
      <h2 id="pipeline-title" className="section__title">
        {t('pipeline.title')}
      </h2>
      <ol className="pipeline">
        {STEPS.map((step, i) => (
          <Fragment key={step}>
            <li className={`pipeline__step${i === STEPS.length - 1 ? ' is-last' : ''}`}>
              <span className="pipeline__num">{t('pipeline.step', { n: i + 1 })}</span>
              <span className="pipeline__name">{t(step)}</span>
            </li>
            {i < STEPS.length - 1 && (
              <li className="pipeline__arrow" aria-hidden="true">
                <ChevronRightIcon size={20} />
              </li>
            )}
          </Fragment>
        ))}
      </ol>
    </section>
  );
}
