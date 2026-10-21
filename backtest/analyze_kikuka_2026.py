# -*- coding: utf-8 -*-
"""2026年菊花賞の出走予定馬と過去菊花賞をローカルTARGETデータで分析する。"""

from __future__ import annotations

import argparse
import csv
import math
from collections import defaultdict
from datetime import date, datetime
from pathlib import Path


RUNNERS = [
    "アウダーシア", "アスクエジンバラ", "エムズビギン", "キンググローリー",
    "コンジェスタス", "ゴーイントゥスカイ", "サノノグレーター", "ショウナンガルフ",
    "ショウナンハヤナミ", "シートゥサミット", "ジャスティンシカゴ", "ダノンヒストリー",
    "チャリングクロス", "ナリタエスペランサ", "バステール", "マジョレルブルー",
    "ラージアンサンブル", "ロブチェン",
]

PREDICTION = [
    {"mark": "◎", "name": "ロブチェン", "reason": "皐月賞・日本ダービー・神戸新聞杯を制し、位置取りと長い脚の両方を使える。父ワールドプレミアで京都3000mの血統背景も明確。"},
    {"mark": "○", "name": "ジャスティンシカゴ", "reason": "稍重のセントライト記念を好位から完勝。7戦で前走G2勝ちという過去の勝ち馬像に合う。2400m以上未経験が課題。"},
    {"mark": "▲", "name": "ダノンヒストリー", "reason": "2600mを2戦2勝、着差2.3秒と1.3秒でスタミナ性能は最上位。2勝クラスからG1への急上昇だけが大きな不確実性。"},
    {"mark": "☆", "name": "シートゥサミット", "reason": "2400mを4戦して全て3着以内。神戸新聞杯で向正面から動いて3着に粘り、菊花賞のロングスパート適性を示した。"},
    {"mark": "△", "name": "バステール", "reason": "日本ダービー3着の能力は高い。セントライト記念13着からの反転が必要で、軸より相手候補。"},
    {"mark": "△", "name": "ゴーイントゥスカイ", "reason": "青葉賞1着、日本ダービー4着。末脚は上位だが、3000mで後方一辺倒になる展開リスクがある。"},
    {"mark": "△", "name": "アウダーシア", "reason": "セントライト記念3着で前走好走条件を満たす。2400mの日本ダービー11着から距離延長への確信は弱い。"},
    {"mark": "穴", "name": "キンググローリー", "reason": "2500mを逃げ切り、2600mも2着。格では劣るが、残り1000mから持続戦になれば粘り込み余地がある。"},
]

G1_WORDS = ("皐月賞", "東京優駿", "ホープフル")
G2_WORDS = ("神戸新聞杯", "セントライト", "青葉賞", "京都新聞杯", "弥生", "スプリング")
G3_WORDS = ("ラジオＮＩＫＫＥＩ", "ラジオNIKKEI", "きさらぎ", "共同通信")


def number(value, default=None):
    try:
        text = str(value).strip().replace(",", "")
        return float(text) if text else default
    except (TypeError, ValueError):
        return default


def integer(value, default=None):
    parsed = number(value, default)
    return int(parsed) if parsed is not None else default


def make_date(row):
    year = integer(row.get("年"), 0)
    year = 2000 + year if year < 80 else 1900 + year
    return f"{year:04d}-{integer(row.get('月'), 0):02d}-{integer(row.get('日'), 0):02d}"


def race_key(row):
    return (row["date"], row["track"], row["race_no"], row["race_name"])


def normalize_raw(row):
    return {
        "date": make_date(row),
        "track": row.get("場所", "").strip(),
        "race_no": row.get("レース番号", "").strip(),
        "race_name": row.get("レース名", "").strip(),
        "class_code": row.get("クラスコード", "").strip(),
        "surface": row.get("芝・ダ", "").strip(),
        "distance": integer(row.get("距離")),
        "going": row.get("馬場状態", "").strip(),
        "headcount": integer(row.get("頭数")),
        "num": integer(row.get("馬番")),
        "name": row.get("馬名", "").strip(),
        "horse_id": row.get("血統登録番号", "").strip(),
        "jockey": row.get("騎手名", "").strip(),
        "impost": number(row.get("斤量")),
        "finish": integer(row.get("確定着順")),
        "popularity": integer(row.get("人気順")),
        "odds": number(row.get("単勝オッズ")),
        "run_time": number(row.get("走破タイム")),
        "last3f": number(row.get("上がり3Fタイム")),
        "corner1": integer(row.get("通過順1")),
        "corner2": integer(row.get("通過順2")),
        "corner3": integer(row.get("通過順3")),
        "corner4": integer(row.get("通過順4")),
        "weight": integer(row.get("馬体重")),
        "margin": number(row.get("着差タイム")),
        "pci": number(row.get("PCI")),
        "source": "local_TARGET",
    }


