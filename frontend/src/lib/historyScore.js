/**
 * 過去4走の履歴データ（JRA出馬表から取得）をもとに自動採点するロジック。
 *
 * 今回の改善点:
 * - 着差（margin）を考慮: 大差負けと僅差負けを区別
 * - 同コース実績を評価
 * - 馬場適性: 道悪実績 + 良馬場実績を組み合わせた適性判定
 * - 着順はグレード重み付き絶対評価
 */

import { calcPedigreeScore } from './sireData';
import { calcTimeIndexFromHistory } from './timeIndex';

function parseRaceDate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return Number.isNaN(d.getTime()) ? null : d;
}

function validHistory(history) {
  if (!history) return [];
  return ["前走", "前々走", "3走前", "4走前"]
    .map(label => history[label])
    .filter(r => r !== null && r !== undefined);
}

/**
 * グレード係数: G1 > G2 > G3 > リステッド > OP > 通常
 */
function gradeWeight(className) {
  if (!className) return 1.0;
  if (/G[Ⅰ1](?!I)/i.test(className) || /GI$/i.test(className)) return 2.0;
  if (/G[Ⅱ2]/i.test(className) || /GII$/i.test(className)) return 1.6;
  if (/G[Ⅲ3]/i.test(className) || /GIII$/i.test(className)) return 1.3;
  if (/リステッド/.test(className)) return 1.15;
  if (/オープン|OP|ステークス/.test(className) || /[SC記念杯賞]$/.test(className.trim().replace(/G(I{1,3}|[1-3])$/i, ''))) return 1.1;
  return 1.0;
}

/**
 * 着順の質スコア（0〜10）: 着順・頭数・着差・グレードを考慮
 * - 1着との着差が小さいほど評価を下げすぎない
 * - G1での5着はG3での2着よりも評価が高い場合がある
 */
function calcRaceQualityScore(race) {
  if (!race || !race.rank || !race.headcount) return null;
  const { rank, headcount, margin, class_name } = race;

  // 基本着順スコア: 1着=10点、最下位=0点
  const baseScore = Math.max(0, 10 * (1 - (rank - 1) / Math.max(headcount - 1, 1)));

  // 着差補正: 着差が小さいほど減点を緩和（例: 0.0秒差=減点なし, 1.0秒差=追加減点）
  // 2着以下でも0.1秒差ならほぼ実力は示せている
  let marginBonus = 0;
  if (rank > 1 && margin !== null && margin !== undefined) {
    if (margin <= 0.2) marginBonus = 1.5;        // 僅差（0.2秒以内）
    else if (margin <= 0.5) marginBonus = 0.5;   // 小差（0.5秒以内）
    else if (margin > 1.5) marginBonus = -1.0;   // 大差負け
  }

  // グレード補正
  const gw = gradeWeight(class_name);
  const adjusted = Math.min(10, (baseScore + marginBonus) * Math.sqrt(gw));

  return Math.max(0, Math.round(adjusted * 10) / 10);
}

/**
 * 騎手評価（0〜20点）
 */
export function calcJockeyScore(currentJockey, history) {
  const races = validHistory(history);
  if (!currentJockey || races.length === 0) {
    return { score: 10, hasData: false, reason: "判断材料なし（中立値）" };
  }

  let consecutiveCount = 0;
  for (const race of races) {
    if (race.jockey && race.jockey === currentJockey) {
      consecutiveCount++;
    } else {
      break;
    }
  }

  const isContinuing = consecutiveCount > 0;
  let score;
  if (consecutiveCount >= 3) score = 18;
  else if (consecutiveCount === 2) score = 16;
  else if (consecutiveCount === 1) score = 14;
  else if (!isContinuing && races[0]?.jockey) score = 8;
  else score = 10;

  return {
    score,
    hasData: true,
    reason: isContinuing
      ? `直近${consecutiveCount}走継続騎乗（信頼度高）`
      : `前走から乗り替わり（${races[0]?.jockey || '不明'} → ${currentJockey}）`,
  };
}

/**
 * 馬場適性（0〜10点）。
 * 今回の馬場状態（稍重・重・不良 or 良）に合わせて評価する。
 * - 道悪得意: 道悪での好走実績が多い
 * - 道悪苦手: 良馬場では好走するが道悪では崩れている
 * - データ不足: 中立値
 */
