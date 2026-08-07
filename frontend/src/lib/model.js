/**
 * model.js — 学習済み条件付きロジットモデルのブラウザ側推論
 *
 * 重要: featurizeHorse は backtest/train_model.py の featurize_horse と
 * 完全に同一のロジックでなければならない(学習時と推論時の特徴量パリティ)。
 * どちらかを変更したら必ず両方を変更し、パリティテストで検証すること。
 *
 * 2026-07改訂: 特徴量を28→38に拡張(血統・着差・PCI・クラス変動・所属地・
 * 距離適性)。ブラウザ側の出馬表CSVには履歴由来の値(着差・PCI等)が含まれ
 * ないため該当特徴量は0(=中立)となり、予測はローカルのpredict_today.pyより
 * 保守的になる。本気の購入判断はpredict_today.pyを使うこと。
 */

import weightsJson from './model_weights.json';

export const MODEL = weightsJson;

function clip(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

// 東西の主要4場(遠征=away判定用)。Python側 train_model.py と同一に保つこと。
const EAST_TRACKS = ['東京', '中山', '福島', '新潟'];
const WEST_TRACKS = ['中京', '京都', '阪神', '小倉'];

/** 所属地文字列 → 西(栗東/関西)ならtrue、東(美浦/関東)ならfalse、不明null。 */
function regionIsWest(region) {
  const s = String(region || '').trim();
  if (!s) return null;
  if (s.includes('栗') || s.includes('関西') || s === '西') return true;
  if (s.includes('美') || s.includes('関東') || s === '東') return false;
  return null;
}

/** 縮小推定勝率差 (騎手/調教師=事前分布30走分、種牡馬/母父=100走分) */
function shrunkDiff(statsEntry, prior, g) {
  const [rides, wins] = statsEntry;
  const shrunk = (wins + prior * g) / (rides + prior);
  return (shrunk - g) * 8.0;
}

/**
 * 1頭分の特徴量ベクトルを生成する。
 * @param {object} h 正規化済みの馬データ(target CSVの列マッピング後)
 *   {num, headcount, age, impost, weightChange, odds, jockey, trainer,
 *    sire, damsire, region, track, distance, prevFinish, prevHeadcount,
 *    prevDays, prevDistance, ...}
 * @param {number} marketP レース内で正規化した市場勝率
 */
export function featurizeHorse(h, marketP) {
  const f = new Array(46).fill(0);
  f[0] = Math.log(Math.max(marketP, 1e-6));
  f[1] = ((h.impost || 56) - 56) / 2.0;
  f[2] = (h.weightChange !== null && h.weightChange !== undefined)
    ? clip(h.weightChange, -20, 20) / 10.0 : 0;
  if (h.prevFinish && h.prevHeadcount && h.prevHeadcount > 1) {
    f[3] = 1.0 - 2.0 * (h.prevFinish - 1) / (h.prevHeadcount - 1);
  }
  if (h.prevDays && h.prevDays > 0) {
    f[4] = clip(Math.log(h.prevDays / 28.0), -1.5, 1.5);
  }
  if (h.age) {
    f[5] = clip((h.age - 4) / 2.0, -1.5, 2.0);
  }
  if (h.headcount && h.headcount > 1) {
    f[6] = ((h.num || 0) - (h.headcount + 1) / 2.0) / (h.headcount / 2.0);
  }
  if (h.distance && h.prevDistance) {
    f[7] = clip((h.distance - h.prevDistance) / 400.0, -2.0, 2.0);
  }
  const g = MODEL.global_win_rate || 0.08;
  const js = MODEL.jockey_stats && MODEL.jockey_stats[h.jockey || ''];
  if (js) {
    f[8] = shrunkDiff(js, 30, g);
  }
  if (h.prevTimeDev !== null && h.prevTimeDev !== undefined && h.prevTimeDev !== '') {
    f[9] = clip(-Number(h.prevTimeDev), -3.0, 3.0);
  }
  if (h.prevLast3f && h.prevLast3f > 0) {
    f[10] = clip((35.0 - h.prevLast3f) / 2.0, -2.5, 2.5);
  }
  if (h.prevCorner4 && h.prevCorner4 > 0 && h.prevHeadcount && h.prevHeadcount > 1) {
    f[11] = 1.0 - 2.0 * (h.prevCorner4 - 1) / (h.prevHeadcount - 1);
  }
  if (h.weight && h.weight > 0) {
    f[12] = clip((h.weight - 480) / 50.0, -2.0, 2.0);
  }
  f[13] = h.surface === 'ダート' ? 1.0 : 0.0;
  f[14] = h.sex === '牝' ? 1.0 : 0.0;
  // 調教師(騎手と同じ縮小推定)
  const ts = MODEL.trainer_stats && MODEL.trainer_stats[h.trainer || ''];
  if (ts) {
    f[15] = shrunkDiff(ts, 30, g);
  }
  // 履歴集約特徴量(target_import.py計算値のスケーリング。無ければ0)
  const cs = h.careerStarts;
  f[16] = (cs === null || cs === undefined || cs === '' || cs === 0) ? 1.0 : 0.0;
  if (cs !== null && cs !== undefined && cs !== '' && cs > 0) {
    f[17] = clip((cs - 8) / 10.0, -0.8, 2.2);
  }
  if (h.careerTop3 !== null && h.careerTop3 !== undefined && h.careerTop3 !== '') {
    f[18] = clip((Number(h.careerTop3) - 0.3) * 2.0, -0.8, 1.4);
  }
  if (h.avgPerf3 !== null && h.avgPerf3 !== undefined && h.avgPerf3 !== '') {
    f[19] = clip(Number(h.avgPerf3), -1.0, 1.0);
  }
  if (h.bestTdev3 !== null && h.bestTdev3 !== undefined && h.bestTdev3 !== '') {
    f[20] = clip(-Number(h.bestTdev3), -3.0, 3.0);
  }
  if (h.prevBeatMkt !== null && h.prevBeatMkt !== undefined && h.prevBeatMkt !== '') {
    f[21] = clip(Number(h.prevBeatMkt) * 2.0, -1.5, 1.5);
  }
  if (h.jockeyChange !== null && h.jockeyChange !== undefined && h.jockeyChange !== '') {
    f[22] = Number(h.jockeyChange);
  }
  if (h.surfaceSwitch !== null && h.surfaceSwitch !== undefined && h.surfaceSwitch !== '') {
    f[23] = Number(h.surfaceSwitch);
  }
  if (h.trackFit !== null && h.trackFit !== undefined && h.trackFit !== '') {
    f[24] = clip(Number(h.trackFit), -1.0, 1.0);
  }
  if (h.muddyFit !== null && h.muddyFit !== undefined && h.muddyFit !== '') {
    f[25] = clip(Number(h.muddyFit), -1.0, 1.0);
  }
  if (h.avgPrize !== null && h.avgPrize !== undefined && h.avgPrize !== '' && Number(h.avgPrize) >= 0) {
    f[26] = clip((Math.log(1 + Number(h.avgPrize)) - 3.0) / 2.0, -1.5, 2.0);
  }
  f[27] = f[6] * f[13];
  // --- 2026-07追加 ---
  // 種牡馬・母父(縮小推定。母集団が大きいので事前分布の重みを100走分に)
  const sr = MODEL.sire_stats && MODEL.sire_stats[h.sire || ''];
  if (sr) {
    f[28] = shrunkDiff(sr, 100, g);
  }
  const ds = MODEL.damsire_stats && MODEL.damsire_stats[h.damsire || ''];
  if (ds) {
    f[29] = shrunkDiff(ds, 100, g);
  }
  // 前走着差: 勝てば1.0、0.5秒差なら0.5、3秒離されると-2.0
  if (h.prevMargin !== null && h.prevMargin !== undefined && h.prevMargin !== '') {
    f[30] = clip(1.0 - Number(h.prevMargin), -2.0, 1.0);
  }
  if (h.bestMargin3 !== null && h.bestMargin3 !== undefined && h.bestMargin3 !== '') {
    f[31] = clip(1.0 - Number(h.bestMargin3), -2.0, 1.0);
  }
  // 前走PCI: 50を中心に正規化(大=スロー上がり勝負、小=ハイペース消耗戦)
  let pciV = null;
  if (h.prevPci !== null && h.prevPci !== undefined && h.prevPci !== '' && Number(h.prevPci) > 0) {
    pciV = Number(h.prevPci);
    f[32] = clip((pciV - 50.0) / 10.0, -2.0, 2.0);
  }
  // 展開不利の検出: 前走ハイペース(PCI<48)を前で運んで(4角前目)潰れた馬。
  if (pciV !== null && pciV < 48.0 && f[11] > 0) {
    f[33] = Math.min(1.5, f[11] * (48.0 - pciV) / 10.0);
  }
  if (h.classChange !== null && h.classChange !== undefined && h.classChange !== '') {
    f[34] = clip(Number(h.classChange) * 3.0, -1.5, 1.5);
  }
  // 所属(関西=1)と遠征(東西を跨ぐ輸送)
  const iw = regionIsWest(h.region);
  if (iw !== null) {
    f[35] = iw ? 1.0 : 0.0;
    const trk = h.track || '';
    if (iw && EAST_TRACKS.some(t => trk.includes(t))) {
      f[36] = 1.0;
    } else if (!iw && WEST_TRACKS.some(t => trk.includes(t))) {
      f[36] = 1.0;
    }
  }
  if (h.distFit !== null && h.distFit !== undefined && h.distFit !== '') {
    f[37] = clip(Number(h.distFit), -1.0, 1.0);
  }
  // 血統×馬場適性(キーは "名前|馬場" 文字列。Python側と同一形式)
  const surf = h.surface || '';
  const ss = MODEL.sire_surface_stats && MODEL.sire_surface_stats[(h.sire || '') + '|' + surf];
  if (ss) {
    f[38] = shrunkDiff(ss, 60, g);
  }
  const dss = MODEL.damsire_surface_stats && MODEL.damsire_surface_stats[(h.damsire || '') + '|' + surf];
  if (dss) {
    f[39] = shrunkDiff(dss, 60, g);
  }
  const tss = MODEL.trainer_surface_stats && MODEL.trainer_surface_stats[(h.trainer || '') + '|' + surf];
  if (tss) {
    f[40] = shrunkDiff(tss, 40, g);
  }
  // 調教特徴量(ブラウザの出馬表CSVには含まれないため通常0=中立。
  // フル予測はpredict_today.py --workout を使うこと)
  if (h.wkHas === 1 || h.wkHas === '1') {
    f[41] = 1.0;
    if (h.wkBest4 !== null && h.wkBest4 !== undefined && h.wkBest4 !== '') {
      f[42] = clip(-Number(h.wkBest4) / 4.0, -3.0, 3.0);
    }
    if (h.wkBest1 !== null && h.wkBest1 !== undefined && h.wkBest1 !== '') {
      f[43] = clip(-Number(h.wkBest1) / 1.0, -3.0, 3.0);
    }
    if (h.wkN28 !== null && h.wkN28 !== undefined && h.wkN28 !== '') {
      f[44] = clip((Number(h.wkN28) - 4.0) / 4.0, -1.0, 1.5);
    }
    if (h.wkSelf !== null && h.wkSelf !== undefined && h.wkSelf !== '') {
      f[45] = clip(-Number(h.wkSelf) / 3.0, -2.0, 2.0);
    }
  }
  return f;
}

/**
 * 1レース分の予測。オッズが入った馬配列 → 勝率・EV・ケリー。
 * @param {Array<object>} horses 正規化済み馬データ(オッズ>1必須)
 * @returns {Array<{prob:number, ev:number, kelly:number}>}
 */
export function predictRace(horses) {
  if (!MODEL.coef) return horses.map(() => ({ prob: 0, ev: 0, kelly: 0 }));
  const inv = horses.map(h => (h.odds > 1 ? 1 / h.odds : 0));
  const s = inv.reduce((a, b) => a + b, 0);
  if (s === 0) return horses.map(() => ({ prob: 0, ev: 0, kelly: 0 }));
  const mkt = inv.map(v => v / s);

  const z = horses.map((h, i) => {
    const f = featurizeHorse(h, mkt[i]);
    return f.reduce((acc, v, j) => acc + v * MODEL.coef[j], 0);
  });
  const zMax = Math.max(...z);
  const exps = z.map(v => Math.exp(v - zMax));
  const zSum = exps.reduce((a, b) => a + b, 0);
  const probs = exps.map(e => e / zSum);

  return horses.map((h, i) => {
    const p = probs[i];
    const ev = h.odds > 1 ? p * h.odds : 0;
    let kelly = 0;
    if (h.odds > 1) {
      const b = h.odds - 1;
      const f = (p * b - (1 - p)) / b;
      kelly = f > 0 ? Math.min(f * 0.25, 0.05) : 0; // 1/4ケリー・上限5%
    }
    return { prob: p, marketProb: mkt[i], ev, kelly };
  });
}

/* =====================================================================
 * TARGET CSVのブラウザ内パース (target_import.py のALIASESと同一)
 * ===================================================================== */

const ALIASES = [
  ['prevFinish',    ['前走着順', '前着順']],
  ['prevHeadcount', ['前走頭数']],
  ['prevDate',      ['前走日付', '前走年月日']],
  ['prevDistance',  ['前走距離']],
  ['prevLast3f',    ['前走上がり3F', '前走上がり']],
  ['prevCorner4',   ['前走通過順4', '前走4角']],
  ['prevTimeDev',   ['前走時計偏差']],
  ['sex',           ['性別']],
  ['raceId',        ['レースID', 'RaceID', 'race_id']],
  ['date',          ['日付', '年月日', '開催日']],
  ['track',         ['場所', '場名', '競馬場']],
  ['raceNo',        ['R', 'Ｒ', 'レース番号', 'レースR']],
  ['distance',      ['距離']],
  ['surface',       ['芝ダ', '芝・ダ', 'トラック', '芝ダ障']],
  ['headcount',     ['頭数', '出走頭数']],
  ['num',           ['馬番']],
  ['name',          ['馬名']],
  ['sexage',        ['性齢']],
  ['age',           ['齢', '馬齢', '年齢']],
  ['jockey',        ['騎手', '騎手名']],
  ['trainer',       ['調教師名', '調教師']],
  ['impost',        ['斤量', '負担重量']],
  ['weight',        ['馬体重', '体重']],
  ['weightChange',  ['増減', '馬体重増減', '体重増減']],
  ['odds',          ['確定単勝オッズ', '単勝オッズ', '本オッズ', '単オッズ', 'オッズ']],
  ['finish',        ['確定着順', '着順']],
  // --- 2026-07追加: 血統・所属(damsireをsireより先に解決=部分一致の誤爆防止) ---
  ['damsire',       ['母の父馬名', '母父馬名', '母父名', '母父']],
  ['sire',          ['父馬名', '父名', '種牡馬名', '種牡馬']],
  ['region',        ['所属地', '所属', '東西']],
];

// 「年」「月」「日」は短すぎて部分一致だと「生年月日」等に誤爆するため完全一致のみ。
// TARGETはこれらを独立列で出力するため、レース開催日の最も確実な取得元になる。
const EXACT_ONLY_ALIASES = [
  ['year',      ['年']],
  ['month',     ['月']],
  ['day',       ['日']],
  ['kai',       ['回次']],
  ['dayIndex',  ['日次']],
];

// 部分一致でdate扱いしてはいけない列(「生年月日」を開催日と誤認する事故を防ぐ)
const DATE_PARTIAL_BLOCKLIST = ['生年', '前走'];

/** クオート対応の簡易CSVパーサ */
export function parseCsvText(text) {
  const rows = [];
  let row = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false;
      } else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some(v => v !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); if (row.some(v => v !== '')) rows.push(row); }
  return rows;
}

