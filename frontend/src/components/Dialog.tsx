import { useEffect, useRef, type ReactNode } from 'react';
import { useI18n } from '@/i18n';

interface DialogProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}

/** Accessible modal built on the native <dialog> element (focus trap, Esc to close). */
export function Dialog({ open, title, onClose, children, footer }: DialogProps) {
  const { t } = useI18n();
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby="dialog-title"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
    >
      {open && (
        <div className="dialog__body">
          <div className="dialog__header">
            <h2 id="dialog-title" className="dialog__title">
              {title}
            </h2>
            <button type="button" className="icon-btn" onClick={onClose} aria-label={t('common.close')}>
              ✕
            </button>
          </div>
          <div className="dialog__content">{children}</div>
          {footer && <div className="dialog__footer">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}
