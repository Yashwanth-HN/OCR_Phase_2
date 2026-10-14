import { MoonIcon, SunIcon } from '@/components/icons';
import { useResolvedTheme } from '@/hooks/useThemeSync';
import { useI18n } from '@/i18n';
import { useAppStore } from '@/store/useAppStore';

export function ThemeToggle() {
  const { t } = useI18n();
  const resolved = useResolvedTheme();
  const setSettings = useAppStore((s) => s.setSettings);
  return (
    <button
      type="button"
      className="icon-btn icon-btn--on-dark"
      aria-label={t('theme.toggle')}
      aria-pressed={resolved === 'dark'}
      onClick={() => setSettings({ theme: resolved === 'dark' ? 'light' : 'dark' })}
    >
      {resolved === 'dark' ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}
