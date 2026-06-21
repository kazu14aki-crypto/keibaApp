import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../lib/api';
import { totalScore, FACTOR_DEFS, MAX_TOTAL } from '../lib/scoring';
import { styles } from '../styles';

export default function StatsPage() {
  const [races, setRaces] = useState(null);

  useEffect(() => {
    (async () => {
      const list = await api.listRaces();
      const detailed = await Promise.all(list.map(r => api.getRace(r.id)));
      setRaces(detailed);
    })();
  }, []);

  const finished = useMemo(() => (races || []).filter(r => r.horses.some(h => h.result_rank)), [races]);
  const allHorses = useMemo(() => (races || []).flatMap(r => r.horses.map(h => ({ ...h, raceName: r.name }))), [races]);
  const scored = useMemo(() => allHorses.filter(h => totalScore(h.factors) > 0), [allHorses]);

  const byTrack = useMemo(() => {
    const map = {};
    (races || []).forEach(r => {
      r.horses.forEach(h => {
        if (!h.result_rank) return;
        const key = r.track;
        if (!map[key]) map[key] = { total: 0, hit: 0 };
        map[key].total += 1;
        const top3Score = [...r.horses].sort((a, b) => totalScore(b.factors) - totalScore(a.factors)).slice(0, 3).some(x => x.id === h.id);
        const top3Result = Number(h.result_rank) <= 3;
        if (top3Score && top3Result) map[key].hit += 1;
      });
    });
    return map;
  }, [races]);

  const factorAverage = useMemo(() => {
    if (!scored.length) return {};
    const sums = Object.fromEntries(FACTOR_DEFS.map(f => [f.key, 0]));
    scored.forEach(h => FACTOR_DEFS.forEach(f => { sums[f.key] += (h.factors[f.key] || 0); }));
    const avg = {};
    FACTOR_DEFS.forEach(f => { avg[f.key] = (sums[f.key] / scored.length).toFixed(1); });
    return avg;
  }, [scored]);

  if (races === null) return <div style={styles.dim}>読み込み中…</div>;

  if (races.length === 0) {
    return (
      <div style={styles.empty}>
        <div style={styles.emptyMark}>◎</div>
        <p style={styles.emptyText}>傾向分析を表示するには、まず出馬表でレースと採点を登録してください。</p>
      </div>
    );
  }

  return (
    <div>
      <h1 style={styles.h1}>傾向分析</h1>
      <p style={styles.lead}>登録した採点と結果から、独自指標の的中傾向を振り返ります。</p>

      <div style={styles.statGrid}>
        <StatCard label="登録レース数" value={races.length} unit="件" />
        <StatCard label="結果記録済み" value={finished.length} unit="件" />
        <StatCard label="採点済み馬" value={scored.length} unit="頭" />
      </div>

      <div style={styles.card}>
        <h3 style={styles.cardTitle}>競馬場別：採点上位3頭の的中率</h3>
        {Object.keys(byTrack).length === 0 ? (
          <p style={styles.dim}>結果（着順）を記録すると、ここに的中率が表示されます。</p>
        ) : (
          <div style={styles.barList}>
            {Object.entries(byTrack).map(([track, d]) => (
              <div key={track} style={styles.barRow}>
                <span style={styles.barLabel}>{track}</span>
                <div style={styles.barTrack}><div style={{ ...styles.barFill, width: `${(d.hit / d.total) * 100}%` }} /></div>
                <span style={styles.barValue}>{d.hit}/{d.total}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={styles.card}>
        <h3 style={styles.cardTitle}>採点項目の平均配点傾向</h3>
        <p style={styles.dim}>どの指標を重視して採点しているかの自己分析です。</p>
        <div style={styles.barList}>
          {FACTOR_DEFS.map(f => (
            <div key={f.key} style={styles.barRow}>
              <span style={styles.barLabel}>{f.label}</span>
              <div style={styles.barTrack}><div style={{ ...styles.barFill, width: `${((factorAverage[f.key] || 0) / f.max) * 100}%`, background: '#c4a35a' }} /></div>
              <span style={styles.barValue}>{factorAverage[f.key] || 0}/{f.max}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, unit }) {
  return (
    <div style={styles.statCard}>
      <div style={styles.statValue}>{value}<small>{unit}</small></div>
      <div style={styles.statLabel}>{label}</div>
    </div>
  );
}
