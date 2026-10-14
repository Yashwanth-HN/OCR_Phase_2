import { Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import { BottomNav } from '@/components/BottomNav';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Header } from '@/components/Header';
import { Toaster } from '@/components/Toaster';
import { useThemeSync } from '@/hooks/useThemeSync';
import { useI18n } from '@/i18n';

export function AppLayout() {
  const { t } = useI18n();
  useThemeSync();
  return (
    <div className="app">
      <Header />
      <main id="main" className="app__main" tabIndex={-1}>
        <ErrorBoundary>
          <Suspense fallback={<div className="page-center">{t('common.loading')}</div>}>
            <Outlet />
          </Suspense>
        </ErrorBoundary>
      </main>
      <BottomNav />
      <Toaster />
    </div>
  );
}
