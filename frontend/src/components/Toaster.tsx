import { useToasts } from '@/store/useToasts';

export function Toaster() {
  const toasts = useToasts((s) => s.toasts);
  const dismiss = useToasts((s) => s.dismiss);
  return (
    <div className="toaster" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast--${toast.kind}`}>
          <span>{toast.message}</span>
          <button type="button" className="toast__close" onClick={() => dismiss(toast.id)} aria-label="×">
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
