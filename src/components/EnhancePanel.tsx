import { Segmented } from '@/components/Segmented';
import { useI18n } from '@/i18n';
import type { EnhanceSettings, TextType } from '@/types';

interface EnhancePanelProps {
  enhance: EnhanceSettings;
  textType: TextType;
  /** False for history entries whose image is no longer available. */
  canRerun: boolean;
  busy: boolean;
  onEnhance: (patch: Partial<EnhanceSettings>) => void;
  onTextType: (value: TextType) => void;
  onRerun: () => void;
}

function Switch({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="switch-row">
      <span id={`sw-${label}`}>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={`sw-${label}`}
        disabled={disabled}
        className={`switch${checked ? ' is-on' : ''}`}
        onClick={() => onChange(!checked)}
      >
        <span className="switch__thumb" />
      </button>
    </div>
  );
}

function Slider({
  id,
  label,
  value,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <div className="slider">
      <label htmlFor={id}>
        <span>{label}</span>
        <span className="slider__value">{value}</span>
      </label>
      <input
        id={id}
        type="range"
        min={0}
        max={100}
        step={1}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </div>
  );
}

export function EnhancePanel({ enhance, textType, canRerun, busy, onEnhance, onTextType, onRerun }: EnhancePanelProps) {
  const { t } = useI18n();
  const disabled = !canRerun || busy;
  return (
    <>
      <section className="panel" aria-labelledby="enh-title">
        <h2 id="enh-title" className="panel__title">
          {t('enh.title')}
        </h2>
        <Switch label={t('enh.deskew')} checked={enhance.deskew} disabled={disabled} onChange={(v) => onEnhance({ deskew: v })} />
        <Switch label={t('enh.denoise')} checked={enhance.denoise} disabled={disabled} onChange={(v) => onEnhance({ denoise: v })} />
        <Slider id="enh-contrast" label={t('enh.contrast')} value={enhance.contrast} disabled={disabled} onChange={(v) => onEnhance({ contrast: v })} />
        <Slider id="enh-brightness" label={t('enh.brightness')} value={enhance.brightness} disabled={disabled} onChange={(v) => onEnhance({ brightness: v })} />
        <button type="button" className="btn btn--primary btn--block" onClick={onRerun} disabled={disabled}>
          {t('enh.rerun')}
        </button>
      </section>

      <section className="panel" aria-labelledby="tt-title">
        <h2 id="tt-title" className="panel__title">
          {t('texttype.label')}
        </h2>
        <Segmented<TextType>
          label={t('texttype.label')}
          value={textType}
          disabled={disabled}
          onChange={onTextType}
          options={[
            { value: 'printed', label: t('texttype.printed') },
            { value: 'handwritten', label: t('texttype.handwritten') },
          ]}
        />
      </section>
    </>
  );
}
