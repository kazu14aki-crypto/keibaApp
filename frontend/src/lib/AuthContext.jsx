import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { api, getToken, setToken, clearToken } from '../lib/api';

const AuthContext = createContext(null);
const VERIFIED_AT_KEY = 'kirisuite_verified_at';
const VERIFY_CACHE_MS = 5 * 60 * 1000;

export function AuthProvider({ children }) {
  const [authed, setAuthed] = useState(!!getToken());
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    (async () => {
      const token = getToken();
      if (!token) { setChecking(false); return; }
      const verifiedAt = Number(sessionStorage.getItem(VERIFIED_AT_KEY) || 0);
      // 同一タブで直近確認済みなら、初期表示をネットワーク待ちにしない。
      // 実際のAPI呼び出しは401時にトークンを破棄するため、失効は安全に検出される。
      if (Date.now() - verifiedAt < VERIFY_CACHE_MS) {
        setChecking(false);
        return;
      }
      try {
        const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
        const res = await fetch(`${API_BASE}/auth/verify`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setAuthed(res.ok);
        if (res.ok) sessionStorage.setItem(VERIFIED_AT_KEY, String(Date.now()));
        else {
          clearToken();
          sessionStorage.removeItem(VERIFIED_AT_KEY);
        }
      } catch (e) {
        setAuthed(false);
      } finally {
        setChecking(false);
      }
    })();
  }, []);

  const login = useCallback(async (password) => {
    const res = await api.login(password);
    setToken(res.token);
    sessionStorage.setItem(VERIFIED_AT_KEY, String(Date.now()));
    setAuthed(true);
  }, []);

  const logout = useCallback(() => {
    clearToken();
    sessionStorage.removeItem(VERIFIED_AT_KEY);
    setAuthed(false);
  }, []);

  return (
    <AuthContext.Provider value={{ authed, checking, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
