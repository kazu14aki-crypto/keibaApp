import React, { useState, useMemo } from 'react';
import { MODEL, predictRace, parseCsvText, normalizeTargetRows } from '../lib/model';
import { styles } from '../styles';

/**
 * モデル予測ページ。
 * TARGET frontier JVから出力した当日出馬表CSV(直前オッズ入り)をアップロードすると、
 * 学習済み条件付きロジットモデルで全レースの勝率・期待値・推奨賭け金を一括計算する。
 *
 * 運用フロー:
 *   発走30分〜10分前: TARGETでその日の全レースをCSV出力(オッズ列を含める)
 *   → このページにドラッグ&ドロップ → 🔥フラグの馬だけを購入
 */
export default function ModelPage() {
  const [races, setRaces] = useState([]);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  const [evThreshold, setEvThreshold] = useState(1.2);
  const [bankroll, setBankroll] = useState(100000);

  const trained = Array.isArray(MODEL.coef);

  const handleFile = async (file) => {
    if (!file) return;
    setError('');
    setFileName(file.name);
    try {
      const buf = await file.arrayBuffer();
      // TARGETの既定はShift-JIS。失敗(置換文字混入)したらUTF-8で再デコード
      let text = new TextDecoder('shift_jis').decode(buf);
      if ((text.match(/\uFFFD/g) || []).length > 5) {
        text = new TextDecoder('utf-8').decode(buf);
      }
      const parsed = normalizeTargetRows(parseCsvText(text));
      if (parsed.length === 0) {
        setError('レースを抽出できませんでした。CSVに必須列(日付・場所・R・馬番・馬名・騎手・斤量・オッズ・頭数)が含まれるか確認してください。');
        return;
      }
      setRaces(parsed);
    } catch (e) {
      setError(`読み込みエラー: ${e.message}`);
    }
  };

  const analyzed = useMemo(() => {
    if (!trained) return [];
    return races.map(race => {
      const withOdds = race.horses.filter(h => h.odds > 1);
      if (withOdds.length < 6) return { ...race, results: null };
      const preds = predictRace(withOdds);
      const rows = withOdds.map((h, i) => ({ ...h, ...preds[i] }))
        .sort((a, b) => b.ev - a.ev);
      const picks = rows.filter(r => r.ev >= evThreshold);
      return { ...race, results: rows, picks };
    });
  }, [races, evThreshold, trained]);

  const totalPicks = analyzed.reduce((n, r) => n + (r.picks?.length || 0), 0);
  const pct = v => `${(v * 100).toFixed(1)}%`;

  return (
    <div>
      <h2 style={{ fontSize: 20, marginBottom: 4 }}>モデル予測（JRA-VANデータ学習モデル）</h2>
      <div style={{ fontSize: 12, color: '#9c9588', marginBottom: 16, lineHeight: 1.8 }}>
        TARGET frontier JVで出力した出馬表CSV（<b>直前オッズ列を含む</b>）をアップロードすると、
        条件付きロジットモデルが全レースの勝率を推定し、期待値がプラスの馬だけを抽出します。
        {trained ? (
          <span>
            　現在のモデル: 学習{MODEL.train_races}レース
            {MODEL.test_logloss_model && (
              <>（検証logLoss {MODEL.test_logloss_model} / 市場 {MODEL.test_logloss_market}
                {MODEL.test_logloss_model < MODEL.test_logloss_market
                  ? ' — 市場超え✓' : ' — 市場未達、EV閾値を高めに'}）</>
            )}
          </span>
        ) : null}
      </div>

      {!trained && (
        <div style={{ ...styles.card, borderColor: '#b3493f', marginBottom: 16 }}>
          <b>モデルが未学習です。</b>
          <div style={{ fontSize: 12, marginTop: 6, lineHeight: 1.8 }}>
            backtest/README_TARGET.md の手順でTARGETから過去データを出力し、
            train_model.py で学習してください。生成された model_weights.json を
            frontend/src/lib/model_weights.json に上書きしてデプロイすると、このページが有効になります。
          </div>
        </div>
      )}

      <div
        style={{ ...styles.card, marginBottom: 16, textAlign: 'center', padding: 28, cursor: 'pointer', borderStyle: 'dashed' }}
        onDragOver={e => e.preventDefault()}
        onDrop={e => { e.preventDefault(); handleFile(e.dataTransfer.files[0]); }}
        onClick={() => document.getElementById('model-csv-input').click()}
      >
        <input
          id="model-csv-input" type="file" accept=".csv" style={{ display: 'none' }}
          onChange={e => handleFile(e.target.files[0])}
        />
        <div style={{ fontSize: 14, fontWeight: 700 }}>📄 TARGET出馬表CSVをドロップ / クリックで選択</div>
        <div style={{ fontSize: 11, color: '#9c9588', marginTop: 6 }}>
          {fileName ? `読込済み: ${fileName}（${races.length}レース）` : 'Shift-JIS / UTF-8 自動判定'}
        </div>
      </div>

      {error && <div style={{ color: '#b3493f', fontSize: 12, marginBottom: 12 }}>{error}</div>}

      {races.length > 0 && trained && (
        <>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 14, fontSize: 12, flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              EV購入閾値
              <input type="number" step="0.05" min="1" max="2"
                style={{ ...styles.input, width: 64, fontSize: 12, padding: '3px 6px' }}
                value={evThreshold} onChange={e => setEvThreshold(Number(e.target.value) || 1.2)} />
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              資金(円)
              <input type="number" step="10000" min="0"
                style={{ ...styles.input, width: 100, fontSize: 12, padding: '3px 6px' }}
                value={bankroll} onChange={e => setBankroll(Number(e.target.value) || 0)} />
            </label>
            <span style={{ color: '#a87f2e', fontWeight: 700 }}>
              購入候補: 全{analyzed.length}レース中 {totalPicks}頭
            </span>
          </div>

          {analyzed.map(race => (
            <div key={race.key} style={{ ...styles.card, marginBottom: 14 }}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>
                {race.date} {race.track} {race.raceNo}R
                {race.picks?.length > 0 && <span style={{ color: '#a87f2e' }}>　🔥 {race.picks.length}頭妙味</span>}
              </div>
              {!race.results ? (
                <div style={{ fontSize: 11, color: '#9c9588' }}>オッズ入り6頭以上のデータがなくスキップ</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ color: '#9c9588', textAlign: 'right' }}>
                      <th style={{ padding: '3px 8px', textAlign: 'center' }}>番</th>
                      <th style={{ padding: '3px 8px', textAlign: 'left' }}>馬名</th>
                      <th style={{ padding: '3px 8px' }}>オッズ</th>
                      <th style={{ padding: '3px 8px' }}>市場勝率</th>
                      <th style={{ padding: '3px 8px' }}>モデル勝率</th>
                      <th style={{ padding: '3px 8px' }}>EV</th>
                      <th style={{ padding: '3px 8px' }}>推奨額</th>
                    </tr>
                  </thead>
                  <tbody>
                    {race.results.map(h => (
                      <tr key={h.num} style={{
                        textAlign: 'right',
                        background: h.ev >= evThreshold ? 'rgba(168,127,46,0.12)' : 'transparent',
                        borderTop: '1px solid rgba(138,131,116,0.15)',
                      }}>
                        <td style={{ padding: '4px 8px', textAlign: 'center', fontFamily: 'monospace' }}>{h.num}</td>
                        <td style={{ padding: '4px 8px', textAlign: 'left', fontWeight: h.ev >= evThreshold ? 700 : 400 }}>
                          {h.ev >= evThreshold ? '🔥 ' : ''}{h.name}
                        </td>
                        <td style={{ padding: '4px 8px' }}>{h.odds.toFixed(1)}</td>
                        <td style={{ padding: '4px 8px', color: '#9c9588' }}>{pct(h.marketProb)}</td>
                        <td style={{ padding: '4px 8px', fontWeight: 600 }}>{pct(h.prob)}</td>
                        <td style={{
                          padding: '4px 8px', fontWeight: 700,
                          color: h.ev >= evThreshold ? '#a87f2e' : h.ev >= 1 ? '#5a5348' : '#b3493f',
                        }}>{h.ev.toFixed(2)}</td>
                        <td style={{ padding: '4px 8px' }}>
                          {h.kelly > 0 ? `${Math.round(h.kelly * bankroll / 100) * 100}円` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ))}

          <div style={{ fontSize: 10, color: '#8a8374', lineHeight: 1.8 }}>
            推奨額は1/4ケリー基準（1点上限5%）。確定オッズ学習によるバイアスがあるため、
            実運用初期はさらに半額以下を推奨。オッズは締切直前に再出力するほど精度が上がります。
            月1回、直近データを追加して train_model.py で再学習してください。
          </div>
        </>
      )}
    </div>
  );
}
