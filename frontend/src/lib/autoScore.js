/**
 * タイム指数の自動計算（上がり3Fベースの相対評価）。
 *
 * 設計方針:
 * - 競馬場・距離が異なるレース間では絶対タイムの比較に意味がないため、
 *   「同じレースに出走する馬どうし」の相対比較に倒す。
 * - 出走馬の中で前走の上がり3Fが最も速い馬を満点(20点)とし、
 *   そこからの秒差に応じて減点していく。
 * - 上がり3F未入力（初出走・データなしなど）の馬は自動計算の対象外とし、
 *   0点のまま残して手動で個別評価してもらう（呼び出し側でフラグを返す）。
 *
 * 減点幅は経験則の叩き台:
 *   差 0.0〜0.5秒: -1点/0.1秒（僅差はほぼ互角として扱う）
 *   差 0.5〜1.5秒: -1.5点/0.1秒（ここが主な差のつく帯）
 *   差 1.5秒以上 : -1点/0.1秒（差が大きい馬同士の中でも一応の強弱はつける）
 * 0点に張り付きすぎないよう下限を2点に設定し、識別力を残す。
 * 実際の的中傾向を見ながら調整することを前提にしている。
 */

function parseLast3f(value) {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  if (!s) return null;
  const num = parseFloat(s);
  if (Number.isNaN(num)) return null;
  if (num <= 0 || num > 60) return null; // 明らかに異常な値は無視
  return num;
}

/**
 * @param {Array<{id: string, last_3f: string|number}>} horses
 * @returns {Map<string, {score: number, hasData: boolean}>} horseId -> 結果
 */
export function calcTimeScores(horses) {
  const parsed = horses.map(h => ({ id: h.id, val: parseLast3f(h.last_3f) }));
  const valid = parsed.filter(p => p.val !== null);

  const result = new Map();

  if (valid.length === 0) {
    horses.forEach(h => result.set(h.id, { score: 0, hasData: false }));
    return result;
  }

  const best = Math.min(...valid.map(p => p.val));

  parsed.forEach(p => {
    if (p.val === null) {
      result.set(p.id, { score: 0, hasData: false });
      return;
    }
    const diff = p.val - best; // 0以上。0なら最速。
    let penalty;
    if (diff <= 0.5) {
      penalty = diff * 10 * 1; // 0.1秒あたり1点減点
    } else if (diff <= 1.5) {
      penalty = 0.5 * 10 * 1 + (diff - 0.5) * 10 * 1.5; // 0.1秒あたり1.5点減点
    } else {
      penalty = 0.5 * 10 * 1 + 1.0 * 10 * 1.5 + (diff - 1.5) * 10 * 1;
    }
    const score = Math.max(2, Math.round(20 - penalty));
    result.set(p.id, { score, hasData: true });
  });

  return result;
}
