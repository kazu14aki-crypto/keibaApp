# -*- coding: utf-8 -*-
"""
predict_today.py — レース当日のフルパワー予測(ローカル実行)

サイトの「モデル予測」ページは出馬表CSV単体から予測するため、
履歴系特徴量(前走時計偏差・コース適性・複勝率など)が使えない。
このスクリプトは「過去データCSV + 当日出馬表CSV」を結合して
各馬の履歴を再構築するため、学習時と同じ全46特徴量で予測できる。
→ 本気の購入判断はこちらを使うこと。サイトは外出先の簡易確認用。

使い方 (PowerShell):
  python predict_today.py input.csv 出馬表.csv --workout ウッドC.csv --workout 坂路.csv --ev 1.05 --max-odds 30
  python predict_today.py input.csv 出馬表.csv --workout ウッドC.csv --workout 坂路.csv --json pack.json

引数:
  history_csv : TARGETから出力した過去データ(学習に使ったものと同じでよい。
                直近レースまで含むよう週次で再出力すると精度が上がる)
  card_csv    : TARGETから出力した当日出馬表(同じ列構成、着順は空でよい。
                単勝オッズ列は発走直前の値で出力すること)

出力: レースごとにEV降順の表を表示し、購入条件を満たす馬に🔥を付ける。
      --json を指定すると「解析パック」を書き出す。サイトのレース詳細ページの
      「解析パック取込」で読み込むと、脚質・調教評価・モデル予測が
      該当レースの馬に自動反映される(JRA取込の過去4走制限・脚質欠落を補完)。
"""

import argparse
import datetime
import json
import math
import sys

import target_import as ti
from train_model import featurize_horse, FEATURE_NAMES


def workout_score(h):
    """調教特徴量 → 0〜10点の調教評価(サイトの採点用)。データ無しはNone。

    実測に基づく重み付け: 終い1F(wk_best1)が最も効き、自己平常比(wk_self)が次点。
    5点=平均的な調教。8点以上=時計面で明確に良い、3点以下=物足りない。
    """
    if h.get("wk_has") not in (1, "1"):
        return None
    score = 5.0
    b1 = h.get("wk_best1")
    if b1 not in (None, ""):
        score += max(-2.5, min(2.5, -float(b1) * 2.0))
    ws = h.get("wk_self")
    if ws not in (None, ""):
        score += max(-1.5, min(1.5, -float(ws) * 0.5))
    n = h.get("wk_n28")
    if n not in (None, ""):
        n = float(n)
        score += 0.5 if n >= 4 else (-0.5 if n <= 1 else 0.0)
    return int(round(max(0.0, min(10.0, score))))


