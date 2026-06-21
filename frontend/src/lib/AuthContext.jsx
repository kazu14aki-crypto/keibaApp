import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { api, getToken, setToken, clearToken } from '../lib/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [authed, setAuthed] = useState(!!getToken());
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    (async () => {
      const token = getToken();
      if (!token) { setChecking(false); return; }
      try {
        const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
        const res = await fetch(`${API_BASE}/auth/verify`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setAuthed(res.ok);
        if (!res.ok) clearToken();
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
    setAuthed(true);
  }, []);

  const logout = useCallback(() => {
    clearToken();
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
