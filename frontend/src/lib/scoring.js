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
    key: 'pedigree', label: '血統適性', max: 20, hint: '父系統データベースとレース条件（距離・馬場・コース形態）から自動計算',
    auto: true,
    guide: [
      '自動計算は主要な父系統のみ収録した簡易データベースが根拠。データベースにない系統は中立値になる',
      '母父との配合で傾向が変わることが多いため、知識があれば手動で加減点を',
      '兄弟馬・近親に当該コースでの好走馬がいるかも確認するとよい',
    ],
  },
  {
    key: 'time', label: 'タイム指数', max: 20, hint: '過去4走それぞれを競馬場・距離・クラス別の基準タイムと比較（自動計算）',
    auto: true,
    guide: [
      '自動計算は競馬場・距離・クラス帯ごとの基準タイムデータベースとの比較が根拠',
      '基準タイムは複数サイトの集計を参考にした目安であり、毎年の馬場改修等で変動しうる',
      '対応する競馬場・距離・クラスの組み合わせが未収録の場合は中立値になる',
      '展開（ハイペース/スローペース）による上がり3Fの違いも合わせて確認するとよい',
    ],
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
      '馬体重の増減は下の専用欄で入力・確認できる（点数には自動反映されない参考情報）',
    ],
  },
  {
    key: 'season', label: '季節・気温適性', max: 5, hint: '夏季・冬季など特定条件で結果が大きく変わる馬の調整（手動評価）',
    auto: false,
    guide: [
      'メモ欄に「#夏弱」「#冬強」のようなタグを付けておくと、馬名検索ページで横断的に検索できる',
      '同条件（季節・気温帯）での過去の好走・凡走パターンがあれば加減点を',
      '毛艶・馬体の仕上がりなど季節要因に関する情報があれば考慮',
      '多くの馬には該当しないため、特に当てはまりがなければ中央値のままでよい',
    ],
  },
  {
    key: 'impost', label: '斤量', max: 10, hint: '今回の斤量（軽いほど高評価）と前走比の変化から自動計算',
    auto: true,
    guide: [
      '基準は55.0kg（牝馬重賞の標準的な斤量）。1kg軽いと+1.5点、1kg重いと-1.5点が目安',
      '前走比で1kg以上減った場合は追加+1点、1kg以上増えた場合は-1点',
      '斤量はJRA出馬表から自動取得する（取得できない場合は中立値5点）',
      '斤量差のアドバンテージは距離・ペースによっても変わるため、あくまで参考程度に',
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
