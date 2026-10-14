import { NavLink } from 'react-router-dom';
import { CameraIcon, ClockIcon, LayersIcon, UploadIcon } from '@/components/icons';
import { useI18n, type MessageKey } from '@/i18n';

const ITEMS: Array<{ to: string; label: MessageKey; icon: typeof UploadIcon; end?: boolean }> = [
  { to: '/', label: 'nav.recognize', icon: UploadIcon, end: true },
  { to: '/?camera=1', label: 'nav.scan', icon: CameraIcon },
  { to: '/batch', label: 'nav.batch', icon: LayersIcon },
  { to: '/history', label: 'nav.history', icon: ClockIcon },
];

/** Mobile-only tab bar (hidden on wider screens via CSS). */
export function BottomNav() {
  const { t } = useI18n();
  return (
    <nav className="bottom-nav" aria-label={t('nav.main')}>
      {ITEMS.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          // The "scan" tab shares the home route; only the plain home link is highlighted for "/".
          className={({ isActive }) =>
            `bottom-nav__item${isActive && !to.includes('camera') ? ' is-active' : ''}`
          }
        >
          <Icon size={22} />
          <span>{t(label)}</span>
        </NavLink>
      ))}
    </nav>
  );
}
