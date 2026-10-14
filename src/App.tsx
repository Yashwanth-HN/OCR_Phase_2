import { lazy } from 'react';
import { Route, Routes } from 'react-router-dom';
import { AppLayout } from '@/components/AppLayout';

// Route-level code splitting keeps the first load small.
const HomePage = lazy(() => import('@/pages/HomePage'));
const WorkspacePage = lazy(() => import('@/pages/WorkspacePage'));
const BatchPage = lazy(() => import('@/pages/BatchPage'));
const HistoryPage = lazy(() => import('@/pages/HistoryPage'));
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'));

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<HomePage />} />
        <Route path="workspace/:id" element={<WorkspacePage />} />
        <Route path="batch" element={<BatchPage />} />
        <Route path="history" element={<HistoryPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
