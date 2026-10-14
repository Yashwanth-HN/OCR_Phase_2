import { useRef, useState, type DragEvent } from 'react';
import { UploadIcon } from '@/components/icons';
import { ACCEPT_ATTR, MAX_FILE_MB } from '@/lib/constants';
import { useI18n } from '@/i18n';

interface DropzoneProps {
  onFiles: (files: File[]) => void;
  /** Allow several files (batch). */
  multiple?: boolean;
  compact?: boolean;
}

export function Dropzone({ onFiles, multiple = true, compact = false }: DropzoneProps) {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  // dragenter/dragleave also fire for child elements, so count them.
  const depth = useRef(0);

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    depth.current = 0;
    setDragging(false);
    const files = Array.from(event.dataTransfer.files);
    if (files.length > 0) onFiles(multiple ? files : files.slice(0, 1));
  };

  return (
    <div
      className={`dropzone${dragging ? ' is-dragging' : ''}${compact ? ' dropzone--compact' : ''}`}
      onDragEnter={(event) => {
        event.preventDefault();
        depth.current += 1;
        setDragging(true);
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={() => {
        depth.current = Math.max(0, depth.current - 1);
        if (depth.current === 0) setDragging(false);
      }}
      onDrop={onDrop}
    >
      <span className="dropzone__icon">
        <UploadIcon size={compact ? 24 : 36} />
      </span>
      <p className="dropzone__title">{dragging ? t('upload.dropActive') : t('upload.drop')}</p>
      <p className="dropzone__hint">{t('upload.hint', { size: MAX_FILE_MB })}</p>
      <button type="button" className="btn btn--primary" onClick={() => inputRef.current?.click()}>
        {t('upload.choose')}
      </button>
      <input
        ref={inputRef}
        type="file"
        hidden
        multiple={multiple}
        accept={ACCEPT_ATTR}
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          if (files.length > 0) onFiles(files);
          event.target.value = ''; // allow selecting the same file again
        }}
      />
    </div>
  );
}