export function calcConditionScore(history, currentCondition) {
  const races = validHistory(history);
  if (races.length === 0) {
    return { score: 5, hasData: false, reason: "出走歴なし（中立値）" };
  }

  const isMuddy = currentCondition && currentCondition !== "良";
  const muddyRaces = races.filter(r => r.condition && r.condition !== "良" && r.rank > 0 && r.headcount > 0);
  const goodRaces = races.filter(r => r.condition === "良" && r.rank > 0 && r.headcount > 0);

  if (isMuddy) {
    // 今回道悪: 道悪実績を重視
    if (muddyRaces.length === 0) {
      // 道悪経験なし → やや不安要素として減点気味の中立値
      return { score: 4, hasData: false, reason: "道悪経験なし（やや不安要素）" };
    }
    const muddyAvgRatio = muddyRaces.reduce((s, r) => s + r.rank / r.headcount, 0) / muddyRaces.length;
    const score = Math.max(1, Math.min(10, Math.round(10 - muddyAvgRatio * 8)));
    return {
      score,
      hasData: true,
      reason: `道悪${muddyRaces.length}走 平均${(muddyAvgRatio * 100).toFixed(0)}%位`,
    };
  } else {
    // 今回良馬場: 良馬場実績を評価、道悪得意馬は若干割引
    if (goodRaces.length === 0) {
      return { score: 5, hasData: false, reason: "良馬場実績なし（中立値）" };
    }
    const goodAvgRatio = goodRaces.reduce((s, r) => s + r.rank / r.headcount, 0) / goodRaces.length;
    let score = Math.max(1, Math.min(10, Math.round(10 - goodAvgRatio * 8)));
    // 道悪でのみ良績があり良馬場で崩れている馬は減点
    if (muddyRaces.length > 0 && goodRaces.length > 0) {
      const muddyAvg = muddyRaces.reduce((s, r) => s + r.rank / r.headcount, 0) / muddyRaces.length;
      if (muddyAvg < goodAvgRatio - 0.2) score = Math.max(1, score - 1); // 道悪得意→良馬場割引
    }
    return {
      score,
      hasData: true,
      reason: `良馬場${goodRaces.length}走 平均${(goodAvgRatio * 100).toFixed(0)}%位`,
    };
  }
}

/**
 * 同コース実績（オプション評価）。
 * course_record（手動入力の通算成績 "2-1-0-3" 形式）が入力されていればそちらを優先。
 * なければ過去4走から同コースを検索して評価する。
 */
export function calcSameCourseScore(history, currentTrack, currentSurface, courseRecord) {
  if (!currentTrack) return { score: 10, hasData: false, reason: "コース情報なし（中立値）" };

  // 手動入力の通算成績が優先（"1着-2着-3着-着外" の形式: "2-1-0-3"）
  if (courseRecord && courseRecord.trim()) {
    const parts = courseRecord.trim().split('-').map(n => parseInt(n, 10));
    if (parts.length >= 2 && !parts.some(isNaN)) {
      const [w, p2, p3, rest] = parts;
      const total = parts.reduce((a, b) => a + b, 0);
      if (total > 0) {
        const winRate = w / total;
        const renRate = (w + (p2 || 0)) / total;
        const fukuRate = (w + (p2 || 0) + (p3 || 0)) / total;
        // 連対率・複勝率を総合してスコア化
        const score = Math.min(20, Math.round(winRate * 12 + renRate * 5 + fukuRate * 3));
        return {
          score,
          hasData: true,
          source: 'manual',
          reason: `${currentTrack}${currentSurface}通算 ${courseRecord}（${total}戦${w}勝 連対率${Math.round(renRate*100)}%）`,
        };
      }
    }
  }
  const races = validHistory(history);
  const sameCourse = races.filter(r =>
    r.track === currentTrack && r.surface === currentSurface && r.rank > 0 && r.headcount > 0
  );

  if (sameCourse.length === 0) {
    return { score: 7, hasData: false, reason: `${currentTrack}${currentSurface}初出走or実績なし（やや中立）` };
  }

  // 質スコアの加重平均（直近重視）
  const weights = [0.45, 0.30, 0.15, 0.10];
  let wSum = 0, wTotal = 0;
  sameCourse.forEach((race, i) => {
    const q = calcRaceQualityScore(race);
    if (q !== null) {
      const w = weights[i] || 0.05;
      wSum += q * w;
      wTotal += w;
    }
  });

  if (wTotal === 0) return { score: 7, hasData: false, reason: "着順データ不足" };

  const avgQ = wSum / wTotal;
  // avgQ: 0〜10 → 0〜20点にスケール
  const score = Math.max(0, Math.min(20, Math.round(avgQ * 2)));
  const reasons = sameCourse.map(r => {
    const gLabel = gradeWeight(r.class_name) >= 1.3 ? `[${r.class_name}]` : '';
    return `${r.rank}着${r.margin !== null && r.margin !== undefined ? `(${r.margin}差)` : ''}${gLabel}`;
  });

  return {
    score,
    hasData: true,
    reason: `${currentTrack}${currentSurface}実績: ${reasons.join('→')}`,
    count: sameCourse.length,
  };
}

/**
 * 臨戦状態（0〜10点）。
 * - 前走間隔（適切な中間隔が理想）
 * - 前走の着順・着差・グレードを総合した実力評価
 * - 前走と前々走の着順トレンド
 */
