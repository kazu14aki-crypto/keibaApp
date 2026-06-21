export const TRACKS = ['東京', '中山', '阪神', '京都', '中京', '新潟', '小倉', '福島', '札幌', '函館'];
export const SURFACES = ['芝', 'ダート'];
export const CONDITIONS = ['良', '稍重', '重', '不良'];
export const STYLES = ['逃げ', '先行', '差し', '追込'];

export const FACTOR_DEFS = [
  {
    key: 'waku', label: '枠順適性', max: 20, hint: '今回の枠番がコース傾向に合うか',
    auto: true,
    guide: [],
  },
  {
    key: 'jockey', label: '騎手評価', max: 20, hint: '当該コース・条件での騎手実績',
    auto: false,
    guide: [
      'その騎手は当該競馬場・距離・馬場種別での経験が豊富か',
      'この馬への騎乗が今回が初めてか、続き乗りか（コンビ実績）',
      '直近の騎手の調子（勝ち星・連対率の波）',
      '同型の馬（逃げ・先行など）を得意とする騎手か',
    ],
  },
  {
    key: 'pedigree', label: '血統適性', max: 20, hint: '父系統・距離適性・馬場適性',
    auto: false,
    guide: [
      '父・母父の産駒は今回の距離をこなせる系統か（スピード型かスタミナ型か）',
      '父・母父の産駒は芝/ダートどちらを得意とするか',
      '道悪（稍重以上）での父系統の実績はどうか',
      '兄弟馬・近親に当該コースでの好走馬がいるか',
    ],
  },
  {
    key: 'time', label: 'タイム指数', max: 20, hint: '前走の上がり3Fを出走馬間で相対評価（自動計算可）',
    auto: true,
    guide: [],
  },
  {
    key: 'condition', label: '馬場適性', max: 10, hint: '良/稍重/重/不良への対応力',
    auto: false,
    guide: [
      '今回の馬場発表（良・稍重・重・不良）に対し、過去の道悪実績はどうか',
      '父系統が道悪を得意とするか（前述の血統適性とも関連）',
      '脚質（先行・差し等）と馬場が渋った時の有利不利の相性',
    ],
  },
  {
    key: 'form', label: '臨戦・状態', max: 10, hint: '間隔・ローテーション・調教',
    auto: false,
    guide: [
      '前走からの間隔（中1週・中2週・休み明けなど）は適正か',
      '今回叩き○走目か（上昇度・期待値の目安）',
      '使われ方（重賞→格下げ、格上げ初挑戦など）に妙味・割引材料がないか',
      '馬体重の増減（公開されていれば）',
    ],
  },
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
