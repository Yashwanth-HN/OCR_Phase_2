import { Component, type ErrorInfo, type ReactNode } from 'react';
import { translate } from '@/i18n';
import { useAppStore } from '@/store/useAppStore';

interface State {
  failed: boolean;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Unhandled UI error', error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    const locale = useAppStore.getState().settings.locale;
    return (
      <div className="page-center" role="alert">
        <p>{translate(locale, 'err.boundary')}</p>
        <button type="button" className="btn btn--primary" onClick={() => window.location.assign('/')}>
          {translate(locale, 'err.home')}
        </button>
      </div>
    );
  }
}
