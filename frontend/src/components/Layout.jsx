import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { styles } from '../styles';

export default function Layout({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { logout } = useAuth();

  const isActive = (path) => location.pathname === path || (path === '/' && location.pathname.startsWith('/races/'));

  return (
    <div style={styles.app}>
      <GlobalStyle />
      <header style={styles.header}>
        <div style={styles.headerInner}>
          <div style={styles.brand} onClick={() => navigate('/')}>
            <span style={styles.brandMark}>馬</span>
            <div>
              <div style={styles.brandTitle}>競走馬スコアリング</div>
              <div style={styles.brandSub}>独自採点 馬券分析台帳</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <nav style={styles.nav}>
              <button style={{ ...styles.navBtn, ...(isActive('/') ? styles.navBtnActive : {}) }} onClick={() => navigate('/')}>出馬表</button>
              <button style={{ ...styles.navBtn, ...(isActive('/search') ? styles.navBtnActive : {}) }} onClick={() => navigate('/search')}>馬名検索</button>
              <button style={{ ...styles.navBtn, ...(isActive('/stats') ? styles.navBtnActive : {}) }} onClick={() => navigate('/stats')}>傾向分析</button>
            </nav>
            <button style={styles.logoutBtn} onClick={logout}>ログアウト</button>
          </div>
        </div>
      </header>
      <main style={styles.main}>{children}</main>
    </div>
  );
}

function GlobalStyle() {
  return (
    <style>{`
      * { box-sizing: border-box; }
      body { margin: 0; background: #14110f; }
      ::selection { background: #c4a35a; color: #14110f; }
      input[type=range] { -webkit-appearance: none; appearance: none; background: transparent; }
      input[type=range]::-webkit-slider-runnable-track { height: 6px; background: #2a2620; border-radius: 3px; }
      input[type=range]::-webkit-slider-thumb {
        -webkit-appearance: none; appearance: none; width: 18px; height: 18px; margin-top: -6px;
        border-radius: 50%; background: #c4a35a; border: 2px solid #14110f; cursor: pointer;
      }
      input[type=range]::-moz-range-track { height: 6px; background: #2a2620; border-radius: 3px; }
      input[type=range]::-moz-range-thumb { width: 14px; height: 14px; border-radius: 50%; background: #c4a35a; border: 2px solid #14110f; cursor: pointer; }
      .scrollbar::-webkit-scrollbar { height: 8px; width: 8px; }
      .scrollbar::-webkit-scrollbar-track { background: #181511; }
      .scrollbar::-webkit-scrollbar-thumb { background: #3a352c; border-radius: 4px; }
      button { font-family: inherit; }
    `}</style>
  );
}