def load_local(path):
    runner_rows = []
    kikuka_rows = []
    coverage_min = None
    coverage_max = None
    with path.open(encoding="cp932", newline="") as handle:
        for raw in csv.DictReader(handle):
            row = normalize_raw(raw)
            coverage_min = min(coverage_min or row["date"], row["date"])
            coverage_max = max(coverage_max or row["date"], row["date"])
            if row["name"] in RUNNERS:
                runner_rows.append(row)
            if "菊花賞" in row["race_name"] and row["surface"] == "芝" and row["distance"] == 3000:
                kikuka_rows.append(row)
    # 馬名は数十年後に再使用されるため、最新世代の血統登録番号だけを採用する。
    latest_ids = {}
    for row in runner_rows:
        current = latest_ids.get(row["name"])
        if current is None or row["date"] > current[0]:
            latest_ids[row["name"]] = (row["date"], row["horse_id"])
    runner_rows = [
        row for row in runner_rows
        if row["horse_id"] and row["horse_id"] == latest_ids[row["name"]][1]
    ]
    target_races = {race_key(row) for row in runner_rows}
    all_target_race_rows = []
    with path.open(encoding="cp932", newline="") as handle:
        for raw in csv.DictReader(handle):
            row = normalize_raw(raw)
            if race_key(row) in target_races:
                all_target_race_rows.append(row)
    return runner_rows, all_target_race_rows, kikuka_rows, coverage_min, coverage_max


def load_recent_fields(path):
    rows = []
    with path.open(encoding="utf-8-sig", newline="") as handle:
        for raw in csv.DictReader(handle):
            row = {key: value.strip() for key, value in raw.items()}
            for key in ("distance", "headcount", "finish", "num", "popularity", "corner1", "corner2", "corner3", "corner4", "weight"):
                row[key] = integer(row.get(key))
            for key in ("impost", "odds", "run_time", "last3f"):
                row[key] = number(row.get(key))
            row["class_code"] = ""
            row["source"] = "web_result"
            row["source_url"] = ""
            row["margin"] = None
            row["pci"] = None
            rows.append(row)
    return rows


def load_supplement(path):
    rows = []
    with path.open(encoding="utf-8-sig", newline="") as handle:
        for raw in csv.DictReader(handle):
            row = {key: value.strip() for key, value in raw.items()}
            for key in ("distance", "headcount", "num", "finish", "popularity", "corner1", "corner2", "corner3", "corner4", "weight"):
                row[key] = integer(row.get(key))
            for key in ("impost", "odds", "run_time", "last3f", "margin"):
                row[key] = number(row.get(key))
            row["class_code"] = ""
            row["horse_id"] = ""
            row["pci"] = None
            row["source"] = "web_supplement"
            rows.append(row)
    return rows


def grade_weight(name):
    if any(word in name for word in G1_WORDS):
        return 1.55
    if any(word in name for word in G2_WORDS):
        return 1.30
    if any(word in name for word in G3_WORDS):
        return 1.15
    if "S" in name or "ステークス" in name or "特別" in name:
        return 1.00
    return 0.85


def class_ceiling(row):
    """相手水準を0〜1で表す。下級条件の勝利をG1好走と同列にしない。"""
    name = row["race_name"]
    performance = field_score(row)
    if any(word in name for word in G1_WORDS):
        tier = 1.00
    elif any(word in name for word in G2_WORDS):
        tier = 0.88
    elif any(word in name for word in G3_WORDS):
        tier = 0.78
    elif "S" in name or "ステークス" in name:
        tier = 0.68
    elif "特別" in name:
        tier = 0.58
    else:
        tier = 0.48
    return performance * tier


def field_score(row):
    finish, headcount = row.get("finish"), row.get("headcount")
    if not finish or not headcount or headcount < 2:
        return 0.0
    base = (headcount - finish) / (headcount - 1)
    margin = row.get("margin")
    bonus = 0.0
    if margin is not None and margin < 0:
        bonus = min(0.15, -margin * 0.05)
    return min(1.0, max(0.0, base + bonus))


