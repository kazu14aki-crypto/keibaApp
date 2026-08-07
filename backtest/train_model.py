# -*- coding: utf-8 -*-
"""
train_model.py — 条件付きロジットモデルの学習(Benter方式)

モデル: P(馬iが勝つ) = exp(x_i·w) / Σ_j exp(x_j·w)   ※jはレース内全馬
  これは競馬確率モデルの世界標準(Bill Benterが香港で使った構造)。
  市場オッズを特徴量の一つとして含めるため、「モデルと市場のブレンド比」を
  手で決める必要がなく、データが最適な融合を自動学習する。

規律(株のバックテストと同じ):
  * ウォークフォワード: 学習期間と検証期間を厳密に分離。
  * 騎手成績などの集計特徴量は学習期間のみから計算(リーク防止)。
  * 判定基準は検証期間のlogLossが「市場のみ」を下回るか。

── 2026-07 改訂第2弾の要点 ──────────────────────────────────
(1) 特徴量を28→38に拡張(既存エクスポート列の活用。再エクスポート不要):
    sire/damsire       : 種牡馬・母父の縮小推定勝率(学習期間のみから算出)
    prev_margin        : 前走の勝ち馬との着差(秒)。着順より情報量が多い
    best_margin3       : 直近3走の最小着差(接戦経験=能力の証拠)
    prev_pci           : 前走の自身ペース指数
    hi_pace_front      : 前走ハイペースを先行して潰れた馬(展開不利の検出)
    class_change       : 昇級(+)/降級(-)。昇級初戦の過大人気を捉える
    is_west / away     : 関西馬効果と東西を跨ぐ遠征(輸送)の影響
    dist_fit           : 同距離カテゴリでの過去成績
(2) --walk-forward YEAR を追加(実運用判定の正式な方式)。
    YEARから最終年まで「その年より前の全データで学習→その年を予測」を
    毎年繰り返し、検証ベットを累積する。これは実運用(毎年再学習して
    その年を賭ける)の完全なシミュレーションであり、単一分割より
    検証ベット数が大幅に増えるため、判定基準B(ベット数≥900)を
    偶然でなく満たせるかを正しく測れる。
(3) EV帯別の較正テーブルを追加。
    EV1.1-1.2はプラスなのにEV1.2超がマイナス、のような非単調性は
    「モデルの自信過剰域」の存在を示す較正不良のサイン。帯別に
    可視化して監視する。
(4) 実運用判定を「オッズ上限付き戦略」でも実施。
    50倍超はサンプル希薄で運の支配が大きいため、実運用戦略の本命は
    EV閾値×オッズ上限の組み合わせになる。
(5) scipy利用時はL-BFGSで高速学習(無ければ勾配降下にフォールバック)。
──────────────────────────────────────────────────────────────

使い方:
  python train_model.py train_data.csv --walk-forward 2012          (推奨)
  python train_model.py train_data.csv --valid-from 2018
  python train_model.py train_data.csv --valid-from 2018 --half-life 8
  → model_weights.json を出力(サイト組込み用は frontend/src/lib/ へコピー)
"""

import argparse
import csv
import json
import math
import re
import sys
from collections import defaultdict

try:
    import numpy as np
except ImportError:
    print("pip install numpy を先に実行してください")
    sys.exit(1)

try:
    from scipy.optimize import minimize as _scipy_minimize
except ImportError:
    _scipy_minimize = None

FEATURE_NAMES = [
    "log_market",      # ln(市場勝率) — 最強の特徴量。係数1.0前後なら市場をほぼ信頼
    "impost",          # (斤量-56)/2
    "weight_change",   # 馬体重増減/10 (±20でクリップ)
    "prev_perf",       # 前走成績 1-2*(着順-1)/(頭数-1) ∈[-1,1]
    "rest_weeks",      # ln(中間日数/28) (±1.5クリップ)
    "age",             # (年齢-4)/2 (クリップ)
    "draw",            # 馬番の相対位置 ∈[-1,1]
    "dist_change",     # (距離-前走距離)/400 (符号付き。延長+/短縮-)
    "jockey",          # 騎手の縮小推定勝率差×8 (学習期間から算出)
    "prev_time_dev",   # 前走走破タイム偏差(秒、負=速い)を -符号で。速い馬ほど+
    "prev_last3f",     # 前走上がり3F。速い(小さい)ほど+になるよう変換
    "prev_corner4",    # 前走4角通過順の相対位置(前ほど+)。脚質/展開適性
    "weight_dev",      # 馬体重の標準(480kg)からの偏差/50
    "is_dirt",         # ダート=1, 芝=0 (レース内で共通のため主効果は相殺。交互作用の材料)
    "is_female",       # 牝=1 (性別主効果)
    "trainer",         # 調教師の縮小推定勝率差×8 (学習期間から算出)
    "no_history",      # 過去走なし(新馬・データ開始直後)=1
    "career_starts",   # 過去出走数(経験値)
    "career_top3",     # 複勝率(縮小推定)の0.3基準偏差
    "avg_perf3",       # 直近3走の相対着順スコア平均(近況)
    "best_tdev3",      # 直近3走の最速時計偏差(ピーク能力)。速いほど+
    "prev_beat_mkt",   # 前走で人気より好走した度合い(市場の見落とし検出)
    "jockey_change",   # 乗り替わり=1
    "surface_switch",  # 芝⇔ダート替わり=1
    "track_fit",       # 同競馬場での過去成績(コース巧者度)
    "muddy_fit",       # 道悪開催時の過去道悪成績(道悪巧者度)
    "avg_prize",       # 過去平均獲得賞金(クラスの代理変数)
    "draw_dirt",       # 枠×ダート交互作用(ダートは外枠有利傾向の学習用)
    # --- 2026-07追加(index 28〜37) ---
    "sire",            # 種牡馬の縮小推定勝率差×8 (学習期間から算出)
    "damsire",         # 母父の縮小推定勝率差×8 (学習期間から算出)
    "prev_margin",     # 前走の勝ち馬との着差。小さい(接戦)ほど+
    "best_margin3",    # 直近3走の最小着差。接戦経験があるほど+
    "prev_pci",        # 前走の自身PCI。(PCI-50)/10
    "hi_pace_front",   # 前走ハイペース先行の展開不利度(正=不利があった=今走妙味)
    "class_change",    # クラス変動。昇級+/降級- (係数は負が自然=昇級は不利)
    "is_west",         # 関西(栗東)所属=1
    "away",            # 東西を跨ぐ遠征=1 (輸送・環境変化の影響)
    "dist_fit",        # 同距離カテゴリでの過去成績
    "sire_surface",    # 種牡馬×馬場(芝/ダ別)の縮小推定勝率。実測で全fold安定(+0.10前後)
    "damsire_surface", # 母父×馬場の縮小推定勝率。実測で最強クラス(+0.16〜0.21)
    "trainer_surface", # 調教師×馬場の縮小推定勝率。実測で安定(+0.04〜0.065)
    # --- 調教(--workout指定時のみ値が入る。無ければ0=中立) ---
    "wk_has",          # 調教データあり=1
    "wk_best4",        # ベスト4F偏差。速いほど+
    "wk_best1",        # ベストラスト1F偏差。速いほど+ (実測で唯一弱い正の効き)
    "wk_n28",          # 乗り込み量
    "wk_self",         # 自己平常比。平常より速い=+ (調子の上向き)
]

