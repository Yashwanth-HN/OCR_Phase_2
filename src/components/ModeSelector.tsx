import { useI18n, type MessageKey } from '@/i18n';
import type { OcrMode } from '@/types';

const MODES: Array<{ value: OcrMode; label: MessageKey; desc: MessageKey }> = [
  { value: 'word', label: 'mode.word', desc: 'mode.word.desc' },
  { value: 'paragraph', label: 'mode.paragraph', desc: 'mode.paragraph.desc' },
  { value: 'page', label: 'mode.page', desc: 'mode.page.desc' },
];

interface ModeSelectorProps {
  value: OcrMode;
  onChange: (mode: OcrMode) => void;
}

/** The three reading modes as large radio cards (used on the home page). */
export function ModeSelector({ value, onChange }: ModeSelectorProps) {
  const { t } = useI18n();
  return (
    <fieldset className="mode-cards">
      <legend className="field-label">{t('mode.question')}</legend>
      {MODES.map((mode) => (
        <label key={mode.value} className={`mode-card${value === mode.value ? ' is-active' : ''}`}>
          <input
            type="radio"
            name="ocr-mode"
            value={mode.value}
            checked={value === mode.value}
            onChange={() => onChange(mode.value)}
          />
          <span className="mode-card__text">
            <span className="mode-card__title">{t(mode.label)}</span>
            <span className="mode-card__desc">{t(mode.desc)}</span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}
