/**
 * probability.js — KiriScore 期待値エンジン
 *
 * 設計思想:
 *   「どの馬が強いか」(スコア) を「どの馬が儲かるか」(期待値) に変換する。
 *   競馬はパリミュチュエル方式のため、控除率(単勝20%)を上回るには
 *   市場(オッズ)より正確な確率見積もりが必要。本モジュールは
 *   (1) スコア→勝率変換 (ソフトマックス)
 *   (2) オッズ→市場勝率変換 (正規化により控除率を自動除去)
 *   (3) モデルと市場のブレンド (Benter方式: 市場情報は捨てずに融合する)
 *   (4) 期待値 EV = p × オッズ
 *   (5) 資金配分 (分数ケリー基準)
 *   を提供する。
 *
 * 重要な統計的注意:
 *   βとブレンド比wは蓄積データで較正(calibration)しない限り「仮の値」。
 *   fitBeta / fitBlendWeight を、結果を記録した過去レースで定期的に実行し、
 *   対数損失(logLoss)が市場単体を下回っているかを常に監視すること。
 *   モデルのlogLossが市場に勝てない間は、EVフィルタを厳しく(1.3以上)保つ。
 */

/**
 * スコア配列を勝率配列に変換する(ソフトマックス)。
 * @param {number[]} scores - 各馬のKiriScore合計点
 * @param {number} beta - 温度パラメータ。大きいほどスコア差を強く信じる。
 *   β=0 で全馬同確率、β→∞ で最高点馬の勝率100%。
 *   初期推奨値 0.10〜0.15 (較正前の保守的設定)。
 * @returns {number[]} 合計1.0の勝率配列
 */
export function softmaxProbs(scores, beta = 0.12) {
  if (!scores || scores.length === 0) return [];
  const maxS = Math.max(...scores);
  const exps = scores.map(s => Math.exp(beta * (s - maxS))); // オーバーフロー対策で最大値を引く
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map(e => e / sum);
}

/**
 * 単勝オッズ配列を市場の暗黙勝率に変換する。
 * 1/オッズをレース内で正規化することで、控除率(約20%)を自動的に除去する。
 * オッズ未入力(0以下)の馬は市場確率0として扱い、残りで正規化する。
 * @param {number[]} oddsArr - 各馬の単勝オッズ
 * @returns {number[]} 合計1.0の市場勝率配列
 */
export function marketProbs(oddsArr) {
  if (!oddsArr || oddsArr.length === 0) return [];
  const raw = oddsArr.map(o => (o && o > 1.0 ? 1 / o : 0));
  const sum = raw.reduce((a, b) => a + b, 0);
  if (sum === 0) return oddsArr.map(() => 0);
  return raw.map(r => r / sum);
}

/**
 * モデル勝率と市場勝率を幾何平均でブレンドする。
 * Benterの発見: 自前モデル単体より「モデル×市場」の融合が常に強い。
 * 市場は膨大な情報(調教・厩舎話・直前気配)を織り込んでおり、捨てるのは損失。
 * p_blend ∝ p_model^w × p_market^(1-w)
 * @param {number[]} modelP
 * @param {number[]} marketP
 * @param {number} w - モデルへの信頼度 0〜1。較正前の推奨値 0.3(市場寄り)。
 *   自モデルのlogLossが市場を安定して下回るようになったら段階的に上げる。
 * @returns {number[]} 合計1.0のブレンド勝率
 */
export function blendedProbs(modelP, marketP, w = 0.3) {
  if (!modelP || modelP.length === 0) return [];
  if (!marketP || marketP.every(p => p === 0)) return modelP; // オッズ未入力ならモデルのみ
  const raw = modelP.map((pm, i) => {
    const pk = marketP[i] > 0 ? marketP[i] : 1e-6;
    return Math.pow(Math.max(pm, 1e-9), w) * Math.pow(pk, 1 - w);
  });
  const sum = raw.reduce((a, b) => a + b, 0);
  return raw.map(r => r / sum);
}

/**
 * 単勝期待値。EV = 勝率 × オッズ。
 * EV > 1.0 で理論上プラス、ただしモデル誤差を考慮し実運用の購入閾値は
 * 1.2〜1.4 を推奨(較正が進むまでは高めに)。
 */
export function expectedValue(prob, odds) {
  if (!odds || odds <= 1.0) return 0;
  return prob * odds;
}

/**
 * 分数ケリー基準による推奨賭け金比率(バンクロール比)。
 * フルケリー f* = (p×(o-1) - (1-p)) / (o-1)
 * 実運用ではモデル誤差によるオーバーベットが破産リスクを生むため、
 * 1/4ケリー(fraction=0.25)を推奨。さらに1銘柄上限cap(既定5%)で頭打ち。
 * 株式で言えば「ポジションサイジング」。エッジが小さい時は自動的に小さく賭ける。
 * @returns {number} 0〜cap の賭け金比率。エッジ無しなら0。
 */
