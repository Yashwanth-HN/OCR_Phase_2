import { useEffect, useRef } from 'react';

/** Calls `onFiles` when the user pastes an image (or file) from the clipboard. */
export function usePasteImage(onFiles: (files: File[]) => void, enabled = true): void {
  const ref = useRef(onFiles);
  ref.current = onFiles;

  useEffect(() => {
    if (!enabled) return;
    const onPaste = (event: ClipboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
      const files = Array.from(event.clipboardData?.files ?? []);
      if (files.length > 0) {
        event.preventDefault();
        ref.current(files);
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [enabled]);
}
