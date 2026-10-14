import { ConfidenceBar } from '@/components/ConfidenceBar';
import { useI18n } from '@/i18n';
import { LOW_CONFIDENCE } from '@/lib/constants';
import type { OcrLine } from '@/types';

interface LineListProps {
  lines: OcrLine[];
  numbers: Map<string, number>;
  resolvedIds: Set<string>;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function LineList({ lines, numbers, resolvedIds, selectedId, onSelect }: LineListProps) {
  const { t } = useI18n();
  if (lines.length === 0) return <p className="muted">{t('text.empty')}</p>;
  return (
    <ul className="line-list">
      {lines.map((line) => {
        const review = line.confidence < LOW_CONFIDENCE && !resolvedIds.has(line.id);
        return (
          <li key={line.id}>
            <button
              type="button"
              className={`line-row lift-sm${review ? ' is-review' : ''}${selectedId === line.id ? ' is-selected' : ''}`}
              onClick={() => onSelect(line.id)}
            >
              <span className="line-row__num">{numbers.get(line.id)}</span>
              <span className="line-row__text" lang="kn">
                {line.text}
              </span>
              <ConfidenceBar value={line.confidence} />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