def predict_races(records, card_keys, weights, ev_threshold, bankroll, max_odds,
                  min_field=0):
    coef = weights["coef"]
    stats = {
        "jockey": weights.get("jockey_stats", {}),
        "trainer": weights.get("trainer_stats", {}),
        "sire": weights.get("sire_stats", {}),
        "damsire": weights.get("damsire_stats", {}),
        "sire_surface": weights.get("sire_surface_stats", {}),
        "damsire_surface": weights.get("damsire_surface_stats", {}),
        "trainer_surface": weights.get("trainer_surface_stats", {}),
        "global_wr": weights.get("global_win_rate", 0.08),
    }

    # レースごとにグルーピング
    by_race = {}
    for r in records:
        if r["race_key"] in card_keys:
            by_race.setdefault(r["race_key"], []).append(r)

    n_picks = 0
    pack_races = []
    for key in sorted(by_race.keys()):
        horses = [h for h in by_race[key] if h["odds"] and float(h["odds"]) > 1.0]
        if len(horses) < 6:
            print(f"\n■ {key}: オッズ入り6頭未満のためスキップ")
            continue
        if min_field and len(horses) < min_field:
            print(f"\n■ {key}: {len(horses)}頭 < 最低頭数{min_field} のため購入対象外")
            continue

        inv = [1.0 / float(h["odds"]) for h in horses]
        s = sum(inv)
        mkt = [v / s for v in inv]

        # canonical文字列をfeaturize用の型に変換
        def conv(h):
            out = dict(h)
            for k in ("num", "headcount", "age", "finish", "prev_finish",
                      "prev_headcount", "prev_days", "prev_distance",
                      "prev_corner4", "prev_corner1", "career_starts",
                      "jockey_change", "surface_switch", "weight", "distance",
                      "wk_has", "wk_n28"):
                v = out.get(k)
                out[k] = int(float(v)) if v not in ("", None) else None
            for k in ("impost", "odds", "prev_last3f", "prev_time_dev",
                      "career_top3", "avg_perf3", "best_tdev3",
                      "prev_beat_mkt", "track_fit", "muddy_fit", "avg_prize",
                      "prev_margin", "best_margin3", "prev_pci",
                      "class_change", "dist_fit", "season_fit",
                      "wk_best4", "wk_best1", "wk_self"):
                v = out.get(k)
                out[k] = float(v) if v not in ("", None) else None
            wc = out.get("weight_change")
            out["weight_change"] = int(float(wc)) if wc not in ("", None) else None
            return out

        hs = [conv(h) for h in horses]
        z = []
        for i, h in enumerate(hs):
            f = featurize_horse(h, mkt[i], stats)
            z.append(sum(fv * c for fv, c in zip(f, coef)))
        zm = max(z)
        e = [math.exp(v - zm) for v in z]
        zs = sum(e)
        probs = [v / zs for v in e]

        rows = []
        pack_horses = []
        for i, h in enumerate(hs):
            odds = h["odds"]
            ev = probs[i] * odds
            b = odds - 1
            kelly = max(0.0, (probs[i] * b - (1 - probs[i])) / b) * 0.25
            kelly = min(kelly, 0.05)
            rows.append((h["num"], h["name"], odds, mkt[i], probs[i], ev, kelly))
            pack_horses.append({
                "num": h["num"], "name": h.get("name", ""),
                "style": h.get("style_est") or "",
                "odds": odds, "market_prob": round(mkt[i], 4),
                "prob": round(float(probs[i]), 4), "ev": round(float(ev), 3),
                "kelly": round(float(kelly), 4),
                "wk_score": workout_score(h),
                "wk_best4": h.get("wk_best4"), "wk_best1": h.get("wk_best1"),
                "wk_n28": h.get("wk_n28"), "wk_self": h.get("wk_self"),
                "best_tdev3": h.get("best_tdev3"),
                "career_starts": h.get("career_starts"),
            })
        kp = key.split("_")
        pack_races.append({
            "race_key": key,
            "date": kp[0] if len(kp) == 5 else "",
            "track": kp[1] if len(kp) == 5 else "",
            "kai": kp[2] if len(kp) == 5 else "",
            "day_idx": kp[3] if len(kp) == 5 else "",
            "race_no": kp[4] if len(kp) == 5 else "",
            "horses": pack_horses,
        })
        rows.sort(key=lambda r: -r[5])

        print(f"\n■ {key}  ({len(rows)}頭)")
        print(f"  {'番':>3} {'馬名':<16} {'オッズ':>7} {'市場%':>6} {'モデル%':>7} {'EV':>6} {'推奨額':>8}")
        for num, name, odds, mp, p, ev, kelly in rows:
            # 購入条件: EV閾値超え かつ オッズ上限以内
            pick = ev >= ev_threshold and (not max_odds or odds <= max_odds)
            flag = "🔥" if pick else "  "
            note = ""
            if ev >= ev_threshold and max_odds and odds > max_odds:
                note = " (EV超えだがオッズ上限超のため見送り)"
            stake = int(kelly * bankroll / 100) * 100 if pick else 0
            stake_s = f"{stake}円" if stake else "—"
            print(f"{flag}{num:>3} {name:<16} {odds:>7.1f} {mp*100:>5.1f}% {p*100:>6.1f}% {ev:>6.2f} {stake_s:>8}{note}")
            if pick:
                n_picks += 1

    cond = f"EV{ev_threshold}以上" + (f"・オッズ{max_odds:.0f}倍以下" if max_odds else "")
    print(f"\n合計 {len(by_race)}レース / {cond}の購入候補 {n_picks}頭")
    print("注意: 確定オッズ学習バイアスのため、初期は表示推奨額の半額以下を推奨。")
    return pack_races


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("history_csv", help="過去データCSV(TARGET出力、直近まで含む)")
    ap.add_argument("card_csv", help="当日出馬表CSV(TARGET出力、直前オッズ入り)")
    ap.add_argument("--weights", default="model_weights.json")
    ap.add_argument("--ev", type=float, default=1.05, help="EV購入閾値(既定1.05)")
    ap.add_argument("--max-odds", type=float, default=30.0,
                    help="購入オッズ上限(既定30)。0で無制限")
    ap.add_argument("--workout", action="append", default=[],
                    help="調教CSV(学習時と同じものを指定): --workout ウッドC.csv --workout 坂路.csv")
    ap.add_argument("--json", default="",
                    help="解析パック(JSON)の出力先。サイトの「解析パック取込」で読み込むと"
                         "脚質・調教評価・モデル予測が自動反映される。例: --json pack.json")
    ap.add_argument("--min-field", type=int, default=0,
                    help="購入対象の最低頭数(既定0=無効)。バックテストでは10頭以下の"
                         "レースは市場が効率的で回収率が低い傾向(93.7%%)。紙上検証で"
                         "この傾向が確認できたら11を指定")
    ap.add_argument("--bankroll", type=int, default=100000, help="資金(円)")
    args = ap.parse_args()

    with open(args.weights, encoding="utf-8") as f:
        weights = json.load(f)
    if not weights.get("coef"):
        print("weightsが未学習です。先に train_model.py を実行してください。")
        sys.exit(1)
    if len(weights["coef"]) != len(FEATURE_NAMES):
        print(f"警告: weightsの特徴量数({len(weights['coef'])})が現行コード({len(FEATURE_NAMES)})と不一致。")
        print("モデルを再学習してください(特徴量セットが更新されています)。")
        sys.exit(1)

    print("履歴データ読み込み中…")
    rec_hist = ti.normalize(ti.open_csv(args.history_csv))
    print(f"  履歴: {len(rec_hist)}行")
    print("出馬表読み込み中…")
    rec_card = ti.normalize(ti.open_csv(args.card_csv))
    card_keys = {r["race_key"] for r in rec_card}
    print(f"  出馬表: {len(rec_card)}行 / {len(card_keys)}レース")

    # 履歴CSVに出馬表と同じレースが含まれる場合は履歴側を除外する
    # (二重計上すると1レース内の頭数が倍になり、確率・EVが半減して壊れる)
    overlap = sum(1 for r in rec_hist if r["race_key"] in card_keys)
    if overlap:
        print(f"  注意: 履歴CSVに出馬表と同一レースが{overlap}行 → 履歴側を除外して続行")
        rec_hist = [r for r in rec_hist if r["race_key"] not in card_keys]

    # 結合して履歴特徴量を構築(出馬表の馬に過去走が正しく紐付く)
    combined = rec_hist + rec_card
    ti.attach_history_features(combined)
    if args.workout:
        by_horse = ti.load_workout_csv(args.workout)
        ti.merge_workouts(combined, by_horse)

    max_odds = args.max_odds if args.max_odds and args.max_odds > 0 else None
    pack_races = predict_races(combined, card_keys, weights, args.ev, args.bankroll,
                               max_odds, args.min_field)
    if args.json:
        pack = {
            "kind": "kirisuite_analysis_pack",
            "version": 1,
            "generated": datetime.datetime.now().strftime("%Y-%m-%d %H:%M"),
            "ev_threshold": args.ev,
            "max_odds": max_odds,
            "races": pack_races,
        }
        with open(args.json, "w", encoding="utf-8") as f:
            json.dump(pack, f, ensure_ascii=False, indent=1)
        print(f"解析パックを保存: {args.json}")
        print("サイトのレース詳細ページ →「解析パック取込」でこのファイルを選択すると、")
        print("脚質・調教評価・モデル予測(メモ欄)が該当馬に自動反映されます。")


if __name__ == "__main__":
    main()
