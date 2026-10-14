import { useState, type FormEvent } from 'react';
import { Dialog } from '@/components/Dialog';
import { fileFromUrl } from '@/lib/files';
import { useI18n } from '@/i18n';

interface LinkDialogProps {
  open: boolean;
  onClose: () => void;
  onFile: (file: File) => void;
}

export function LinkDialog({ open, onClose, onFile }: LinkDialogProps) {
  const { t } = useI18n();
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onFile(await fileFromUrl(url.trim()));
      setUrl('');
      onClose();
    } catch {
      setError(t('upload.linkError'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} title={t('upload.linkTitle')} onClose={onClose}>
      <form className="link-form" onSubmit={submit}>
        <label className="sr-only" htmlFor="image-url">
          {t('upload.linkTitle')}
        </label>
        <input
          id="image-url"
          className="input"
          type="url"
          inputMode="url"
          required
          placeholder="https://…"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          disabled={busy}
        />
        <button type="submit" className="btn btn--primary" disabled={busy || url.trim() === ''}>
          {busy ? t('common.loading') : t('upload.linkSubmit')}
        </button>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </form>
    </Dialog>
  );
}
