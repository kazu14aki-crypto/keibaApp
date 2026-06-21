import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { totalScore, TRACKS, SURFACES, CONDITIONS, isUpcomingWeekend } from '../lib/scoring';
import { styles } from '../styles';

export default function RaceListPage() {
  const navigate = useNavigate();
  const [races, setRaces] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', date: '', track: '東京', surface: '芝', distance: 2000, condition: '良', grade: '' });
  const [toast, setToast] = useState(null);

  useEffect(() => { reload(); }, []);

  const reload = async () => {
    const data = await api.listRaces();
    setRaces(data);
  };

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2200); };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    const created = await api.createRace(form);
    setForm({ name: '', date: '', track: '東京', surface: '芝', distance: 2000, condition: '良', grade: '' });
    setShowForm(false);
    await reload();
    navigate(`/races/${created.id}`);
  };

  const remove = async (id) => {
    await api.deleteRace(id);
    showToast('レースを削除しました');
    reload();
  };

  // --- 開催日でグルーピング（JRA出馬表ページの構造を意識） ---
  const grouped = useMemo(() => {
    if (!races) return [];
    const upcoming = races.filter(r => isUpcomingWeekend(r.date));
    const map = {};
    upcoming.forEach(r => {
      const key = r.date || '日付未定';
      if (!map[key]) map[key] = [];
      map[key].push(r);
    });
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
  }, [races]);

  const others = useMemo(() => {
    if (!races) return [];
    return races.filter(r => !isUpcomingWeekend(r.date));
  }, [races]);

  if (races === null) {
    return <div style={styles.dim}>読み込み中…</div>;
  }

  return (
    <div>
      <div style={styles.sectionHead}>
        <div>
          <h1 style={styles.h1}>出馬表一覧</h1>
          <p style={styles.lead}>直近の土日開催を中心に表示しています。レースごとに採点を記録しましょう。</p>
        </div>
        <button style={styles.primaryBtn} onClick={() => setShowForm(s => !s)}>
          {showForm ? '閉じる' : '＋ レースを追加'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={submit} style={{ ...styles.card, marginBottom: 28 }}>
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

      {grouped.length === 0 && others.length === 0 ? (
        <EmptyState onCreate={() => setShowForm(true)} />
      ) : (
        <>
          {grouped.map(([date, list]) => (
            <div key={date} style={{ marginBottom: 32 }}>
              <h2 style={styles.h2}>{formatDateHeading(date)}</h2>
              <div style={styles.raceGrid}>
                {list.map(r => (
                  <RaceCard key={r.id} race={r} onOpen={() => navigate(`/races/${r.id}`)} onDelete={() => remove(r.id)} />
                ))}
              </div>
            </div>
          ))}

          {others.length > 0 && (
            <details style={{ marginTop: 12 }}>
              <summary style={{ cursor: 'pointer', color: '#9c9588', fontSize: 13, marginBottom: 16 }}>
                それ以前・それ以降のレース（{others.length}件）
              </summary>
              <div style={styles.raceGrid}>
                {others.map(r => (
                  <RaceCard key={r.id} race={r} onOpen={() => navigate(`/races/${r.id}`)} onDelete={() => remove(r.id)} />
                ))}
              </div>
            </details>
          )}
        </>
      )}

      {toast && <div style={styles.toast}>{toast}</div>}
    </div>
  );
}

function formatDateHeading(dateStr) {
  if (dateStr === '日付未定') return dateStr;
  const d = new Date(dateStr + 'T00:00:00');
  const days = ['日', '月', '火', '水', '木', '金', '土'];
  return `${d.getMonth() + 1}月${d.getDate()}日（${days[d.getDay()]}）`;
}

function EmptyState({ onCreate }) {
  return (
    <div style={styles.empty}>
      <div style={styles.emptyMark}>◎</div>
      <p style={styles.emptyText}>まだレースが登録されていません。<br />金曜に出馬表が出たら、レースを追加して採点を始めましょう。</p>
      <button style={styles.primaryBtn} onClick={onCreate}>＋ レースを追加</button>
    </div>
  );
}

function RaceCard({ race, onOpen, onDelete }) {
  const [horseCount, setHorseCount] = useState(race.horse_count ?? null);
  return (
    <div style={styles.raceCard}>
      <div style={styles.raceCardTop} onClick={onOpen}>
        <div style={styles.raceCardHead}>
          {race.grade ? <span style={styles.gradeTag}>{race.grade}</span> : <span />}
          <span style={styles.raceDate}>{race.date || '日付未設定'}</span>
        </div>
        <h3 style={styles.raceCardTitle}>{race.name}</h3>
        <div style={styles.raceCardMeta}>
          {race.track} {race.surface}{race.distance}m ・ {race.condition}
        </div>
      </div>
      <button style={styles.deleteIconBtn} onClick={(e) => { e.stopPropagation(); onDelete(); }} title="削除">✕</button>
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