def mean(values):
    values = [value for value in values if value is not None]
    return sum(values) / len(values) if values else 0.0


def rank_value(value, values):
    if value is None:
        return None
    ordered = sorted(item for item in values if item is not None)
    return ordered.index(value) + 1


def enrich_race_fields(rows):
    grouped = defaultdict(list)
    for row in rows:
        grouped[race_key(row)].append(row)
    enriched = []
    comparisons = []
    for key, field in sorted(grouped.items()):
        target_names = sorted({row["name"] for row in field if row["name"] in RUNNERS})
        if not target_names:
            continue
        times = [row.get("run_time") for row in field]
        last3fs = [row.get("last3f") for row in field]
        winner_time = min((value for value in times if value is not None), default=None)
        best_last3f = min((value for value in last3fs if value is not None), default=None)
        winner = min(field, key=lambda row: row.get("finish") or 999)
        fastest = min(field, key=lambda row: row.get("last3f") if row.get("last3f") is not None else 999)
        for source_row in field:
            row = dict(source_row)
            row["target_flag"] = 1 if row["name"] in RUNNERS else 0
            row["target_names_in_race"] = "、".join(target_names)
            row["time_behind_winner"] = (
                round(row["run_time"] - winner_time, 1)
                if row.get("run_time") is not None and winner_time is not None else None
            )
            row["last3f_diff_to_best"] = (
                round(row["last3f"] - best_last3f, 1)
                if row.get("last3f") is not None and best_last3f is not None else None
            )
            row["field_time_rank"] = rank_value(row.get("run_time"), times)
            row["field_last3f_rank"] = rank_value(row.get("last3f"), last3fs)
            row["finish_percentile"] = round(field_score(row), 4)
            enriched.append(row)
        reported = max((row.get("headcount") or 0 for row in field), default=0)
        if len(field) == reported:
            coverage = "完全"
        elif reported - len(field) == 1:
            coverage = "完全（取消除く）"
        else:
            coverage = "要確認"
        comparisons.append({
            "date": key[0], "track": key[1], "race_no": key[2], "race_name": key[3],
            "surface": winner.get("surface"), "distance": winner.get("distance"),
            "going": winner.get("going"), "field_rows": len(field),
            "reported_headcount": reported, "coverage_status": coverage,
            "target_count": len(target_names), "target_names": "、".join(target_names),
            "winner": winner.get("name"), "winner_time": winner_time,
            "fastest_last3f_horse": fastest.get("name"), "best_last3f": best_last3f,
            "avg_last3f": round(mean(last3fs), 2),
            "source": winner.get("source"), "source_url": winner.get("source_url", ""),
        })
    enriched.sort(key=lambda row: (row["date"], row["track"], integer(row["race_no"], 0), row.get("finish") or 999))
    return enriched, comparisons


def pct(count, total):
    return count / total if total else 0.0


def summarize_runners(history):
    grouped = defaultdict(list)
    for row in history:
        grouped[row["name"]].append(row)
    summaries = []
    for name in RUNNERS:
        rows = sorted(grouped[name], key=lambda item: item["date"])
        turf = [row for row in rows if row["surface"] == "芝"]
        long = [row for row in turf if (row["distance"] or 0) >= 2200]
        very_long = [row for row in turf if (row["distance"] or 0) >= 2400]
        recent = rows[-3:]
        class_scores = sorted((class_ceiling(row) for row in rows), reverse=True)[:2]
        career_top3 = pct(sum((row["finish"] or 99) <= 3 for row in turf), len(turf))
        long_top3 = pct(sum((row["finish"] or 99) <= 3 for row in long), len(long))
        very_long_top3 = pct(sum((row["finish"] or 99) <= 3 for row in very_long), len(very_long))
        recent_score = mean([field_score(row) for row in recent])
        class_score = mean(class_scores) if class_scores else 0.0
        distance_experience = min(1.0, len(long) / 3.0)
        composite = 100 * (
            0.50 * class_score
            + 0.15 * recent_score
            + 0.12 * long_top3
            + 0.08 * very_long_top3
            + 0.08 * career_top3
            + 0.07 * distance_experience
        )
        summaries.append({
            "name": name,
            "starts": len(rows),
            "wins": sum(row["finish"] == 1 for row in rows),
            "top3_rate": round(career_top3, 4),
            "max_distance": max((row["distance"] or 0 for row in rows), default=0),
            "starts_2200_plus": len(long),
            "top3_rate_2200_plus": round(long_top3, 4),
            "starts_2400_plus": len(very_long),
            "top3_rate_2400_plus": round(very_long_top3, 4),
            "recent3_score": round(recent_score, 4),
            "class_score": round(class_score, 4),
            "composite_score": round(composite, 2),
            "latest_date": rows[-1]["date"] if rows else "",
            "latest_race": rows[-1]["race_name"] if rows else "",
            "latest_finish": rows[-1]["finish"] if rows else None,
        })
    return sorted(summaries, key=lambda item: item["composite_score"], reverse=True)


