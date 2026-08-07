import React, { useEffect, useState, useMemo } from 'react';
import { analyzeRace } from '../lib/probability';
import { styles } from '../styles';

/**
 * 期待値分析パネル。
 * スコア(KiriScore)をソフトマックスで勝率に変換し、入力された単勝オッズと
 * 比較して期待値(EV)とケリー推奨賭け金比率を表示する。
 *
 * 使い方:
 *   1. 発走前に各馬の単勝オッズを入力する(発走10分前以降が望ましい)
 *   2. EV列が閾値(既定1.2)以上の馬だけが「妙味あり」としてハイライトされる
 *   3. EV最大の馬 ≠ スコア最大の馬 であることが多い。買うべきはEV側。
 *
 * props:
 *   horses: [{id, num, name, score, odds}] スコア降順推奨
 *   onUpdateOdds: (horseId, odds:number) => void  オッズ保存コールバック
 */
export default function ValueAnalysis({ horses, onUpdateOdds }) {
  const [beta, setBeta] = useState(0.12);
  const [blendW, setBlendW] = useState(0.3);
  const [evThreshold, setEvThreshold] = useState(1.2);
  const [collapsed, setCollapsed] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showCandidatesOnly, setShowCandidatesOnly] = useState(false);
  const [oddsDrafts, setOddsDrafts] = useState({});

  // 入力途中の「1」「12」を即座にAPIへ保存せず、確定操作時だけ時点を記録する。
  // レースを再読込したときは、保存済みの値を表示に反映する。
  useEffect(() => {
    setOddsDrafts(prev => {
      const next = { ...prev };
      horses.forEach(h => {
        if (!(h.id in next)) next[h.id] = h.odds > 1 ? String(h.odds) : '';
      });
      return next;
    });
  }, [horses]);

  const analysis = useMemo(() => {
    if (!horses || horses.length === 0) return [];
    const displayHorses = horses.map(h => ({
      ...h,
      odds: oddsDrafts[h.id] === undefined ? h.odds || 0 : Number(oddsDrafts[h.id]) || 0,
    }));
    const results = analyzeRace(
      displayHorses.map(h => ({ score: h.score, odds: h.odds || 0 })),
      { beta, blendW, evThreshold },
    );
    return displayHorses.map((h, i) => ({ ...h, ...results[i] }));
  }, [horses, oddsDrafts, beta, blendW, evThreshold]);

  const hasAnyOdds = analysis.some(a => a.odds > 1);
  const oddsCount = analysis.filter(a => a.odds > 1).length;
  const candidates = analysis.filter(a => a.valueFlag);
  // EV降順で表示(オッズ未入力馬は末尾)
  const sorted = [...analysis].sort((a, b) => (b.ev || 0) - (a.ev || 0));
  const visible = showCandidatesOnly ? sorted.filter(h => h.valueFlag) : sorted;

  const pct = (v) => `${(v * 100).toFixed(1)}%`;
  const saveOdds = (horseId) => {
    const odds = Number(oddsDrafts[horseId]) || 0;
    const saved = horses.find(h => h.id === horseId)?.odds || 0;
    if (odds !== saved) onUpdateOdds(horseId, odds);
  };

  return (
    <div style={{ ...styles.card, marginTop: 18 }}>
      <div
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
        onClick={() => setCollapsed(c => !c)}
      >
        <div style={{ fontWeight: 700, fontSize: 14 }}>
          💰 期待値分析（オッズ×勝率）
        </div>
        <span style={{ color: '#8a8374', transform: collapsed ? 'none' : 'rotate(90deg)', display: 'inline-block', transition: 'transform .2s' }}>›</span>
      </div>

      {!collapsed && (
        <>
          <div style={{ fontSize: 11, color: '#9c9588', margin: '8px 0 12px', lineHeight: 1.7 }}>
            スコアをソフトマックス変換した推定勝率と市場オッズを融合し、単勝期待値（EV = 勝率×オッズ）を計算します。
            <b>買うべきは「スコア1位」ではなく「EVが閾値を超える馬」</b>です。EVが1.0を下回る馬は、どれだけ強くても長期的には損をします。
            オッズは発走直前（10分前以降）の値を入力してください。入力時刻も保存されます。早い時間のオッズや確定後入力はバックテストとの乖離要因になるため、検証では除外します。
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
            <StatusPill label={`オッズ入力 ${oddsCount}/${analysis.length}`} tone={oddsCount === analysis.length ? 'ok' : 'neutral'} />
            <StatusPill label={`妙味候補 ${candidates.length}頭`} tone={candidates.length ? 'gold' : 'neutral'} />
            <StatusPill label="紙上検証モード" tone="neutral" />
            <button
              type="button"
              onClick={() => setShowCandidatesOnly(v => !v)}
              style={{ ...styles.ghostBtn, padding: '5px 10px', fontSize: 11, color: showCandidatesOnly ? '#fff' : '#a87f2e', background: showCandidatesOnly ? '#a87f2e' : 'transparent' }}
            >
              {showCandidatesOnly ? '全馬を表示' : '妙味候補だけ'}
            </button>
          </div>

          <div style={{ marginBottom: 12 }}>
            <button type="button" onClick={() => setShowSettings(v => !v)} style={{ background: 'none', border: 'none', padding: 0, color: '#7a7468', fontSize: 11, cursor: 'pointer' }}>
              {showSettings ? '⌃ 詳細設定を閉じる' : '⌄ 詳細設定（較正済みの値がある場合のみ変更）'}
            </button>
          </div>
          {showSettings && <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 12, fontSize: 11 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              β(スコア信頼度)
              <input
                type="number" step="0.02" min="0.02" max="0.5"
                style={{ ...styles.input, width: 64, fontSize: 11, padding: '3px 6px' }}
                value={beta}
                onChange={e => setBeta(Number(e.target.value) || 0.12)}
              />
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              モデル比重w
              <input
                type="number" step="0.1" min="0" max="1"
                style={{ ...styles.input, width: 56, fontSize: 11, padding: '3px 6px' }}
                value={blendW}
                onChange={e => setBlendW(Number(e.target.value) || 0.3)}
              />
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              EV購入閾値
              <input
                type="number" step="0.05" min="1" max="2"
                style={{ ...styles.input, width: 60, fontSize: 11, padding: '3px 6px' }}
                value={evThreshold}
                onChange={e => setEvThreshold(Number(e.target.value) || 1.2)}
              />
            </label>
          </div>}

          {/* テーブル */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ color: '#9c9588', textAlign: 'right' }}>
                  <th style={{ padding: '4px 8px', textAlign: 'center' }}>番</th>
                  <th style={{ padding: '4px 8px', textAlign: 'left' }}>馬名</th>
                  <th style={{ padding: '4px 8px' }}>スコア</th>
                  <th style={{ padding: '4px 8px' }}>推定勝率</th>
                  <th style={{ padding: '4px 8px' }}>単勝オッズ</th>
                  <th style={{ padding: '4px 8px' }}>市場勝率</th>
                  <th style={{ padding: '4px 8px' }}>融合勝率</th>
                  <th style={{ padding: '4px 8px' }}>EV</th>
                  <th style={{ padding: '4px 8px' }}>推奨賭金%</th>
                </tr>
              </thead>
              <tbody>
                {visible.map(h => (
                  <tr
                    key={h.id}
                    style={{
                      textAlign: 'right',
                      background: h.valueFlag ? 'rgba(168,127,46,0.12)' : 'transparent',
                      borderTop: '1px solid rgba(138,131,116,0.15)',
                    }}
                  >
                    <td style={{ padding: '5px 8px', textAlign: 'center', fontFamily: 'monospace' }}>{h.num}</td>
                    <td style={{ padding: '5px 8px', textAlign: 'left', fontWeight: h.valueFlag ? 700 : 400 }}>
                      {h.valueFlag ? '🔥 ' : ''}{h.name}
                    </td>
                    <td style={{ padding: '5px 8px' }}>{h.score}</td>
                    <td style={{ padding: '5px 8px' }}>{pct(h.modelProb)}</td>
                    <td style={{ padding: '5px 8px' }}>
                      <input
                        type="number" step="0.1" min="1"
                        style={{ ...styles.input, width: 64, fontSize: 12, padding: '3px 6px', textAlign: 'right' }}
                        value={oddsDrafts[h.id] ?? (h.odds > 1 ? String(h.odds) : '')}
                        placeholder="—"
                        onClick={e => e.stopPropagation()}
                        onChange={e => setOddsDrafts(d => ({ ...d, [h.id]: e.target.value }))}
                        onBlur={() => saveOdds(h.id)}
                        onKeyDown={e => { if (e.key === 'Enter') { e.currentTarget.blur(); } }}
                      />
                    </td>
                    <td style={{ padding: '5px 8px', color: '#9c9588' }}>{h.marketProb > 0 ? pct(h.marketProb) : '—'}</td>
                    <td style={{ padding: '5px 8px', fontWeight: 600 }}>{h.odds > 1 ? pct(h.blendProb) : pct(h.modelProb)}</td>
                    <td style={{
                      padding: '5px 8px', fontWeight: 700,
                      color: h.ev >= evThreshold ? '#a87f2e' : h.ev >= 1.0 ? '#5a5348' : '#b3493f',
                    }}>
                      {h.odds > 1 ? h.ev.toFixed(2) : '—'}
                    </td>
                    <td style={{ padding: '5px 8px' }}>{h.kelly > 0 ? `${(h.kelly * 100).toFixed(1)}%` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {!hasAnyOdds && (
            <div style={{ fontSize: 11, color: '#b3493f', marginTop: 10 }}>
              オッズが未入力です。オッズを入力すると期待値・推奨賭け金が計算されます。
            </div>
          )}
          {hasAnyOdds && oddsCount < analysis.length && (
            <div style={{ fontSize: 11, color: '#7a7468', marginTop: 10 }}>
              未入力の馬がいるため、現在の市場確率とEVは暫定値です。全頭の単勝オッズを入力してから比較してください。
            </div>
          )}
          <div style={{ fontSize: 10, color: '#8a8374', marginTop: 10, lineHeight: 1.7 }}>
            β・wは較正前の暫定値です。結果を記録したレースが50件を超えたら、バックテストツール（backtest/README参照）で較正し直してください。
            推奨賭金%は1/4ケリー基準（上限5%）ですが、実運用判定がPASSするまでは紙上検証用の表示です。モデルが市場に勝てているか未検証の段階では、実際の投入額はさらに半分以下を強く推奨します。
          </div>
        </>
      )}
    </div>
  );
}

function StatusPill({ label, tone }) {
  const palette = {
    ok: { background: 'rgba(63,122,82,0.1)', color: '#2c6b3f' },
    gold: { background: 'rgba(168,127,46,0.12)', color: '#8b651c' },
    neutral: { background: '#f1f0ea', color: '#7a7468' },
  };
  return <span style={{ ...palette[tone], padding: '5px 9px', borderRadius: 99, fontSize: 11, fontWeight: 600 }}>{label}</span>;
}
