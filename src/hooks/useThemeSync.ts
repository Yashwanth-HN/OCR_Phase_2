import { useEffect } from 'react';
import { useAppStore } from '@/store/useAppStore';

/** Applies the theme preference and UI language to <html>. Mount once at the app root. */
export function useThemeSync(): void {
  const theme = useAppStore((s) => s.settings.theme);
  const locale = useAppStore((s) => s.settings.locale);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const resolved = theme === 'system' ? (media.matches ? 'dark' : 'light') : theme;
      document.documentElement.dataset.theme = resolved;
    };
    apply();
    if (theme !== 'system') return;
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme]);
}

export function useResolvedTheme(): 'light' | 'dark' {
  const theme = useAppStore((s) => s.settings.theme);
  if (theme !== 'system') return theme;
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}
