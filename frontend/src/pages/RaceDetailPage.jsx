import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { totalScore, MAX_TOTAL, FACTOR_DEFS, TRACKS, SURFACES, CONDITIONS, STYLES, wakuColor } from '../lib/scoring';
import { calcWakuScore, getCourseRule } from '../lib/courseData';
import { calcAutoFactorsFromHistory } from '../lib/historyScore';
import { evaluateRaceTime } from '../lib/timeIndex';
import { styles } from '../styles';

export default function RaceDetailPage() {
  const { raceId } = useParams();
  const navigate = useNavigate();
  const [race, setRace] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [editingHead, setEditingHead] = useState(false);
  const [toast, setToast] = useState(null);
  const [showUrlForm, setShowUrlForm] = useState(false);
  const [jraUrl, setJraUrl] = useState('');
  const [urlImporting, setUrlImporting] = useState(false);
  const [urlError, setUrlError] = useState('');
  const fileInputRef = useRef(null);

  const load = useCallback(async () => {
    const data = await api.getRace(raceId);
    setRace(data);
  }, [raceId]);

  useEffect(() => { load(); }, [load]);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2200); };

  const updateRaceHead = async (patch) => {
    setRace(r => ({ ...r, ...patch }));
    await api.updateRace(raceId, patch);
  };

  const addHorse = async () => {
    const nextNum = (race.horses?.length || 0) + 1;
    const horse = await api.addHorse(raceId, {
      num: nextNum,
      waku: Math.min(8, Math.ceil(nextNum / 2)),
      name: '', jockey: '', pedigree: '', style: '先行',
      last_time: '', last_3f: '', note: '',
      factors: { waku: 0, jockey: 0, pedigree: 0, time: 0, condition: 0, form: 0 },
    });
    setRace(r => ({ ...r, horses: [...r.horses, horse] }));
  };

  const updateHorse = async (horseId, patch) => {
    setRace(r => ({ ...r, horses: r.horses.map(h => h.id === horseId ? { ...h, ...patch } : h) }));
    await api.updateHorse(horseId, patch);
  };

  const updateFactor = async (horseId, key, value) => {
    const horse = race.horses.find(h => h.id === horseId);
    const factors = { ...horse.factors, [key]: value };
    setRace(r => ({ ...r, horses: r.horses.map(h => h.id === horseId ? { ...h, factors } : h) }));
    await api.updateHorse(horseId, { factors });
  };

  const autoCalculate = async () => {
    if (!race.horses.length) return;

    const updates = race.horses.map(h => {
      const wakuScore = calcWakuScore(h.waku, race.track, race.surface, race.distance);
      const historyResults = calcAutoFactorsFromHistory(h, race.date, race);

      const factors = {
        ...h.factors,
        waku: wakuScore,
        time: historyResults.time.hasData ? historyResults.time.score : h.factors.time,
        jockey: historyResults.jockey.score,
        condition: historyResults.condition.score,
        form: historyResults.form.score,
        pedigree: historyResults.pedigree.score,
      };
      return {
        id: h.id,
        factors,
        timeHasData: historyResults.time.hasData,
        historyHasData: historyResults.jockey.hasData || historyResults.condition.hasData || historyResults.form.hasData || historyResults.pedigree.hasData,
      };
    });

    setRace(r => ({
      ...r,
      horses: r.horses.map(h => {
        const u = updates.find(x => x.id === h.id);
        return u ? { ...h, factors: u.factors } : h;
      }),
    }));

    await Promise.all(updates.map(u => api.updateHorse(u.id, { factors: u.factors })));

    const noTimeDataCount = updates.filter(u => !u.timeHasData).length;
    const noHistoryDataCount = updates.filter(u => !u.historyHasData).length;
    const notes = [];
    if (noTimeDataCount > 0) notes.push(`タイム評価できない過去走${noTimeDataCount}頭`);
    if (noHistoryDataCount > 0) notes.push(`過去走データなし${noHistoryDataCount}頭`);

    if (notes.length > 0) {
      showToast(`枠順・タイム・騎手・馬場・臨戦状態を自動計算しました（${notes.join('、')}は手動評価を推奨）`);
    } else {
      showToast('枠順・タイム・騎手・馬場・臨戦状態を自動計算しました');
    }
  };

  const deleteHorse = async (horseId) => {
    setRace(r => ({ ...r, horses: r.horses.filter(h => h.id !== horseId) }));
    await api.deleteHorse(horseId);
  };

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const res = await api.importCsv(raceId, file);
      showToast(`${res.imported}頭を取り込みました`);
      await load();
    } catch (err) {
      showToast(err.message || '取り込みに失敗しました');
    }
    e.target.value = '';
  };

  const handleJraUrlImport = async () => {
    if (!jraUrl.trim()) return;
    setUrlImporting(true);
    setUrlError('');
    try {
      const res = await api.importJraUrl(raceId, jraUrl.trim());
      showToast(`${res.imported}頭を取り込みました`);
      setJraUrl('');
      setShowUrlForm(false);
      await load();
    } catch (err) {
      setUrlError(err.message || '取り込みに失敗しました。JRAサイトの構造が変わっている可能性があります。手動CSV取込みもお試しください。');
    } finally {
      setUrlImporting(false);
    }
  };

  const ranked = useMemo(() => {
    if (!race) return [];
    return [...race.horses].map(h => ({ ...h, score: totalScore(h.factors) })).sort((a, b) => b.score - a.score);
  }, [race]);

  if (!race) return <div style={styles.dim}>読み込み中…</div>;

  return (
    <div>
      <button style={styles.backBtn} onClick={() => navigate('/')}>← 出馬表一覧へ</button>

      <RaceHeader race={race} editing={editingHead} setEditing={setEditingHead} onUpdate={updateRaceHead} />

      <div style={styles.toolbar}>
        <button style={styles.ghostBtn} onClick={() => setShowUrlForm(s => !s)}>
          🔗 JRA出馬表URLから取り込む
        </button>
        <button style={styles.ghostBtn} onClick={() => fileInputRef.current?.click()}>⇧ 出馬表CSVを取り込む</button>
        <input ref={fileInputRef} type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={handleFile} />
        <button style={styles.primaryBtn} onClick={autoCalculate}>⚡ 採点基準を自動計算（全項目）</button>
      </div>

      <div style={styles.toolbarHint}>
        {(() => {
          const rule = getCourseRule(race.track, race.surface, race.distance);
          return `このコースの傾向：${rule.note}`;
        })()}
      </div>

      {showUrlForm && (
        <div style={{ ...styles.card, marginBottom: 18 }}>
          <label style={styles.fieldLabel}>JRA公式サイトの出馬表ページURL</label>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <input
              style={{ ...styles.input, flex: '1 1 320px' }}
              value={jraUrl}
              onChange={e => setJraUrl(e.target.value)}
              placeholder="https://www.jra.go.jp/JRADB/accessD.html?CNAME=..."
            />
            <button style={styles.primaryBtn} onClick={handleJraUrlImport} disabled={urlImporting}>
              {urlImporting ? '取り込み中…' : '取り込む'}
            </button>
          </div>
          {urlError && <div style={styles.errorText}>{urlError}</div>}
          <div style={{ ...styles.toolbarHint, marginTop: 10 }}>
            JRA公式サイトの出馬表ページ（jra.go.jp）のURLを貼り付けてください。馬番・枠番・馬名・騎手・血統を自動取得します（既存の出走馬は上書きされます）。脚質は自動取得できないため後で手動調整してください。サイト構造の変更により取得に失敗する場合は、CSV取込みをご利用ください。
          </div>
        </div>
      )}

      <div style={styles.tableWrap} className="scrollbar">
        <div style={styles.tableHeadRow}>
          <div style={{ ...styles.th, width: 44 }}>枠</div>
          <div style={{ ...styles.th, width: 44 }}>番</div>
          <div style={{ ...styles.th, flex: '1 1 160px', textAlign: 'left' }}>馬名</div>
          <div style={{ ...styles.th, flex: '1 1 120px', textAlign: 'left' }}>騎手</div>
          <div style={{ ...styles.th, width: 110 }}>採点</div>
          <div style={{ ...styles.th, width: 36 }}></div>
        </div>

        {ranked.map(h => (
          <HorseRow
            key={h.id}
            horse={h}
            expanded={expandedId === h.id}
            onToggle={() => setExpandedId(expandedId === h.id ? null : h.id)}
            onUpdate={(patch) => updateHorse(h.id, patch)}
            onFactor={(key, val) => updateFactor(h.id, key, val)}
            onDelete={() => deleteHorse(h.id)}
          />
        ))}

        <button style={styles.addHorseBtn} onClick={addHorse}>＋ 出走馬を追加</button>
      </div>

      {ranked.length > 0 && (
        <div style={styles.legendNote}>
          採点は{MAX_TOTAL}点満点（枠順・騎手・血統・タイム指数 各20点、馬場適性・臨戦状態 各10点、季節・気温適性 5点）。
        </div>
      )}

      {toast && <div style={styles.toast}>{toast}</div>}
    </div>
  );
}