export function kellyFraction(prob, odds, fraction = 0.25, cap = 0.05) {
  if (!odds || odds <= 1.0) return 0;
  const b = odds - 1;
  const f = (prob * b - (1 - prob)) / b;
  if (f <= 0) return 0;
  return Math.min(f * fraction, cap);
}

/**
 * 対数損失(log loss)。モデル品質の唯一絶対の物差し。
 * 「実際に勝った馬に事前何%を与えていたか」の対数の平均(負号付き)。
 * 小さいほど良い。市場(オッズ)のlogLossと常に比較すること。
 * @param {Array<{probs:number[], winnerIndex:number}>} races
 * @returns {number}
 */
export function logLoss(races) {
  if (!races || races.length === 0) return Infinity;
  let total = 0;
  let n = 0;
  for (const r of races) {
    if (r.winnerIndex == null || r.winnerIndex < 0 || !r.probs) continue;
    const p = Math.max(r.probs[r.winnerIndex] || 0, 1e-9);
    total += -Math.log(p);
    n += 1;
  }
  return n > 0 ? total / n : Infinity;
}

/**
 * βの較正: 結果記録済みレース群でlogLoss最小のβをグリッドサーチする。
 * @param {Array<{scores:number[], winnerIndex:number}>} races
 *   scores: 全馬のKiriScore、winnerIndex: 勝ち馬のインデックス
 * @param {number[]} grid - 探索するβ候補
 * @returns {{beta:number, logLoss:number, nRaces:number}}
 */
export function fitBeta(races, grid = [0.02, 0.04, 0.06, 0.08, 0.10, 0.12, 0.15, 0.18, 0.22, 0.26, 0.30]) {
  const valid = (races || []).filter(r => r.scores && r.scores.length > 1 && r.winnerIndex >= 0);
  if (valid.length === 0) return { beta: 0.12, logLoss: Infinity, nRaces: 0 };
  let best = { beta: grid[0], logLoss: Infinity, nRaces: valid.length };
  for (const b of grid) {
    const ll = logLoss(valid.map(r => ({ probs: softmaxProbs(r.scores, b), winnerIndex: r.winnerIndex })));
    if (ll < best.logLoss) best = { beta: b, logLoss: ll, nRaces: valid.length };
  }
  return best;
}

/**
 * ブレンド比wの較正: モデル勝率と市場勝率の最適融合比を探索する。
 * @param {Array<{scores:number[], odds:number[], winnerIndex:number}>} races
 * @param {number} beta - fitBetaで得た較正済みβ
 * @returns {{w:number, logLoss:number, marketLogLoss:number, modelLogLoss:number}}
 *   marketLogLoss < modelLogLoss なら「まだ市場に勝てていない」ことを意味する。
 */
export function fitBlendWeight(races, beta) {
  const valid = (races || []).filter(r => r.scores && r.odds && r.winnerIndex >= 0 && r.odds.some(o => o > 1));
  if (valid.length === 0) return { w: 0.3, logLoss: Infinity, marketLogLoss: Infinity, modelLogLoss: Infinity };
  const grid = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
  const prepared = valid.map(r => ({
    modelP: softmaxProbs(r.scores, beta),
    marketP: marketProbs(r.odds),
    winnerIndex: r.winnerIndex,
  }));
  const modelLL = logLoss(prepared.map(r => ({ probs: r.modelP, winnerIndex: r.winnerIndex })));
  const marketLL = logLoss(prepared.map(r => ({ probs: r.marketP, winnerIndex: r.winnerIndex })));
  let best = { w: 0.3, logLoss: Infinity };
  for (const w of grid) {
    const ll = logLoss(prepared.map(r => ({ probs: blendedProbs(r.modelP, r.marketP, w), winnerIndex: r.winnerIndex })));
    if (ll < best.logLoss) best = { w, logLoss: ll };
  }
  return { ...best, marketLogLoss: marketLL, modelLogLoss: modelLL };
}

/**
 * 1レース分の総合分析。UIから呼ぶメインエントリポイント。
 * @param {Array<{score:number, odds:number}>} horses
 * @param {{beta?:number, blendW?:number, evThreshold?:number}} opts
 * @returns {Array<{modelProb, marketProb, blendProb, ev, kelly, valueFlag}>}
 */
export function analyzeRace(horses, opts = {}) {
  const beta = opts.beta ?? 0.12;
  const blendW = opts.blendW ?? 0.3;
  const evThreshold = opts.evThreshold ?? 1.2;
  const scores = horses.map(h => h.score || 0);
  const oddsArr = horses.map(h => h.odds || 0);
  const modelP = softmaxProbs(scores, beta);
  const marketP = marketProbs(oddsArr);
  const blendP = blendedProbs(modelP, marketP, blendW);
  return horses.map((h, i) => {
    const ev = expectedValue(blendP[i], oddsArr[i]);
    return {
      modelProb: modelP[i],
      marketProb: marketP[i],
      blendProb: blendP[i],
      ev,
      kelly: kellyFraction(blendP[i], oddsArr[i]),
      valueFlag: ev >= evThreshold,
    };
  });
}
