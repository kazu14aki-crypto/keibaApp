import React, { useState, useEffect, useCallback, useMemo } from 'react';

// ============================================================
// 定数定義
// ============================================================
const TRACKS = ['東京', '中山', '阪神', '京都', '中京', '新潟', '小倉', '福島', '札幌', '函館'];
const SURFACES = ['芝', 'ダート'];
const CONDITIONS = ['良', '稍重', '重', '不良'];
const STYLES = ['逃げ', '先行', '差し', '追込'];

const FACTOR_DEFS = [
  { key: 'waku', label: '枠順適性', max: 20, hint: '今回の枠番がコース傾向に合うか' },
  { key: 'jockey', label: '騎手評価', max: 20, hint: '当該コース・条件での騎手実績' },
  { key: 'pedigree', label: '血統適性', max: 20, hint: '父系統・距離適性・馬場適性' },
  { key: 'time', label: 'タイム指数', max: 20, hint: '走破タイム・上がり3Fの絶対値評価' },
  { key: 'condition', label: '馬場適性', max: 10, hint: '良/稍重/重/不良への対応力' },
  { key: 'form', label: '臨戦・状態', max: 10, hint: '間隔・ローテーション・調教' },
];
const MAX_TOTAL = FACTOR_DEFS.reduce((s, f) => s + f.max, 0);

const emptyFactors = () => Object.fromEntries(FACTOR_DEFS.map(f => [f.key, 0]));

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

// ============================================================
// ストレージ ヘルパー
// ============================================================
async function loadEntries() {
  try {
    const res = await window.storage.get('entries-list', false);
    if (!res) return [];
    return JSON.parse(res.value);
  } catch (e) {
    return [];
  }
}
async function saveEntries(entries) {
  try {
    await window.storage.set('entries-list', JSON.stringify(entries), false);
  } catch (e) {
    console.error('save failed', e);
  }
}

// ============================================================
// スコア計算
// ============================================================
function totalScore(factors) {
  return FACTOR_DEFS.reduce((s, f) => s + (Number(factors[f.key]) || 0), 0);
}

// ============================================================
// CSV パーサー（出馬表取り込み用）
// 想定ヘッダー例: 馬番,枠番,馬名,騎手,血統,脚質
// 列名は多少のゆらぎ（馬番/番, 枠番/枠, 馬名/名前 等）を許容
// ============================================================
function parseCsv(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n').filter(l => l.trim() !== '');
  if (lines.length < 2) return [];
  const splitLine = (line) => {
    const result = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') { inQuotes = !inQuotes; continue; }
      if (c === ',' && !inQuotes) { result.push(cur); cur = ''; continue; }
      cur += c;
    }
    result.push(cur);
    return result.map(s => s.trim());
  };
  const header = splitLine(lines[0]);
  const findCol = (cands) => header.findIndex(h => cands.some(c => h.includes(c)));
  const idx = {
    num: findCol(['馬番', '番']),
    waku: findCol(['枠番', '枠']),
    name: findCol(['馬名', '名前']),
    jockey: findCol(['騎手']),
    pedigree: findCol(['血統', '父']),
    style: findCol(['脚質']),
  };
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitLine(lines[i]);
    if (!cols.some(c => c !== '')) continue;
    const numVal = idx.num >= 0 ? Number(cols[idx.num]) : rows.length + 1;
    rows.push({
      id: uid(),
      num: isNaN(numVal) ? rows.length + 1 : numVal,
      waku: idx.waku >= 0 ? (Number(cols[idx.waku]) || Math.min(8, Math.ceil((rows.length + 1) / 2))) : Math.min(8, Math.ceil((rows.length + 1) / 2)),
      name: idx.name >= 0 ? cols[idx.name] : '',
      jockey: idx.jockey >= 0 ? cols[idx.jockey] : '',
      pedigree: idx.pedigree >= 0 ? cols[idx.pedigree] : '',
      style: idx.style >= 0 && STYLES.includes(cols[idx.style]) ? cols[idx.style] : '先行',
      lastTime: '',
      last3F: '',
      resultRank: '',
      factors: emptyFactors(),
      note: '',
    });
  }
  return rows;
}

