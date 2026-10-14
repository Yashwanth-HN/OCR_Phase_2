import { Link, NavLink } from 'react-router-dom';
import { LangToggle } from '@/components/LangToggle';
import { ModelStatus } from '@/components/ModelStatus';
import { ThemeToggle } from '@/components/ThemeToggle';
import { useI18n, type MessageKey } from '@/i18n';

const NAV: Array<{ to: string; label: MessageKey; end?: boolean }> = [
  { to: '/', label: 'nav.recognize', end: true },
  { to: '/batch', label: 'nav.batch' },
  { to: '/history', label: 'nav.history' },
];

export function Header() {
  const { t } = useI18n();
  return (
    <header className="site-header">
      <a className="skip-link" href="#main">
        {t('a11y.skip')}
      </a>
      <div className="site-header__inner">
        <Link to="/" className="brand" aria-label={`${t('brand.name')} · ${t('brand.tagline')}`}>
          <span className="brand__mark" lang="kn" aria-hidden="true">
            ಕ
          </span>
          <span className="brand__text">
            <span className="brand__name">{t('brand.name')}</span>
            <span className="brand__tagline">{t('brand.tagline')}</span>
          </span>
        </Link>
        <nav className="site-nav" aria-label={t('nav.main')}>
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `site-nav__link${isActive ? ' is-active' : ''}`}
            >
              {t(item.label)}
            </NavLink>
          ))}
        </nav>
        <div className="site-header__tools">
          <ModelStatus />
          <LangToggle />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
