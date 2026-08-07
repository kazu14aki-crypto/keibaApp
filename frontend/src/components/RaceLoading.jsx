import React, { useEffect, useState } from 'react';
import { colors, styles } from '../styles';

/**
 * 180ms以内に終わる通信では何も表示しない。
 * 長い待機だけ、処理内容を短く明示する。
 */
export default function RaceLoading({ label = 'データを読み込んでいます', detail = '', fullPage = false }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 180);
    return () => clearTimeout(timer);
  }, []);

  if (!visible) return null;
  const wrapStyle = fullPage
    ? styles.loadingWrap
    : { minHeight: 96, display: 'grid', placeItems: 'center', padding: '16px 0', color: colors.inkDim };

  return (
    <div style={wrapStyle} role="status" aria-live="polite" aria-label={label}>
      <div style={{ width: 270, maxWidth: '88vw', textAlign: 'center' }}>
        <div aria-hidden="true" style={{ width: 24, height: 3, borderRadius: 999, background: colors.gold, margin: '0 auto 11px' }} />
        <div style={{ color: colors.ink, fontSize: 13, fontWeight: 700 }}>{label}</div>
        <div style={{ fontSize: 11, color: colors.inkDim, marginTop: 5, minHeight: 16 }}>{detail || '通信が完了し次第、すぐに表示します'}</div>
      </div>
    </div>
  );
}
