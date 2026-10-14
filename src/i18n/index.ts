import { useCallback } from 'react';
import { en } from '@/i18n/en';
import { kn, type MessageKey } from '@/i18n/kn';
import { useAppStore } from '@/store/useAppStore';
import type { Locale } from '@/types';

export type { MessageKey };

const dictionaries: Record<Locale, Record<MessageKey, string>> = { kn, en };

export type TFunction = (key: MessageKey, vars?: Record<string, string | number>) => string;

export function translate(
  locale: Locale,
  key: MessageKey,
  vars?: Record<string, string | number>,
): string {
  const template = dictionaries[locale][key] ?? kn[key];
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  );
}

export function useI18n(): { locale: Locale; t: TFunction; setLocale: (l: Locale) => void } {
  const locale = useAppStore((s) => s.settings.locale);
  const setSettings = useAppStore((s) => s.setSettings);
  const t = useCallback<TFunction>((key, vars) => translate(locale, key, vars), [locale]);
  const setLocale = useCallback((next: Locale) => setSettings({ locale: next }), [setSettings]);
  return { locale, t, setLocale };
}
