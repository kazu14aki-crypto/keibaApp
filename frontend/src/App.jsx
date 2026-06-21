import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/AuthContext';
import { styles } from './styles';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import RaceListPage from './pages/RaceListPage';
import RaceDetailPage from './pages/RaceDetailPage';
import HorseSearchPage from './pages/HorseSearchPage';
import StatsPage from './pages/StatsPage';

function RequireAuth({ children }) {
  const { authed, checking } = useAuth();
  if (checking) {
    return (
      <div style={styles.loadingWrap}>
        <div style={styles.loadingMark}>馬</div>
        <div style={styles.loadingText}>確認中…</div>
      </div>
    );
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
              <Routes>
                <Route path="/" element={<RaceListPage />} />
                <Route path="/races/:raceId" element={<RaceDetailPage />} />
                <Route path="/search" element={<HorseSearchPage />} />
                <Route path="/stats" element={<StatsPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
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
