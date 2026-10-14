import { GlobeIcon } from '@/components/icons';
import type { useTranslation } from '@/hooks/useTranslation';
import { useI18n } from '@/i18n';

interface TranslationCardProps {
  disabled: boolean;
  translation: ReturnType<typeof useTranslation>;
}

export function TranslationCard({ disabled, translation }: TranslationCardProps) {
  const { t } = useI18n();
  const { visible, state, toggle, retry } = translation;

  return (
    <section className="panel translation" aria-labelledby="tr-title">
      <div className="translation__head">
        <h2 id="tr-title" className="panel__title panel__title--accent panel__title--tight">
          {t('tr.title')}
        </h2>
        <button type="button" className="btn btn--glass btn--sm" onClick={toggle} disabled={disabled} aria-pressed={visible}>
          <GlobeIcon size={16} />
          {visible ? t('tr.hide') : t('tr.action')}
        </button>
      </div>
      {visible && (
        <div className="translation__body" aria-live="polite">
          {state.status === 'loading' && <p className="muted">{t('tr.loading')}</p>}
          {state.status === 'done' && <p lang="en">{state.text}</p>}
          {state.status === 'error' && (
            <p role="alert" className="form-error">
              {t('tr.error')}{' '}
              <button type="button" className="link-btn" onClick={retry}>
                {t('common.retry')}
              </button>
            </p>
          )}
        </div>
      )}
    </section>
  );
}
