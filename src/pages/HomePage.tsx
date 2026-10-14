import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CameraDialog } from '@/components/CameraDialog';
import { Dropzone } from '@/components/Dropzone';
import { FeatureBento } from '@/components/FeatureBento';
import { Footer } from '@/components/Footer';
import { HeroPreview } from '@/components/HeroPreview';
import { CameraIcon, LinkIcon } from '@/components/icons';
import { LinkDialog } from '@/components/LinkDialog';
import { ModeSelector } from '@/components/ModeSelector';
import { Pipeline } from '@/components/Pipeline';
import { Segmented } from '@/components/Segmented';
import { useIngest } from '@/hooks/useIngest';
import { usePasteImage } from '@/hooks/usePasteImage';
import { useI18n } from '@/i18n';
import { makeSampleFile } from '@/lib/sample';
import { useAppStore } from '@/store/useAppStore';
import { useToasts } from '@/store/useToasts';
import type { TextType } from '@/types';

export default function HomePage() {
  const { t } = useI18n();
  const push = useToasts((s) => s.push);
  const { start } = useIngest();
  const mode = useAppStore((s) => s.settings.mode);
  const textType = useAppStore((s) => s.settings.textType);
  const setSettings = useAppStore((s) => s.setSettings);

  const [searchParams, setSearchParams] = useSearchParams();
  const [cameraOpen, setCameraOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);

  // The mobile "Scan" tab links to /?camera=1.
  useEffect(() => {
    if (searchParams.get('camera') === '1') {
      setCameraOpen(true);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  usePasteImage(start);

  const trySample = async () => {
    try {
      start([await makeSampleFile()]);
    } catch {
      push(t('upload.sampleError'), 'error');
    }
  };

  return (
    <>
      <section className="hero">
        <div className="container hero__grid">
          <div className="hero__copy">
            <span className="chip chip--glass">
              <span className="pulse-dot" aria-hidden="true" />
              {t('hero.badge')}
            </span>
            <h1 className="hero__title">
              {t('hero.titleA')}
              <span className="hero__accent">{t('hero.titleB')}</span>
              {t('hero.titleC')}
            </h1>
            <p className="hero__sub">{t('hero.sub')}</p>
            <div className="hero__actions">
              <a href="#upload" className="btn btn--primary btn--lg">
                {t('hero.ctaUpload')}
              </a>
              <button type="button" className="btn btn--outline-light btn--lg" onClick={trySample}>
                {t('hero.ctaSample')}
              </button>
            </div>
            <ul className="hero__chips">
              <li className="chip chip--dim">{t('hero.chip1')}</li>
              <li className="chip chip--dim">{t('hero.chip2')}</li>
              <li className="chip chip--dim">{t('hero.chip3')}</li>
            </ul>
          </div>
          <HeroPreview />
        </div>
      </section>

      <div className="container home-body">
        <section id="upload" className="upload-card" aria-label={t('hero.ctaUpload')}>
          <div className="upload-card__left">
            <Dropzone onFiles={start} />
            <div className="upload-card__sources">
              <button type="button" className="btn btn--outline" onClick={() => setCameraOpen(true)}>
                <CameraIcon size={18} />
                {t('upload.camera')}
              </button>
              <button type="button" className="btn btn--outline" onClick={() => setLinkOpen(true)}>
                <LinkIcon size={18} />
                {t('upload.link')}
              </button>
            </div>
            <p className="upload-card__tip">{t('upload.paste')}</p>
          </div>
          <div className="upload-card__right">
            <ModeSelector value={mode} onChange={(next) => setSettings({ mode: next })} />
            <div className="field">
              <span className="field-label">{t('texttype.label')}</span>
              <Segmented<TextType>
                label={t('texttype.label')}
                value={textType}
                onChange={(next) => setSettings({ textType: next })}
                options={[
                  { value: 'printed', label: t('texttype.printed') },
                  { value: 'handwritten', label: t('texttype.handwritten') },
                ]}
              />
            </div>
          </div>
        </section>

        <FeatureBento />
        <Pipeline />
        <p className="home-body__link">
          <Link to="/api">{t('nav.api')} →</Link>
        </p>
      </div>

      <Footer />

      <CameraDialog open={cameraOpen} onClose={() => setCameraOpen(false)} onCapture={(file) => start([file])} />
      <LinkDialog open={linkOpen} onClose={() => setLinkOpen(false)} onFile={(file) => start([file])} />
    </>
  );
}