def summarize_kikuka(rows, race_laps):
    grouped = defaultdict(list)
    for row in rows:
        grouped[row["date"]].append(row)
    laps_by_year = {integer(row["year"]): row for row in race_laps}
    output = []
    for race_date, field in sorted(grouped.items()):
        winner = min(field, key=lambda row: row["finish"] or 99)
        top3 = [row for row in field if (row["finish"] or 99) <= 3]
        year = integer(race_date[:4])
        lap = laps_by_year.get(year, {})
        output.append({
            "year": year,
            "date": race_date,
            "track": winner["track"],
            "going": winner["going"],
            "field_size": len(field),
            "winner": winner["name"],
            "winner_time": winner["run_time"],
            "winner_last3f": winner["last3f"],
            "winner_corner4": winner["corner4"],
            "top3_avg_corner4": round(mean([row["corner4"] for row in top3]), 2),
            "top3_avg_last3f": round(mean([row["last3f"] for row in top3]), 2),
            "lap_first1000": lap.get("first1000"),
            "lap_middle1000": lap.get("middle1000"),
            "lap_last1000": lap.get("last1000"),
            "lap_last3f": lap.get("last3f"),
        })
    return output


def load_laps(path):
    rows = []
    with path.open(encoding="utf-8-sig", newline="") as handle:
        for raw in csv.DictReader(handle):
            laps = [float(value) for value in raw["lap_200m"].split("-")]
            if len(laps) != 15:
                raise ValueError(f"{raw['year']}年の200mラップが15区間ではありません")
            if abs(sum(laps) - float(raw["winner_time"])) > 0.15:
                raise ValueError(f"{raw['year']}年のラップ合計と勝ち時計が不一致です")
            raw["first1000"] = round(sum(laps[:5]), 1)
            raw["middle1000"] = round(sum(laps[5:10]), 1)
            raw["last1000"] = round(sum(laps[10:]), 1)
            raw["last3f"] = round(sum(laps[-3:]), 1)
            rows.append(raw)
    return rows