function toNum(s) {
  const v = parseFloat(String(s ?? '').replace(/[,±＋]/g, m => (m === '＋' ? '+' : m === '±' ? '' : '')));
  return Number.isFinite(v) ? v : null;
}

function parseDateStr(s) {
  const t = String(s || '').trim().replace(/[./]/g, '-');
  let m = t.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`;
  m = t.replace(/-/g, '').match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  // 6桁のYYMMDD形式(出馬表エクスポートの「年月日」列。例: 260718 = 2026-07-18)
  m = t.replace(/-/g, '').match(/^(\d{2})(\d{2})(\d{2})$/);
  if (m) {
    const yy = parseInt(m[1], 10);
    const yyyy = yy < 70 ? 2000 + yy : 1900 + yy;
    return `${yyyy}-${m[2]}-${m[3]}`;
  }
  return '';
}

/**
 * TARGET CSVの行列 → レースごとの正規化データ。
 * @returns {Array<{key, date, track, raceNo, horses:[...]}>}
 */
export function normalizeTargetRows(rows) {
  if (!rows || rows.length < 2) return [];
  const header = rows[0].map(h => h.trim());
  const mapping = {};
  const claimed = new Set();
  // 0周目: 完全一致のみで解決(年/月/日/回次/日次)
  for (const [canon, names] of EXACT_ONLY_ALIASES) {
    for (let i = 0; i < header.length; i++) {
      if (claimed.has(i)) continue;
      if (names.includes(header[i])) { mapping[canon] = i; claimed.add(i); break; }
    }
  }
  for (const [canon, names] of ALIASES) {          // 完全一致
    if (canon in mapping) continue;
    for (let i = 0; i < header.length; i++) {
      if (claimed.has(i)) continue;
      if (names.includes(header[i])) { mapping[canon] = i; claimed.add(i); break; }
    }
  }
  for (const [canon, names] of ALIASES) {          // 部分一致
    if (canon in mapping) continue;
    for (let i = 0; i < header.length; i++) {
      if (claimed.has(i)) continue;
      // date系の部分一致は「生年月日」等の誤爆を防ぐ
      if (canon === 'date' && DATE_PARTIAL_BLOCKLIST.some(b => header[i].includes(b))) continue;
      if (names.some(n => header[i].includes(n))) { mapping[canon] = i; claimed.add(i); break; }
    }
  }

  const get = (raw, key) => (key in mapping ? (raw[mapping[key]] || '').trim() : '');
  const byRace = new Map();
  for (const raw of rows.slice(1)) {
    const surface = get(raw, 'surface');
    if (surface.includes('障')) continue;
    let age = toNum(get(raw, 'age'));
    const sexage = get(raw, 'sexage');
    if (age === null && sexage) {
      const m = sexage.match(/(?:牡|牝|セ|騸)(\d{1,2})/);
      if (m) age = parseInt(m[1], 10);
    }
    let date = parseDateStr(get(raw, 'date'));
    // 「年」「月」「日」の分割列があればそちらを最優先(TARGETの標準形)
    const y0 = toNum(get(raw, 'year')), m0 = toNum(get(raw, 'month')), d0 = toNum(get(raw, 'day'));
    if (y0 !== null && m0 !== null && d0 !== null) {
      const yy = y0 < 100 ? (y0 < 70 ? y0 + 2000 : y0 + 1900) : y0;
      date = `${String(yy).padStart(4, '0')}-${String(m0).padStart(2, '0')}-${String(d0).padStart(2, '0')}`;
    }
    const prevDate = parseDateStr(get(raw, 'prevDate'));
    let prevDays = null;
    if (date && prevDate) {
      const d = (new Date(date) - new Date(prevDate)) / 86400000;
      if (Number.isFinite(d) && d > 0) prevDays = Math.round(d);
    }
    const wcRaw = get(raw, 'weightChange').replace('±', '').replace('＋', '+').replace('－', '-');
    // race_key: 「レースID」列は馬番連結の場合があるため使わず、
    // 日付+場所+回次+日次+レース番号で一意化する(Python版と同一)
    const trackV = get(raw, 'track'), raceNoV = get(raw, 'raceNo');
    const kaiV = get(raw, 'kai'), dayIdxV = get(raw, 'dayIndex');
    const key = (date && trackV && raceNoV)
      ? `${date}_${trackV}_${kaiV}_${dayIdxV}_${raceNoV}`
      : (get(raw, 'raceId') || `${date}_${trackV}_${raceNoV}`);
    const horse = {
      num: toNum(get(raw, 'num')) || 0,
      name: get(raw, 'name'),
      jockey: get(raw, 'jockey'),
      trainer: get(raw, 'trainer'),
      sire: get(raw, 'sire'),
      damsire: get(raw, 'damsire'),
      region: get(raw, 'region'),
      track: trackV,
      age,
      sex: sexage ? (sexage.match(/(牡|牝|セ|騸)/)?.[1] || get(raw, 'sex')) : get(raw, 'sex'),
      surface: surface.includes('ダ') ? 'ダート' : (surface.includes('芝') ? '芝' : surface),
      impost: toNum(get(raw, 'impost')),
      weight: toNum(get(raw, 'weight')),
      weightChange: wcRaw === '' || wcRaw === '--' ? null : toNum(wcRaw),
      odds: toNum(get(raw, 'odds')) || 0,
      headcount: toNum(get(raw, 'headcount')) || 0,
      distance: toNum(get(raw, 'distance')) || 0,
      prevFinish: toNum(get(raw, 'prevFinish')),
      prevHeadcount: toNum(get(raw, 'prevHeadcount')),
      prevDays,
      prevDistance: toNum(get(raw, 'prevDistance')),
      // 前走の上がり/4角/時計偏差はTARGETの出馬表CSVには通常含まれないため、
      // 取得できなければ0扱い(featurizeHorse内で無視される)。
      // 学習時より情報が少ない分、予測はやや保守的になる。
      prevLast3f: toNum(get(raw, 'prevLast3f')),
      prevCorner4: toNum(get(raw, 'prevCorner4')),
      prevTimeDev: toNum(get(raw, 'prevTimeDev')),
      // 着差・PCI・クラス変動・距離適性は履歴の再構築が必要なため
      // ブラウザ側では取得不可(null=中立)。predict_today.pyでは有効。
      wkHas: null,
      wkBest4: null,
      wkBest1: null,
      wkN28: null,
      wkSelf: null,
      prevMargin: null,
      bestMargin3: null,
      prevPci: null,
      classChange: null,
      distFit: null,
      finish: /^\d+$/.test(get(raw, 'finish')) ? parseInt(get(raw, 'finish'), 10) : null,
    };
    if (!byRace.has(key)) {
      byRace.set(key, { key, date, track: get(raw, 'track'), raceNo: get(raw, 'raceNo'), horses: [] });
    }
    byRace.get(key).horses.push(horse);
  }
  const races = [...byRace.values()].filter(r => {
    if (r.horses.length < 6 || r.horses.length > 18) return false;
    const nums = r.horses.map(h => h.num);
    return new Set(nums).size === nums.length; // 馬番重複=レース合体データは除外
  });
  for (const r of races) {
    if (!r.horses[0].headcount) {
      r.horses.forEach(h => { h.headcount = r.horses.length; });
    }
  }
  return races;
}
