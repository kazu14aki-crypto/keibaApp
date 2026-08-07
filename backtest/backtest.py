# -*- coding: utf-8 -*-
"""
backtest.py — KiriScore期待値戦略のバックテストハーネス

目的:
  過去レースデータ(CSV)を使い、以下を検証する:
  (1) β較正: スコア→勝率変換の最適温度パラメータ
  (2) モデル品質: 対数損失(log loss)を市場(オッズ)と比較。
      ここで市場に勝てなければ、どんな買い方をしても長期では負ける。
  (3) 戦略シミュレーション: EV閾値ごとの回収率・的中率・最大ドローダウン
  (4) ウォークフォワード検証: 前半データで較正→後半データで検証し、
      過剰適合(オーバーフィッティング)を防ぐ。株のバックテストと同じ規律。

入力CSVスキーマ (1行=1頭):
  race_id,date,horse_num,score,odds,finish
  - race_id: レース識別子(同一レースの馬は同じID)
  - date:    YYYY-MM-DD (ウォークフォワード分割に使用)
  - score:   その馬のKiriScore合計点(または任意のモデルスコア)
  - odds:    確定単勝オッズ
  - finish:  確定着順(1=勝ち)

使い方:
  python backtest.py data.csv
  python backtest.py --demo        # 合成データでハーネスの動作確認

重要な注意(必読):
  * 確定オッズでのバックテストは回収率を「過大評価」する。
    日本の馬券市場は締切直前に鋭い資金(スマートマネー)が入り、
    確定オッズは購入時点のオッズより効率的だから。実運用では
    バックテスト回収率から5〜10%引いた値を期待値とみなすこと。
  * 自分の購入がオッズを下げる(マーケットインパクト)。少額なら無視可。
  * 統計的有意性: 回収率110%を偶然と区別するには約900ベット必要。
    (単勝リターンの標準偏差≒3倍賭け金、t=3を得るには n≈(3σ/edge)^2)
    100ベット程度の好成績で確信しないこと。
"""

import argparse
import csv
import math
import sys
import random
from collections import defaultdict


# ---------------------------------------------------------------
# 確率変換 (frontend/src/lib/probability.js と同一ロジック)
# ---------------------------------------------------------------

def softmax_probs(scores, beta):
    if not scores:
        return []
    mx = max(scores)
    exps = [math.exp(beta * (s - mx)) for s in scores]
    total = sum(exps)
    return [e / total for e in exps]


def market_probs(odds_list):
    raw = [1.0 / o if o and o > 1.0 else 0.0 for o in odds_list]
    total = sum(raw)
    if total == 0:
        return [0.0] * len(odds_list)
    return [r / total for r in raw]


def blended_probs(model_p, market_p, w):
    if all(p == 0 for p in market_p):
        return model_p
    raw = [max(pm, 1e-9) ** w * max(pk, 1e-6) ** (1 - w)
           for pm, pk in zip(model_p, market_p)]
    total = sum(raw)
    return [r / total for r in raw]


def log_loss(prob_winner_pairs):
    """[(probs, winner_idx)] の平均対数損失。小さいほど良い。"""
    total, n = 0.0, 0
    for probs, widx in prob_winner_pairs:
        if widx is None or widx < 0:
            continue
        total += -math.log(max(probs[widx], 1e-9))
        n += 1
    return total / n if n else float("inf")


# ---------------------------------------------------------------
# データ読み込み
# ---------------------------------------------------------------

