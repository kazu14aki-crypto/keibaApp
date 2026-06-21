export const TRACKS = ['東京', '中山', '阪神', '京都', '中京', '新潟', '小倉', '福島', '札幌', '函館'];
export const SURFACES = ['芝', 'ダート'];
export const CONDITIONS = ['良', '稍重', '重', '不良'];
export const STYLES = ['逃げ', '先行', '差し', '追込'];

export const FACTOR_DEFS = [
  {
    key: 'waku', label: '枠順適性', max: 20, hint: '今回の枠番がコース傾向に合うか（自動計算）',
    auto: true,
    guide: [],
  },
  {
    key: 'jockey', label: '騎手評価', max: 20, hint: '過去4走の乗り替わり有無・継続騎乗回数から自動計算',
    auto: true,
    guide: [
      '自動計算は「乗り替わりの有無」「直近の連続騎乗回数」のみが根拠（出馬表データの範囲）',
      '当該コースでの騎手実績や脚質との相性までは自動判定できないため、知識があれば手動で加減点を',
      '直近の騎手の調子（勝ち星・連対率の波）も合わせて確認するとよい',
    ],
  },
  {
    key: 'pedigree', label: '血統適性', max: 20, hint: '父系統・距離適性・馬場適性（手動評価）',
    auto: false,
    guide: [
      '父・母父の産駒は今回の距離をこなせる系統か（スピード型かスタミナ型か）',
      '父・母父の産駒は芝/ダートどちらを得意とするか',
      '道悪（稍重以上）での父系統の実績はどうか',
      '兄弟馬・近親に当該コースでの好走馬がいるか',
    ],
  },
  {
    key: 'time', label: 'タイム指数', max: 20, hint: '前走の上がり3Fを出走馬間で相対評価（自動計算）',
    auto: true,
    guide: [],
  },
  {
    key: 'condition', label: '馬場適性', max: 10, hint: '過去4走の道悪実績（着順率）から自動計算',
    auto: true,
    guide: [
      '自動計算は過去4走のうち稍重以上の馬場での着順率が根拠（出走数が少ないと参考程度）',
      '父系統が道悪を得意とするか（血統適性の判断とも関連するため合わせて確認）',
      '脚質と馬場が渋った時の有利不利の相性も考慮するとよい',
    ],
  },
  {
    key: 'form', label: '臨戦・状態', max: 10, hint: '前走間隔・着順推移から自動計算',
    auto: true,
    guide: [
      '自動計算は「前走からの間隔」「直近2走の着順推移」が根拠',
      '今回叩き○走目か（上昇度・期待値の目安）は手動で加味するとよい',
      '使われ方（重賞→格下げ、格上げ初挑戦など）の妙味・割引材料も確認',
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