export function calcFormScore(history, raceDate) {
  const races = validHistory(history);
  if (races.length === 0) {
    return { score: 5, hasData: false, reason: "出走歴なし（中立値）" };
  }

  const lastRace = races[0];
  let intervalScore = 5;
  let intervalReason = "";

  const lastDate = parseRaceDate(lastRace.date);
  const targetDate = raceDate ? parseRaceDate(raceDate) : new Date();

  if (lastDate && targetDate) {
    const diffDays = Math.round((targetDate - lastDate) / (1000 * 60 * 60 * 24));
    if (diffDays <= 13) {
      intervalScore = 4;
      intervalReason = `中${Math.floor(diffDays / 7)}週以内の詰めたローテ`;
    } else if (diffDays <= 35) {
      intervalScore = 8;
      intervalReason = "中2〜5週の標準的な間隔";
    } else if (diffDays <= 84) {
      intervalScore = 6;
      intervalReason = "中6〜12週とやや間隔が空く";
    } else {
      intervalScore = 4;
      intervalReason = "長期休養明け（3ヶ月以上）";
    }
  }

  // 前走の質スコア（着差・グレード考慮）
  const lastQ = calcRaceQualityScore(lastRace) ?? 5;
  const lastQScore = Math.round(lastQ * 0.8 + 1); // 0〜9点

  // トレンド（前走→前々走比較）
  let trendBonus = 0;
  if (races.length >= 2 && races[0].rank > 0 && races[1].rank > 0) {
    const r0ratio = races[0].rank / (races[0].headcount || 1);
    const r1ratio = races[1].rank / (races[1].headcount || 1);
    if (r0ratio < r1ratio - 0.1) trendBonus = 1;       // 上昇
    else if (r0ratio > r1ratio + 0.1) trendBonus = -1; // 下降
  }

  const score = Math.max(0, Math.min(10, Math.round((intervalScore + lastQScore) / 2) + trendBonus));
  const gLabel = gradeWeight(lastRace.class_name) >= 1.3 ? `[G${gradeWeight(lastRace.class_name) >= 2.0 ? '1' : gradeWeight(lastRace.class_name) >= 1.6 ? '2' : '3'}]` : '';
  const marginStr = (lastRace.margin !== null && lastRace.margin !== undefined) ? `/${lastRace.margin}秒差` : '';

  return {
    score,
    hasData: true,
    reason: `前走${gLabel}${lastRace.rank || '?'}着${marginStr} / ${intervalReason}`,
  };
}

/**
 * 斤量スコアを計算する（0〜10点）。
 */
function calcImpostScore(currentImpost, history) {
  if (!currentImpost || currentImpost === 0) {
    return { score: 5, hasData: false, reason: '斤量データなし（中立値）' };
  }
  const BASE_KG = 55.0;
  const diffFromBase = BASE_KG - currentImpost;
  let baseScore = Math.round(5 + diffFromBase * 1.5);
  baseScore = Math.max(1, Math.min(9, baseScore));

  const prevImpost = history?.['前走']?.impost;
  let changeBonus = 0, changeReason = '';
  if (prevImpost && prevImpost > 0) {
    const kgDiff = prevImpost - currentImpost;
    if (kgDiff >= 1) { changeBonus = 1; changeReason = `前走比${kgDiff}kg減`; }
    else if (kgDiff <= -1) { changeBonus = -1; changeReason = `前走比${Math.abs(kgDiff)}kg増`; }
  }

  const score = Math.max(0, Math.min(10, baseScore + changeBonus));
  return {
    score, hasData: true,
    reason: `今回${currentImpost}kg（基準55kg比${diffFromBase > 0 ? '+' : ''}${diffFromBase.toFixed(1)}kg）${changeReason ? ' / ' + changeReason : ''}`,
  };
}

/**
 * 1頭分の自動採点結果をまとめて返す。
 * race: { track, surface, condition, distance } が今回のレース情報
 */
export function calcAutoFactorsFromHistory(horse, raceDate, race) {
  const jockeyResult = calcJockeyScore(horse.jockey, horse.history);
  const conditionResult = calcConditionScore(horse.history, race?.condition);
  const formResult = calcFormScore(horse.history, raceDate);
  const pedigreeResult = calcPedigreeScore(horse.pedigree, race);
  const timeResult = calcTimeIndexFromHistory(horse.history);
  const impostResult = calcImpostScore(horse.current_impost, horse.history);
  const sameCourseResult = calcSameCourseScore(horse.history, race?.track, race?.surface, horse.course_record);

  return {
    jockey: jockeyResult,
    condition: conditionResult,
    form: formResult,
    pedigree: pedigreeResult,
    time: timeResult,
    impost: impostResult,
    sameCourse: sameCourseResult,
  };
}
