import { useEffect, useRef } from 'react';

export type ShortcutMap = Partial<Record<'copy' | 'listen' | 'translate', () => void>>;

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
}

/**
 * Ctrl/Cmd+C copies the recognized text (only when nothing is selected, so normal copy still works),
 * Space toggles listening, T toggles translation.
 */
export function useShortcuts(handlers: ShortcutMap): void {
  const ref = useRef(handlers);
  ref.current = handlers;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isTypingTarget(event.target)) return;
      const key = event.key.toLowerCase();

      if ((event.ctrlKey || event.metaKey) && key === 'c') {
        const selection = window.getSelection();
        if (selection && !selection.isCollapsed) return;
        if (ref.current.copy) {
          event.preventDefault();
          ref.current.copy();
        }
        return;
      }
      if (event.ctrlKey || event.metaKey || event.altKey) return;

      // Space on a focused button/link must keep its native behaviour.
      const onInteractive =
        event.target instanceof HTMLElement && event.target.closest('button, a, summary, [role="tab"]');
      if (key === ' ' && !onInteractive && ref.current.listen) {
        event.preventDefault();
        ref.current.listen();
      } else if (key === 't' && ref.current.translate) {
        event.preventDefault();
        ref.current.translate();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