# 1レースあたりの最低頭数。TARGETで「上位N頭のみ」出力した場合、この値を
# 一時的に下げれば読み込み自体は通るが、後述の通り市場確率が歪むため
# 分析結果は信頼できない。正攻法は全頭出力での再エクスポート。
MIN_RUNNERS = 6

# 東西の主要4場(遠征=away判定用)。札幌・函館は両所属が輸送するため対象外。
EAST_TRACKS = ("東京", "中山", "福島", "新潟")
WEST_TRACKS = ("中京", "京都", "阪神", "小倉")


def clip(v, lo, hi):
    return max(lo, min(hi, v))


def region_is_west(region):
    """所属地文字列 → 西(栗東/関西)ならTrue、東(美浦/関東)ならFalse、不明None。"""
    s = str(region or "").strip()
    if not s:
        return None
    if "栗" in s or "関西" in s or s == "西":
        return True
    if "美" in s or "関東" in s or s == "東":
        return False
    return None


def featurize_horse(h, market_p, stats):
    """1頭分の特徴量ベクトル。JS側(model.js)と完全に同一のロジックを保つこと。

    stats: {"jockey": {name:[rides,wins]}, "trainer": {...}, "sire": {...},
            "damsire": {...}, "global_wr": float}
    """
    jockey_stats = stats.get("jockey") or {}
    trainer_stats = stats.get("trainer") or {}
    sire_stats = stats.get("sire") or {}
    damsire_stats = stats.get("damsire") or {}
    global_wr = stats.get("global_wr") or 0.08

    f = [0.0] * len(FEATURE_NAMES)
    f[0] = math.log(max(market_p, 1e-6))
    f[1] = ((h.get("impost") or 56) - 56) / 2.0
    wc = h.get("weight_change")
    f[2] = clip(wc, -20, 20) / 10.0 if wc is not None else 0.0
    pf, ph = h.get("prev_finish"), h.get("prev_headcount")
    if pf and ph and ph > 1:
        f[3] = 1.0 - 2.0 * (pf - 1) / (ph - 1)
    pd = h.get("prev_days")
    if pd and pd > 0:
        f[4] = clip(math.log(pd / 28.0), -1.5, 1.5)
    age = h.get("age")
    if age:
        f[5] = clip((age - 4) / 2.0, -1.5, 2.0)
    n, hc = h.get("num") or 0, h.get("headcount") or 0
    if hc > 1:
        f[6] = (n - (hc + 1) / 2.0) / (hc / 2.0)
    dist, pdist = h.get("distance") or 0, h.get("prev_distance")
    if dist and pdist:
        f[7] = clip((dist - pdist) / 400.0, -2.0, 2.0)
    js = jockey_stats.get(h.get("jockey", ""))
    if js:
        rides, wins = js
        shrunk = (wins + 30 * global_wr) / (rides + 30)
        f[8] = (shrunk - global_wr) * 8.0
    ptd = h.get("prev_time_dev")
    if ptd is not None and ptd != "":
        f[9] = clip(-float(ptd), -3.0, 3.0)
    pl3 = h.get("prev_last3f")
    if pl3 and pl3 > 0:
        f[10] = clip((35.0 - pl3) / 2.0, -2.5, 2.5)
    pc4, pfhc = h.get("prev_corner4"), h.get("prev_headcount")
    if pc4 and pc4 > 0 and pfhc and pfhc > 1:
        f[11] = 1.0 - 2.0 * (pc4 - 1) / (pfhc - 1)
    wt = h.get("weight")
    if wt and wt > 0:
        f[12] = clip((wt - 480) / 50.0, -2.0, 2.0)
    f[13] = 1.0 if h.get("surface") == "ダート" else 0.0
    f[14] = 1.0 if h.get("sex") == "牝" else 0.0
    # 調教師(騎手と同じ縮小推定)
    ts = trainer_stats.get(h.get("trainer", ""))
    if ts:
        rides, wins = ts
        shrunk = (wins + 30 * global_wr) / (rides + 30)
        f[15] = (shrunk - global_wr) * 8.0
    # 履歴集約特徴量(target_import.pyが計算済みの値をスケーリング)
    cs = h.get("career_starts")
    f[16] = 1.0 if (cs is None or cs == "" or cs == 0) else 0.0   # 過去走なし
    if cs not in (None, "") and cs > 0:
        f[17] = clip((cs - 8) / 10.0, -0.8, 2.2)
    ct3 = h.get("career_top3")
    if ct3 not in (None, ""):
        f[18] = clip((float(ct3) - 0.3) * 2.0, -0.8, 1.4)
    ap3 = h.get("avg_perf3")
    if ap3 not in (None, ""):
        f[19] = clip(float(ap3), -1.0, 1.0)
    bt3 = h.get("best_tdev3")
    if bt3 not in (None, ""):
        f[20] = clip(-float(bt3), -3.0, 3.0)
    pbm = h.get("prev_beat_mkt")
    if pbm not in (None, ""):
        f[21] = clip(float(pbm) * 2.0, -1.5, 1.5)
    jc = h.get("jockey_change")
    if jc not in (None, ""):
        f[22] = float(jc)
    ss = h.get("surface_switch")
    if ss not in (None, ""):
        f[23] = float(ss)
    tf = h.get("track_fit")
    if tf not in (None, ""):
        f[24] = clip(float(tf), -1.0, 1.0)
    mf = h.get("muddy_fit")
    if mf not in (None, ""):
        f[25] = clip(float(mf), -1.0, 1.0)
    apz = h.get("avg_prize")
    if apz not in (None, "") and float(apz) >= 0:
        f[26] = clip((math.log(1 + float(apz)) - 3.0) / 2.0, -1.5, 2.0)
    f[27] = f[6] * f[13]   # 枠×ダート交互作用
    # --- 2026-07追加 ---
    # 種牡馬・母父(縮小推定。母集団が大きいので事前分布の重みを100走分に)
    sr = sire_stats.get(h.get("sire", ""))
    if sr:
        rides, wins = sr
        shrunk = (wins + 100 * global_wr) / (rides + 100)
        f[28] = (shrunk - global_wr) * 8.0
    ds = damsire_stats.get(h.get("damsire", ""))
    if ds:
        rides, wins = ds
        shrunk = (wins + 100 * global_wr) / (rides + 100)
        f[29] = (shrunk - global_wr) * 8.0
    # 前走着差: 勝てば1.0、0.5秒差なら0.5、3秒離されると-2.0
    pm = h.get("prev_margin")
    if pm not in (None, ""):
        f[30] = clip(1.0 - float(pm), -2.0, 1.0)
    bm3 = h.get("best_margin3")
    if bm3 not in (None, ""):
        f[31] = clip(1.0 - float(bm3), -2.0, 1.0)
    # 前走PCI: 50を中心に正規化(大=スロー上がり勝負、小=ハイペース消耗戦)
    ppci = h.get("prev_pci")
    pci_v = None
    if ppci not in (None, "") and float(ppci) > 0:
        pci_v = float(ppci)
        f[32] = clip((pci_v - 50.0) / 10.0, -2.0, 2.0)
    # 展開不利の検出: 前走ハイペース(PCI<48)を前で運んで(4角前目)潰れた馬。
    # 市場は着順を過大に嫌うため、こういう馬は次走過小評価されやすい。
    if pci_v is not None and pci_v < 48.0 and f[11] > 0:
        f[33] = min(1.5, f[11] * (48.0 - pci_v) / 10.0)
    cc = h.get("class_change")
    if cc not in (None, ""):
        f[34] = clip(float(cc) * 3.0, -1.5, 1.5)
    # 所属(関西=1)と遠征(東西を跨ぐ輸送)
    iw = region_is_west(h.get("region"))
    if iw is not None:
        f[35] = 1.0 if iw else 0.0
        trk = h.get("track", "") or ""
        if iw and any(t in trk for t in EAST_TRACKS):
            f[36] = 1.0
        elif (not iw) and any(t in trk for t in WEST_TRACKS):
            f[36] = 1.0
    df = h.get("dist_fit")
    if df not in (None, ""):
        f[37] = clip(float(df), -1.0, 1.0)
    # 血統×馬場適性(2026-07実測: 素の種牡馬勝率はほぼ無効果だが、芝/ダ別に
    # 分けると全foldで安定した係数を持つ=「血統の情報は馬場適性に宿る」)。
    # statsのキーは "名前|馬場" の文字列(JSON化のため。JS側と同一形式)
    surf = h.get("surface", "") or ""
    ss = (stats.get("sire_surface") or {}).get((h.get("sire", "") or "") + "|" + surf)
    if ss:
        rides, wins = ss
        shrunk = (wins + 60 * global_wr) / (rides + 60)
        f[38] = (shrunk - global_wr) * 8.0
    dss = (stats.get("damsire_surface") or {}).get((h.get("damsire", "") or "") + "|" + surf)
    if dss:
        rides, wins = dss
        shrunk = (wins + 60 * global_wr) / (rides + 60)
        f[39] = (shrunk - global_wr) * 8.0
    tss = (stats.get("trainer_surface") or {}).get((h.get("trainer", "") or "") + "|" + surf)
    if tss:
        rides, wins = tss
        shrunk = (wins + 40 * global_wr) / (rides + 40)
        f[40] = (shrunk - global_wr) * 8.0
    # 調教特徴量(target_import --workout で結合された値。無ければ0)
    if h.get("wk_has") in (1, 1.0, "1"):
        f[41] = 1.0
        wb4 = h.get("wk_best4")
        if wb4 not in (None, ""):
            f[42] = clip(-float(wb4) / 4.0, -3.0, 3.0)
        wb1 = h.get("wk_best1")
        if wb1 not in (None, ""):
            f[43] = clip(-float(wb1) / 1.0, -3.0, 3.0)
        wn = h.get("wk_n28")
        if wn not in (None, ""):
            f[44] = clip((float(wn) - 4.0) / 4.0, -1.0, 1.5)
        ws = h.get("wk_self")
        if ws not in (None, ""):
            f[45] = clip(-float(ws) / 3.0, -2.0, 2.0)
    return f