// ============================================================
// メインアプリ
// ============================================================
export default function App() {
  const [view, setView] = useState('races'); // races | race | stats
  const [races, setRaces] = useState([]); // [{id, name, date, track, surface, distance, condition, horses:[{id,num,waku,name,jockey,pedigree,factors,resultRank}]}]
  const [activeRaceId, setActiveRaceId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    (async () => {
      const data = await loadEntries();
      setRaces(data);
      setLoading(false);
    })();
  }, []);

  const persist = useCallback(async (next) => {
    setRaces(next);
    await saveEntries(next);
  }, []);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  };

  const activeRace = useMemo(() => races.find(r => r.id === activeRaceId) || null, [races, activeRaceId]);

  // --- レース操作 ---
  const createRace = (raceData) => {
    const newRace = {
      id: uid(),
      name: raceData.name || '無題のレース',
      date: raceData.date || '',
      track: raceData.track || '東京',
      surface: raceData.surface || '芝',
      distance: raceData.distance || 2000,
      condition: raceData.condition || '良',
      grade: raceData.grade || '',
      memo: raceData.memo || '',
      horses: [],
      createdAt: Date.now(),
    };
    const next = [newRace, ...races];
    persist(next);
    setActiveRaceId(newRace.id);
    setView('race');
    showToast('レースを作成しました');
  };

  const updateRace = (raceId, patch) => {
    const next = races.map(r => r.id === raceId ? { ...r, ...patch } : r);
    persist(next);
  };

  const deleteRace = (raceId) => {
    const next = races.filter(r => r.id !== raceId);
    persist(next);
    if (activeRaceId === raceId) {
      setActiveRaceId(null);
      setView('races');
    }
    showToast('レースを削除しました');
  };

  // --- 馬操作 ---
  const addHorse = (raceId) => {
    const race = races.find(r => r.id === raceId);
    const nextNum = (race.horses.length || 0) + 1;
    const horse = {
      id: uid(),
      num: nextNum,
      waku: Math.min(8, Math.ceil(nextNum / 2)),
      name: '',
      jockey: '',
      pedigree: '',
      style: '先行',
      lastTime: '',
      last3F: '',
      resultRank: '',
      factors: emptyFactors(),
      note: '',
    };
    const next = races.map(r => r.id === raceId ? { ...r, horses: [...r.horses, horse] } : r);
    persist(next);
  };

  const importHorsesFromCsv = (raceId, csvText) => {
    const parsed = parseCsv(csvText);
    if (!parsed.length) {
      showToast('CSVを読み取れませんでした');
      return;
    }
    const next = races.map(r => r.id === raceId ? { ...r, horses: parsed } : r);
    persist(next);
    showToast(`${parsed.length}頭を取り込みました`);
  };

  const updateHorse = (raceId, horseId, patch) => {
    const next = races.map(r => {
      if (r.id !== raceId) return r;
      return { ...r, horses: r.horses.map(h => h.id === horseId ? { ...h, ...patch } : h) };
    });
    persist(next);
  };

  const updateHorseFactor = (raceId, horseId, key, value) => {
    const next = races.map(r => {
      if (r.id !== raceId) return r;
      return {
        ...r,
        horses: r.horses.map(h => h.id === horseId ? { ...h, factors: { ...h.factors, [key]: value } } : h)
      };
    });
    persist(next);
  };

  const deleteHorse = (raceId, horseId) => {
    const next = races.map(r => r.id === raceId ? { ...r, horses: r.horses.filter(h => h.id !== horseId) } : r);
    persist(next);
  };

  if (loading) {
    return (
      <div style={styles.loadingWrap}>
        <div style={styles.loadingMark}>馬</div>
        <div style={styles.loadingText}>データを呼び出し中…</div>
      </div>
    );
  }

  return (
    <div style={styles.app}>
      <GlobalStyle />
      <Header view={view} onNav={(v) => { setView(v); if (v === 'races') setActiveRaceId(null); }} />
      <main style={styles.main}>
        {view === 'races' && (
          <RaceList
            races={races}
            onOpen={(id) => { setActiveRaceId(id); setView('race'); }}
            onCreate={createRace}
            onDelete={deleteRace}
          />
        )}
        {view === 'race' && activeRace && (
          <RaceDetail
            race={activeRace}
            onUpdateRace={(patch) => updateRace(activeRace.id, patch)}
            onAddHorse={() => addHorse(activeRace.id)}
            onImportCsv={(text) => importHorsesFromCsv(activeRace.id, text)}
            onUpdateHorse={(hid, patch) => updateHorse(activeRace.id, hid, patch)}
            onUpdateFactor={(hid, key, val) => updateHorseFactor(activeRace.id, hid, key, val)}
            onDeleteHorse={(hid) => deleteHorse(activeRace.id, hid)}
            onBack={() => { setView('races'); setActiveRaceId(null); }}
          />
        )}
        {view === 'stats' && <StatsView races={races} />}
      </main>
      {toast && <div style={styles.toast}>{toast}</div>}
    </div>
  );
}

