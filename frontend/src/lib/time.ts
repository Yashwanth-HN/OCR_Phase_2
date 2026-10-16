import type { Locale } from '@/types';

const UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
  ['second', 1],
];

export function formatRelative(timestamp: number, locale: Locale, now: number = Date.now()): string {
  const diffSeconds = Math.round((timestamp - now) / 1000);
  const formatter = new Intl.RelativeTimeFormat(locale === 'kn' ? 'kn-IN' : 'en', { numeric: 'auto' });
  const abs = Math.abs(diffSeconds);
  if (abs < 45) return formatter.format(0, 'second');
  for (const [unit, seconds] of UNITS) {
    if (abs >= seconds) {
      return formatter.format(Math.round(diffSeconds / seconds), unit);
    }
  }
  return formatter.format(0, 'second');
}
