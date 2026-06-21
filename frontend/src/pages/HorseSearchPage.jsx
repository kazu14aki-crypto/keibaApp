import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { totalScore, wakuColor } from '../lib/scoring';
import { styles } from '../styles';

export default function HorseSearchPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);

  const search = async (e) => {
    e?.preventDefault();
    if (!query.trim()) { setResults(null); return; }
    setLoading(true);
    try {
      const data = await api.searchHorses(query.trim());
      setResults(data);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h1 style={styles.h1}>馬名検索</h1>
      <p style={styles.lead}>過去に登録した出走馬を馬名で横断検索します。同じ馬の過去の採点傾向を振り返るのに便利です。</p>

      <form onSubmit={search} style={{ ...styles.searchBox, marginTop: 24 }}>
        <input
          style={styles.searchInput}
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="馬名の一部を入力（例：ダノン）"
          autoFocus
        />
        <button type="submit" style={styles.primaryBtn} disabled={loading}>{loading ? '検索中…' : '検索'}</button>
      </form>

      {results === null ? (
        <p style={styles.dim}>馬名を入力して検索してください。部分一致で検索できます。</p>
      ) : results.length === 0 ? (
        <p style={styles.dim}>「{query}」に一致する出走馬は見つかりませんでした。</p>
      ) : (
        <div>
          <p style={styles.dim}>{results.length}件ヒットしました</p>
          {results.map(h => (
            <div
              key={h.id}
              style={styles.searchResultCard}
              onClick={() => h.races && navigate(`/races/${h.races.id}`)}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ ...styles.wakuChip, ...wakuColor(h.waku) }}>{h.waku}</span>
                <div>
                  <div style={styles.searchResultName}>{h.name || '未入力'}</div>
                  <div style={styles.searchResultMeta}>
                    {h.races?.name || 'レース不明'}
                    {h.races?.date && ` ・ ${h.races.date}`}
                    {h.jockey && ` ・ ${h.jockey}`}
                  </div>
                </div>
              </div>
              <span style={styles.searchResultScore}>{totalScore(h.factors)}<small style={{ fontSize: 11, fontWeight: 400 }}>点</small></span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
