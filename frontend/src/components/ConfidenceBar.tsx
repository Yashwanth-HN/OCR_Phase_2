import { useI18n, type MessageKey } from '@/i18n';
import { confidenceLevel, formatPercent, type ConfidenceLevel } from '@/lib/job';

const LEVEL_KEYS: Record<ConfidenceLevel, MessageKey> = {
  high: 'conf.high',
  medium: 'conf.medium',
  low: 'conf.low',
};

export function ConfidenceBar({ value, showLabel = false }: { value: number; showLabel?: boolean }) {
  const { t } = useI18n();
  const level = confidenceLevel(value);
  const percent = formatPercent(value);
  return (
    <span className={`confidence confidence--${level}`}>
      <span className="confidence__text">
        {showLabel ? `${t(LEVEL_KEYS[level])} · ${percent}` : percent}
      </span>
      <span
        className="confidence__track"
        role="meter"
        aria-label={t('conf.label')}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(value * 100)}
      >
        <span className="confidence__fill" style={{ width: percent }} />
      </span>
    </span>
  );
}
