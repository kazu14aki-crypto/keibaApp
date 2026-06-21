/**
 * 過去4走の履歴データ（JRA出馬表から取得）をもとに、
 * 騎手評価・馬場適性・臨戦状態を自動採点するロジック。
 *
 * 重要な前提（精度の限界について）:
 * - これらはあくまで「出馬表に書かれている過去4走の範囲」だけを根拠にした簡易指標。
 * - 「騎手のコース実績」のような大規模統計に基づく評価ではない。
 *   （正確なコース別騎手成績にはJRA-VAN等の別データソースが必要で、現状は未対応）
 * - サンプル数が最大4走と少ないため、過信せず「参考値」として扱うことを前提に設計している。
 */

import { calcPedigreeScore } from './sireData';

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
 * 騎手評価（0〜20点）を自動採点する。
 * 判断材料: 今回の騎手が前走から継続騎乗しているか、直近どれだけ連続騎乗しているか。
 * （コース実績やコース×脚質の相性は出馬表データだけでは計算できないため対象外）
 */
export function calcJockeyScore(currentJockey, history) {
  const races = validHistory(history);
  if (!currentJockey || races.length === 0) {
    return { score: 10, hasData: false, reason: "判断材料なし（中立値）" };
  }

  // 直近から何走連続で同じ騎手が乗っているか数える
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
  let reason;

  if (consecutiveCount >= 3) {
    score = 17;
    reason = `同騎手で${consecutiveCount}走連続騎乗（コンビ継続）`;
  } else if (consecutiveCount >= 1) {
    score = 14;
    reason = `同騎手で前走から継続騎乗（${consecutiveCount}走）`;
  } else {
    score = 8;
    reason = "今回が乗り替わり（前走と騎手が異なる）";
  }

  return { score, hasData: true, reason, isContinuing, consecutiveCount };
}

/**
 * 馬場適性（0〜10点）を自動採点する。
 * 判断材料: 過去4走のうち、道悪（稍重・重・不良）での着順実績。
 */
export function calcConditionScore(history) {
  const races = validHistory(history);
  const muddyRaces = races.filter(r => r.condition && r.condition !== "良");

  if (muddyRaces.length === 0) {
    return { score: 5, hasData: false, reason: "道悪での出走歴なし（中立値）" };
  }

  // 着順と頭数から「上位率」を計算（着順 / 頭数が小さいほど良い）
  const ratios = muddyRaces
    .filter(r => r.rank > 0 && r.headcount > 0)
    .map(r => r.rank / r.headcount);

  if (ratios.length === 0) {
    return { score: 5, hasData: false, reason: "道悪での着順データなし（中立値）" };
  }

  const avgRatio = ratios.reduce((a, b) => a + b, 0) / ratios.length;
  // avgRatio: 0に近いほど上位、1に近いほど下位
  const score = Math.round(10 - avgRatio * 8);
  const clamped = Math.max(2, Math.min(10, score));

  return {
    score: clamped,
    hasData: true,
    reason: `道悪${muddyRaces.length}走の平均着順率${(avgRatio * 100).toFixed(0)}%`,
  };
}

/**
 * 臨戦状態（0〜10点）を自動採点する。
 * 判断材料: 前走からの間隔（連闘〜長期休養）、直近の着順推移（上昇/下降）。
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
      intervalReason = `中${Math.floor(diffDays / 7)}週以内の詰めたローテーション`;
    } else if (diffDays <= 35) {
      intervalScore = 8;
      intervalReason = "中2〜5週の標準的な間隔";
    } else if (diffDays <= 84) {
      intervalScore = 6;
      intervalReason = "中6〜12週とやや間隔が空いている";
    } else {
      intervalScore = 4;
      intervalReason = "長期休養明け（3ヶ月以上）";
    }
  }

  // 着順推移（直近2走が分かれば比較）
  let trendScore = 5;
  let trendReason = "";
  if (races.length >= 2 && races[0].rank > 0 && races[1].rank > 0) {
    const prevRank = races[0].rank;
    const prevPrevRank = races[1].rank;
    if (prevRank < prevPrevRank) {
      trendScore = 7;
      trendReason = "着順が上昇傾向";
    } else if (prevRank > prevPrevRank) {
      trendScore = 3;
      trendReason = "着順が下降傾向";
    } else {
      trendScore = 5;
      trendReason = "着順は横ばい";
    }
  }

  const score = Math.round((intervalScore + trendScore) / 2);
  const reasonParts = [intervalReason, trendReason].filter(Boolean);

  return {
    score: Math.max(0, Math.min(10, score)),
    hasData: true,
    reason: reasonParts.join(" / ") || "判断材料が限定的",
  };
}

/**
 * 1頭分の自動採点結果をまとめて返す。
 */
export function calcAutoFactorsFromHistory(horse, raceDate, race) {
  const jockeyResult = calcJockeyScore(horse.jockey, horse.history);
  const conditionResult = calcConditionScore(horse.history);
  const formResult = calcFormScore(horse.history, raceDate);
  const pedigreeResult = calcPedigreeScore(horse.pedigree, race);

  return {
    jockey: jockeyResult,
    condition: conditionResult,
    form: formResult,
    pedigree: pedigreeResult,
  };
}
