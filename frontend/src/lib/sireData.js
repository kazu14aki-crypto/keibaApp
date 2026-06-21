/**
 * 主要な父系統（種牡馬）ごとの、脚質・距離適性・芝/ダート適性・
 * 馬場状態適性・コース形態適性（直線が長いコース向きか、小回り向きか）をまとめたデータベース。
 *
 * 重要な注意点（精度の限界について）:
 * - これは複数の競馬メディア・血統解説記事を基にした「一般的な傾向」のまとめであり、
 *   個体差や配合（母父との組み合わせ）によって大きく変わりうる参考情報。
 * - 統計的な裏付け（実際の勝率・回収率データ）に基づくものではなく、定性的な解説の要約。
 * - サイト側の自動採点はあくまで「叩き台」を出すのみで、点数は手動で調整できる。
 * - JRA出馬表から取得できる血統情報は「父」のみ（母・母父も取れる場合があるが現状未使用）。
 *   母父との配合によって傾向が大きく変わる種牡馬も多いため、父系統だけでの判断には限界がある。
 *
 * 各エントリの意味:
 * - distanceFit: 得意距離帯 [下限, 上限]（m）の目安
 * - surface: "芝" | "ダート" | "両方"（より得意な方、両方こなせる場合は"両方"）
 * - trackShape: "直線" (東京・新潟外回りなど直線が長く高速向き) | "小回り" (中山・小倉・福島など) | "両方"
 * - mudResistance: 道悪（稍重以上）適性 1〜5（5が最も道悪に強い）
 * - styleHint: 傾向として出やすい脚質
 * - note: 簡潔な補足
 */

export const SIRE_LINE_DATA = {
  'ディープインパクト': {
    distanceFit: [1800, 2400], surface: '芝', trackShape: '直線', mudResistance: 2,
    styleHint: '差し・追込（瞬発力型）',
    note: '芝の中長距離で鋭い末脚。高速馬場・直線の長いコース向き。ダート・道悪は割引。',
  },
  'キズナ': {
    distanceFit: [1800, 2400], surface: '芝', trackShape: '両方', mudResistance: 3,
    styleHint: '差し',
    note: 'ディープ系の瞬発力にパワーを補強。東京の長い直線での末脚比べに強い。牝馬の小回り穴も。',
  },
  'ハーツクライ': {
    distanceFit: [2000, 2500], surface: '芝', trackShape: '両方', mudResistance: 3,
    styleHint: '差し',
    note: 'ディープ系に近いが、ややダート・道悪耐性が高め。長距離もこなす。',
  },
  'エピファネイア': {
    distanceFit: [2000, 2400], surface: '芝', trackShape: '両方', mudResistance: 3,
    styleHint: '差し（タフな流れに強い）',
    note: 'パワーと底力を兼備。東京のタフな流れでもバテにくい。中距離以上向き。',
  },
  'ステイゴールド': {
    distanceFit: [2000, 3200], surface: '芝', trackShape: '小回り', mudResistance: 5,
    styleHint: '差し・追込',
    note: 'スタミナ・パワーに優れる「Tサンデー系」。重馬場・不良馬場が得意。晩成型。',
  },
  'オルフェーヴル': {
    distanceFit: [2000, 3200], surface: '芝', trackShape: '小回り', mudResistance: 5,
    styleHint: '差し・追込',
    note: 'ステイゴールド系。長距離・道悪に強い。時計のかかる馬場で台頭しやすい。',
  },
  'ダイワメジャー': {
    distanceFit: [1200, 1600], surface: '両方', trackShape: '両方', mudResistance: 3,
    styleHint: '先行',
    note: '「Pサンデー系」。1400m以下が得意でダートもこなせる珍しいタイプ。',
  },
  'キングカメハメハ': {
    distanceFit: [1600, 2000], surface: '両方', trackShape: '両方', mudResistance: 3,
    styleHint: '先行・差し',
    note: 'スピード・パワー兼備で芝ダート問わず活躍。母系の色を強く出す。',
  },
  'ロードカナロア': {
    distanceFit: [1200, 1600], surface: '芝', trackShape: '両方', mudResistance: 2,
    styleHint: '先行・差し',
    note: '高速芝への適性が高い。良馬場が得意で渋ると割引。ダート短距離もこなす。母系次第で中距離も。',
  },
  'ゴールドアリュール': {
    distanceFit: [1400, 1800], surface: 'ダート', trackShape: '両方', mudResistance: 4,
    styleHint: '先行',
    note: 'ダート短〜中距離のスペシャリスト。芝での実績はまれ。',
  },
  'キタサンブラック': {
    distanceFit: [2000, 2400], surface: '芝', trackShape: '直線', mudResistance: 3,
    styleHint: '先行・差し',
    note: '芝の中長距離で高い勝率。東京などスケールの大きいコースで期待値が高い。',
  },
  'ドゥラメンテ': {
    distanceFit: [2000, 2400], surface: '芝', trackShape: '両方', mudResistance: 3,
    styleHint: '差し',
    note: 'キングカメハメハ系。パワーとスピードを兼ね備え中距離以上の重賞で実績。',
  },
  'モーリス': {
    distanceFit: [1600, 2000], surface: '芝', trackShape: '両方', mudResistance: 3,
    styleHint: '差し',
    note: 'マイル〜中距離で安定。海外実績もあり世界レベルの瞬発力。',
  },
  'サトノダイヤモンド': {
    distanceFit: [2000, 2400], surface: '芝', trackShape: '直線', mudResistance: 2,
    styleHint: '差し・追込',
    note: 'ディープ系で長め距離向き。高速馬場の直線で末脚を活かすタイプ。',
  },
};

