# -*- coding: utf-8 -*-
"""
odds_import.py — TARGET時系列オッズ(JD*.CSV)の一括解析ツール

TARGETの時系列オッズ出力(1レース1ファイル、例: JD03262611.CSV)をフォルダごと
読み込み、レースごとに「前日最終」「当日朝」「確定」の3時点の単勝オッズを抽出する。

ファイル形式(実物から解読済み):
  列: レースID, 区分, 月日時分, 頭数, 単勝票数, 複勝票数, 1単, 1複Lo, 1複Hi, 2単, ...
  レースID: YYYYMMDD + 場コード2桁 + 回2桁 + 日次2桁 + R2桁 (例: 2026071203020611
            = 2026/07/12 福島(03) 2回 6日目 11R) — レース情報はここに全て入っている
  区分: 1=5分刻みの途中経過 / 2=前日最終 / 3=締切直前 / 4=確定

使い方:
  1) 抽出: フォルダ内のJD*.CSVをまとめてスナップショット表に変換
     python odds_import.py parse オッズフォルダ --out odds_snapshots.csv

  2) ドリフト分析: 「前日→確定でオッズが縮んだ馬(=資金流入)は市場評価以上に
     走るか」を実測する。エッジの源泉として時系列オッズに投資する価値があるかの
     事前判定に使う。
     python odds_import.py analyze odds_snapshots.csv train_data.csv

分析の理屈(株のアナロジー):
  前日→直前の急なオッズ短縮は「誰かが大金を入れた」ことを意味し、内部情報
  (厩舎の仕上がり評価など)の代理指標になる。株で言えば「決算前の不自然な
  出来高増」。海外の研究では短縮馬の過剰パフォーマンスが繰り返し報告されており、
  JRAで同じ現象が確認できれば、時系列オッズの一括入手(JRDB等)に投資する
  根拠になる。
"""

import argparse
import csv
import glob
import math
import os
import sys
from collections import defaultdict

# JRA場コード → 場名 (レースIDのデコード用)
TRACK_CODES = {
    "01": "札幌", "02": "函館", "03": "福島", "04": "新潟", "05": "東京",
    "06": "中山", "07": "中京", "08": "京都", "09": "阪神", "10": "小倉",
}


def open_rows(path):
    for enc in ("cp932", "utf-8-sig", "utf-8"):
        try:
            with open(path, encoding=enc, newline="") as f:
                rows = list(csv.reader(f))
            if rows and any(rows[0]):
                return rows
        except (UnicodeDecodeError, LookupError):
            continue
    return None


def decode_race_id(rid):
    """レースID(16桁) → (date'YYYY-MM-DD', 場名, 回, 日次, R)。不正ならNone。"""
    rid = str(rid).strip()
    if len(rid) != 16 or not rid.isdigit():
        return None
    date = f"{rid[0:4]}-{rid[4:6]}-{rid[6:8]}"
    track = TRACK_CODES.get(rid[8:10])
    if not track:
        return None
    return date, track, int(rid[10:12]), int(rid[12:14]), int(rid[14:16])


def to_f(s):
    try:
        v = float(str(s).strip())
        return v if v > 0 else None
    except (ValueError, TypeError):
        return None


def parse_file(path):
    """1ファイル(1レース) → {"key":..., "horses": {num: {prev, morn, final, fLo, fHi}}}"""
    rows = open_rows(path)
    if not rows or len(rows) < 3:
        return None
    header = [h.strip() for h in rows[0]]
    if "レースID" not in header or "区分" not in header:
        return None
    i_rid = header.index("レースID")
    i_kubun = header.index("区分")
    i_time = header.index("月日時分")
    # 馬番ごとの列位置("1単","1複Lo","1複Hi",...)をヘッダーから解決
    win_cols, plo_cols, phi_cols = {}, {}, {}
    for i, h in enumerate(header):
        if h.endswith("単") and h[:-1].isdigit():
            win_cols[int(h[:-1])] = i
        elif h.endswith("複Lo") and h[:-2-1].isdigit():
            plo_cols[int(h[:-3])] = i
        elif h.endswith("複Hi") and h[:-3].isdigit():
            phi_cols[int(h[:-3])] = i
    body = rows[1:]
    dec = decode_race_id(body[0][i_rid])
    if not dec:
        return None
    date, track, kai, day_idx, race_no = dec
    race_day_md = date[5:7] + date[8:10]   # 'MMDD'

    row_prev = row_morn = row_final = None
    last_prevday = None
    for r in body:
        k = r[i_kubun].strip()
        t = r[i_time].strip()          # MMDDHHMM
        if len(t) != 8:
            continue
        md, hm = t[:4], t[4:]
        if k == "2":
            row_prev = r
        elif k == "4":
            row_final = r
        elif k == "3" and row_final is None:
            row_final = r
        if md < race_day_md:
            last_prevday = r
        if md == race_day_md and hm <= "0930":
            row_morn = r                # 当日9:30までの最新
    if row_prev is None:
        row_prev = last_prevday         # 区分2が無ければ前日最終の途中経過
    if row_final is None and body:
        row_final = body[-1]

    horses = {}
    for num, ci in win_cols.items():
        rec = {}
        for label, row in (("prev", row_prev), ("morn", row_morn), ("final", row_final)):
            rec[label] = to_f(row[ci]) if row is not None and ci < len(row) else None
        if row_final is not None:
            rec["fLo"] = to_f(row_final[plo_cols[num]]) if num in plo_cols else None
            rec["fHi"] = to_f(row_final[phi_cols[num]]) if num in phi_cols else None
        if any(rec.get(x) for x in ("prev", "morn", "final")):
            horses[num] = rec
    return {"date": date, "track": track, "kai": kai, "day_idx": day_idx,
            "race_no": race_no, "horses": horses}


