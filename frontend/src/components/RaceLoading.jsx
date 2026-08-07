import React, { useEffect, useState } from 'react';
import { colors, styles } from '../styles';
import racehorseImage from '../assets/racehorse-loader.webp';

/**
 * 180ms以内に終わる通信では何も表示しない。
 * 長い待機だけ、競走馬ビジュアルと処理内容を短く明示する。
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
    : { minHeight: 170, display: 'grid', placeItems: 'center', padding: '20px 0', color: colors.inkDim };

  return (
    <div style={wrapStyle} role="status" aria-live="polite" aria-label={label}>
      <style>{`
        @keyframes racehorse-glide { 0%,100% { transform: translateX(-8px) translateY(0); } 50% { transform: translateX(8px) translateY(-2px); } }
        @keyframes racehorse-dust { 0% { opacity: .15; transform: translateX(0); } 100% { opacity: .7; transform: translateX(-24px); } }
        .racehorse-loader { animation: racehorse-glide .75s ease-in-out infinite; will-change: transform; }
        .racehorse-dust { animation: racehorse-dust .75s linear infinite; }
        @media (prefers-reduced-motion: reduce) { .racehorse-loader, .racehorse-dust { animation: none !important; } }
      `}</style>
      <div style={{ width: 270, maxWidth: '88vw', textAlign: 'center' }}>
        <div style={{ height: 88, position: 'relative', overflow: 'hidden', borderBottom: `2px solid ${colors.cardBorder}` }}>
          <span className="racehorse-dust" style={{ position: 'absolute', left: '46%', bottom: 7, width: 22, height: 3, background: colors.gold, borderRadius: 9 }} />
          <span className="racehorse-dust" style={{ position: 'absolute', left: '38%', bottom: 13, width: 12, height: 2, background: colors.gold, borderRadius: 9, animationDelay: '.2s' }} />
          <img className="racehorse-loader" src={racehorseImage} alt="全力で走る競走馬と騎手" style={{ width: 210, height: 116, objectFit: 'contain', position: 'absolute', left: 27, bottom: -23 }} />
        </div>
        <div style={{ color: colors.ink, fontSize: 13, fontWeight: 700, marginTop: 13 }}>{label}</div>
        <div style={{ fontSize: 11, color: colors.inkDim, marginTop: 5, minHeight: 16 }}>{detail || '通信が完了し次第、すぐに表示します'}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4, marginTop: 13, fontSize: 10, color: colors.inkDim }}>
          <span style={stepStyle(true)}>接続</span>
          <span style={stepStyle(true)}>取得</span>
          <span style={stepStyle(false)}>表示</span>
        </div>
      </div>
    </div>
  );
}

function stepStyle(active) {
  return {
    padding: '5px 2px', borderRadius: 6,
    background: active ? colors.goldSoft : colors.bgAlt,
    color: active ? colors.gold : colors.inkDim,
    fontWeight: active ? 700 : 400,
  };
}
