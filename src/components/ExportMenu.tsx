import { useEffect, useRef, useState } from 'react';
import type { useExporter } from '@/hooks/useExporter';
import { useI18n } from '@/i18n';

interface ExportMenuProps {
  exporter: ReturnType<typeof useExporter>;
  disabled?: boolean;
}

export function ExportMenu({ exporter, disabled }: ExportMenuProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const run = (action: () => void | Promise<void>) => () => {
    setOpen(false);
    void action();
  };

  return (
    <div className="menu" ref={rootRef}>
      <button
        type="button"
        className="btn btn--primary"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
      >
        {t('act.export')}
      </button>
      {open && (
        <ul className="menu__list" role="menu">
          <li role="none">
            <button type="button" role="menuitem" onClick={run(exporter.copy)}>
              {t('act.copy')}
            </button>
          </li>
          <li role="none">
            <button type="button" role="menuitem" onClick={run(exporter.downloadTxt)}>
              .txt
            </button>
          </li>
          <li role="none">
            <button type="button" role="menuitem" onClick={run(exporter.downloadDocx)}>
              .docx
            </button>
          </li>
          <li role="none">
            <button type="button" role="menuitem" onClick={run(exporter.downloadPdf)}>
              PDF
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}
