import { SAMPLE_LINES } from '@/lib/constants';
import { useI18n } from '@/i18n';

/** Decorative animated document used in the hero (a scan line sweeps over detected lines). */
export function HeroPreview() {
  const { t } = useI18n();
  return (
    <div className="hero-preview" aria-hidden="true">
      <div className="hero-preview__paper">
        <div className="hero-preview__meta">
          <span>scan_page_01.jpg</span>
          <span className="chip chip--warm">{t('preview.detecting')}</span>
        </div>
        <div className="hero-preview__body">
          <span className="skeleton" style={{ width: '55%' }} />
          {SAMPLE_LINES.map((line, i) => (
            <div key={line} className="hero-preview__line" lang="kn">
              <span className="hero-preview__tag">{t('preview.line', { n: i + 1 })}</span>
              {line}
            </div>
          ))}
          <span className="skeleton" style={{ width: '80%' }} />
          <span className="skeleton" style={{ width: '40%' }} />
          <span className="hero-preview__scan" />
        </div>
      </div>
      <div className="hero-preview__result">
        <div className="hero-preview__result-label">{t('preview.recognized')}</div>
        <div lang="kn">{SAMPLE_LINES[0]} {SAMPLE_LINES[1].split('.')[0]}.</div>
      </div>
    </div>
  );
}
