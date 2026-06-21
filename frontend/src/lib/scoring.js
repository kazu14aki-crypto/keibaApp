export const TRACKS = ['東京', '中山', '阪神', '京都', '中京', '新潟', '小倉', '福島', '札幌', '函館'];
export const SURFACES = ['芝', 'ダート'];
export const CONDITIONS = ['良', '稍重', '重', '不良'];
export const STYLES = ['逃げ', '先行', '差し', '追込'];

export const FACTOR_DEFS = [
  { key: 'waku', label: '枠順適性', max: 20, hint: '今回の枠番がコース傾向に合うか' },
  { key: 'jockey', label: '騎手評価', max: 20, hint: '当該コース・条件での騎手実績' },
  { key: 'pedigree', label: '血統適性', max: 20, hint: '父系統・距離適性・馬場適性' },
  { key: 'time', label: 'タイム指数', max: 20, hint: '走破タイム・上がり3Fの絶対値評価' },
  { key: 'condition', label: '馬場適性', max: 10, hint: '良/稍重/重/不良への対応力' },
  { key: 'form', label: '臨戦・状態', max: 10, hint: '間隔・ローテーション・調教' },
];
export const MAX_TOTAL = FACTOR_DEFS.reduce((s, f) => s + f.max, 0);

export function totalScore(factors) {
  if (!factors) return 0;
  return FACTOR_DEFS.reduce((s, f) => s + (Number(factors[f.key]) || 0), 0);
}

export function wakuColor(waku) {
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

/** 開催日が「直近の土日」かどうかを判定。トップページの当日表示に使う。 */
export function isUpcomingWeekend(dateStr) {
  if (!dateStr) return false;
  const d = new Date(dateStr + 'T00:00:00');
  const now = new Date();
  const diffDays = (d - new Date(now.toDateString())) / (1000 * 60 * 60 * 24);
  return diffDays >= -1 && diffDays <= 8;
}
