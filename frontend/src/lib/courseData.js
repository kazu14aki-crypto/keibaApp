/**
 * 競馬場ごとの枠順適性ルール。
 *
 * 設計方針:
 * - 公開されている各競馬場のコース形状（直線距離、初角までの距離、内回り/外回りの別など）
 *   と、競馬メディアで広く言われている定性的な傾向（内枠有利/外枠有利の一般論）をもとにした
 *   「叩き台」です。実際の的中率は人によって異なるため、StatsPage（傾向分析）の結果を見ながら
 *   waku.jsonの係数を調整していくことを前提にしています。
 * - 直線が短い・初角までが短いコースほど内枠有利（先行争いで外を回らされにくい）。
 * - 直線が長いコースほど枠の差は縮まり、外枠でも届きやすい。
 * - ダートは芝よりスタート時の砂被りなどの影響があり、馬場や距離によって傾向が変わる。
 *
 * favorWaku: 'inner' | 'outer' | 'neutral'
 *   - inner: 1〜3枠が有利な傾向
 *   - outer: 6〜8枠が有利な傾向
 *   - neutral: 枠による差は比較的小さい
 * strength: 1(弱い傾向) 〜 3(強い傾向) — 配点の重み付けに使う
 */

export const COURSE_WAKU_RULES = {
  // --- 東京 ---
  "東京-芝-短距離": { favorWaku: "outer", strength: 1, note: "直線が長く外枠も届きやすい。中〜外枠がやや優勢。" },
  "東京-芝-中距離": { favorWaku: "neutral", strength: 1, note: "直線525.9mと全場最長級。枠差は小さく、能力がストレートに出やすい。" },
  "東京-芝-長距離": { favorWaku: "neutral", strength: 1, note: "長丁場で枠の影響は小さい。道中の位置取りの方が重要。" },
  "東京-ダート-短距離": { favorWaku: "outer", strength: 2, note: "ダート1400m以下は外枠の先行争いがしやすく外枠有利の傾向。" },
  "東京-ダート-中距離": { favorWaku: "outer", strength: 1, note: "1600mは芝スタートで外枠が芝部分を長く走れて恩恵を受けやすい。" },
  "東京-ダート-長距離": { favorWaku: "neutral", strength: 1, note: "長距離はポジション取りより持久力勝負。" },

  // --- 中山 ---
  "中山-芝-短距離": { favorWaku: "inner", strength: 3, note: "初角までが短く、内枠先行馬が圧倒的有利。外枠は包まれるリスク。" },
  "中山-芝-中距離": { favorWaku: "inner", strength: 2, note: "コーナーがタイトで小回り。内枠の方が立ち回りやすい。" },
  "中山-芝-長距離": { favorWaku: "inner", strength: 1, note: "周回数が増え枠の影響はやや薄れるが内枠優勢は継続。" },
  "中山-ダート-短距離": { favorWaku: "inner", strength: 2, note: "直線が短く、内枠先行馬が残りやすい。" },
  "中山-ダート-中距離": { favorWaku: "inner", strength: 1, note: "内枠やや有利だが極端ではない。" },
  "中山-ダート-長距離": { favorWaku: "neutral", strength: 1, note: "枠の影響は小さくなる。" },

  // --- 阪神 ---
  "阪神-芝-短距離": { favorWaku: "inner", strength: 2, note: "内回りは先行有利。外回り使用時はやや外枠も。" },
  "阪神-芝-中距離": { favorWaku: "neutral", strength: 1, note: "外回りは直線473.6mと長く、枠差は縮小。" },
  "阪神-芝-長距離": { favorWaku: "neutral", strength: 1, note: "長距離は枠より展開・スタミナが支配的。" },
  "阪神-ダート-短距離": { favorWaku: "outer", strength: 1, note: "ダートは他場同様やや外枠優勢の傾向。" },
  "阪神-ダート-中距離": { favorWaku: "neutral", strength: 1, note: "枠差は小さい。" },
  "阪神-ダート-長距離": { favorWaku: "neutral", strength: 1, note: "枠差は小さい。" },

  // --- 京都 ---
  "京都-芝-短距離": { favorWaku: "inner", strength: 2, note: "内回り使用時は先行・内枠有利。" },
  "京都-芝-中距離": { favorWaku: "neutral", strength: 1, note: "外回りは直線403.7mとやや長く、枠差は縮小。" },
  "京都-芝-長距離": { favorWaku: "neutral", strength: 1, note: "幅員が広く馬場が傷みにくいため枠の影響は限定的。" },
  "京都-ダート-短距離": { favorWaku: "outer", strength: 1, note: "芝スタート区間がある distancesは外枠が芝を多く走れて有利な場合がある。" },
  "京都-ダート-中距離": { favorWaku: "neutral", strength: 1, note: "枠差は小さい。" },
  "京都-ダート-長距離": { favorWaku: "neutral", strength: 1, note: "枠差は小さい。" },

  // --- 中京 ---
  "中京-芝-短距離": { favorWaku: "inner", strength: 3, note: "1200mはコーナーまでが短く内枠が圧倒的有利。稍重以上でさらに顕著。" },
  "中京-芝-中距離": { favorWaku: "neutral", strength: 1, note: "直線が長めで枠差は縮小。" },
  "中京-芝-長距離": { favorWaku: "neutral", strength: 1, note: "枠差は小さい。" },
  "中京-ダート-短距離": { favorWaku: "outer", strength: 1, note: "中京ダートは外枠もやや有利。" },
  "中京-ダート-中距離": { favorWaku: "neutral", strength: 1, note: "直線が長く、枠差は中程度。" },
  "中京-ダート-長距離": { favorWaku: "neutral", strength: 1, note: "枠差は小さい。" },

  // --- 新潟 ---
  "新潟-芝-短距離": { favorWaku: "outer", strength: 2, note: "直線1000mは外枠（特に開催後半は内が荒れて外有利）。" },
  "新潟-芝-中距離": { favorWaku: "outer", strength: 1, note: "外回り使用時は直線659mと全場最長。上がりが速い外枠も台頭。" },
  "新潟-芝-長距離": { favorWaku: "neutral", strength: 1, note: "枠差は小さい。" },
  "新潟-ダート-短距離": { favorWaku: "outer", strength: 1, note: "外枠やや有利。" },
  "新潟-ダート-中距離": { favorWaku: "neutral", strength: 1, note: "枠差は小さい。" },
  "新潟-ダート-長距離": { favorWaku: "neutral", strength: 1, note: "枠差は小さい。" },

  // --- 小倉 ---
  "小倉-芝-短距離": { favorWaku: "inner", strength: 2, note: "小回りで内枠先行が有利。" },
  "小倉-芝-中距離": { favorWaku: "inner", strength: 1, note: "直線262mと全場最短級で内枠・先行有利。" },
  "小倉-芝-長距離": { favorWaku: "inner", strength: 1, note: "小回り周回で内枠優勢が継続。" },
  "小倉-ダート-短距離": { favorWaku: "inner", strength: 1, note: "直線が短く内枠先行が残りやすい。" },
  "小倉-ダート-中距離": { favorWaku: "neutral", strength: 1, note: "枠差は中程度。" },
  "小倉-ダート-長距離": { favorWaku: "neutral", strength: 1, note: "枠差は小さい。" },

  // --- 札幌 ---
  "札幌-芝-短距離": { favorWaku: "inner", strength: 2, note: "洋芝・小回りで内枠先行有利。" },
  "札幌-芝-中距離": { favorWaku: "inner", strength: 1, note: "直線が短めで内枠優勢。" },
  "札幌-芝-長距離": { favorWaku: "neutral", strength: 1, note: "枠差は小さい。" },
  "札幌-ダート-短距離": { favorWaku: "neutral", strength: 1, note: "枠差は中程度。" },
  "札幌-ダート-中距離": { favorWaku: "neutral", strength: 1, note: "枠差は小さい。" },
  "札幌-ダート-長距離": { favorWaku: "neutral", strength: 1, note: "枠差は小さい。" },

  // --- 函館 ---
  "函館-芝-短距離": { favorWaku: "inner", strength: 2, note: "直線260m級、内枠・先行が圧倒的有利。" },
  "函館-芝-中距離": { favorWaku: "inner", strength: 1, note: "小回りで内枠優勢。" },
  "函館-芝-長距離": { favorWaku: "neutral", strength: 1, note: "枠差は小さい。" },
  "函館-ダート-短距離": { favorWaku: "outer", strength: 2, note: "函館ダート1000mは外枠有利の傾向が知られる。" },
  "函館-ダート-中距離": { favorWaku: "neutral", strength: 1, note: "枠差は中程度。" },
  "函館-ダート-長距離": { favorWaku: "neutral", strength: 1, note: "枠差は小さい。" },

  // --- 福島 ---
  "福島-芝-短距離": { favorWaku: "inner", strength: 2, note: "小回りで内枠先行有利。" },
  "福島-芝-中距離": { favorWaku: "inner", strength: 1, note: "内枠やや優勢。" },
  "福島-芝-長距離": { favorWaku: "neutral", strength: 1, note: "枠差は小さい。" },
  "福島-ダート-短距離": { favorWaku: "neutral", strength: 1, note: "枠差は中程度。" },
  "福島-ダート-中距離": { favorWaku: "neutral", strength: 1, note: "枠差は小さい。" },
  "福島-ダート-長距離": { favorWaku: "neutral", strength: 1, note: "枠差は小さい。" },
};

