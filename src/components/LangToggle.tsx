import { useI18n } from '@/i18n';

export function LangToggle() {
  const { locale, setLocale, t } = useI18n();
  return (
    <div className="lang-toggle" role="group" aria-label={t('lang.toggle')}>
      <button
        type="button"
        lang="kn"
        className={locale === 'kn' ? 'is-active' : ''}
        aria-pressed={locale === 'kn'}
        onClick={() => setLocale('kn')}
      >
        ಕನ್ನಡ
      </button>
      <button
        type="button"
        lang="en"
        className={locale === 'en' ? 'is-active' : ''}
        aria-pressed={locale === 'en'}
        onClick={() => setLocale('en')}
      >
        EN
      </button>
    </div>
  );
}
