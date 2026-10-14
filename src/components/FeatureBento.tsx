import type { ReactNode } from 'react';
import { LayersIcon, LockIcon, PenIcon, SlidersIcon } from '@/components/icons';
import { useI18n, type MessageKey } from '@/i18n';

const WAVE = [100, 70, 100, 55, 85, 60, 90];

interface Tile {
  title: MessageKey;
  desc: MessageKey;
  dark?: boolean;
  visual: ReactNode;
}

export function FeatureBento() {
  const { t } = useI18n();

  const tiles: Tile[] = [
    {
      title: 'features.listen',
      desc: 'features.listen.desc',
      dark: true,
      visual: (
        <div className="wave" aria-hidden="true">
          {WAVE.map((h, i) => (
            <span key={i} className="wave__bar" style={{ height: `${h}%`, animationDelay: `${i * 0.15}s` }} />
          ))}
        </div>
      ),
    },
    {
      title: 'features.translate',
      desc: 'features.translate.desc',
      dark: true,
      visual: (
        <div className="bubbles" aria-hidden="true">
          <span lang="kn">ಇದರ ರಾಜಧಾನಿ ಬೆಂಗಳೂರು.</span>
          <span className="bubbles__accent" lang="en">
            Its capital is Bengaluru.
          </span>
        </div>
      ),
    },
    { title: 'features.enhance', desc: 'features.enhance.desc', visual: <SlidersIcon size={26} /> },
    { title: 'features.handwriting', desc: 'features.handwriting.desc', visual: <PenIcon size={26} /> },
    { title: 'features.batch', desc: 'features.batch.desc', visual: <LayersIcon size={26} /> },
    { title: 'features.privacy', desc: 'features.privacy.desc', visual: <LockIcon size={26} /> },
  ];

  return (
    <section aria-labelledby="features-title" className="section">
      <h2 id="features-title" className="section__title">
        {t('features.title')}
      </h2>
      <div className="bento">
        {tiles.map((tile) => (
          <article key={tile.title} className={`tile lift${tile.dark ? ' tile--dark' : ''}`}>
            {tile.dark ? tile.visual : <span className="tile__icon">{tile.visual}</span>}
            <h3 className="tile__title">{t(tile.title)}</h3>
            <p className="tile__desc">{t(tile.desc)}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