def load_races(csv_path, strict_odds=False):
    """CSVを読み、レース単位の辞書リストに変換する。"""
    rows_by_race = defaultdict(list)
    with open(csv_path, newline="", encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            rows_by_race[row["race_id"]].append(row)

    races = []
    for rid, rows in rows_by_race.items():
        try:
            scores = [float(r["score"]) for r in rows]
            odds = [float(r["odds"]) for r in rows]
            finishes = [int(r["finish"]) for r in rows]
        except (ValueError, KeyError):
            continue  # 欠損行を含むレースはスキップ
        if 1 not in finishes or len(rows) < 5:
            continue
        captured = all((r.get("odds_captured_at") or "").strip() for r in rows)
        if strict_odds and not captured:
            continue
        races.append({
            "race_id": rid,
            "date": rows[0].get("date", ""),
            "scores": scores,
            "odds": odds,
            "winner_idx": finishes.index(1),
            "finishes": finishes,
            "odds_captured": captured,
        })
    races.sort(key=lambda r: r["date"])
    return races


# ---------------------------------------------------------------
# 較正 (トレーニングデータのみで実行すること)
# ---------------------------------------------------------------

def fit_beta(races, grid=None):
    grid = grid or [0.02, 0.04, 0.06, 0.08, 0.10, 0.12, 0.15, 0.18, 0.22, 0.26, 0.30]
    best_beta, best_ll = grid[0], float("inf")
    for b in grid:
        ll = log_loss([(softmax_probs(r["scores"], b), r["winner_idx"]) for r in races])
        if ll < best_ll:
            best_beta, best_ll = b, ll
    return best_beta, best_ll


def fit_blend_weight(races, beta):
    grid = [i / 10 for i in range(11)]
    best_w, best_ll = 0.0, float("inf")
    for w in grid:
        pairs = []
        for r in races:
            mp = softmax_probs(r["scores"], beta)
            kp = market_probs(r["odds"])
            pairs.append((blended_probs(mp, kp, w), r["winner_idx"]))
        ll = log_loss(pairs)
        if ll < best_ll:
            best_w, best_ll = w, ll
    return best_w, best_ll


# ---------------------------------------------------------------
# 戦略シミュレーション
# ---------------------------------------------------------------

def simulate(races, beta, blend_w, ev_threshold, stake=100):
    """EV閾値以上の馬の単勝を定額購入した場合の成績。"""
    bets = hits = 0
    spent = returned = 0.0
    bankroll_curve, bankroll = [], 0.0
    max_peak, max_dd = 0.0, 0.0

    for r in races:
        mp = softmax_probs(r["scores"], beta)
        kp = market_probs(r["odds"])
        bp = blended_probs(mp, kp, blend_w)
        for i, (p, o) in enumerate(zip(bp, r["odds"])):
            if o <= 1.0:
                continue
            ev = p * o
            if ev >= ev_threshold:
                bets += 1
                spent += stake
                if i == r["winner_idx"]:
                    hits += 1
                    returned += stake * o
                bankroll = returned - spent
                max_peak = max(max_peak, bankroll)
                max_dd = min(max_dd, bankroll - max_peak)
                bankroll_curve.append(bankroll)

    roi = returned / spent if spent else 0.0
    hit_rate = hits / bets if bets else 0.0
    return {
        "ev_threshold": ev_threshold,
        "bets": bets,
        "hits": hits,
        "hit_rate": hit_rate,
        "roi": roi,
        "profit": returned - spent,
        "max_drawdown": max_dd,
    }


def race_level_returns(races, beta, blend_w, ev_threshold, stake=100):
    """1レースを1観測として収益率を返す。

    同一レースの複数購入を分離して再抽出すると分散を過小評価するため、
    信頼区間は必ずレース単位でブートストラップする。
    """
    result = []
    for r in races:
        mp = softmax_probs(r["scores"], beta)
        bp = blended_probs(mp, market_probs(r["odds"]), blend_w)
        spent = returned = 0.0
        for i, (p, o) in enumerate(zip(bp, r["odds"])):
            if o > 1 and p * o >= ev_threshold:
                spent += stake
                if i == r["winner_idx"]:
                    returned += stake * o
        if spent:
            result.append((spent, returned))
    return result


def bootstrap_roi_interval(race_returns, samples=2000, seed=20260807):
    """レース単位ブートストラップによるROIの95%区間。"""
    if len(race_returns) < 20:
        return None
    rng = random.Random(seed)
    n = len(race_returns)
    rois = []
    for _ in range(samples):
        picked = [race_returns[rng.randrange(n)] for _ in range(n)]
        spent = sum(x[0] for x in picked)
        returned = sum(x[1] for x in picked)
        rois.append(returned / spent if spent else 0.0)
    rois.sort()
    return rois[int(samples * 0.025)], rois[int(samples * 0.975)]


def select_threshold(validation, beta, blend_w, thresholds):
    """購入閾値は検証期間ではなく、学習期間内の専用検証区間で固定する。"""
    candidates = []
    for th in thresholds:
        s = simulate(validation, beta, blend_w, th)
        interval = bootstrap_roi_interval(race_level_returns(validation, beta, blend_w, th))
        # サンプルが少ない戦略を偶然の高ROIで選ばないため、下限を優先する。
        lower = interval[0] if interval else -float("inf")
        candidates.append((lower, s["bets"], th, s, interval))
    eligible = [c for c in candidates if c[1] >= 25 and c[4] is not None]
    best = max(eligible or candidates, key=lambda c: (c[0], c[1]))
    return best, candidates


def calibration_table(races, beta, blend_w, buckets=10):
    """予測勝率の分位ごとに実際の勝率を照合(較正曲線)。
    予測と実際が一致していれば、モデルの確率は「本物」。"""
    preds = []  # (predicted_p, won)
    for r in races:
        mp = softmax_probs(r["scores"], beta)
        kp = market_probs(r["odds"])
        bp = blended_probs(mp, kp, blend_w)
        for i, p in enumerate(bp):
            preds.append((p, 1 if i == r["winner_idx"] else 0))
    preds.sort()
    n = len(preds)
    rows = []
    for b in range(buckets):
        chunk = preds[b * n // buckets:(b + 1) * n // buckets]
        if not chunk:
            continue
        avg_pred = sum(p for p, _ in chunk) / len(chunk)
        actual = sum(w for _, w in chunk) / len(chunk)
        rows.append((avg_pred, actual, len(chunk)))
    return rows


# ---------------------------------------------------------------
# 合成データ生成 (--demo用: ハーネスの動作確認)
# ---------------------------------------------------------------

def generate_demo_csv(path, n_races=600, seed=42):
    """現実的な構造の合成データ:
    - 各馬に真の能力θがあり、真の勝率はsoftmax(θ)
    - 市場オッズは真の勝率をノイズ付きで反映(市場は賢い)+控除率20%
    - モデルスコアは真の能力の「市場よりノイズが多い」観測
    → 現実と同じく「モデル単体では市場に勝てないが、ブレンドで改善」
      という結果が再現される教材データ。"""
    rng = random.Random(seed)
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["race_id", "date", "horse_num", "score", "odds", "finish"])
        for ridx in range(n_races):
            n_horses = rng.choice([10, 12, 14, 16])
            theta = [rng.gauss(0, 1.0) for _ in range(n_horses)]
            true_p = softmax_probs(theta, 1.0)
            # 勝ち馬を真の確率で抽選
            u, acc, widx = rng.random(), 0.0, 0
            for i, p in enumerate(true_p):
                acc += p
                if u <= acc:
                    widx = i
                    break
            # 市場: 真のθ + 小ノイズ → 控除率20%込みオッズ
            market_theta = [t + rng.gauss(0, 0.35) for t in theta]
            mkt_p = softmax_probs(market_theta, 1.0)
            odds = [round(max(1.1, 0.80 / max(p, 0.005)), 1) for p in mkt_p]
            # モデル(KiriScore想定): 真のθ + 大ノイズ、0-135点スケール
            model_theta = [t + rng.gauss(0, 0.80) for t in theta]
            scores = [round(70 + 18 * t) for t in model_theta]
            date = f"2025-{(ridx % 12) + 1:02d}-{(ridx % 28) + 1:02d}"
            month_order = ridx  # 単調な日付順を保証
            date = f"2025-{month_order // 50 + 1:02d}-{month_order % 28 + 1:02d}" if month_order // 50 < 12 else f"2026-01-{month_order % 28 + 1:02d}"
            for i in range(n_horses):
                finish = 1 if i == widx else (i + 2 if i < widx else i + 1)
                w.writerow([f"R{ridx:05d}", date, i + 1, scores[i], odds[i], finish])
    return path


# ---------------------------------------------------------------
# メイン
# ---------------------------------------------------------------

def run(csv_path, strict_odds=False):
    races = load_races(csv_path, strict_odds=strict_odds)
    if len(races) < 30:
        print(f"レース数が不足しています({len(races)}件)。最低30件、推奨100件以上。")
        return

    # ウォークフォワード分割: 前半60%で較正、後半40%で検証
    split = int(len(races) * 0.6)
    train, test = races[:split], races[split:]
    print(f"総レース数: {len(races)}  (較正用: {len(train)} / 検証用: {len(test)})")
    print("=" * 68)

    # 閾値の選択用に、trainの末尾25%をさらに隔離する。
    # これによりtestは最後まで一切見ずに評価専用として残る。
    tune_split = max(20, int(len(train) * 0.75))
    tune, strategy_validation = train[:tune_split], train[tune_split:]
    beta_tune, _ = fit_beta(tune)
    blend_tune, _ = fit_blend_weight(tune, beta_tune)
    selected, _candidates = select_threshold(
        strategy_validation, beta_tune, blend_tune, [1.0, 1.05, 1.1, 1.2, 1.3, 1.4, 1.5]
    )
    _lower, _bets, selected_threshold, selected_stats, selected_interval = selected

    # 確率変換はtrain全体で再推定するが、購入閾値は上の専用区間で固定したままにする。
    beta, beta_ll = fit_beta(train)
    blend_w, blend_ll = fit_blend_weight(train, beta)
    print(f"[較正結果 — trainデータ]")
    print(f"  最適β        : {beta}")
    print(f"  最適ブレンドw : {blend_w}  (0=市場のみ / 1=モデルのみ)")
    ci_text = f"{selected_interval[0]*100:.1f}〜{selected_interval[1]*100:.1f}%" if selected_interval else "算出不可(レース数不足)"
    print(f"  購入閾値      : EV≥{selected_threshold:.2f}  (train内の別検証区間で固定 / ROI95%区間 {ci_text})")

    # --- 検証フェーズ (testのみ使用) ---
    model_ll = log_loss([(softmax_probs(r["scores"], beta), r["winner_idx"]) for r in test])
    mkt_ll = log_loss([(market_probs(r["odds"]), r["winner_idx"]) for r in test])
    blend_pairs = []
    for r in test:
        mp = softmax_probs(r["scores"], beta)
        kp = market_probs(r["odds"])
        blend_pairs.append((blended_probs(mp, kp, blend_w), r["winner_idx"]))
    bl_ll = log_loss(blend_pairs)

    print(f"\n[モデル品質 — testデータでの対数損失(小さいほど良い)]")
    print(f"  市場(オッズ)   : {mkt_ll:.4f}   ← 超えるべきベンチマーク")
    print(f"  モデル単体     : {model_ll:.4f}   {'✓市場に勝利' if model_ll < mkt_ll else '✗市場に敗北(通常はこうなる)'}")
    print(f"  ブレンド       : {bl_ll:.4f}   {'✓市場に勝利 → エッジの可能性あり' if bl_ll < mkt_ll else '✗市場に敗北 → 買うほどEVマイナス'}")

    # --- 較正曲線 ---
    print(f"\n[較正曲線 — 予測勝率 vs 実際の勝率 (testデータ)]")
    print(f"  {'予測':>8} {'実際':>8} {'頭数':>6}")
    for pred, actual, cnt in calibration_table(test, beta, blend_w):
        print(f"  {pred*100:7.1f}% {actual*100:7.1f}% {cnt:6d}")

    # --- 戦略シミュレーション ---
    print(f"\n[戦略シミュレーション — testデータ / 単勝定額100円]")
    print(f"  {'EV閾値':>6} {'ベット数':>8} {'的中率':>8} {'回収率':>8} {'損益':>10} {'最大DD':>10}")
    for th in [1.0, 1.1, 1.2, 1.3, 1.4, 1.5]:
        s = simulate(test, beta, blend_w, th)
        print(f"  {th:6.1f} {s['bets']:8d} {s['hit_rate']*100:7.1f}% "
              f"{s['roi']*100:7.1f}% {s['profit']:10.0f} {s['max_drawdown']:10.0f}")

    frozen = simulate(test, beta, blend_w, selected_threshold)
    frozen_ci = bootstrap_roi_interval(race_level_returns(test, beta, blend_w, selected_threshold))
    print(f"\n[事前固定戦略の最終評価 — EV≥{selected_threshold:.2f}]")
    if frozen_ci:
        print(f"  ベット数 {frozen['bets']} / 回収率 {frozen['roi']*100:.1f}% / レース単位95%区間 {frozen_ci[0]*100:.1f}〜{frozen_ci[1]*100:.1f}%")
    else:
        print(f"  ベット数 {frozen['bets']} / 回収率 {frozen['roi']*100:.1f}% / 信頼区間は20レース以上の購入対象で算出")

    print("\n[読み方]")
    print("  * ブレンドのlogLossが市場を下回らない限り、どのEV閾値でも長期回収率は")
    print("    100%を超えません。まずモデル品質(logLoss)の改善に集中してください。")
    print("  * 購入閾値はtrain内で固定済みです。test側の一覧で最良閾値を選び直さないでください。")
    print("  * ベット数が少ない閾値の回収率は偶然の産物です。最低500ベット以上で判断。")
    print("  * 確定オッズによる検証のため、実運用の回収率はここから5〜10%低下します。")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="KiriScoreの確率・EVバックテスト")
    ap.add_argument("csv_path", nargs="?", help="バックテストCSV")
    ap.add_argument("--demo", action="store_true", help="合成データで動作確認")
    ap.add_argument("--strict-odds", action="store_true",
                    help="odds_captured_atが全馬にないレースを除外(新規データでは推奨)")
    args = ap.parse_args()
    if args.demo:
        path = generate_demo_csv("demo_data.csv")
        print(f"合成データを生成しました: {path}\n")
        run(path, strict_odds=args.strict_odds)
    elif args.csv_path:
        run(args.csv_path, strict_odds=args.strict_odds)
    else:
        print("使い方: python backtest.py <data.csv>  または  python backtest.py --demo")