/**
 * pedigree文字列（例: "ディープインパクト系"）から系統データを引く。
 * 完全一致だけでなく、「○○系」表記や部分一致にもある程度対応する。
 */
export function lookupSireLine(pedigreeText) {
  if (!pedigreeText) return null;
  const cleaned = pedigreeText.replace(/系$/, '').trim();

  if (SIRE_LINE_DATA[cleaned]) {
    return { name: cleaned, ...SIRE_LINE_DATA[cleaned] };
  }
  // 部分一致（前方一致・含む）でのフォールバック
  for (const name of Object.keys(SIRE_LINE_DATA)) {
    if (cleaned.includes(name) || name.includes(cleaned)) {
      return { name, ...SIRE_LINE_DATA[name] };
    }
  }
  return null;
}

/**
 * 血統適性スコア（0〜20点）を、種牡馬データベースとレース条件から算出する。
 * データベースにない種牡馬の場合は中立値を返す。
 */
export function calcPedigreeScore(pedigreeText, race) {
  const sireInfo = lookupSireLine(pedigreeText);
  if (!sireInfo) {
    return { score: 10, hasData: false, reason: pedigreeText ? 'データベースに未収録の系統（中立値）' : '血統情報未入力（中立値）' };
  }

  let score = 10;
  const reasons = [];

  // 距離適性
  const distance = race?.distance || 0;
  if (distance > 0) {
    const [lo, hi] = sireInfo.distanceFit;
    if (distance >= lo && distance <= hi) {
      score += 4;
      reasons.push(`距離適性 ◎（得意帯${lo}-${hi}m）`);
    } else {
      const diff = distance < lo ? lo - distance : distance - hi;
      if (diff <= 200) {
        score += 1;
        reasons.push('距離適性 ○（やや範囲外）');
      } else {
        score -= 2;
        reasons.push('距離適性 △（範囲外）');
      }
    }
  }

  // 芝・ダート適性
  const surface = race?.surface || '';
  if (surface) {
    if (sireInfo.surface === '両方') {
      score += 2;
      reasons.push(`${surface}適性あり`);
    } else if (sireInfo.surface === surface) {
      score += 4;
      reasons.push(`${surface}得意系統`);
    } else {
      score -= 3;
      reasons.push(`${surface}は不得意系統の可能性`);
    }
  }

  // コース形態適性（直線が長い/小回り）
  const trackShape = getTrackShape(race?.track);
  if (trackShape && sireInfo.trackShape !== '両方') {
    if (sireInfo.trackShape === trackShape) {
      score += 2;
      reasons.push(`コース形態 ◎（${trackShape}向き）`);
    } else {
      score -= 1;
      reasons.push(`コース形態 △（${sireInfo.trackShape}向きの系統）`);
    }
  }

  // 馬場状態適性
  const condition = race?.condition || '良';
  if (condition !== '良') {
    if (sireInfo.mudResistance >= 4) {
      score += 2;
      reasons.push('道悪適性高い系統');
    } else if (sireInfo.mudResistance <= 2) {
      score -= 2;
      reasons.push('道悪はやや割引の系統');
    }
  }

  return {
    score: Math.max(0, Math.min(20, Math.round(score))),
    hasData: true,
    sireInfo,
    reason: `${sireInfo.name}系: ${reasons.join('、')}`,
  };
}

/** 競馬場名から「直線」型か「小回り」型かを大まかに判定する */
function getTrackShape(track) {
  if (!track) return null;
  const straightTracks = ['東京', '新潟'];
  const compactTracks = ['中山', '小倉', '福島', '函館', '札幌', '中京'];
  if (straightTracks.includes(track)) return '直線';
  if (compactTracks.includes(track)) return '小回り';
  return null; // 京都・阪神はコースによるため判定保留
}