def cmd_parse(folder, out):
    paths = sorted(glob.glob(os.path.join(folder, "*.CSV")) +
                   glob.glob(os.path.join(folder, "*.csv")))
    if not paths:
        print(f"{folder} にCSVが見つかりません")
        sys.exit(1)
    n_ok = 0
    with open(out, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["date", "track", "kai", "day_idx", "race_no", "num",
                    "odds_prev", "odds_morn", "odds_final", "fuku_lo", "fuku_hi"])
        for p in paths:
            try:
                race = parse_file(p)
            except Exception as e:
                print(f"  {os.path.basename(p)}: 解析失敗 ({e})")
                continue
            if not race:
                print(f"  {os.path.basename(p)}: 時系列オッズ形式ではないためスキップ")
                continue
            for num in sorted(race["horses"]):
                h = race["horses"][num]
                w.writerow([race["date"], race["track"], race["kai"],
                            race["day_idx"], race["race_no"], num,
                            h.get("prev") or "", h.get("morn") or "",
                            h.get("final") or "", h.get("fLo") or "", h.get("fHi") or ""])
            n_ok += 1
    print(f"抽出完了: {n_ok}レース → {out}")
    print(f"次: python odds_import.py analyze {out} train_data.csv")


def cmd_analyze(snap_csv, train_csv):
    """前日→確定のオッズドリフトと実際の成績の関係を実測する。"""
    # スナップショット読み込み (キー: date|track|kai|day|R|num)
    snaps = {}
    with open(snap_csv, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            try:
                key = (row["date"], row["track"], int(row["kai"]),
                       int(row["day_idx"]), int(row["race_no"]), int(row["num"]))
            except (ValueError, KeyError):
                continue
            snaps[key] = row
    print(f"オッズスナップショット: {len(snaps)}頭分")

    # レース結果と結合 (train_data.csvのrace_key = date_track_kai_day_raceNo)
    joined = []
    with open(train_csv, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            rk = row.get("race_key", "").split("_")
            if len(rk) != 5:
                continue
            try:
                key = (rk[0], rk[1], int(rk[2] or 0), int(rk[3] or 0),
                       int(rk[4] or 0), int(float(row["num"])))
            except (ValueError, TypeError):
                continue
            s = snaps.get(key)
            if not s:
                continue
            prev, final = s.get("odds_prev"), s.get("odds_final")
            if not prev or not final:
                continue
            fin = row.get("finish", "")
            if not str(fin).strip().replace(".0", "").isdigit():
                continue
            joined.append({
                "prev": float(prev), "final": float(final),
                "won": 1 if int(float(fin)) == 1 else 0,
            })
    print(f"レース結果との結合: {len(joined)}頭")
    if len(joined) < 200:
        print("結合数が少なすぎます(最低200頭、推奨2000頭以上)。")
        print("時系列オッズの出力レース数を増やすか、train_data.csvに該当レースが")
        print("含まれているか(最新開催まで再エクスポート済みか)を確認してください。")
        if not joined:
            return

    # ドリフト = ln(確定/前日)。負 = オッズ短縮 = 資金流入
    for r in joined:
        r["drift"] = math.log(r["final"] / r["prev"])
    joined.sort(key=lambda r: r["drift"])
    n = len(joined)
    print("\n[オッズドリフト5分位別の成績] (ドリフト=ln(確定/前日)。負=短縮=資金流入)")
    print(f"  {'分位':<12} {'頭数':>6} {'平均ドリフト':>8} {'的中率':>7} {'回収率':>7}")
    for q in range(5):
        seg = joined[q * n // 5:(q + 1) * n // 5]
        if not seg:
            continue
        bets = len(seg)
        hits = sum(r["won"] for r in seg)
        ret = sum(r["final"] * 100 for r in seg if r["won"])
        d = sum(r["drift"] for r in seg) / bets
        label = ["大幅短縮", "短縮", "中立", "伸び", "大幅伸び"][q]
        print(f"  Q{q+1} {label:<8} {bets:6d} {d:+8.2f} {hits/bets*100:6.1f}% "
              f"{ret/(bets*100)*100:6.1f}%")
    print("\n判定の目安: Q1(大幅短縮)の回収率がQ5(大幅伸び)を明確に上回っていれば、")
    print("「資金流入シグナル」がJRAでも機能している証拠。時系列オッズの一括入手")
    print("(JRDB購読 or JV-Link自作取得)に投資する価値がある。差がなければ、")
    print("市場は前日時点で既に効率的であり、この方向は打ち止めにする。")


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    p1 = sub.add_parser("parse", help="JD*.CSVフォルダ → スナップショット表")
    p1.add_argument("folder", help="時系列オッズCSVが入ったフォルダ")
    p1.add_argument("--out", default="odds_snapshots.csv")
    p2 = sub.add_parser("analyze", help="ドリフトと成績の関係を実測")
    p2.add_argument("snapshots", help="parseで作ったodds_snapshots.csv")
    p2.add_argument("train_data", help="target_import.pyで作ったtrain_data.csv")
    args = ap.parse_args()
    if args.cmd == "parse":
        cmd_parse(args.folder, args.out)
    else:
        cmd_analyze(args.snapshots, args.train_data)


if __name__ == "__main__":
    main()
