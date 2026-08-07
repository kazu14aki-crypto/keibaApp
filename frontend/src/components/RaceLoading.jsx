import React from 'react';
import { colors, styles } from '../styles';

/** 軽量なSVGのみで描く、騎手と競走馬の待機アニメーション。 */
export default function RaceLoading({ label = 'データを確認中…' }) {
  return (
    <div style={styles.loadingWrap} role="status" aria-live="polite" aria-label={label}>
      <style>{`
        @keyframes race-run { 0% { transform: translateX(-18px); } 100% { transform: translateX(18px); } }
        @keyframes race-bob { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
        @keyframes race-leg-a { 0%,100% { transform: rotate(22deg); } 50% { transform: rotate(-28deg); } }
        @keyframes race-leg-b { 0%,100% { transform: rotate(-24deg); } 50% { transform: rotate(25deg); } }
        .race-loader { animation: race-run 1.2s ease-in-out infinite alternate; }
        .race-loader-body { animation: race-bob .34s ease-in-out infinite; }
        .race-leg-a { animation: race-leg-a .34s ease-in-out infinite; transform-origin: top center; }
        .race-leg-b { animation: race-leg-b .34s ease-in-out infinite; transform-origin: top center; }
        @media (prefers-reduced-motion: reduce) { .race-loader, .race-loader-body, .race-leg-a, .race-leg-b { animation: none !important; } }
      `}</style>
      <svg className="race-loader" width="164" height="92" viewBox="0 0 164 92" fill="none" aria-hidden="true">
        <path d="M10 79H154" stroke={colors.cardBorder} strokeWidth="2" strokeLinecap="round" />
        <g className="race-loader-body">
          <path d="M43 49C47 37 59 34 79 38C88 32 102 32 110 40L126 43C136 45 139 55 132 60L112 59C101 68 72 67 52 60L38 62L31 56L39 50Z" fill={colors.gold} />
          <path d="M76 39L83 25L97 27L102 41" fill="#3d5a7a" />
          <circle cx="90" cy="20" r="8" fill="#d8aa82" />
          <path d="M83 18C86 10 96 10 99 18" stroke="#2a2620" strokeWidth="4" strokeLinecap="round" />
          <path d="M81 27L69 38" stroke="#3d5a7a" strokeWidth="6" strokeLinecap="round" />
          <path d="M98 29L111 39" stroke="#3d5a7a" strokeWidth="6" strokeLinecap="round" />
          <path d="M42 49L27 40L17 42L29 52" fill={colors.gold} />
          <path d="M43 53L28 55" stroke="#2a2620" strokeWidth="3" strokeLinecap="round" />
          <g className="race-leg-a"><path d="M60 62L53 78" stroke="#2a2620" strokeWidth="6" strokeLinecap="round" /><path d="M53 78L43 78" stroke="#2a2620" strokeWidth="4" strokeLinecap="round" /></g>
          <g className="race-leg-b"><path d="M83 63L91 78" stroke="#2a2620" strokeWidth="6" strokeLinecap="round" /><path d="M91 78L101 78" stroke="#2a2620" strokeWidth="4" strokeLinecap="round" /></g>
          <g className="race-leg-b"><path d="M105 61L101 77" stroke="#2a2620" strokeWidth="6" strokeLinecap="round" /><path d="M101 77L92 78" stroke="#2a2620" strokeWidth="4" strokeLinecap="round" /></g>
          <g className="race-leg-a"><path d="M119 59L128 76" stroke="#2a2620" strokeWidth="6" strokeLinecap="round" /><path d="M128 76L138 78" stroke="#2a2620" strokeWidth="4" strokeLinecap="round" /></g>
          <circle cx="126" cy="49" r="3" fill="#2a2620" />
        </g>
      </svg>
      <div style={{ ...styles.loadingText, marginTop: 8 }}>{label}</div>
      <div style={{ fontSize: 11, color: colors.inkDim, marginTop: 5 }}>出馬表と予測材料を整えています</div>
    </div>
  );
}