def write_csv(path, rows, fields=None):
    path.parent.mkdir(parents=True, exist_ok=True)
    if not rows:
        return
    fields = fields or list(rows[0].keys())
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def write_summary(path, coverage_min, coverage_max, history, ranking, kikuka_summary, laps):
    top = ranking[:8]
    kyoto = [row for row in kikuka_summary if row["track"] == "京都" and row["year"] >= 2016]
    lines = [
        "# 2026年 菊花賞データ分析",
        "",
        "## データ範囲",
        "",
        f"- ローカルTARGETデータ: {coverage_min}〜{coverage_max}",
        f"- 出走想定18頭の全履歴: {len(history)}走（ローカル＋2026年7月6日以降の補完）",
        f"- 過去菊花賞: {len(kikuka_summary)}年分・{sum(row['field_size'] for row in kikuka_summary)}頭",
        "- 個別ラップは走破タイム、上がり3F、通過順、PCI。200m刻みはJRA公式の過去10年レースラップを別表化。",
        "",
        "## 機械集計順位（オッズ・枠順・当日馬場を未使用）",
        "",
        "| 順位 | 馬名 | 総合 | 戦績 | 2200m以上複勝率 | 2400m以上複勝率 | 直近3走指数 |",
        "|---:|---|---:|---:|---:|---:|---:|",
    ]
    for idx, row in enumerate(top, 1):
        lines.append(
            f"| {idx} | {row['name']} | {row['composite_score']:.2f} | "
            f"{row['wins']}-{row['starts'] - row['wins']} | {row['top3_rate_2200_plus']:.1%} | "
            f"{row['top3_rate_2400_plus']:.1%} | {row['recent3_score']:.3f} |"
        )
    if kyoto:
        lines += [
            "",
            "## 京都施行の過去菊花賞（2016年以降）",
            "",
            f"- 勝ち時計中央値: {sorted(row['winner_time'] for row in kyoto)[len(kyoto)//2]:.1f}秒",
            f"- 3着以内馬の4角位置平均: {mean([row['top3_avg_corner4'] for row in kyoto]):.1f}番手",
            f"- レース上がり3F平均: {mean([number(row['lap_last3f']) for row in kyoto]):.1f}秒",
            "- 2017年の不良馬場は外れ値。良〜稍重では中盤で息を入れ、残り1000mから長く加速する年が多い。",
        ]
    lines += [
        "",
        "## 暫定予想（枠順・当日オッズ確定前）",
        "",
        "| 印 | 馬名 | 評価理由 |",
        "|---|---|---|",
    ]
    for item in PREDICTION:
        lines.append(f"| {item['mark']} | {item['name']} | {item['reason']} |")
    lines += [
        "",
        "想定はキンググローリー、ナリタエスペランサ、ジャスティンシカゴが前を取り、極端なハイペースにはならない形。京都施行の近年は中盤で緩んだ後に残り1000mが速くなるため、折り合いと早めに動ける持続力を重視した。",
        "",
        "土曜の降雨予報が残るため、日曜が曇りでも稍重寄りまで想定する。道悪が長引けばダノンヒストリー、ジャスティンシカゴ、シートゥサミットを上げ、瞬発力だけに寄る馬を下げる。",
    ]
    lines += [
        "",
        "## 解釈上の注意",
        "",
        "- 総合点は過去成績の整理用で、未来の的中率を保証しない。",
        "- 3000mは全馬未経験。2400〜2600m実績、G1/G2水準、直近内容を組み合わせて評価した。",
        "- 最終判断は枠順、当日馬場、気配、オッズを受けて更新する。",
    ]
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", default="backtest/input.csv")
    parser.add_argument("--supplement", default="backtest/kikuka_2026_supplement.csv")
    parser.add_argument("--recent-fields", default="backtest/kikuka_2026_recent_fields.csv")
    parser.add_argument("--laps", default="backtest/kikuka_race_laps.csv")
    parser.add_argument("--out", default="backtest/reports/kikuka_2026_2026-10-22")
    args = parser.parse_args()

    runner_rows, local_field_rows, kikuka_rows, coverage_min, coverage_max = load_local(Path(args.input))
    recent_field_rows = load_recent_fields(Path(args.recent_fields))
    supplement = load_supplement(Path(args.supplement))
    history = sorted(runner_rows + supplement, key=lambda row: (row["name"], row["date"]))
    all_participants, race_comparison = enrich_race_fields(local_field_rows + recent_field_rows)
    laps = load_laps(Path(args.laps))
    ranking = summarize_runners(history)
    kikuka_summary = summarize_kikuka(kikuka_rows, laps)
    out = Path(args.out)
    write_csv(out / "runner_history.csv", history)
    write_csv(out / "runner_summary.csv", ranking)
    write_csv(out / "race_comparison.csv", race_comparison)
    write_csv(out / "all_race_participants.csv", all_participants)
    write_csv(out / "prediction.csv", PREDICTION)
    write_csv(out / "past_kikuka_all_runners.csv", sorted(kikuka_rows, key=lambda row: (row["date"], row["finish"] or 99)))
    write_csv(out / "past_kikuka_summary.csv", kikuka_summary)
    write_csv(out / "past_kikuka_race_laps.csv", laps)
    write_summary(out / "summary.md", coverage_min, coverage_max, history, ranking, kikuka_summary, laps)
    print(f"output={out.resolve()}")
    print(f"runner_history={len(history)}")
    print(f"target_races={len(race_comparison)}")
    print(f"all_race_participants={len(all_participants)}")
    print(f"complete_races={sum(row['coverage_status'].startswith('完全') for row in race_comparison)}")
    print(f"kikuka_rows={len(kikuka_rows)}")
    print("ranking=" + ", ".join(f"{r['name']}:{r['composite_score']:.2f}" for r in ranking[:8]))


if __name__ == "__main__":
    main()
