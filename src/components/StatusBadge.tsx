import { useI18n, type MessageKey } from '@/i18n';
import type { DisplayStatus } from '@/types';

const LABELS: Record<DisplayStatus, MessageKey> = {
  done: 'status.done',
  review: 'status.review',
  edited: 'status.edited',
  queued: 'status.queued',
  processing: 'status.processing',
  error: 'status.error',
};

export function StatusBadge({ status }: { status: DisplayStatus }) {
  const { t } = useI18n();
  return (
    <span className={`badge badge--${status}`}>
      {status === 'processing' && <span className="badge__dot" aria-hidden="true" />}
      {t(LABELS[status])}
    </span>
  );
}
