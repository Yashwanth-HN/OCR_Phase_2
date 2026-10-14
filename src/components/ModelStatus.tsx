import { USE_MOCK } from '@/api';
import { useServerHealth } from '@/hooks/useServerHealth';
import { useI18n } from '@/i18n';

/** Header chip: is the OCR model reachable, and which version is it. */
export function ModelStatus() {
  const { t } = useI18n();
  const health = useServerHealth();

  const state = USE_MOCK ? 'demo' : health === null ? 'checking' : health.online ? 'online' : 'offline';
  const label = {
    demo: t('model.demo'),
    checking: t('model.checking'),
    online: t('model.online'),
    offline: t('model.offline'),
  }[state];
  const version = state === 'online' ? health?.modelVersion : undefined;

  return (
    <span
      className={`model-status model-status--${state}`}
      role="status"
      title={version ? t('model.version', { version }) : label}
    >
      <span className="model-status__dot" aria-hidden="true" />
      <span className="model-status__label">{label}</span>
      {version && <span className="model-status__version">{version.split('-')[0]}</span>}
    </span>
  );
}