def load_canonical(path):
    races = defaultdict(list)
    with open(path, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            def num(k, cast=float):
                v = row.get(k, "")
                try:
                    return cast(float(v))
                except (ValueError, TypeError):
                    return None
            races[row["race_key"]].append({
                "date": row.get("date", ""),
                "track": row.get("track", ""),
                "num": num("num", int), "headcount": num("headcount", int),
                "age": num("age", int), "impost": num("impost"),
                "weight_change": num("weight_change", int),
                "odds": num("odds") or 0, "finish": num("finish", int),
                "horse_id": row.get("horse_id", ""),
                "jockey": row.get("jockey", ""),
                "trainer": row.get("trainer", ""),
                "sire": row.get("sire", ""),
                "damsire": row.get("damsire", ""),
                "region": row.get("region", ""),
                "distance": num("distance", int),
                "surface": row.get("surface", ""),
                "sex": row.get("sex", ""),
                "weight": num("weight", int),
                "prev_finish": num("prev_finish", int),
                "prev_headcount": num("prev_headcount", int),
                "prev_days": num("prev_days", int),
                "prev_distance": num("prev_distance", int),
                "prev_last3f": num("prev_last3f"),
                "prev_corner4": num("prev_corner4", int),
                "prev_corner1": num("prev_corner1", int),
                "prev_going": row.get("prev_going", ""),
                "going": row.get("going", ""),
                "prev_corner1": num("prev_corner1", int),
                "prev_going": row.get("prev_going", ""),
                "going": row.get("going", ""),
                "prev_time_dev": num("prev_time_dev"),
                "career_starts": num("career_starts", int),
                "career_top3": num("career_top3"),
                "avg_perf3": num("avg_perf3"),
                "best_tdev3": num("best_tdev3"),
                "prev_beat_mkt": num("prev_beat_mkt"),
                "jockey_change": num("jockey_change", int),
                "surface_switch": num("surface_switch", int),
                "track_fit": num("track_fit"),
                "muddy_fit": num("muddy_fit"),
                "avg_prize": num("avg_prize"),
                "prev_margin": num("prev_margin"),
                "best_margin3": num("best_margin3"),
                "prev_pci": num("prev_pci"),
                "class_change": num("class_change"),
                "dist_fit": num("dist_fit"),
                "season_fit": num("season_fit"),
                "wk_has": num("wk_has", int),
                "wk_best4": num("wk_best4"),
                "wk_best1": num("wk_best1"),
                "wk_n28": num("wk_n28", int),
                "wk_self": num("wk_self"),
            })
    out = []
    partial_field_count = 0
    for key, horses in races.items():
        valid = [h for h in horses if h["odds"] and h["odds"] > 1.0]
        if len(valid) < MIN_RUNNERS or len(valid) > 18:
            continue
        winners = [i for i, h in enumerate(valid) if h["finish"] == 1]
        if len(winners) != 1:
            continue  # 勝者0または複数=レースキー重複などのデータ異常
        nums = [h["num"] for h in valid]
        if len(set(nums)) != len(nums):
            continue  # 馬番重複=レース合体の兆候
        # 上位N頭抜粋の検出: headcount(実際の出走頭数)がCSV収録行数より
        # 明らかに多い場合、6着以下の馬がデータから欠落している=生存者バイアス。
        true_hc = max((h["headcount"] or 0) for h in valid)
        if true_hc and true_hc > len(valid) + 1:
            partial_field_count += 1
        out.append({"key": key, "date": valid[0]["date"], "horses": valid, "winner": winners[0]})
    out.sort(key=lambda r: r["date"])

    if out and partial_field_count / len(out) > 0.3:
        pct = partial_field_count / len(out) * 100
        print("=" * 68)
        print("!! 重大な警告: 「上位N頭抜粋」データが検出されました")
        print(f"   採用された{len(out)}レース中 {partial_field_count}件 ({pct:.0f}%) で、")
        print("   実際の出走頭数よりCSVの収録頭数が少なくなっています。")
        print()
        print("   これは統計的に致命的な生存者バイアスです。単勝オッズに基づく")
        print("   確率モデルは「そのレースの全出走馬」のオッズが揃わないと、")
        print("   市場勝率(1/オッズの正規化)が正しく計算できません。")
        print("   上位数頭だけでは「負けた弱い馬」がデータから消え、モデルは")
        print("   弱い馬を弱いと学習する機会を失い、logLoss・回収率が")
        print("   実際にはあり得ないほど良く見える結果を出します。")
        print()
        print("   対策: TARGETの出力設定で頭数制限を外し、全出走馬を")
        print("   再エクスポートしてください。それ以外に根本解決はありません。")
        print("=" * 68)

    # 新特徴量の充足チェック(旧形式CSVを検出したら再変換を促す)
    sample = out[: min(2000, len(out))]
    n_sire = sum(1 for r in sample for h in r["horses"] if h.get("sire"))
    if n_sire == 0:
        print("注意: このCSVに血統・着差等の新列がありません。新しいtarget_import.pyで")
        print("      再変換すると特徴量が38種にフル活用されます:")
        print("      python target_import.py 学習用データ.csv --out train_data.csv")

    return out


def year_of(r):
    m = re.match(r"(\d{4})", r["date"])
    return int(m.group(1)) if m else 0


def collect_stats(train_races):
    """騎手・調教師・種牡馬・母父の成績を学習期間のみから集計(リーク防止)。

    stats["_last_seen"] に名前ごとの最終活動年を記録する(weights保存時の
    軽量化用。学習・推論のロジックには影響しない)。
    """
    counters = {k: defaultdict(lambda: [0, 0]) for k in ("jockey", "trainer", "sire", "damsire")}
    last_seen = defaultdict(int)
    total = wins_total = 0
    for r in train_races:
        y = year_of(r)
        for i, h in enumerate(r["horses"]):
            won = 1 if i == r["winner"] else 0
            total += 1
            wins_total += won
            for key in ("jockey", "trainer", "sire", "damsire"):
                name = h.get(key, "")
                if name:
                    counters[key][name][0] += 1
                    counters[key][name][1] += won
                    if y > last_seen[name]:
                        last_seen[name] = y
    global_wr = wins_total / total if total else 0.08
    min_starts = {"jockey": 10, "trainer": 10, "sire": 30, "damsire": 30}
    stats = {"global_wr": global_wr}
    for key, c in counters.items():
        stats[key] = {k: v for k, v in c.items() if v[0] >= min_starts[key]}
    # 属性×馬場(キーは "名前|馬場" 文字列。JSON化とJSパリティのため)
    for src_key, out_key in (("sire", "sire_surface"), ("damsire", "damsire_surface"),
                             ("trainer", "trainer_surface")):
        c = defaultdict(lambda: [0, 0])
        for r in train_races:
            for i, h in enumerate(r["horses"]):
                name, surf = h.get(src_key, ""), h.get("surface", "")
                if name and surf:
                    k = name + "|" + surf
                    c[k][0] += 1
                    c[k][1] += 1 if i == r["winner"] else 0
        stats[out_key] = {k: v for k, v in c.items() if v[0] >= 30}
    return stats


def build_matrices(races, stats, half_life=0.0, ref_year=None):
    """レース群 → 頭数ごとにまとめた特徴量テンソル(ベクトル化学習用)。

    half_life>0 のとき、レース年が ref_year から離れるほど学習寄与を
    指数減衰させる(weight = 0.5 ** ((ref_year - year) / half_life))。
    株のEWMA(指数加重移動平均)と同じ発想: 市場構造は変化するので、
    直近の観測ほど重く、遠い過去ほど軽く扱う。
    """
    groups = defaultdict(lambda: {"X": [], "y": [], "w": []})
    for r in races:
        odds = [h["odds"] for h in r["horses"]]
        inv = [1.0 / o for o in odds]
        s = sum(inv)
        mkt = [v / s for v in inv]
        X = [featurize_horse(h, mkt[i], stats) for i, h in enumerate(r["horses"])]
        if half_life > 0 and ref_year:
            age_years = max(0, ref_year - year_of(r))
            sw = 0.5 ** (age_years / half_life)
        else:
            sw = 1.0
        g = groups[len(X)]
        g["X"].append(X)
        g["y"].append(r["winner"])
        g["w"].append(sw)
    return {n: (np.array(g["X"]), np.array(g["y"]), np.array(g["w"]))
            for n, g in groups.items()}


def nll_and_grad(w, groups, l2=0.05):
    """加重負対数尤度と勾配。

    正則化の重要な仕様: L2ペナルティは w[1:] のみに適用し、
    w[0](log_market係数)は正則化しない。市場係数は理論上1.0前後が
    自然な値であり、0方向へ縮小すると「市場が嫌った馬(大穴)の確率を
    系統的に持ち上げる」バイアスが生じ、EV判定が50倍超に偏る原因になる。
    """
    nll, grad, w_total = 0.0, np.zeros_like(w), 0.0
    for X, y, sw in groups.values():       # X: (R, H, D), sw: (R,)
        z = X @ w                          # (R, H)
        z -= z.max(axis=1, keepdims=True)
        p = np.exp(z)
        p /= p.sum(axis=1, keepdims=True)
        R = X.shape[0]
        nll += -(sw * np.log(p[np.arange(R), y] + 1e-12)).sum()
        resid = p.copy()
        resid[np.arange(R), y] -= 1.0      # (p - onehot)
        resid *= sw[:, None]               # レース重みを掛ける
        grad += np.einsum("rh,rhd->d", resid, X)
        w_total += sw.sum()
    reg = w.copy()
    reg[0] = 0.0                           # log_market係数は正則化対象外
    nll = nll / w_total + 0.5 * l2 * (reg @ reg)
    grad = grad / w_total + l2 * reg
    return nll, grad


def train(groups, iters=400, l2=0.05, quiet=False):
    w0 = np.zeros(len(FEATURE_NAMES))
    w0[0] = 1.0  # 市場を初期信頼
    if _scipy_minimize is not None:
        res = _scipy_minimize(lambda w: nll_and_grad(w, groups, l2), w0,
                              jac=True, method="L-BFGS-B",
                              options={"maxiter": iters})
        if not quiet and not res.success:
            print(f"  (L-BFGS収束警告: {res.message})")
        return res.x, float(res.fun)
    # フォールバック: 勾配降下
    w, lr, prev = w0, 0.5, float("inf")
    for it in range(iters):
        nll, grad = nll_and_grad(w, groups, l2=l2)
        if nll > prev:
            lr *= 0.5
        prev = nll
        w -= lr * grad
        if np.linalg.norm(grad) < 1e-5:
            break
    return w, prev


def eval_logloss(races, w, stats):
    model_ll = mkt_ll = 0.0
    per_horse = []  # (p_model, odds, won, date)
    for r in races:
        odds = [h["odds"] for h in r["horses"]]
        inv = [1.0 / o for o in odds]
        s = sum(inv)
        mkt = [v / s for v in inv]
        X = np.array([featurize_horse(h, mkt[i], stats)
                      for i, h in enumerate(r["horses"])])
        z = X @ w
        z -= z.max()
        p = np.exp(z)
        p /= p.sum()
        model_ll += -math.log(max(p[r["winner"]], 1e-12))
        mkt_ll += -math.log(max(mkt[r["winner"]], 1e-12))
        for i in range(len(p)):
            per_horse.append((p[i], odds[i], 1 if i == r["winner"] else 0, r["date"]))
    n = len(races)
    return (model_ll / n if n else 0), (mkt_ll / n if n else 0), per_horse


def simulate(per_horse, threshold, stake=100, max_odds=None):
    bets = hits = 0
    spent = ret = 0.0
    for p, o, won, _date in per_horse:
        if max_odds and o > max_odds:
            continue
        if p * o >= threshold:
            bets += 1
            spent += stake
            if won:
                hits += 1
                ret += stake * o
    return bets, hits, (ret / spent if spent else 0.0), ret - spent


def ev_band_report(per_horse, stake=100):
    """EV帯別の回収率(較正の単調性チェック)。

    正しく較正されたモデルなら、EVが高い帯ほど回収率も高くなるはず。
    「EV1.1-1.2はプラスなのにEV1.35超がマイナス」のような逆転は、
    モデルの自信過剰域(特徴量の外挿・極端値)の存在を示す。
    """
    bands = [(1.0, 1.1), (1.1, 1.2), (1.2, 1.35), (1.35, 99.0)]
    print("\n[EV帯別の較正チェック] 上の帯ほど回収率が高いのが理想(逆転=自信過剰域あり)")
    print(f"  {'EV帯':>12} {'ベット':>6} {'的中率':>8} {'回収率':>8}")
    for lo, hi in bands:
        bets = hits = 0
        spent = ret = 0.0
        for p, o, won, _d in per_horse:
            ev = p * o
            if lo <= ev < hi:
                bets += 1
                spent += stake
                if won:
                    hits += 1
                    ret += stake * o
        label = f"{lo}~{hi}" if hi < 99 else f"{lo}~"
        hr = hits / bets * 100 if bets else 0
        roi = ret / spent * 100 if spent else 0
        print(f"  {label:>12} {bets:6d} {hr:7.1f}% {roi:7.1f}%")


def breakdown_report(per_horse, threshold, stake=100):
    """EV閾値超えベットの年代別・オッズ帯別の内訳。

    目的: 見かけの高回収率が「昔の非効率な市場」や「特定オッズ帯の偶然」に
    集中していないかを検証する。実運用で再現できるのは直近年代の成績のみ。
    """
    def era_of(date):
        y = int(date[:4]) if date[:4].isdigit() else 0
        if y < 2000:
            return "1986-1999"
        if y < 2010:
            return "2000-2009"
        if y < 2018:
            return "2010-2017"
        return "2018-2026"

    def band_of(o):
        if o < 5:
            return "  ~5倍"
        if o < 10:
            return " 5~10倍"
        if o < 20:
            return "10~20倍"
        if o < 50:
            return "20~50倍"
        return "50倍~  "

    eras = defaultdict(lambda: [0, 0, 0.0, 0.0])   # bets, hits, spent, ret
    bands = defaultdict(lambda: [0, 0, 0.0, 0.0])
    for p, o, won, date in per_horse:
        if p * o >= threshold:
            for bucket in (eras[era_of(date)], bands[band_of(o)]):
                bucket[0] += 1
                bucket[2] += stake
                if won:
                    bucket[1] += 1
                    bucket[3] += stake * o

    print(f"\n[EV≥{threshold} ベットの内訳 — この閾値で実運用する前に必ず確認]")
    print("  <年代別> 直近年代がプラスでなければ実運用での再現性は疑わしい")
    print(f"  {'年代':>10} {'ベット':>6} {'的中率':>8} {'回収率':>8}")
    for era in sorted(eras):
        b, h, s, r = eras[era]
        print(f"  {era:>10} {b:6d} {h/b*100 if b else 0:7.1f}% {r/s*100 if s else 0:7.1f}%")
    print("  <オッズ帯別> 特定帯(特に50倍~)への偏りは較正不良のサイン")
    print(f"  {'オッズ帯':>10} {'ベット':>6} {'的中率':>8} {'回収率':>8}")
    for band in sorted(bands):
        b, h, s, r = bands[band]
        print(f"  {band:>10} {b:6d} {h/b*100 if b else 0:7.1f}% {r/s*100 if s else 0:7.1f}%")


def readiness_check(per_horse, threshold, recent_from=2018, stake=100, max_odds=None):
    """実運用判定(引き継ぎ資料の合格基準を機械的にチェック)。

    基準:
      A. 直近年代(recent_from以降)の回収率が100%超であること
      B. 直近年代のベット数が900以上であること
         (回収率110%を偶然と区別するのに必要なサンプル数の目安。
          単勝リターンのσ≒賭け金の3倍、という統計的性質に基づく)
      C. 50倍超の帯にベット数の50%超が集中していないこと(較正不良の兆候)
         ※オッズ上限付き戦略では上限により自動的に満たされる
    3つ全てPASSして初めて「実運用検討可」。1つでもFAILなら本番投入不可。
    """
    rec = [0, 0, 0.0, 0.0]      # bets, hits, spent, ret (直近年代)
    all_bets = long_bets = 0
    for p, o, won, date in per_horse:
        if max_odds and o > max_odds:
            continue
        if p * o < threshold:
            continue
        all_bets += 1
        if o >= 50:
            long_bets += 1
        y = int(date[:4]) if date[:4].isdigit() else 0
        if y >= recent_from:
            rec[0] += 1
            rec[2] += stake
            if won:
                rec[1] += 1
                rec[3] += stake * o
    roi_recent = rec[3] / rec[2] * 100 if rec[2] else 0.0
    long_share = long_bets / all_bets * 100 if all_bets else 0.0

    a = roi_recent > 100.0
    b = rec[0] >= 900
    c = long_share <= 50.0
    verdict = "実運用検討可(次はpredict_today.pyで少額紙上検証)" if (a and b and c) \
        else "実運用不可(本番投入・サイトデプロイは見送り)"

    strategy = f"EV≥{threshold}" + (f" & オッズ≤{max_odds:.0f}倍" if max_odds else "")
    print(f"\n[実運用判定 {strategy}] (直近={recent_from}年以降)")
    print(f"  A. 直近回収率 >100%   : {'PASS' if a else 'FAIL'} ({roi_recent:.1f}% / {rec[0]}ベット)")
    print(f"  B. 直近ベット数 ≥900  : {'PASS' if b else 'FAIL'} ({rec[0]}ベット)")
    print(f"  C. 50倍超集中 ≤50%    : {'PASS' if c else 'FAIL'} ({long_share:.1f}%)")
    print(f"  → 総合: {verdict}")
    return a and b and c


def split_races(races, mode, valid_from=None):
    """学習/検証データの分割。

    'chrono'     : 時系列で前75%学習・後25%検証(既定)。
    'alt-year'   : 偶数年学習/奇数年検証。係数解釈の参考用。
                   「昔の非効率な市場」の利益が検証成績を水増しするので、
                   実運用可否の判定には使わないこと。
    'valid-from' : --valid-from YEAR 指定時。YEAR未満で学習・YEAR以降で検証。
    ※実運用判定の正式な方式は --walk-forward (main参照)。
    """
    if valid_from:
        train_r = [r for r in races if year_of(r) < valid_from]
        test_r = [r for r in races if year_of(r) >= valid_from]
        if len(train_r) < 20 or len(test_r) < 20:
            print(f"--valid-from {valid_from} では学習/検証データが不足するため、時系列分割にフォールバックします。")
        else:
            return train_r, test_r, f"valid-from {valid_from}"
    if mode == "alt-year":
        train_r = [r for r in races if year_of(r) % 2 == 0]
        test_r = [r for r in races if year_of(r) % 2 == 1]
        if len(train_r) < 20 or len(test_r) < 20:
            print("隔年分割では学習/検証データが不足するため、時系列分割にフォールバックします。")
            mode = "chrono"
        else:
            train_r.sort(key=lambda r: r["date"])
            test_r.sort(key=lambda r: r["date"])
            return train_r, test_r, mode
    split = int(len(races) * 0.75)
    return races[:split], races[split:], "chrono"


def run_walk_forward(races, start_year, step, half_life, l2, iters):
    """毎年再学習ウォークフォワード — 実運用の完全なシミュレーション。

    「start_year以降の各年Yについて、Y未満の全データで学習し、Yを予測する」
    を繰り返す。これは実際の運用(毎年最新データで再学習して当年を賭ける)と
    同一の手順であり、単一分割と違って検証ベットが全期間から累積されるため、
    判定基準B(ベット数)を満たせるかを正しく測れる。株のローリング
    バックテストと同じ考え方。

    注意: 各折りたたみで騎手・種牡馬統計もその時点までのデータだけで
    再集計する(リーク防止を折りたたみ単位で厳守)。
    """
    last_year = max(year_of(r) for r in races)
    per_horse_all = []
    model_ll_sum = mkt_ll_sum = 0.0
    n_test_total = 0
    print(f"\n[ウォークフォワード検証] {start_year}〜{last_year}を{step}年刻みで毎回再学習")
    for y0 in range(start_year, last_year + 1, step):
        y1 = min(y0 + step - 1, last_year)
        train_r = [r for r in races if year_of(r) < y0]
        test_r = [r for r in races if y0 <= year_of(r) <= y1]
        if len(train_r) < 500 or not test_r:
            print(f"  {y0}-{y1}: データ不足のためスキップ")
            continue
        stats = collect_stats(train_r)
        ref_year = y0 - 1
        groups = build_matrices(train_r, stats, half_life=half_life, ref_year=ref_year)
        w, _ = train(groups, iters=iters, l2=l2, quiet=True)
        mll, kll, ph = eval_logloss(test_r, w, stats)
        n = len(test_r)
        model_ll_sum += mll * n
        mkt_ll_sum += kll * n
        n_test_total += n
        per_horse_all.extend(ph)
        edge = "✓" if mll < kll else "✗"
        print(f"  {y0}-{y1}: 学習{len(train_r):6d} 検証{n:5d}  "
              f"logLoss 市場{kll:.4f}/モデル{mll:.4f} {edge}  log_market={w[0]:+.3f}")
    if n_test_total == 0:
        print("ウォークフォワードで検証可能な折りたたみがありませんでした。")
        sys.exit(1)
    return per_horse_all, model_ll_sum / n_test_total, mkt_ll_sum / n_test_total


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("csv_path")
    ap.add_argument("--split", choices=["chrono", "alt-year"], default="chrono",
                    help="chrono: 時系列前後分割(既定) / alt-year: 偶数年学習・奇数年検証")
    ap.add_argument("--valid-from", type=int, default=None,
                    help="この年以降を検証専用にする単一分割(例: 2018)。指定時は--splitより優先")
    ap.add_argument("--walk-forward", type=int, default=None,
                    help="毎年再学習ウォークフォワードの開始年(例: 2012)。実運用判定の正式な方式。指定時は他の分割より優先")
    ap.add_argument("--wf-step", type=int, default=2,
                    help="ウォークフォワードの再学習間隔(年)。既定2(=2年ごとに再学習)。1にすると厳密だが時間がかかる")
    ap.add_argument("--half-life", type=float, default=0.0,
                    help="学習サンプルの指数減衰半減期(年)。例: 8 → 8年前のレースの学習寄与を半分にする。0で無効(既定)")
    ap.add_argument("--l2", type=float, default=0.05,
                    help="L2正則化強度(log_market係数には適用されない)。既定0.05")
    ap.add_argument("--max-odds", type=float, default=30.0,
                    help="オッズ上限付きEVシミュレーションの上限値(既定30)。0で非表示")
    ap.add_argument("--iters", type=int, default=400, help="最適化の最大反復回数")
    args = ap.parse_args()

    races = load_canonical(args.csv_path)
    if len(races) < 200:
        print(f"レース数{len(races)}件。統計的に安定した学習には最低1000件、推奨5000件以上。")
        if len(races) < 50:
            sys.exit(1)

    cap = args.max_odds if args.max_odds and args.max_odds > 0 else None

    # ================= ウォークフォワードモード(推奨) =================
    if args.walk_forward:
        per_horse, model_ll, mkt_ll = run_walk_forward(
            races, args.walk_forward, args.wf_step, args.half_life, args.l2, args.iters)

        print(f"\n[ウォークフォワード全期間のlogLoss]")
        print(f"  市場のみ : {mkt_ll:.4f}")
        verdict = "✓ 市場超え — エッジの可能性あり" if model_ll < mkt_ll else "✗ 市場に届かず — 特徴量追加が必要"
        print(f"  モデル   : {model_ll:.4f}   {verdict}")

        print(f"\n[単勝EV戦略シミュレーション(定額100円) — 全ウォークフォワード期間]")
        print(f"  {'EV閾値':>6} {'ベット':>6} {'的中率':>8} {'回収率':>8} {'損益':>10}")
        for th in (1.0, 1.1, 1.2, 1.3, 1.4):
            bets, hits, roi, pnl = simulate(per_horse, th)
            hr = hits / bets * 100 if bets else 0
            print(f"  {th:6.1f} {bets:6d} {hr:7.1f}% {roi*100:7.1f}% {pnl:10.0f}")
        if cap:
            print(f"\n[同・オッズ{cap:.0f}倍以下に限定した場合] (超大穴の偶然を除いた頑健性確認)")
            print(f"  {'EV閾値':>6} {'ベット':>6} {'的中率':>8} {'回収率':>8} {'損益':>10}")
            for th in (1.0, 1.1, 1.2, 1.3, 1.4):
                bets, hits, roi, pnl = simulate(per_horse, th, max_odds=cap)
                hr = hits / bets * 100 if bets else 0
                print(f"  {th:6.1f} {bets:6d} {hr:7.1f}% {roi*100:7.1f}% {pnl:10.0f}")

        ev_band_report(per_horse)
        breakdown_report(per_horse, 1.1)
        breakdown_report(per_horse, 1.2)

        results = [
            readiness_check(per_horse, 1.1),
            readiness_check(per_horse, 1.2),
        ]
        if cap:
            results.append(readiness_check(per_horse, 1.0, max_odds=cap))
            results.append(readiness_check(per_horse, 1.05, max_odds=cap))
            results.append(readiness_check(per_horse, 1.1, max_odds=cap))
        if not any(results):
            print("\n※ 全戦略FAILのため、model_weights.jsonのサイトデプロイは行わないこと。")

        # デプロイ用の最終重みは全データで学習(実運用は常に最新の全データで学習する)
        print("\n[最終重みの学習] 全データで学習してmodel_weights.jsonに保存します…")
        stats = collect_stats(races)
        ref_year = max(year_of(r) for r in races)
        groups = build_matrices(races, stats, half_life=args.half_life, ref_year=ref_year)
        w, _ = train(groups, iters=args.iters, l2=args.l2)
        print(f"\n[係数] (全データ学習。符号と大きさで各要因の効きを解釈)")
        for name, coef in zip(FEATURE_NAMES, w):
            print(f"  {name:14s}: {coef:+.4f}")
        used_mode = f"walk-forward {args.walk_forward} (step {args.wf_step})"
        train_period = f"{races[0]['date']}~{races[-1]['date']}"

    # ================= 単一分割モード =================
    else:
        train_races, test_races, used_mode = split_races(races, args.split, args.valid_from)
        print(f"総レース数: {len(races)}  (学習: {len(train_races)} / 検証: {len(test_races)})  分割方式: {used_mode}")
        if used_mode == "alt-year":
            train_years = sorted({r['date'][:4] for r in train_races})
            test_years = sorted({r['date'][:4] for r in test_races})
            print(f"  学習=偶数年 {len(train_years)}年分: {train_years[0]}〜{train_years[-1]}")
            print(f"  検証=奇数年 {len(test_years)}年分: {test_years[0]}〜{test_years[-1]}")
            print(f"  (注意: 時代混在のため回収率は水増しされる。実運用判定は--walk-forwardで)")
        else:
            print(f"  学習期間: {train_races[0]['date']} 〜 {train_races[-1]['date']}")
            print(f"  検証期間: {test_races[0]['date']} 〜 {test_races[-1]['date']}")
        if args.half_life > 0:
            print(f"  学習サンプル減衰: 半減期{args.half_life}年(直近ほど重視)")

        stats = collect_stats(train_races)
        print("\n学習中…")
        ref_year = max((year_of(r) for r in train_races), default=None)
        groups = build_matrices(train_races, stats, half_life=args.half_life, ref_year=ref_year)
        w, train_nll = train(groups, iters=args.iters, l2=args.l2)

        print(f"\n[係数] (符号と大きさで各要因の効きを解釈できます)")
        for name, coef in zip(FEATURE_NAMES, w):
            print(f"  {name:14s}: {coef:+.4f}")
        if w[0] < 0.95:
            print("  ※注意: log_market係数が0.95未満。モデルが市場を過度に割引いており、")
            print("    大穴の確率を持ち上げる較正不良の可能性。--l2を下げる/特徴量を見直すこと。")

        model_ll, mkt_ll, per_horse = eval_logloss(test_races, w, stats)
        print(f"\n[検証期間のlogLoss]")
        print(f"  市場のみ : {mkt_ll:.4f}")
        verdict = "✓ 市場超え — エッジの可能性あり" if model_ll < mkt_ll else "✗ 市場に届かず — 特徴量追加が必要"
        print(f"  モデル   : {model_ll:.4f}   {verdict}")

        print(f"\n[検証期間の単勝EV戦略シミュレーション(定額100円)]")
        print(f"  {'EV閾値':>6} {'ベット':>6} {'的中率':>8} {'回収率':>8} {'損益':>10}")
        for th in (1.0, 1.1, 1.2, 1.3, 1.4):
            bets, hits, roi, pnl = simulate(per_horse, th)
            hr = hits / bets * 100 if bets else 0
            print(f"  {th:6.1f} {bets:6d} {hr:7.1f}% {roi*100:7.1f}% {pnl:10.0f}")
        if cap:
            print(f"\n[同・オッズ{cap:.0f}倍以下に限定した場合] (超大穴の偶然を除いた頑健性確認)")
            print(f"  {'EV閾値':>6} {'ベット':>6} {'的中率':>8} {'回収率':>8} {'損益':>10}")
            for th in (1.0, 1.1, 1.2, 1.3, 1.4):
                bets, hits, roi, pnl = simulate(per_horse, th, max_odds=cap)
                hr = hits / bets * 100 if bets else 0
                print(f"  {th:6.1f} {bets:6d} {hr:7.1f}% {roi*100:7.1f}% {pnl:10.0f}")

        ev_band_report(per_horse)
        breakdown_report(per_horse, 1.1)
        breakdown_report(per_horse, 1.2)

        results = [
            readiness_check(per_horse, 1.1),
            readiness_check(per_horse, 1.2),
        ]
        if cap:
            results.append(readiness_check(per_horse, 1.0, max_odds=cap))
            results.append(readiness_check(per_horse, 1.05, max_odds=cap))
            results.append(readiness_check(per_horse, 1.1, max_odds=cap))
        if not any(results):
            print("\n※ 全戦略FAILのため、model_weights.jsonのサイトデプロイは行わないこと。")
        train_period = f"{train_races[0]['date']}~{train_races[-1]['date']}"

    def prune_stats(d, last_seen, cutoff_year):
        """直近に活動記録の無い名前の統計を除外(サイト配信用の軽量化)。

        キーが "名前|馬場" 形式(血統×馬場など)の場合は名前部分で判定する。
        推論時、引退済みの名前は出馬表に現れないため精度への影響はゼロ。
        """
        out = {}
        for k, v in d.items():
            name = k.split("|")[0] if "|" in k else k
            if last_seen.get(name, 0) >= cutoff_year:
                out[k] = v
        return out

    last_seen = stats.get("_last_seen", {})
    max_y = max(year_of(r) for r in races)
    cutoff = max_y - 3
    pruned = {}
    for key in ("jockey", "trainer", "sire", "damsire",
                "sire_surface", "damsire_surface", "trainer_surface"):
        full = stats.get(key, {})
        pruned[key] = prune_stats(full, last_seen, cutoff) if last_seen else full
    n_before = sum(len(stats.get(k, {})) for k in pruned)
    n_after = sum(len(v) for v in pruned.values())
    if n_before:
        print(f"weights軽量化: 統計エントリ {n_before} → {n_after} "
              f"({cutoff}年以降に活動記録の無い名前を除外)")

    # クラスコード→レベル対応表(target_import.pyが出力していれば同梱する。
    # ブラウザ側でクラス変動特徴量を再現するために必要)
    class_levels = {}
    try:
        with open("class_levels.json", encoding="utf-8") as f:
            class_levels = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        pass

    weights = {
        "feature_names": FEATURE_NAMES,
        "coef": [round(float(c), 6) for c in w],
        "jockey_stats": pruned["jockey"],
        "trainer_stats": pruned["trainer"],
        "sire_stats": pruned["sire"],
        "damsire_stats": pruned["damsire"],
        "sire_surface_stats": pruned["sire_surface"],
        "damsire_surface_stats": pruned["damsire_surface"],
        "trainer_surface_stats": pruned["trainer_surface"],
        "class_levels": class_levels,
        "global_win_rate": round(stats.get("global_wr", 0.08), 5),
        "train_races": len(races),
        "test_logloss_model": round(model_ll, 5),
        "test_logloss_market": round(mkt_ll, 5),
        "train_period": train_period,
        "split_mode": used_mode,
        "half_life": args.half_life,
        "l2": args.l2,
    }
    with open("model_weights.json", "w", encoding="utf-8") as f:
        json.dump(weights, f, ensure_ascii=False, indent=1)
    print(f"\n重みを保存: model_weights.json")
    print("サイト組込み: frontend/src/lib/model_weights.json に上書きコピー → デプロイ")
    print("注意: 確定オッズ学習のため実運用の回収率はシミュレーション値-5〜10%を想定。")
    print("      実運用判定がFAILの間はデプロイしないこと。")


if __name__ == "__main__":
    main()
