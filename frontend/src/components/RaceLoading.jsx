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
      <svg className="race-loader" width="238" height="142" viewBox="0 0 238 142" fill="none" aria-hidden="true">
        <path d="M8 121H230" stroke={colors.cardBorder} strokeWidth="2" strokeLinecap="round" />
        <path d="M20 128H62M88 128H128M153 128H211" stroke={colors.gold} strokeOpacity=".25" strokeWidth="2" strokeLinecap="round" />
        <g className="race-loader-body">
          {/* 頭・耳・首・胴・尾を分離し、競走馬の横姿が読み取れる形にする */}
          <path d="M67 77C75 51 91 43 115 50C129 41 151 43 167 54C181 54 194 62 198 75C202 87 192 97 177 96C164 107 139 111 111 105C94 104 80 99 68 92L50 93L42 85L55 78Z" fill="#7a4a2e" />
          <path d="M71 77C77 56 87 47 101 46L112 55L108 77L91 89Z" fill="#8d5735" />
          <path d="M67 78L42 64L25 68L48 80" fill="#5c3724" />
          <path d="M48 80L28 82" stroke="#2a2620" strokeWidth="4" strokeLinecap="round" />
          <path d="M99 48L103 31L110 43M107 45L119 29L120 46" stroke="#2a2620" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M73 72C85 68 94 70 106 77" stroke="#e2b36b" strokeWidth="3" strokeLinecap="round" opacity=".85" />
          <path d="M62 83C57 84 52 87 48 90" stroke="#2a2620" strokeWidth="3" strokeLinecap="round" />
          <circle cx="103" cy="59" r="2.8" fill="#16130f" />
          <path d="M107 67L119 70" stroke="#2a2620" strokeWidth="2.5" strokeLinecap="round" />
          {/* 鞍・騎手（前傾）・ヘルメット・手綱 */}
          <path d="M119 55C130 50 143 51 151 57L144 70H119Z" fill="#f0eee7" stroke="#2a2620" strokeWidth="2" />
          <path d="M130 57L139 33L157 42L151 62Z" fill="#244766" />
          <circle cx="148" cy="27" r="10" fill="#d9a47d" />
          <path d="M138 26C141 16 154 15 159 25" fill="#b3493f" stroke="#2a2620" strokeWidth="2" />
          <path d="M143 36L125 52" stroke="#244766" strokeWidth="7" strokeLinecap="round" />
          <path d="M154 42L168 59" stroke="#244766" strokeWidth="7" strokeLinecap="round" />
          <path d="M166 58L111 68" stroke="#2a2620" strokeWidth="2" strokeLinecap="round" />
          <path d="M143 61L160 79" stroke="#f0eee7" strokeWidth="6" strokeLinecap="round" />
          <path d="M160 79L177 80" stroke="#2a2620" strokeWidth="4" strokeLinecap="round" />
          {/* 四肢：前後で位相をずらしたギャロップ */}
          <g className="race-leg-a"><path d="M91 98L75 119" stroke="#2a2620" strokeWidth="8" strokeLinecap="round" /><path d="M75 119L62 119" stroke="#2a2620" strokeWidth="5" strokeLinecap="round" /></g>
          <g className="race-leg-b"><path d="M112 102L119 120" stroke="#2a2620" strokeWidth="8" strokeLinecap="round" /><path d="M119 120L134 120" stroke="#2a2620" strokeWidth="5" strokeLinecap="round" /></g>
          <g className="race-leg-b"><path d="M164 96L156 120" stroke="#2a2620" strokeWidth="8" strokeLinecap="round" /><path d="M156 120L145 120" stroke="#2a2620" strokeWidth="5" strokeLinecap="round" /></g>
          <g className="race-leg-a"><path d="M178 94L194 118" stroke="#2a2620" strokeWidth="8" strokeLinecap="round" /><path d="M194 118L208 120" stroke="#2a2620" strokeWidth="5" strokeLinecap="round" /></g>
        </g>
      </svg>
      <div style={{ ...styles.loadingText, marginTop: 8 }}>{label}</div>
      <div style={{ fontSize: 11, color: colors.inkDim, marginTop: 5 }}>出馬表と予測材料を整えています</div>
    </div>
  );
}
