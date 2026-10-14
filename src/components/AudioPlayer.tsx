import { PlayIcon, StopIcon } from '@/components/icons';
import type { useSpeech } from '@/hooks/useSpeech';
import { useI18n } from '@/i18n';

const WAVE = [100, 65, 90, 50, 100, 70, 85, 55, 80];

interface AudioPlayerProps {
  text: string;
  speech: ReturnType<typeof useSpeech>;
}

export function AudioPlayer({ text, speech }: AudioPlayerProps) {
  const { t } = useI18n();
  const { supported, speaking, rate, hasKannadaVoice, toggle, cycleRate } = speech;
  const disabled = !supported || !text.trim();

  return (
    <section className="panel audio" aria-labelledby="listen-title">
      <div className="audio__row">
        <button
          type="button"
          className="audio__play"
          aria-label={speaking ? t('listen.stop') : t('listen.play')}
          aria-pressed={speaking}
          disabled={disabled}
          onClick={() => toggle(text)}
        >
          {speaking ? <StopIcon size={22} /> : <PlayIcon size={22} />}
        </button>
        <div className="audio__body">
          <h2 id="listen-title" className="panel__title panel__title--tight">
            {t('listen.title')}
          </h2>
          <div className={`wave wave--small${speaking ? ' is-playing' : ''}`} aria-hidden="true">
            {WAVE.map((h, i) => (
              <span key={i} className="wave__bar" style={{ height: `${h}%`, animationDelay: `${i * 0.1}s` }} />
            ))}
          </div>
        </div>
        <button
          type="button"
          className="btn btn--glass btn--sm"
          onClick={cycleRate}
          disabled={disabled}
          aria-label={t('listen.speed')}
        >
          {rate}x
        </button>
      </div>
      {!supported && <p className="hint">{t('listen.unsupported')}</p>}
      {supported && !hasKannadaVoice && <p className="hint">{t('listen.noVoice')}</p>}
    </section>
  );
}