// ============================================================
// グローバルスタイル（フォント・キーフレーム）
// ============================================================
function GlobalStyle() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Shippori+Mincho:wght@500;700;800&family=Zen+Kaku+Gothic+New:wght@400;500;700;900&family=JetBrains+Mono:wght@400;500;700&display=swap');
      * { box-sizing: border-box; }
      ::selection { background: #c4a35a; color: #14110f; }
      input[type=range] {
        -webkit-appearance: none;
        appearance: none;
        background: transparent;
      }
      input[type=range]::-webkit-slider-runnable-track {
        height: 6px;
        background: #2a2620;
        border-radius: 3px;
      }
      input[type=range]::-webkit-slider-thumb {
        -webkit-appearance: none;
        appearance: none;
        width: 18px;
        height: 18px;
        margin-top: -6px;
        border-radius: 50%;
        background: #c4a35a;
        border: 2px solid #14110f;
        cursor: pointer;
        box-shadow: 0 0 0 1px #c4a35a55;
      }
      input[type=range]::-moz-range-track {
        height: 6px;
        background: #2a2620;
        border-radius: 3px;
      }
      input[type=range]::-moz-range-thumb {
        width: 14px;
        height: 14px;
        border-radius: 50%;
        background: #c4a35a;
        border: 2px solid #14110f;
        cursor: pointer;
      }
      .scrollbar::-webkit-scrollbar { height: 8px; width: 8px; }
      .scrollbar::-webkit-scrollbar-track { background: #181511; }
      .scrollbar::-webkit-scrollbar-thumb { background: #3a352c; border-radius: 4px; }
      @keyframes fadeUp {
        from { opacity: 0; transform: translateY(6px); }
        to { opacity: 1; transform: translateY(0); }
      }
      @keyframes slideIn {
        from { opacity: 0; transform: translateX(12px); }
        to { opacity: 1; transform: translateX(0); }
      }
      button { font-family: inherit; }
    `}</style>
  );
}

// ============================================================
// ヘッダー
// ============================================================
function Header({ view, onNav }) {
  return (
    <header style={styles.header}>
      <div style={styles.headerInner}>
        <div style={styles.brand}>
          <span style={styles.brandMark}>桐</span>
          <div>
            <div style={styles.brandTitle}>KIRI<span style={{ color: '#c4a35a' }}>SCORE</span></div>
            <div style={styles.brandSub}>独自採点 馬券分析台帳</div>
          </div>
        </div>
        <nav style={styles.nav}>
          <NavBtn active={view === 'races' || view === 'race'} onClick={() => onNav('races')}>出馬表</NavBtn>
          <NavBtn active={view === 'stats'} onClick={() => onNav('stats')}>傾向分析</NavBtn>
        </nav>
      </div>
    </header>
  );
}
function NavBtn({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{ ...styles.navBtn, ...(active ? styles.navBtnActive : {}) }}>
      {children}
    </button>
  );
}

// ============================================================
// レース一覧
// ============================================================
function RaceList({ races, onOpen, onCreate, onDelete }) {
  const [showForm, setShowForm] = useState(races.length === 0);
  const [form, setForm] = useState({ name: '', date: '', track: '東京', surface: '芝', distance: 2000, condition: '良', grade: '' });

  const submit = (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    onCreate(form);
    setForm({ name: '', date: '', track: '東京', surface: '芝', distance: 2000, condition: '良', grade: '' });
    setShowForm(false);
  };

  return (
    <div style={{ animation: 'fadeUp .4s ease' }}>
      <div style={styles.sectionHead}>
        <div>
          <h1 style={styles.h1}>出馬表一覧</h1>
          <p style={styles.lead}>レースごとに出走馬を登録し、独自採点でスコアリングします。</p>
        </div>
        <button style={styles.primaryBtn} onClick={() => setShowForm(s => !s)}>
          {showForm ? '閉じる' : '＋ レースを追加'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={submit} style={{ ...styles.card, marginBottom: 28, animation: 'fadeUp .3s ease' }}>
          <div style={styles.formGrid}>
            <Field label="レース名" span={2}>
              <input style={styles.input} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="例：宝塚記念" autoFocus />
            </Field>
            <Field label="開催日">
              <input style={styles.input} type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
            </Field>
            <Field label="グレード">
              <input style={styles.input} value={form.grade} onChange={e => setForm({ ...form, grade: e.target.value })} placeholder="G1 / G2 / 重賞 等" />
            </Field>
            <Field label="競馬場">
              <select style={styles.input} value={form.track} onChange={e => setForm({ ...form, track: e.target.value })}>
                {TRACKS.map(t => <option key={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="馬場種別">
              <select style={styles.input} value={form.surface} onChange={e => setForm({ ...form, surface: e.target.value })}>
                {SURFACES.map(s => <option key={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="距離 (m)">
              <input style={styles.input} type="number" value={form.distance} onChange={e => setForm({ ...form, distance: Number(e.target.value) })} />
            </Field>
            <Field label="馬場状態">
              <select style={styles.input} value={form.condition} onChange={e => setForm({ ...form, condition: e.target.value })}>
                {CONDITIONS.map(c => <option key={c}>{c}</option>)}
              </select>
            </Field>
          </div>
          <button type="submit" style={{ ...styles.primaryBtn, marginTop: 18 }}>作成する</button>
        </form>
      )}

      {races.length === 0 && !showForm ? (
        <EmptyState onCreate={() => setShowForm(true)} />
      ) : (
        <div style={styles.raceGrid}>
          {races.map((r, i) => (
            <RaceCard key={r.id} race={r} onOpen={() => onOpen(r.id)} onDelete={() => onDelete(r.id)} delay={i * 0.04} />
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyState({ onCreate }) {
  return (
    <div style={styles.empty}>
      <div style={styles.emptyMark}>◎</div>
      <p style={styles.emptyText}>まだレースが登録されていません。<br />最初のレースを追加して採点を始めましょう。</p>
      <button style={styles.primaryBtn} onClick={onCreate}>＋ レースを追加</button>
    </div>
  );
}

function RaceCard({ race, onOpen, onDelete, delay }) {
  const top = useMemo(() => {
    if (!race.horses.length) return null;
    return [...race.horses].sort((a, b) => totalScore(b.factors) - totalScore(a.factors))[0];
  }, [race.horses]);

  return (
    <div style={{ ...styles.raceCard, animation: `fadeUp .4s ease ${delay}s both` }}>
      <div style={styles.raceCardTop} onClick={onOpen}>
        <div style={styles.raceCardHead}>
          {race.grade && <span style={styles.gradeTag}>{race.grade}</span>}
          <span style={styles.raceDate}>{race.date || '日付未設定'}</span>
        </div>
        <h3 style={styles.raceCardTitle}>{race.name}</h3>
        <div style={styles.raceCardMeta}>
          {race.track} {race.surface}{race.distance}m ・ {race.condition}
        </div>
        <div style={styles.raceCardFoot}>
          <span style={styles.horseCount}>{race.horses.length}頭登録</span>
          {top && totalScore(top.factors) > 0 && (
            <span style={styles.topPick}>◎ {top.name || `${top.num}番`} {totalScore(top.factors)}点</span>
          )}
        </div>
      </div>
      <button style={styles.deleteIconBtn} onClick={onDelete} title="削除">✕</button>
    </div>
  );
}

// ============================================================
// レース詳細
// ============================================================
function RaceDetail({ race, onUpdateRace, onAddHorse, onImportCsv, onUpdateHorse, onUpdateFactor, onDeleteHorse, onBack }) {
  const [expandedId, setExpandedId] = useState(null);
  const [editingHead, setEditingHead] = useState(false);
  const fileInputRef = React.useRef(null);

  const ranked = useMemo(() => {
    return [...race.horses]
      .map(h => ({ ...h, score: totalScore(h.factors) }))
      .sort((a, b) => b.score - a.score);
  }, [race.horses]);

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => onImportCsv(String(ev.target.result || ''));
    reader.readAsText(file, 'UTF-8');
    e.target.value = '';
  };

  return (
    <div style={{ animation: 'fadeUp .35s ease' }}>
      <button style={styles.backBtn} onClick={onBack}>← 出馬表一覧へ</button>

      <RaceHeader race={race} editing={editingHead} setEditing={setEditingHead} onUpdate={onUpdateRace} />

      <div style={styles.toolbar}>
        <button style={styles.ghostBtn} onClick={() => fileInputRef.current?.click()}>
          ⇧ 出馬表CSVを取り込む
        </button>
        <input ref={fileInputRef} type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={handleFile} />
        <span style={styles.toolbarHint}>馬番・枠番・馬名・騎手・血統・脚質の列を自動認識します（既存の出走馬は上書きされます）</span>
      </div>

      <div style={styles.tableWrap} className="scrollbar">
        <div style={styles.tableHeadRow}>
          <div style={{ ...styles.th, width: 44 }}>枠</div>
          <div style={{ ...styles.th, width: 44 }}>番</div>
          <div style={{ ...styles.th, flex: '1 1 160px', textAlign: 'left' }}>馬名</div>
          <div style={{ ...styles.th, flex: '1 1 120px', textAlign: 'left' }}>騎手</div>
          <div style={{ ...styles.th, width: 110 }}>採点</div>
          <div style={{ ...styles.th, width: 36 }}></div>
        </div>

        {ranked.map((h, idx) => (
          <HorseRow
            key={h.id}
            horse={h}
            rank={idx + 1}
            expanded={expandedId === h.id}
            onToggle={() => setExpandedId(expandedId === h.id ? null : h.id)}
            onUpdate={(patch) => onUpdateHorse(h.id, patch)}
            onFactor={(key, val) => onUpdateFactor(h.id, key, val)}
            onDelete={() => onDeleteHorse(h.id)}
          />
        ))}

        <button style={styles.addHorseBtn} onClick={onAddHorse}>＋ 出走馬を追加</button>
      </div>

      {ranked.length > 0 && (
        <div style={styles.legendNote}>
          採点は{MAX_TOTAL}点満点（枠順・騎手・血統・タイム指数 各20点、馬場適性・臨戦状態 各10点）。
        </div>
      )}
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
            <input style={styles.input} type="date" value={race.date} onChange={e => onUpdate({ date: e.target.value })} />
          </Field>
          <Field label="グレード">
            <input style={styles.input} value={race.grade} onChange={e => onUpdate({ grade: e.target.value })} />
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
          <textarea style={{ ...styles.input, minHeight: 60, resize: 'vertical' }} value={race.memo} onChange={e => onUpdate({ memo: e.target.value })} placeholder="展開予想・天候・所感など" />
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

function HorseRow({ horse, rank, expanded, onToggle, onUpdate, onFactor, onDelete }) {
  const score = totalScore(horse.factors);
  const pct = score / MAX_TOTAL;

  return (
    <div style={styles.horseBlock}>
      <div style={styles.horseRow} onClick={onToggle}>
        <div style={{ ...styles.td, width: 44 }}>
          <span style={{ ...styles.wakuChip, ...wakuColor(horse.waku) }}>{horse.waku}</span>
        </div>
        <div style={{ ...styles.td, width: 44, fontFamily: 'JetBrains Mono, monospace', color: '#9c9588' }}>{horse.num}</div>
        <div style={{ ...styles.td, flex: '1 1 160px', textAlign: 'left', fontWeight: 700 }}>
          {horse.name || <span style={{ color: '#6b655a' }}>未入力</span>}
        </div>
        <div style={{ ...styles.td, flex: '1 1 120px', textAlign: 'left', color: '#b9b2a3' }}>{horse.jockey || '—'}</div>
        <div style={{ ...styles.td, width: 110 }}>
          <div style={styles.scoreWrap}>
            <span style={styles.scoreNum}>{score}</span>
            <div style={styles.scoreBarTrack}>
              <div style={{ ...styles.scoreBarFill, width: `${pct * 100}%` }} />
            </div>
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
            <Field label="前走タイム"><input style={styles.input} value={horse.lastTime} onChange={e => onUpdate({ lastTime: e.target.value })} placeholder="例：2:09.3" /></Field>
            <Field label="前走上がり3F"><input style={styles.input} value={horse.last3F} onChange={e => onUpdate({ last3F: e.target.value })} placeholder="例：33.8" /></Field>
            <Field label="結果着順（後日記録用）"><input style={styles.input} value={horse.resultRank} onChange={e => onUpdate({ resultRank: e.target.value })} placeholder="例：1" /></Field>
          </div>

          <div style={styles.factorSection}>
            <div style={styles.factorSectionTitle}>独自採点</div>
            {FACTOR_DEFS.map(f => (
              <FactorSlider key={f.key} def={f} value={horse.factors[f.key] || 0} onChange={(v) => onFactor(f.key, v)} />
            ))}
          </div>

          <Field label="メモ" span={2}>
            <textarea style={{ ...styles.input, minHeight: 50, resize: 'vertical' }} value={horse.note} onChange={e => onUpdate({ note: e.target.value })} placeholder="調教評価・不利情報・市場の歪みなど自由記述" />
          </Field>

          <button style={styles.deleteTextBtn} onClick={onDelete}>この馬を削除</button>
        </div>
      )}
    </div>
  );
}

function FactorSlider({ def, value, onChange }) {
  return (
    <div style={styles.factorRow}>
      <div style={styles.factorLabelWrap}>
        <span style={styles.factorLabel}>{def.label}</span>
        <span style={styles.factorHint}>{def.hint}</span>
      </div>
      <input
        type="range"
        min={0}
        max={def.max}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        style={{ flex: 1 }}
      />
      <span style={styles.factorValue}>{value}<small>/{def.max}</small></span>
    </div>
  );
}

function wakuColor(waku) {
  const map = {
    1: { background: '#f4f1ea', color: '#14110f' },
    2: { background: '#1c1a17', color: '#e8e3d8', border: '1px solid #4a443a' },
    3: { background: '#b3493f', color: '#f4f1ea' },
    4: { background: '#3d5a7a', color: '#f4f1ea' },
    5: { background: '#c4a35a', color: '#14110f' },
    6: { background: '#3f7a52', color: '#f4f1ea' },
    7: { background: '#d97a3d', color: '#14110f' },
    8: { background: '#7a4a9c', color: '#f4f1ea' },
  };
  return map[waku] || map[1];
}

// ============================================================
// 傾向分析ビュー
// ============================================================
function StatsView({ races }) {
  const finished = races.filter(r => r.horses.some(h => h.resultRank));
  const allHorses = races.flatMap(r => r.horses.map(h => ({ ...h, raceName: r.name, raceId: r.id })));
  const scored = allHorses.filter(h => totalScore(h.factors) > 0);

  const byTrack = useMemo(() => {
    const map = {};
    races.forEach(r => {
      r.horses.forEach(h => {
        if (!h.resultRank) return;
        const key = r.track;
        if (!map[key]) map[key] = { total: 0, hit: 0 };
        map[key].total += 1;
        const score = totalScore(h.factors);
        const isTop3Score = [...r.horses].sort((a, b) => totalScore(b.factors) - totalScore(a.factors)).slice(0, 3).some(x => x.id === h.id);
        const isTop3Result = Number(h.resultRank) <= 3;
        if (isTop3Score && isTop3Result) map[key].hit += 1;
      });
    });
    return map;
  }, [races]);

  const factorAverage = useMemo(() => {
    if (!scored.length) return {};
    const sums = emptyFactors();
    scored.forEach(h => FACTOR_DEFS.forEach(f => { sums[f.key] += (h.factors[f.key] || 0); }));
    const avg = {};
    FACTOR_DEFS.forEach(f => { avg[f.key] = (sums[f.key] / scored.length).toFixed(1); });
    return avg;
  }, [scored]);

  if (!races.length) {
    return (
      <div style={styles.empty}>
        <div style={styles.emptyMark}>◎</div>
        <p style={styles.emptyText}>傾向分析を表示するには、まず出馬表でレースと採点を登録してください。</p>
      </div>
    );
  }

  return (
    <div style={{ animation: 'fadeUp .35s ease' }}>
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
                <div style={styles.barTrack}>
                  <div style={{ ...styles.barFill, width: `${(d.hit / d.total) * 100}%` }} />
                </div>
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
              <div style={styles.barTrack}>
                <div style={{ ...styles.barFill, width: `${((factorAverage[f.key] || 0) / f.max) * 100}%`, background: '#c4a35a' }} />
              </div>
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

// ============================================================
// 共通パーツ
// ============================================================
function Field({ label, children, span }) {
  return (
    <div style={{ gridColumn: span ? `span ${span}` : undefined }}>
      <label style={styles.fieldLabel}>{label}</label>
      {children}
    </div>
  );
}

// ============================================================
// スタイル定義
// ============================================================
const FONT_DISPLAY = "'Shippori Mincho', serif";
const FONT_BODY = "'Zen Kaku Gothic New', sans-serif";
const FONT_MONO = "'JetBrains Mono', monospace";

const colors = {
  bg: '#14110f',
  bgAlt: '#1a1713',
  card: '#1e1a15',
  cardBorder: '#332d23',
  ink: '#e8e3d8',
  inkDim: '#9c9588',
  gold: '#c4a35a',
  goldSoft: '#c4a35a22',
  red: '#b3493f',
  green: '#3f7a52',
};

const styles = {
  app: { minHeight: '100%', background: colors.bg, color: colors.ink, fontFamily: FONT_BODY, paddingBottom: 60 },
  loadingWrap: { minHeight: 300, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: colors.inkDim, fontFamily: FONT_BODY, background: colors.bg },
  loadingMark: { fontFamily: FONT_DISPLAY, fontSize: 36, color: colors.gold, marginBottom: 8 },
  loadingText: { fontSize: 13, letterSpacing: '0.05em' },

  header: { borderBottom: `1px solid ${colors.cardBorder}`, position: 'sticky', top: 0, background: 'rgba(20,17,15,0.92)', backdropFilter: 'blur(8px)', zIndex: 10 },
  headerInner: { maxWidth: 920, margin: '0 auto', padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 },
  brand: { display: 'flex', alignItems: 'center', gap: 12 },
  brandMark: { fontFamily: FONT_DISPLAY, fontSize: 26, width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${colors.gold}`, borderRadius: '50%', color: colors.gold },
  brandTitle: { fontFamily: FONT_DISPLAY, fontWeight: 800, fontSize: 18, letterSpacing: '0.03em' },
  brandSub: { fontSize: 11, color: colors.inkDim, letterSpacing: '0.08em', marginTop: 2 },
  nav: { display: 'flex', gap: 4, background: colors.bgAlt, padding: 4, borderRadius: 10, border: `1px solid ${colors.cardBorder}` },
  navBtn: { background: 'none', border: 'none', color: colors.inkDim, padding: '8px 16px', borderRadius: 7, cursor: 'pointer', fontSize: 13, fontWeight: 500, transition: 'all .15s' },
  navBtnActive: { background: colors.gold, color: '#14110f', fontWeight: 700 },

  main: { maxWidth: 920, margin: '0 auto', padding: '32px 20px' },

  sectionHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 16, marginBottom: 28 },
  h1: { fontFamily: FONT_DISPLAY, fontSize: 28, fontWeight: 800, margin: '4px 0', letterSpacing: '0.01em' },
  lead: { color: colors.inkDim, fontSize: 14, margin: 0 },

  primaryBtn: { background: colors.gold, color: '#14110f', border: 'none', padding: '11px 22px', borderRadius: 8, fontWeight: 700, fontSize: 13.5, cursor: 'pointer', letterSpacing: '0.02em', transition: 'transform .12s' },
  ghostBtn: { background: 'transparent', color: colors.gold, border: `1px solid ${colors.gold}55`, padding: '8px 16px', borderRadius: 8, fontWeight: 600, fontSize: 12.5, cursor: 'pointer' },
  backBtn: { background: 'none', border: 'none', color: colors.inkDim, fontSize: 13, cursor: 'pointer', marginBottom: 18, padding: '4px 0' },

  card: { background: colors.card, border: `1px solid ${colors.cardBorder}`, borderRadius: 14, padding: 24, marginBottom: 20 },
  cardTitle: { fontFamily: FONT_DISPLAY, fontSize: 16, fontWeight: 700, margin: '0 0 4px' },
  dim: { color: colors.inkDim, fontSize: 12.5, marginTop: 4, marginBottom: 14 },

  formGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 16 },
  fieldLabel: { display: 'block', fontSize: 11.5, color: colors.inkDim, marginBottom: 6, letterSpacing: '0.03em' },
  input: { width: '100%', background: '#100d0a', border: `1px solid ${colors.cardBorder}`, color: colors.ink, padding: '10px 12px', borderRadius: 7, fontSize: 13.5, fontFamily: FONT_BODY, outline: 'none' },

  raceGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 },
  raceCard: { position: 'relative', background: colors.card, border: `1px solid ${colors.cardBorder}`, borderRadius: 14, overflow: 'hidden', transition: 'border-color .15s, transform .15s' },
  raceCardTop: { padding: '20px 20px 16px', cursor: 'pointer' },
  raceCardHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  gradeTag: { background: colors.goldSoft, color: colors.gold, fontSize: 10.5, fontWeight: 700, padding: '3px 8px', borderRadius: 5, letterSpacing: '0.05em' },
  raceDate: { fontSize: 11, color: colors.inkDim, fontFamily: FONT_MONO },
  raceCardTitle: { fontFamily: FONT_DISPLAY, fontSize: 19, fontWeight: 700, margin: '0 0 8px' },
  raceCardMeta: { fontSize: 12.5, color: colors.inkDim },
  raceCardFoot: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, paddingTop: 14, borderTop: `1px solid ${colors.cardBorder}` },
  horseCount: { fontSize: 11.5, color: colors.inkDim },
  topPick: { fontSize: 11.5, color: colors.gold, fontWeight: 600 },
  deleteIconBtn: { position: 'absolute', top: 12, right: 12, background: 'none', border: 'none', color: colors.inkDim, cursor: 'pointer', fontSize: 13, width: 26, height: 26, borderRadius: 6, opacity: 0.5 },

  raceHeadCard: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 24, flexWrap: 'wrap' },
  raceMemo: { fontSize: 13, color: colors.inkDim, marginTop: 10, lineHeight: 1.7, maxWidth: 560 },

  toolbar: { display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18, flexWrap: 'wrap' },
  toolbarHint: { fontSize: 11.5, color: colors.inkDim },

  tableWrap: { overflowX: 'auto' },
  tableHeadRow: { display: 'flex', alignItems: 'center', gap: 8, padding: '0 14px 10px', borderBottom: `1px solid ${colors.cardBorder}`, minWidth: 760 },
  th: { fontSize: 11, color: colors.inkDim, textAlign: 'center', letterSpacing: '0.04em' },

  horseBlock: { borderBottom: `1px solid ${colors.cardBorder}` },
  horseRow: { display: 'flex', alignItems: 'center', gap: 8, padding: '14px', cursor: 'pointer', minWidth: 760, transition: 'background .12s' },
  td: { textAlign: 'center', fontSize: 13.5 },
  wakuChip: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: '50%', fontSize: 12, fontWeight: 700 },
  scoreWrap: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 },
  scoreNum: { fontFamily: FONT_MONO, fontWeight: 700, fontSize: 14 },
  scoreBarTrack: { width: 56, height: 4, background: '#2a2620', borderRadius: 2, overflow: 'hidden' },
  scoreBarFill: { height: '100%', background: colors.gold },

  horseDetail: { padding: '4px 14px 24px', minWidth: 760, animation: 'fadeUp .25s ease' },
  detailGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14, marginBottom: 20 },

  factorSection: { background: '#100d0a', border: `1px solid ${colors.cardBorder}`, borderRadius: 10, padding: 18, marginBottom: 16 },
  factorSectionTitle: { fontFamily: FONT_DISPLAY, fontSize: 13.5, fontWeight: 700, color: colors.gold, marginBottom: 14 },
  factorRow: { display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 },
  factorLabelWrap: { width: 150, flexShrink: 0 },
  factorLabel: { display: 'block', fontSize: 12.5, fontWeight: 600 },
  factorHint: { display: 'block', fontSize: 10.5, color: colors.inkDim, marginTop: 1 },
  factorValue: { width: 46, textAlign: 'right', fontFamily: FONT_MONO, fontSize: 13, fontWeight: 700, color: colors.gold, flexShrink: 0 },

  deleteTextBtn: { background: 'none', border: 'none', color: colors.red, fontSize: 12, cursor: 'pointer', padding: '6px 0' },

  addHorseBtn: { width: '100%', background: 'none', border: `1px dashed ${colors.cardBorder}`, color: colors.inkDim, padding: '14px', borderRadius: 10, cursor: 'pointer', fontSize: 13, marginTop: 12, minWidth: 760 },

  legendNote: { fontSize: 11, color: colors.inkDim, marginTop: 16, lineHeight: 1.7 },

  empty: { textAlign: 'center', padding: '60px 20px', border: `1px dashed ${colors.cardBorder}`, borderRadius: 14 },
  emptyMark: { fontFamily: FONT_DISPLAY, fontSize: 32, color: colors.gold, marginBottom: 14 },
  emptyText: { color: colors.inkDim, fontSize: 13.5, lineHeight: 1.8, marginBottom: 22 },

  statGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 14, marginBottom: 24 },
  statCard: { background: colors.card, border: `1px solid ${colors.cardBorder}`, borderRadius: 12, padding: '18px 20px' },
  statValue: { fontFamily: FONT_DISPLAY, fontSize: 28, fontWeight: 800, color: colors.gold },
  statLabel: { fontSize: 11.5, color: colors.inkDim, marginTop: 4 },

  barList: { display: 'flex', flexDirection: 'column', gap: 12 },
  barRow: { display: 'flex', alignItems: 'center', gap: 12 },
  barLabel: { width: 90, fontSize: 12.5, flexShrink: 0 },
  barTrack: { flex: 1, height: 8, background: '#100d0a', borderRadius: 4, overflow: 'hidden' },
  barFill: { height: '100%', background: colors.red, borderRadius: 4 },
  barValue: { width: 50, textAlign: 'right', fontSize: 11.5, fontFamily: FONT_MONO, color: colors.inkDim, flexShrink: 0 },

  toast: { position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: colors.gold, color: '#14110f', padding: '12px 22px', borderRadius: 10, fontSize: 13, fontWeight: 700, animation: 'slideIn .25s ease', boxShadow: '0 8px 24px rgba(0,0,0,0.4)' },
};
