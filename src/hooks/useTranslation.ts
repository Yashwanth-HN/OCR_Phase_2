import { useCallback, useEffect, useState } from 'react';
import { api, isAbortError } from '@/api';

export type TranslationState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'done'; text: string }
  | { status: 'error' };

/** Shows/hides an English translation of `text`, refetching whenever the text changes. */
export function useTranslation(text: string) {
  const [visible, setVisible] = useState(false);
  const [state, setState] = useState<TranslationState>({ status: 'idle' });

  useEffect(() => {
    if (!visible || !text.trim()) {
      setState({ status: 'idle' });
      return;
    }
    const controller = new AbortController();
    setState({ status: 'loading' });
    api
      .translate(text, controller.signal)
      .then((translated) => setState({ status: 'done', text: translated }))
      .catch((error: unknown) => {
        if (!isAbortError(error)) setState({ status: 'error' });
      });
    return () => controller.abort();
  }, [visible, text]);

  const toggle = useCallback(() => setVisible((v) => !v), []);
  const hide = useCallback(() => setVisible(false), []);
  const retry = useCallback(() => {
    setVisible(false);
    // Re-open on the next tick so the effect above runs again.
    window.setTimeout(() => setVisible(true), 0);
  }, []);

  return { visible, state, toggle, hide, retry };
}