function RaceHeader({ race, editing, setEditing, onUpdate }) {
  if (editing) {
    return (
      <div style={{ ...styles.card, marginBottom: 24 }}>
        <div style={styles.formGrid}>
          <Field label="レース名" span={2}>
            <input style={styles.input} value={race.name} onChange={e => onUpdate({ name: e.target.value })} />
          </Field>
          <Field label="開催日">
            <input style={styles.input} type="date" value={race.date || ''} onChange={e => onUpdate({ date: e.target.value })} />
          </Field>
          <Field label="グレード">
            <input style={styles.input} value={race.grade || ''} onChange={e => onUpdate({ grade: e.target.value })} />
          </Field>
          <Field label="競馬場">
            <select style={styles.input} value={race.track} onChange={e => onUpdate({ track: e.target.value })}>
              {TRACKS.map(t => <option key={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="馬場種別">
            <select style={styles.input} value={race.surface} onChange={e => onUpdate({ surface: e.target.value })}>
              {SURFACES.map(s => <option key={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="距離 (m)">
            <input style={styles.input} type="number" value={race.distance} onChange={e => onUpdate({ distance: Number(e.target.value) })} />
          </Field>
          <Field label="馬場状態">
            <select style={styles.input} value={race.condition} onChange={e => onUpdate({ condition: e.target.value })}>
              {CONDITIONS.map(c => <option key={c}>{c}</option>)}
            </select>
          </Field>
        </div>
        <Field label="メモ" span={2}>
          <textarea style={{ ...styles.input, minHeight: 60, resize: 'vertical' }} value={race.memo || ''} onChange={e => onUpdate({ memo: e.target.value })} placeholder="展開予想・天候・所感など" />
        </Field>
        <button style={{ ...styles.primaryBtn, marginTop: 16 }} onClick={() => setEditing(false)}>完了</button>
      </div>
    );
  }
  return (
    <div style={styles.raceHeadCard}>
      <div>
        {race.grade && <span style={styles.gradeTag}>{race.grade}</span>}
        <h1 style={styles.h1}>{race.name}</h1>
        <div style={styles.raceCardMeta}>
          {race.date && `${race.date} ・ `}{race.track} {race.surface}{race.distance}m ・ 馬場：{race.condition}
        </div>
        {race.memo && <p style={styles.raceMemo}>{race.memo}</p>}
      </div>
      <button style={styles.ghostBtn} onClick={() => setEditing(true)}>編集</button>
    </div>
  );
}

function HorseRow({ horse, expanded, onToggle, onUpdate, onFactor, onDelete }) {
  const score = totalScore(horse.factors);
  const pct = score / MAX_TOTAL;
  return (
    <div style={styles.horseBlock}>
      <div style={styles.horseRow} onClick={onToggle}>
        <div style={{ ...styles.td, width: 44 }}><span style={{ ...styles.wakuChip, ...wakuColor(horse.waku) }}>{horse.waku}</span></div>
        <div style={{ ...styles.td, width: 44, fontFamily: 'JetBrains Mono, monospace', color: '#9c9588' }}>{horse.num}</div>
        <div style={{ ...styles.td, flex: '1 1 160px', textAlign: 'left', fontWeight: 700 }}>
          {horse.name || <span style={{ color: '#6b655a' }}>未入力</span>}
        </div>
        <div style={{ ...styles.td, flex: '1 1 120px', textAlign: 'left', color: '#b9b2a3' }}>{horse.jockey || '—'}</div>
        <div style={{ ...styles.td, width: 110 }}>
          <div style={styles.scoreWrap}>
            <span style={styles.scoreNum}>{score}</span>
            <div style={styles.scoreBarTrack}><div style={{ ...styles.scoreBarFill, width: `${pct * 100}%` }} /></div>
          </div>
        </div>
        <div style={{ ...styles.td, width: 36 }}>
          <span style={{ transform: expanded ? 'rotate(90deg)' : 'none', display: 'inline-block', transition: 'transform .2s', color: '#8a8374' }}>›</span>
        </div>
      </div>

      {expanded && (
        <div style={styles.horseDetail}>
          <div style={styles.detailGrid}>
            <Field label="馬名"><input style={styles.input} value={horse.name} onChange={e => onUpdate({ name: e.target.value })} /></Field>
            <Field label="騎手"><input style={styles.input} value={horse.jockey} onChange={e => onUpdate({ jockey: e.target.value })} /></Field>
            <Field label="馬番"><input style={styles.input} type="number" value={horse.num} onChange={e => onUpdate({ num: Number(e.target.value) })} /></Field>
            <Field label="枠番"><input style={styles.input} type="number" min={1} max={8} value={horse.waku} onChange={e => onUpdate({ waku: Number(e.target.value) })} /></Field>
            <Field label="脚質">
              <select style={styles.input} value={horse.style} onChange={e => onUpdate({ style: e.target.value })}>
                {STYLES.map(s => <option key={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="血統（父系統など）"><input style={styles.input} value={horse.pedigree} onChange={e => onUpdate({ pedigree: e.target.value })} placeholder="例：ディープインパクト系" /></Field>
            <Field label="今回の馬体重">
              <input style={styles.input} type="number" value={horse.current_weight || ''} onChange={e => onUpdate({ current_weight: Number(e.target.value) || 0 })} placeholder="例：462" />
              <WeightDiffHint horse={horse} />
            </Field>
            <Field label="結果着順（後日記録用）"><input style={styles.input} value={horse.result_rank || ''} onChange={e => onUpdate({ result_rank: e.target.value })} placeholder="例：1" /></Field>
          </div>

          <div style={styles.factorSection}>
            <div style={styles.factorSectionTitle}>独自採点</div>
            {FACTOR_DEFS.map(f => (
              <FactorSlider key={f.key} def={f} value={horse.factors[f.key] || 0} onChange={(v) => onFactor(f.key, v)} />
            ))}
          </div>

          {horse.history && <PastRacesTable history={horse.history} />}

          <Field label="メモ" span={2}>
            <textarea style={{ ...styles.input, minHeight: 50, resize: 'vertical' }} value={horse.note || ''} onChange={e => onUpdate({ note: e.target.value })} placeholder="調教評価・不利情報・市場の歪みなど自由記述（例：#夏弱 #冬強 などのタグを書くと馬名検索で横断検索できます）" />
          </Field>

          <button style={styles.deleteTextBtn} onClick={onDelete}>この馬を削除</button>
        </div>
      )}
    </div>
  );
}

function WeightDiffHint({ horse }) {
  const current = horse.current_weight;
  const history = horse.history;
  const lastRace = history?.['前走'];
  const lastWeight = lastRace?.weight;

  if (!current || !lastWeight) {
    return <div style={{ fontSize: 11.5, color: '#9c9588', marginTop: 4 }}>前走馬体重との比較には、今回の馬体重と過去走データの両方が必要です</div>;
  }

  const diff = current - lastWeight;
  const diffText = diff > 0 ? `+${diff}kg` : `${diff}kg`;
  const diffColor = Math.abs(diff) >= 10 ? '#b3493f' : '#5a5448';

  // 過去走の中に、似た増減幅（±4kg以内）で出走した例があれば参考表示する
  const labels = ['前走', '前々走', '3走前', '4走前'];
  const weights = labels.map(l => history[l]?.weight).filter(Boolean);
  let similarNote = '';
  for (let i = 0; i < weights.length - 1; i++) {
    const pastDiff = weights[i] - weights[i + 1];
    if (Math.abs(pastDiff - diff) <= 4) {
      const rank = history[labels[i]]?.rank;
      if (rank) {
        similarNote = `参考：似た増減幅（${pastDiff > 0 ? '+' : ''}${pastDiff}kg）の時は${rank}着`;
        break;
      }
    }
  }

  return (
    <div style={{ fontSize: 11.5, marginTop: 4 }}>
      <span style={{ color: diffColor, fontWeight: 600 }}>前走比 {diffText}</span>
      {Math.abs(diff) >= 10 && <span style={{ color: '#b3493f' }}>（大幅増減）</span>}
      {similarNote && <div style={{ color: '#9c9588', marginTop: 2 }}>{similarNote}</div>}
    </div>
  );
}

function PastRacesTable({ history }) {
  const labels = ['前走', '前々走', '3走前', '4走前'];
  const races = labels.map(label => ({ label, race: history[label] })).filter(r => r.race);

  if (races.length === 0) {
    return (
      <div style={{ ...styles.factorSection, fontSize: 12.5, color: '#9c9588' }}>
        過去走データなし（JRA出馬表URL取込みで自動取得されます）
      </div>
    );
  }

  return (
    <div style={styles.factorSection}>
      <div style={styles.factorSectionTitle}>過去4走（JRA出馬表より自動取得・採点の参考値の根拠）</div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ color: '#9c9588', textAlign: 'left' }}>
              <th style={{ padding: '4px 8px' }}></th>
              <th style={{ padding: '4px 8px' }}>日付</th>
              <th style={{ padding: '4px 8px' }}>競馬場</th>
              <th style={{ padding: '4px 8px' }}>コース</th>
              <th style={{ padding: '4px 8px' }}>馬場</th>
              <th style={{ padding: '4px 8px' }}>着順</th>
              <th style={{ padding: '4px 8px' }}>タイム評価</th>
              <th style={{ padding: '4px 8px' }}>騎手</th>
            </tr>
          </thead>
          <tbody>
            {races.map(({ label, race }) => {
              const timeEval = evaluateRaceTime(race);
              const levelLabel = {
                excellent: '◎優秀', good: '○良好', average: '△平均', below: '▽平均以下',
              }[timeEval.level] || '—';
              return (
                <tr key={label} style={{ borderTop: '1px solid #e3e0d6' }}>
                  <td style={{ padding: '4px 8px', color: '#a87f2e', fontWeight: 700 }}>{label}</td>
                  <td style={{ padding: '4px 8px' }}>{race.date || '—'}</td>
                  <td style={{ padding: '4px 8px' }}>{race.track || '—'}</td>
                  <td style={{ padding: '4px 8px' }}>{race.surface}{race.distance || ''}</td>
                  <td style={{ padding: '4px 8px' }}>{race.condition || '—'}</td>
                  <td style={{ padding: '4px 8px' }}>{race.rank ? `${race.rank}着/${race.headcount}頭` : '—'}</td>
                  <td style={{ padding: '4px 8px' }} title={timeEval.hasData ? `基準タイム差 ${timeEval.diffSec > 0 ? '+' : ''}${timeEval.diffSec}秒` : timeEval.reason}>
                    {timeEval.hasData ? levelLabel : '—'}
                  </td>
                  <td style={{ padding: '4px 8px' }}>{race.jockey || '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FactorSlider({ def, value, onChange }) {
  const [showGuide, setShowGuide] = useState(false);
  const hasGuide = def.guide && def.guide.length > 0;

  return (
    <div>
      <div style={styles.factorRow}>
        <div style={styles.factorLabelWrap}>
          <span style={styles.factorLabel}>
            {def.label}
            {def.auto && <span style={{ marginLeft: 6, fontSize: 10, color: '#a87f2e', fontWeight: 700 }}>自動可</span>}
          </span>
          <span style={styles.factorHint}>
            {def.hint}
            {hasGuide && (
              <span
                onClick={() => setShowGuide(s => !s)}
                style={{ color: '#a87f2e', cursor: 'pointer', marginLeft: 6, fontWeight: 700 }}
              >
                {showGuide ? '判断材料を閉じる ▲' : '判断材料を見る ▼'}
              </span>
            )}
          </span>
        </div>
        <input type="range" min={0} max={def.max} value={value} onChange={e => onChange(Number(e.target.value))} style={{ flex: 1 }} />
        <span style={styles.factorValue}>{value}<small>/{def.max}</small></span>
      </div>
      {hasGuide && showGuide && (
        <ul style={{ margin: '0 0 14px', paddingLeft: 184, fontSize: 12, color: '#7a7468', lineHeight: 1.8 }}>
          {def.guide.map((g, i) => <li key={i}>{g}</li>)}
        </ul>
      )}
    </div>
  );
}

function Field({ label, children, span }) {
  return (
    <div style={{ gridColumn: span ? `span ${span}` : undefined }}>
      <label style={styles.fieldLabel}>{label}</label>
      {children}
    </div>
  );
}