/** 距離を3区分に丸める（コースデータのキー生成用） */
export function distanceBucket(distance) {
  if (distance <= 1400) return "短距離";
  if (distance <= 2000) return "中距離";
  return "長距離";
}

export function getCourseRule(track, surface, distance) {
  const key = `${track}-${surface}-${distanceBucket(distance)}`;
  return COURSE_WAKU_RULES[key] || { favorWaku: "neutral", strength: 1, note: "データなし（中立として扱います）" };
}

/**
 * 枠番から枠順適性スコア（0〜20点）を計算する。
 * favorWaku/strengthに応じて、有利な枠ほど高得点・不利な枠ほど減点する。
 */
export function calcWakuScore(waku, track, surface, distance) {
  const rule = getCourseRule(track, surface, distance);
  const base = 12; // neutralの基準点（20点満点中の中央よりやや上）
  const swing = rule.strength * 3; // strength 1〜3 に応じて振れ幅を変える

  let position; // -1(内) 〜 +1(外) で枠番を正規化
  position = (waku - 4.5) / 3.5;

  let adj = 0;
  if (rule.favorWaku === "inner") {
    adj = -position * swing; // 内枠(positionが負)で加点
  } else if (rule.favorWaku === "outer") {
    adj = position * swing; // 外枠(positionが正)で加点
  }

  const score = Math.round(base + adj);
  return Math.max(0, Math.min(20, score));
}
