import { useI18n, type MessageKey } from '@/i18n';

const ROWS: Array<{ label: MessageKey; keys: string }> = [
  { label: 'sc.copy', keys: 'Ctrl+C' },
  { label: 'sc.listen', keys: 'Space' },
  { label: 'sc.translate', keys: 'T' },
];

export function ShortcutsCard() {
  const { t } = useI18n();
  return (
    <section className="panel panel--shortcuts" aria-labelledby="sc-title">
      <h2 id="sc-title" className="panel__title">
        {t('sc.title')}
      </h2>
      <dl className="shortcuts">
        {ROWS.map((row) => (
          <div key={row.keys} className="shortcuts__row">
            <dt>{t(row.label)}</dt>
            <dd>
              <kbd>{row.keys}</kbd>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
