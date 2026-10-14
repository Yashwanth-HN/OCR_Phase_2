import { describe, expect, it } from 'vitest';
import { en } from '@/i18n/en';
import { kn } from '@/i18n/kn';
import { translate } from '@/i18n';

describe('i18n', () => {
  it('has identical keys in both dictionaries', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(kn).sort());
  });
  it('has no empty strings (except the intentionally empty English hero lead-in)', () => {
    for (const [k, v] of Object.entries(kn)) expect(v.trim(), k).not.toBe('');
    for (const [k, v] of Object.entries(en)) if (k !== 'hero.titleA') expect(v.trim(), k).not.toBe('');
  });
  it('keeps the same {placeholders} in both languages', () => {
    const vars = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join();
    for (const key of Object.keys(kn) as Array<keyof typeof kn>) expect(vars(en[key])).toBe(vars(kn[key]));
  });
  it('interpolates', () => {
    const key = (Object.keys(kn) as Array<keyof typeof kn>).find((k) => /\{\w+\}/.test(en[k]))!;
    const name = /\{(\w+)\}/.exec(en[key])![1]!;
    expect(translate('en', key, { [name]: 42 })).toContain('42');
  });
});
