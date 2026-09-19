import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/AuthContext';
import RaceLoading from './components/RaceLoading';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';

// 各画面は開いた時だけ読み込む。特にModelPageは約600KBの学習済み重みを含むため、
// 一覧画面の初期表示から分離しておく。
const RaceListPage = lazy(() => import('./pages/RaceListPage'));
const RaceDetailPage = lazy(() => import('./pages/RaceDetailPage'));
const HorseSearchPage = lazy(() => import('./pages/HorseSearchPage'));
const StatsPage = lazy(() => import('./pages/StatsPage'));
const ModelPage = lazy(() => import('./pages/ModelPage'));

function PageFallback() {
  return (
    <div role="status" aria-live="polite" style={{ padding: '32px 20px', color: '#756f64', textAlign: 'center', fontSize: 13 }}>
      画面を準備中…
    </div>
  );
}

function RequireAuth({ children }) {
  const { authed, checking } = useAuth();
  if (checking) {
    return <RaceLoading fullPage label="ログイン状態を確認中" detail="保存済みのログイン情報を安全に確認しています" />;
  }
  if (!authed) return <Navigate to="/login" replace />;
  return children;
}

function AppRoutes() {
  const { authed } = useAuth();
  return (
    <Routes>
      <Route path="/login" element={authed ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route
        path="/*"
        element={
          <RequireAuth>
            <Layout>
              <Suspense fallback={<PageFallback />}>
                <Routes>
                  <Route path="/" element={<RaceListPage />} />
                  <Route path="/races/:raceId" element={<RaceDetailPage />} />
                  <Route path="/search" element={<HorseSearchPage />} />
                  <Route path="/stats" element={<StatsPage />} />
                  <Route path="/model" element={<ModelPage />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </Suspense>
            </Layout>
          </RequireAuth>
        }
      />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
