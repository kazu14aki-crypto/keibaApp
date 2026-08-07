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
        @keyframes racehorse-body { 0%,100% { transform: translateY(1px) rotate(-.25deg); } 50% { transform: translateY(-3px) rotate(.25deg); } }
        @keyframes racehorse-front-leg { 0%,100% { transform: rotate(13deg) translate(1px, 2px); } 50% { transform: rotate(-18deg) translate(-2px, -2px); } }
        @keyframes racehorse-back-leg { 0%,100% { transform: rotate(-16deg) translate(-1px, -1px); } 50% { transform: rotate(16deg) translate(2px, 2px); } }
        @keyframes racehorse-front-leg-alt { 0%,100% { transform: rotate(-17deg) translate(-1px, -1px); } 50% { transform: rotate(14deg) translate(2px, 2px); } }
        @keyframes racehorse-back-leg-alt { 0%,100% { transform: rotate(14deg) translate(1px, 1px); } 50% { transform: rotate(-17deg) translate(-2px, -2px); } }
        @keyframes racehorse-track { from { background-position: 0 0; } to { background-position: -42px 0; } }
        @keyframes racehorse-dust { 0% { opacity: 0; transform: translateX(10px) scale(.55); } 25% { opacity: .7; } 100% { opacity: 0; transform: translateX(-42px) scale(1.15); } }
        .racehorse-runner { position: absolute; left: 14px; bottom: -26px; width: 242px; height: 150px; }
        .racehorse-body, .racehorse-leg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; }
        .racehorse-body { clip-path: inset(0 0 38% 0); animation: racehorse-body .42s ease-in-out infinite; transform-origin: 53% 55%; }
        .racehorse-leg { will-change: transform; }
        .racehorse-leg--front { clip-path: polygon(63% 49%, 78% 51%, 94% 100%, 61% 100%); transform-origin: 69% 56%; animation: racehorse-front-leg .42s ease-in-out infinite; }
        .racehorse-leg--front-alt { clip-path: polygon(58% 51%, 71% 53%, 82% 100%, 53% 100%); transform-origin: 63% 58%; animation: racehorse-front-leg-alt .42s ease-in-out infinite; }
        .racehorse-leg--back { clip-path: polygon(21% 50%, 43% 49%, 51% 100%, 0 100%); transform-origin: 36% 55%; animation: racehorse-back-leg .42s ease-in-out infinite; }
        .racehorse-leg--back-alt { clip-path: polygon(31% 51%, 52% 52%, 61% 100%, 20% 100%); transform-origin: 43% 57%; animation: racehorse-back-leg-alt .42s ease-in-out infinite; }
        .racehorse-track { position: absolute; inset: auto 0 5px; height: 3px; background: repeating-linear-gradient(90deg, ${colors.gold} 0 17px, transparent 17px 42px); animation: racehorse-track .42s linear infinite; opacity: .9; }
        .racehorse-dust { position: absolute; bottom: 10px; width: 18px; height: 4px; background: ${colors.gold}; border-radius: 50%; animation: racehorse-dust .7s linear infinite; }
        @media (prefers-reduced-motion: reduce) { .racehorse-body, .racehorse-leg, .racehorse-track, .racehorse-dust { animation: none !important; } }
      `}</style>
      <div style={{ width: 270, maxWidth: '88vw', textAlign: 'center' }}>
        <div style={{ height: 100, position: 'relative', overflow: 'hidden', borderBottom: `2px solid ${colors.cardBorder}` }}>
          <div className="racehorse-track" />
          <span className="racehorse-dust" style={{ left: '44%' }} />
          <span className="racehorse-dust" style={{ left: '53%', animationDelay: '.28s' }} />
          <div className="racehorse-runner" aria-hidden="true">
            <img className="racehorse-body" src={racehorseImage} alt="" />
            <img className="racehorse-leg racehorse-leg--back" src={racehorseImage} alt="" />
            <img className="racehorse-leg racehorse-leg--back-alt" src={racehorseImage} alt="" />
            <img className="racehorse-leg racehorse-leg--front" src={racehorseImage} alt="" />
            <img className="racehorse-leg racehorse-leg--front-alt" src={racehorseImage} alt="" />
          </div>
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
