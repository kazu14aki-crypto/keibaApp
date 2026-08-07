# -*- coding: utf-8 -*-
"""
target_import.py — TARGET frontier JV 出力CSVの正規化

TARGETの「レース検索→CSV出力」で出力したCSVを、学習・予測パイプラインが
読める正規形式に変換する。TARGETは出力項目をユーザーが選ぶ方式のため、
列名の揺れをエイリアス表で吸収する。

【TARGETでの出力項目に必ず含める列】
  必須: 日付 / 場所 / R(レース番号) / 距離 / 芝ダ / 頭数 /
        馬番 / 馬名 / 性齢(または性・齢) / 騎手 / 斤量 /
        馬体重 / 増減 / 単勝オッズ(確定) / 着順
  推奨(あると精度向上): 前走着順 / 前走頭数 / 前走日付 / 前走距離
  ※ 予測用(出馬表)CSVでは着順は不要。オッズは直前オッズで出力すること。

── 2026-07 改訂: 新特徴量の追加 ─────────────────────────────
既存の52列エクスポートに含まれていながら未使用だった列を活用する。
**TARGET側での再エクスポートは不要**(既存の学習用データ.csvをこの
スクリプトで再変換するだけでよい)。

  (1) 着差(prev_margin / best_margin3):
      前走で勝ち馬から何秒離されたか。同じ「5着」でも0.2秒差と2秒差では
      能力評価が全く違う。着順よりも情報量が多い、最重要級の追加。
      「着差タイム」列ではなく走破タイムから勝ち馬タイムを引いて自前計算する
      (列の書式揺れに影響されない)。
  (2) PCI(prev_pci / hi_pace_front):
      前走の自身のペース指数。hi_pace_frontは「前走ハイペースを先行して
      潰れた馬」を検出する展開不利フラグ。市場は着順を過大に嫌うため、
      展開に恵まれなかった馬は過小評価されやすい(=妙味の源泉)。
  (3) 血統(sire / damsire):
      父馬名・母の父馬名をそのまま出力し、学習側で種牡馬別勝率
      (縮小推定)を学習期間のみから算出する(騎手と同じ方式)。
  (4) 所属地(region → is_west / away):
      関西馬(栗東)の優位と、東西を跨ぐ遠征(輸送)の影響。
  (5) クラス変動(class_change):
      クラスコードをデータ駆動でランク化(そのクラスの勝ち馬平均賞金で
      順位付け)し、前走からの昇級(+)/降級(-)を数値化。昇級初戦の
      過大人気・降級馬の妙味を捉える。
  (6) 距離適性(dist_fit):
      今回と同じ距離カテゴリ(短距離/マイル/中距離/長距離)での過去成績
      (track_fitと同じ縮小推定アキュムレータ)。
──────────────────────────────────────────────────────────────

使い方:
  python target_import.py TARGET出力.csv --out train_data.csv
  → train_data.csv と class_levels.json を出力
"""

import argparse
import csv
import json
import re
import sys
from collections import defaultdict
from datetime import datetime

# 正規名 → TARGET側の列名候補(先頭ほど優先/完全一致優先)
# prev_系を先に解決することで「前走着順」が「着順」に誤マッチするのを防ぐ。
# damsireをsireより先に解決することで「父馬名」が「母の父馬名」に誤マッチ
# するのを防ぐ(部分一致対策)。
ALIASES = [
    ("prev_finish",    ["前走着順", "前着順"]),
    ("prev_headcount", ["前走頭数"]),
    ("prev_date",      ["前走日付", "前走年月日"]),
    ("prev_distance",  ["前走距離"]),
    ("race_id",        ["レースID", "RaceID", "race_id"]),
    ("date",           ["年月日", "日付", "開催日"]),
    ("track",          ["場所", "場名", "競馬場"]),
    ("race_no",        ["R", "Ｒ", "レース番号", "レースR"]),
    ("distance",       ["距離"]),
    ("surface",        ["芝ダ", "芝・ダ", "トラック", "芝ダ障"]),
    ("headcount",      ["頭数", "出走頭数"]),
    ("num",            ["馬番"]),
    ("name",           ["馬名"]),
    ("sexage",         ["性齢"]),
    ("sex",            ["性", "性別"]),
    ("age",            ["齢", "馬齢", "年齢"]),
    ("jockey",         ["騎手", "騎手名"]),
    ("impost",         ["斤量", "負担重量"]),
    ("weight",         ["馬体重", "体重"]),
    ("weight_change",  ["増減", "馬体重増減", "体重増減"]),
    ("odds",           ["確定単勝オッズ", "単勝オッズ", "本オッズ", "単オッズ", "オッズ"]),
    ("popularity",     ["確定単勝人気", "単勝人気", "本人気", "人気順", "人気"]),
    ("finish",         ["確定着順", "本着順", "着順"]),
    # --- 馬の時系列履歴を構築するための列(前走特徴量の生成に使用) ---
    ("horse_id",       ["血統登録番号", "血統登録番号(8桁)", "馬ID"]),
    ("trainer",        ["調教師名", "調教師"]),
    ("prize",          ["賞金", "本賞金"]),
    ("class_code",     ["クラスコード"]),
    ("going",          ["馬場状態"]),
    ("run_time",       ["走破タイム"]),      # 秒。今走では結果=リークだが前走値は特徴量になる
    ("last3f",         ["上がり3Fタイム", "上がり3F"]),
    ("corner4",        ["通過順4"]),         # 4コーナー通過順(直線入口の位置)
    ("corner1",        ["通過順1"]),         # 1コーナー通過順(テンの速さ=脚質)
    ("corner2",        ["通過順2"]),         # 2コーナー通過順(通過順1が空の際の代替)
    # --- 2026-07追加: 既存エクスポートに含まれる未使用列の活用 ---
    ("damsire",        ["母の父馬名", "母父馬名", "母父名", "母父"]),  # sireより先に解決
    ("sire",           ["父馬名", "父名", "種牡馬名", "種牡馬"]),
    ("region",         ["所属地", "所属", "東西"]),   # 美浦/栗東 or 関東/関西
    ("pci",            ["PCI", "ＰＣＩ"]),            # 自身のペース指数
]

# 「年」「月」「日」は1〜2文字の短い名前で部分一致させると
# 「生年月日」「前走日付」「日次」等に誤爆するため、完全一致のみで解決する。
# TARGET frontier JVは「年」「月」「日」を独立列で出力することが多く、
# これがレース開催日の最も確実な取得元になる。
EXACT_ONLY_ALIASES = [
    ("year",  ["年"]),
    ("month", ["月"]),
    ("day",   ["日"]),
    ("kai",       ["回次"]),
    ("day_index", ["日次"]),
]

# 部分一致において、これらの語を含む列は date系(開催日)としては絶対に採用しない。
# 「生年月日」(馬の生年月日)を開催日と誤認する事故を防ぐためのブロックリスト。
DATE_PARTIAL_BLOCKLIST = ["生年", "前走"]

CANONICAL_FIELDS = [
    "race_key", "date", "track", "race_no", "distance", "surface", "headcount",
    "num", "name", "sex", "age", "jockey", "trainer", "impost", "weight",
    "weight_change", "odds", "popularity", "finish", "horse_id", "class_code", "going",
    # 血統・所属(学習側で種牡馬勝率・東西効果を算出する材料)
    "sire", "damsire", "region",
    # 前走から引き継ぐ特徴量(target_import.pyが時系列で自動計算)
    "prev_finish", "prev_headcount", "prev_days", "prev_distance",
    "prev_last3f", "prev_corner4", "prev_time_dev",
    # 履歴集約特徴量(過去全走から時系列安全に計算。リークなし)
    "career_starts",   # 過去出走数
    "career_top3",     # 複勝率(縮小推定)
    "avg_perf3",       # 直近3走の相対着順スコア平均 [-1,1]
    "best_tdev3",      # 直近3走の最速時計偏差(秒、負=速い)
    "prev_beat_mkt",   # 前走で人気より着順が良かった度合い(市場の見落とし)
    "jockey_change",   # 前走から乗り替わり=1
    "surface_switch",  # 前走から芝⇔ダート替わり=1
    "track_fit",       # 今回と同じ競馬場での過去成績(縮小推定) [-1,1]
    "muddy_fit",       # 今回が道悪の場合の過去道悪成績(縮小推定)
    "avg_prize",       # 過去平均獲得賞金(万円/走) — クラスの代理変数
    # --- 2026-07追加 ---
    "prev_corner1",    # 前走1角通過順(テン位置。逃げ・先行の検出)
    "prev_going",      # 前走の馬場状態(道悪凡走の言い訳検出用)
    "prev_margin",     # 前走の勝ち馬との着差(秒、勝てば0)。着順より情報量が多い
    "best_margin3",    # 直近3走の最小着差(秒)。凡走続きでも1回接戦なら能力の証拠
    "prev_pci",        # 前走の自身PCI(ペース指数)
    "class_change",    # クラスの昇級(+)/降級(-)。正規化レベル差 [-1,1]
    "dist_fit",        # 同距離カテゴリでの過去成績(縮小推定) [-1,1]
    "season_fit",      # 同季節(冬12-2/春3-5/夏6-8/秋9-11)での過去成績(縮小推定)。夏馬・冬馬の検出
    "style_est",       # 脚質推定(逃げ/先行/差し/追込)。過去最大5走の4角通過順から算出
    "wk_has",          # 調教データあり=1 (--workout指定時のみ)
    "wk_best4",        # レース前2-14日のベスト4F偏差(秒、負=速い)
    "wk_best1",        # 同ベストラスト1F偏差(秒、負=速い)
    "wk_n28",          # レース前28日以内の調教本数(乗り込み量)
    "wk_self",         # ベスト4F偏差-自身の平常偏差。負=平常より速い=上向き
]

def is_bad_going(s):
    """道悪判定。TARGETの馬場状態は「稍重/不良」の完全表記と「稍/不」の
    略記の両方があり得るため、先頭1文字で判定する(良以外=道悪)。"""
    s = str(s or "").strip()
    return bool(s) and s[0] in ("稍", "重", "不")


# 距離カテゴリ: 短距離 / マイル / 中距離 / 長距離
def season_of(date):
    """日付(YYYY-MM-DD) → 季節番号 0:冬(12-2) 1:春(3-5) 2:夏(6-8) 3:秋(9-11)"""
    try:
        m = int(date[5:7])
    except (ValueError, IndexError, TypeError):
        return None
    if m in (12, 1, 2):
        return 0
    if m in (3, 4, 5):
        return 1
    if m in (6, 7, 8):
        return 2
    return 3


def dist_band(d):
    if not d:
        return None
    if d < 1400:
        return 0
    if d < 1800:
        return 1
    if d < 2200:
        return 2
    return 3


def open_csv(path):
    """TARGET標準のcp932(Shift-JIS)を優先し、UTF-8にフォールバック。"""
    for enc in ("cp932", "utf-8-sig", "utf-8"):
        try:
            with open(path, encoding=enc, newline="") as f:
                rows = list(csv.reader(f))
            if rows and any(rows[0]):
                return rows
        except (UnicodeDecodeError, LookupError):
            continue
        except PermissionError:
            print(f"エラー: {path} を開けません(PermissionError)。よくある原因:")
            print("  1. ExcelやTARGETでこのCSVを開いたままにしている → 閉じてから再実行")
            print("  2. OneDrive同期中のファイル → 同期完了を待つか、C:\直下等にコピー")
            print("  3. ファイルではなくフォルダを指定している")
            print("  対処例(PowerShell): Copy-Item '学習用データ.csv' 'input.csv' して input.csv を指定")
            sys.exit(1)
    raise SystemExit("CSVの文字コードを判定できません(cp932/UTF-8のみ対応)")


def map_columns(header):
    """列名→正規名のマッピングを構築する。"""
    mapping = {}   # col_index -> canonical
    claimed = set()
    hdr = [h.strip() for h in header]

    # 0周目: 完全一致のみで解決する項目(年/月/日など、部分一致が危険な短い名前)
    for canon, names in EXACT_ONLY_ALIASES:
        for i, h in enumerate(hdr):
            if i in claimed:
                continue
            if h in names:
                mapping[i] = canon
                claimed.add(i)
                break

    # 1周目: 完全一致
    for canon, names in ALIASES:
        if canon in mapping.values():
            continue
        for i, h in enumerate(hdr):
            if i in claimed:
                continue
            if h in names:
                mapping[i] = canon
                claimed.add(i)
                break
    # 2周目: 部分一致(未解決の正規名のみ)
    resolved = set(mapping.values())
    for canon, names in ALIASES:
        if canon in resolved:
            continue
        for i, h in enumerate(hdr):
            if i in claimed:
                continue
            # date系の部分一致は「生年月日」等の誤爆を防ぐためブロックリストを適用
            if canon == "date" and any(b in hdr[i] for b in DATE_PARTIAL_BLOCKLIST):
                continue
            if any(n in h for n in names):
                mapping[i] = canon
                claimed.add(i)
                resolved.add(canon)
                break
    return mapping


def parse_date(s):
    s = (s or "").strip().replace(".", "/").replace("-", "/")
    m = re.match(r"(\d{4})/(\d{1,2})/(\d{1,2})", s)
    if m:
        return f"{m.group(1)}-{int(m.group(2)):02d}-{int(m.group(3)):02d}"
    m = re.match(r"(\d{4})(\d{2})(\d{2})$", s.replace("/", ""))
    if m:
        return f"{m.group(1)}-{m.group(2)}-{m.group(3)}"
    # 6桁のYYMMDD形式(出馬表エクスポートの「年月日」列。例: 260718 = 2026-07-18)
    m = re.match(r"(\d{2})(\d{2})(\d{2})$", s.replace("/", ""))
    if m:
        yy = int(m.group(1))
        yyyy = 2000 + yy if yy < 70 else 1900 + yy
        return f"{yyyy}-{m.group(2)}-{m.group(3)}"
    return ""


def to_float(s):
    try:
        return float(str(s).replace(",", "").strip())
    except (ValueError, TypeError):
        return None


def to_int(s):
    v = to_float(s)
    return int(v) if v is not None else None


def parse_weight_change(s):
    """'+4' '-6' '±0' '4' などを整数へ。初出走'--'等はNone。"""
    s = str(s or "").strip().replace("±", "").replace("＋", "+").replace("－", "-")
    if not s or s in ("--", "―", "計不"):
        return None
    return to_int(s)


def normalize(rows):
    """生CSV行列 → 正規化された辞書リスト。"""
    header, body = rows[0], rows[1:]
    mapping = map_columns(header)
    have = set(mapping.values())

    # 診断出力: どの列がどの正規名にマッピングされたかを必ず表示する。
    # これを見れば「race_idに誤った列が当たっていないか」「date/track/race_no
    # が正しく取れているか」を目視確認できる。
    print("=== 列マッピング診断 ===")
    print(f"元のヘッダー数: {len(header)}  マッピングできた列数: {len(mapping)}")
    idx_to_canon = {i: c for i, c in mapping.items()}
    for i, h in enumerate(header):
        canon = idx_to_canon.get(i, "―未使用―")
        print(f"  列{i:2d}: {h!r:20s} → {canon}")
    unmapped_important = {"race_id", "date", "track", "race_no"} - have
    if unmapped_important:
        print(f"  (date/track/race_no/race_idのうち未検出: {sorted(unmapped_important)})")
    print("=" * 40)

    required = {"date", "track", "distance", "num", "name", "jockey",
                "impost", "odds", "headcount"}
    missing = required - have
    if missing and "race_id" not in have:
        print(f"警告: 必須列が見つかりません: {sorted(missing)}")
        print(f"検出できた列: {sorted(have)}")
        print("TARGETの出力項目設定を見直すか、ALIASESに列名を追加してください。")

    out = []
    for raw in body:
        rec = {}
        for i, canon in mapping.items():
            if i < len(raw):
                rec[canon] = raw[i].strip()
        # 障害競走・地方は除外
        surface = rec.get("surface", "")
        if "障" in surface:
            continue
        surface = "ダート" if "ダ" in surface else ("芝" if "芝" in surface else surface)

        # 性齢の分解 (例: 牡4)
        sex, age = rec.get("sex", ""), to_int(rec.get("age"))
        sexage = rec.get("sexage", "")
        if sexage and (not sex or age is None):
            m = re.match(r"(牡|牝|セ|騸)(\d{1,2})", sexage)
            if m:
                sex = sex or m.group(1)
                age = age if age is not None else int(m.group(2))

        date = parse_date(rec.get("date", ""))
        # 「年」「月」「日」が分割列として取得できている場合はそちらを最優先する。
        # これがTARGET frontier JVで最も確実なレース開催日の取得元。
        y, m, d = to_int(rec.get("year")), to_int(rec.get("month")), to_int(rec.get("day"))
        if y is not None and m is not None and d is not None:
            if y < 100:  # 2桁年(例: 26)の場合は20xx年とみなす
                y += 2000 if y < 70 else 1900
            date = f"{y:04d}-{m:02d}-{d:02d}"

        finish_raw = rec.get("finish", "")
        finish = to_int(finish_raw) if str(finish_raw).strip().isdigit() else None

        prev_days = None
        prev_date = parse_date(rec.get("prev_date", ""))
        if date and prev_date:
            try:
                d1 = datetime.strptime(date, "%Y-%m-%d")
                d0 = datetime.strptime(prev_date, "%Y-%m-%d")
                prev_days = (d1 - d0).days
            except ValueError:
                pass

        # race_key: 「レースID」列は環境によって馬番等が連結された
        # 馬ごとの一意IDになっている場合がある(例: 末尾2桁が馬番)ため、
        # レース識別には使わない。日付+場所+回次+日次+レース番号という
        # 「本来同一レースなら必ず一致する」組み合わせを最優先で使う。
        track_v = rec.get("track", "")
        race_no_v = rec.get("race_no", "")
        kai_v = rec.get("kai", "")
        day_idx_v = rec.get("day_index", "")
        if date and track_v and race_no_v:
            race_key = f"{date}_{track_v}_{kai_v}_{day_idx_v}_{race_no_v}"
        else:
            # 日付が組み立てられなかった場合のみ、最後の手段としてrace_idを使う
            race_key = rec.get("race_id") or f"{date}_{track_v}_{race_no_v}"

        out.append({
            "race_key": race_key,
            "date": date,
            "track": rec.get("track", ""),
            "race_no": rec.get("race_no", ""),
            "distance": to_int(rec.get("distance")) or 0,
            "surface": surface,
            "headcount": to_int(rec.get("headcount")) or 0,
            "num": to_int(rec.get("num")) or 0,
            "name": rec.get("name", ""),
            "sex": sex,
            "age": age if age is not None else "",
            "jockey": rec.get("jockey", ""),
            "trainer": rec.get("trainer", ""),
            "impost": to_float(rec.get("impost")) or 0,
            "weight": to_int(rec.get("weight")) or "",
            "weight_change": parse_weight_change(rec.get("weight_change")),
            "odds": to_float(rec.get("odds")) or 0,
            "popularity": to_int(rec.get("popularity")) or "",
            "finish": finish if finish is not None else "",
            "horse_id": rec.get("horse_id", ""),
            "class_code": rec.get("class_code", ""),
            "going": rec.get("going", ""),
            "sire": rec.get("sire", ""),
            "damsire": rec.get("damsire", ""),
            "region": rec.get("region", ""),
            # 前走特徴量はこの後 attach_history_features() で時系列計算する。
            # ここでは既存の前走列があればそれも保持(TARGET側が出力していれば)。
            "prev_finish": to_int(rec.get("prev_finish")) or "",
            "prev_headcount": to_int(rec.get("prev_headcount")) or "",
            "prev_days": prev_days if prev_days is not None else "",
            "prev_distance": to_int(rec.get("prev_distance")) or "",
            "prev_last3f": "",
            "prev_corner4": "",
            "prev_corner1": "",
            "prev_going": "",
            "prev_time_dev": "",
            "career_starts": "",
            "career_top3": "",
            "avg_perf3": "",
            "best_tdev3": "",
            "prev_beat_mkt": "",
            "jockey_change": "",
            "surface_switch": "",
            "track_fit": "",
            "muddy_fit": "",
            "avg_prize": "",
            "prev_margin": "",
            "best_margin3": "",
            "prev_pci": "",
            "class_change": "",
            "dist_fit": "",
            "season_fit": "",
            "style_est": "",
            # 履歴構築の材料(今走の結果。前走特徴量への変換にのみ使い、
            # 今走の特徴量としては絶対に使わない=リーク防止)
            "_run_time": to_float(rec.get("run_time")),
            "_last3f": to_float(rec.get("last3f")),
            "_corner4": to_int(rec.get("corner4")),
            "_corner1": to_int(rec.get("corner1")) or to_int(rec.get("corner2")),
            "_prize": to_float(rec.get("prize")) or 0.0,
            "_pci": to_float(rec.get("pci")),
            "_margin": None,       # compute_margins()で勝ち馬タイム差から計算
            "_class_level": None,  # build_class_levels()でランク化
        })
    return out


def compute_margins(records):
    """レースごとに勝ち馬の走破タイムを求め、各馬の着差(秒)を_marginに書き込む。

    「着差タイム」列は書式揺れ(ハナ/クビ/大差等の文字表記)があるため使わず、
    走破タイム(秒)の差分で自前計算する。勝ち馬は0.0。異常値は5秒でキャップ。
    """
    win_time = {}
    for r in records:
        t = r.get("_run_time")
        if r.get("finish") == 1 and t and t > 0:
            win_time[r["race_key"]] = t
    n = 0
    for r in records:
        t = r.get("_run_time")
        wt = win_time.get(r["race_key"])
        if t and t > 0 and wt:
            r["_margin"] = round(min(max(t - wt, 0.0), 5.0), 2)
            n += 1
    return n


def build_class_levels(records):
    """クラスコード → 正規化レベル[0,1] をデータ駆動で構築する。

    JRA-VANのクラスコード体系をハードコードせず、「そのクラスの勝ち馬の
    平均賞金」で順位付けする(新馬・未勝利 < 1勝 < … < G1 の序列は賞金に
    忠実に反映される)。コード体系が変わっても自動追従する。
    これはレース制度のメタデータ(公知の事実)であり、個々の馬の結果を
    使うリークとは性質が異なる。
    """
    prize_by_class = defaultdict(lambda: [0.0, 0])
    for r in records:
        c = r.get("class_code", "")
        if c and r.get("finish") == 1 and (r.get("_prize") or 0) > 0:
            prize_by_class[c][0] += r["_prize"]
            prize_by_class[c][1] += 1
    avg = {c: s / n for c, (s, n) in prize_by_class.items() if n >= 10}
    if len(avg) < 2:
        return {}
    ranked = sorted(avg, key=lambda c: avg[c])
    k = len(ranked)
    levels = {c: round(i / (k - 1), 3) for i, c in enumerate(ranked)}
    for r in records:
        lv = levels.get(r.get("class_code", ""))
        if lv is not None:
            r["_class_level"] = lv
    return levels


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


def attach_history_features(records):
    """各馬の時系列を辿り、「前走の結果」を今走の特徴量として付与する。

    これがモデルを市場に近づける本命の特徴量。予測時点で既知の情報
    (過去のレース結果)だけを使うため、リークにはならない。

    計算する前走特徴量:
      prev_finish/prev_headcount : 前走の着順と頭数(相対着順の材料)
      prev_days                  : 前走からの間隔(日)
      prev_distance              : 前走距離(距離延長/短縮の材料)
      prev_last3f                : 前走上がり3F(末脚の絶対値)
      prev_corner4               : 前走4角通過順(脚質・展開)
      prev_time_dev              : 前走の走破タイムが、同じ距離・馬場・
                                   トラックの平均からどれだけ速かったか(秒)。
                                   時計の絶対評価。負ほど速い(優秀)。
      prev_margin                : 前走の勝ち馬との着差(秒)
      best_margin3               : 直近3走の最小着差(秒)
      prev_pci                   : 前走の自身PCI
      class_change               : クラスレベルの変動(昇級+/降級-)
      dist_fit                   : 同距離カテゴリでの過去成績(縮小推定)
    """
    # 事前計算: 着差とクラスレベル
    n_margin = compute_margins(records)
    class_levels = build_class_levels(records)

    # (1) 距離×馬場×トラック別の平均走破タイムを算出(時計偏差の基準)
    sum_by_cond = defaultdict(lambda: [0.0, 0])
    for r in records:
        t = r.get("_run_time")
        if t and t > 0 and r["distance"] and r["surface"]:
            k = (r["track"], r["surface"], r["distance"])
            sum_by_cond[k][0] += t
            sum_by_cond[k][1] += 1
    avg_by_cond = {k: s / n for k, (s, n) in sum_by_cond.items() if n >= 20}

    # (2) 馬ごとに時系列(日付順)で並べ、1つ前の走の結果を今走へ引き継ぐ
    by_horse = defaultdict(list)
    for r in records:
        hid = r.get("horse_id") or r.get("name")  # 血統登録番号優先、無ければ馬名
        if hid:
            by_horse[hid].append(r)

    for hid, runs in by_horse.items():
        runs.sort(key=lambda r: r["date"])
        # --- 累積アキュムレータ(過去走のみから更新するので時系列リーク無し) ---
        n_starts = 0            # 過去出走数(着順確定した走のみ)
        n_top3 = 0              # 過去3着内数
        prize_sum = 0.0         # 過去獲得賞金合計(万円)
        recent_perfs = []       # 直近の相対着順スコア(最大3件保持)
        recent_tdevs = []       # 直近の時計偏差(最大3件保持)
        recent_margins = []     # 直近の着差(最大3件保持)
        recent_corners = []     # 直近の(4角通過順, 頭数) 最大5件保持(脚質推定用)
        track_perf = defaultdict(lambda: [0.0, 0])   # 競馬場別 perfの[合計, 件数]
        dist_perf = defaultdict(lambda: [0.0, 0])    # 距離カテゴリ別 perfの[合計, 件数]
        season_perf = defaultdict(lambda: [0.0, 0])  # 季節別 perfの[合計, 件数]
        muddy_perf = [0.0, 0]   # 道悪でのperfの[合計, 件数]

        def perf_of(run):
            fin, hc = run["finish"], run["headcount"]
            if fin != "" and fin is not None and hc and hc > 1:
                return 1.0 - 2.0 * (fin - 1) / (hc - 1)
            return None

        for i, cur in enumerate(runs):
            # ==== (a) まず「過去の累積」から今走の特徴量を書き込む ====
            if i > 0:
                prev = runs[i - 1]
                if prev["finish"] != "" and prev["headcount"]:
                    cur["prev_finish"] = prev["finish"]
                    cur["prev_headcount"] = prev["headcount"]
                if prev["distance"]:
                    cur["prev_distance"] = prev["distance"]
                if prev.get("_last3f"):
                    cur["prev_last3f"] = prev["_last3f"]
                if prev.get("_corner4"):
                    cur["prev_corner4"] = prev["_corner4"]
                if prev.get("_corner1"):
                    cur["prev_corner1"] = prev["_corner1"]
                if prev.get("going"):
                    cur["prev_going"] = prev["going"]
                try:
                    d1 = datetime.strptime(cur["date"], "%Y-%m-%d")
                    d0 = datetime.strptime(prev["date"], "%Y-%m-%d")
                    gap = (d1 - d0).days
                    if 0 < gap < 800:
                        cur["prev_days"] = gap
                except (ValueError, TypeError):
                    pass
                pt = prev.get("_run_time")
                k = (prev["track"], prev["surface"], prev["distance"])
                if pt and pt > 0 and k in avg_by_cond:
                    cur["prev_time_dev"] = round(pt - avg_by_cond[k], 2)
                # 馬体重変化: 「増減」列が無いエクスポートでも前走比から自動計算
                if cur.get("weight_change") is None:
                    cw, pw = cur.get("weight"), prev.get("weight")
                    if cw not in ("", None, 0) and pw not in ("", None, 0):
                        cur["weight_change"] = int(cw) - int(pw)
                # 前走で市場の期待(人気)より走ったか: (人気-着順)/頭数。正=見せ場
                pp, pf, ph = prev.get("popularity"), prev.get("finish"), prev.get("headcount")
                if pp not in ("", None) and pf not in ("", None) and ph:
                    cur["prev_beat_mkt"] = round((pp - pf) / ph, 3)
                # 乗り替わり / 芝⇔ダート替わり
                if prev.get("jockey") and cur.get("jockey"):
                    cur["jockey_change"] = 1 if prev["jockey"] != cur["jockey"] else 0
                if prev.get("surface") and cur.get("surface"):
                    cur["surface_switch"] = 1 if prev["surface"] != cur["surface"] else 0
                # 前走着差(勝ち馬とのタイム差)
                if prev.get("_margin") is not None:
                    cur["prev_margin"] = prev["_margin"]
                # 前走PCI(自身のペース指数)
                if prev.get("_pci") is not None and prev["_pci"] > 0:
                    cur["prev_pci"] = prev["_pci"]
                # クラス変動(昇級+/降級-)。正規化レベル[0,1]の差 ∈[-1,1]
                cl, pl = cur.get("_class_level"), prev.get("_class_level")
                if cl is not None and pl is not None:
                    cur["class_change"] = round(cl - pl, 3)

            cur["career_starts"] = n_starts
            if n_starts > 0:
                # 複勝率(縮小推定: 事前分布0.3, 重み5走分)
                cur["career_top3"] = round((n_top3 + 0.3 * 5) / (n_starts + 5), 3)
                cur["avg_prize"] = round(prize_sum / n_starts, 1)
            if recent_perfs:
                cur["avg_perf3"] = round(sum(recent_perfs) / len(recent_perfs), 3)
            if recent_tdevs:
                cur["best_tdev3"] = round(min(recent_tdevs), 2)
            if recent_margins:
                cur["best_margin3"] = round(min(recent_margins), 2)
            tp = track_perf.get(cur["track"])
            if tp and tp[1] > 0:
                # 同競馬場での過去perf(縮小推定: 分母+3で0方向へ縮小)
                cur["track_fit"] = round(tp[0] / (tp[1] + 3), 3)
            db = dist_band(cur["distance"])
            if db is not None:
                dp = dist_perf.get(db)
                if dp and dp[1] > 0:
                    cur["dist_fit"] = round(dp[0] / (dp[1] + 3), 3)
            if is_bad_going(cur.get("going")) and muddy_perf[1] > 0:
                cur["muddy_fit"] = round(muddy_perf[0] / (muddy_perf[1] + 3), 3)
            sn = season_of(cur["date"])
            if sn is not None:
                sp2 = season_perf.get(sn)
                if sp2 and sp2[1] > 0:
                    cur["season_fit"] = round(sp2[0] / (sp2[1] + 3), 3)
            # 脚質推定: 過去最大5走の通過順(絶対番手と頭数比の両方)。
            # テンの位置取り(1〜2角)を優先し、無い場合のみ4角を使う。
            # 脚質の定義は序盤の位置取りなので、捲り・追い上げ後の4角より正確。
            # サイトのJRA取込は脚質を取得できないため、ここで全履歴から推定して
            # 解析パック経由でサイトに供給する(4走制限のあるJRAページより正確)。
            if recent_corners:
                avg_pos = sum(c for c, hc in recent_corners) / len(recent_corners)
                hcs = [hc for c, hc in recent_corners if hc]
                avg_hc = sum(hcs) / len(hcs) if hcs else 14
                ratio = avg_pos / avg_hc if avg_hc else 0.5
                if avg_pos <= 1.8 and ratio <= 0.16:
                    cur["style_est"] = "逃げ"
                elif avg_pos <= 5.5 or ratio <= 0.40:
                    cur["style_est"] = "先行"
                elif ratio <= 0.72:
                    cur["style_est"] = "差し"
                else:
                    cur["style_est"] = "追込"

            # ==== (b) 今走の結果でアキュムレータを更新(次走以降のために) ====
            p = perf_of(cur)
            if p is not None:
                n_starts += 1
                if cur["finish"] <= 3:
                    n_top3 += 1
                recent_perfs.append(p)
                if len(recent_perfs) > 3:
                    recent_perfs.pop(0)
                track_perf[cur["track"]][0] += p
                track_perf[cur["track"]][1] += 1
                db = dist_band(cur["distance"])
                if db is not None:
                    dist_perf[db][0] += p
                    dist_perf[db][1] += 1
                if is_bad_going(cur.get("going")):
                    muddy_perf[0] += p
                    muddy_perf[1] += 1
                sn = season_of(cur["date"])
                if sn is not None:
                    season_perf[sn][0] += p
                    season_perf[sn][1] += 1
            if cur.get("_margin") is not None:
                recent_margins.append(cur["_margin"])
                if len(recent_margins) > 3:
                    recent_margins.pop(0)
            cpos = cur.get("_corner1") or cur.get("_corner4")
            if cpos and cpos > 0 and cur.get("headcount"):
                recent_corners.append((cpos, cur["headcount"]))
                if len(recent_corners) > 5:
                    recent_corners.pop(0)
            prize_sum += cur.get("_prize") or 0.0
            t = cur.get("_run_time")
            k = (cur["track"], cur["surface"], cur["distance"])
            if t and t > 0 and k in avg_by_cond:
                recent_tdevs.append(t - avg_by_cond[k])
                if len(recent_tdevs) > 3:
                    recent_tdevs.pop(0)
    return records, class_levels




# =====================================================================
# 調教データ(ウッドC・坂路など)の読み込みと結合
# =====================================================================
# TARGETの調教CSV(列名: 場所/コース/年月日/血統登録番号/4F/1F等)を読み込み、
# レース前の追い切り情報を特徴量としてtrain_data.csvに結合する。
#
# 標準化の設計:
#   タイムは(場所,コース,年)グループの平均との偏差(秒)に変換する。
#   美浦W/栗東W/坂路はコース形状が違い生タイムは比較不能だが、
#   偏差にすれば「その環境でどれだけ速いか」として横断比較できる。
#   条件付きロジットはレース内共通のオフセットを自動相殺するため、
#   中心化の厳密さよりスケールの一貫性が重要。
#
# 実測メモ(2026-07, ウッドC単体・2022+学習):
#   係数は微弱(wk_best1 +0.055、他ほぼ0)。追い切りタイムは新聞掲載の
#   定番情報として市場に織り込まれている模様。坂路合流後に再判定する。

def norm_hid(hid):
    """血統登録番号を10桁(年4桁)に正規化。レースCSVは8桁(年2桁)の場合がある。"""
    s = str(hid or "").strip()
    if len(s) == 8 and s.isdigit():
        yy = int(s[:2])
        return ("19" if yy >= 50 else "20") + s
    return s


def _wk_days_between(d1, d0):
    """YYYYMMDD整数の簡易日数差(月30日近似。窓判定にのみ使用)"""
    return ((d1 // 10000) - (d0 // 10000)) * 365 \
        + ((d1 // 100 % 100) - (d0 // 100 % 100)) * 30 \
        + (d1 % 100 - d0 % 100)


def _wk_open_stream(path):
    """調教CSVをストリーミングで開く(文字コード自動判定)。"""
    for enc in ("cp932", "utf-8-sig", "utf-8"):
        try:
            f = open(path, encoding=enc, newline="")
            header = next(csv.reader([f.readline()]))
            if header and any(header):
                return f, [h.strip() for h in header]
            f.close()
        except (UnicodeDecodeError, LookupError, StopIteration):
            try:
                f.close()
            except Exception:
                pass
            continue
        except PermissionError:
            print(f"エラー: {path} を開けません。Excel/TARGETで開いたままにしていないか確認してください。")
            sys.exit(1)
    raise SystemExit(f"{path}: 文字コードを判定できません")


def load_workout_csv(paths):
    """調教CSV(複数可)を読み込み、馬ごとの(日付, 4F偏差, 1F偏差)リストを返す。

    列は名前で解決するため、ウッドC・坂路など列構成が多少違っても動く。
    必須列: 血統登録番号 / 年月日(または日付) / 4F(坂路形式はTime1)。
    1F(坂路形式はTime4)・場所・コースは任意。
    メモリ節約のため2パスのストリーミング処理
    (パス1: グループ平均の算出 / パス2: 偏差化して馬別に格納)。
    """
    def resolve(header):
        def col(*names):
            for n in names:
                if n in header:
                    return header.index(n)
            return None
        return {
            "hid": col("血統登録番号", "馬ID"),
            "date": col("年月日", "日付", "調教年月日"),
            # ウッドC形式は「4F」「1F」、坂路形式は「Time1」(=全体4F)「Time4」(=ラスト1F)
            "f4": col("4F", "Time1"), "f1": col("1F", "Time4"),
            "place": col("場所"), "course": col("コース"),
        }

    def parse(row, ix):
        try:
            hid = norm_hid(row[ix["hid"]])
            d = re.sub(r"[^0-9]", "", row[ix["date"]].strip())[:8]
            di = int(d)
            f4 = float(row[ix["f4"]])
        except (ValueError, IndexError):
            return None
        if not hid or len(d) != 8 or f4 <= 30 or f4 > 80:
            return None
        f1 = None
        if ix["f1"] is not None:
            try:
                v = float(row[ix["f1"]])
                if 8 < v <= 25:
                    f1 = v
            except (ValueError, IndexError):
                pass
        group = ((row[ix["place"]].strip() if ix["place"] is not None else "") + "|"
                 + (row[ix["course"]].strip() if ix["course"] is not None else "")
                 + "|" + d[:4])
        return hid, di, f4, f1, group

    # パス1: (場所,コース,年)グループごとの平均タイム
    sums = defaultdict(lambda: [0.0, 0, 0.0, 0])   # 4F計, 4F件数, 1F計, 1F件数
    for path in paths:
        f, header = _wk_open_stream(path)
        ix = resolve(header)
        if ix["hid"] is None or ix["date"] is None or ix["f4"] is None:
            print(f"警告: {path} に必須列(血統登録番号/年月日/4F)が見つからずスキップ")
            f.close()
            continue
        n_ok = 0
        for row in csv.reader(f):
            p = parse(row, ix)
            if not p:
                continue
            _, _, f4, f1, g = p
            sums[g][0] += f4
            sums[g][1] += 1
            if f1 is not None:
                sums[g][2] += f1
                sums[g][3] += 1
            n_ok += 1
        f.close()
        print(f"調教データ読み込み: {path} → {n_ok}本")
    means = {}
    for g, (s4, n4, s1, n1) in sums.items():
        if n4 >= 100:
            means[g] = (s4 / n4, s1 / n1 if n1 >= 100 else None)

    # パス2: 偏差化して馬別に格納
    by_horse = defaultdict(list)
    for path in paths:
        f, header = _wk_open_stream(path)
        ix = resolve(header)
        if ix["hid"] is None or ix["date"] is None or ix["f4"] is None:
            f.close()
            continue
        for row in csv.reader(f):
            p = parse(row, ix)
            if not p:
                continue
            hid, di, f4, f1, g = p
            m = means.get(g)
            if not m:
                continue
            d4 = round(f4 - m[0], 2)
            d1 = round(f1 - m[1], 2) if (f1 is not None and m[1] is not None) else None
            by_horse[hid].append((di, d4, d1))
        f.close()
    for hid in by_horse:
        by_horse[hid].sort()
    return dict(by_horse)


def merge_workouts(records, by_horse):
    """各レース行に調教特徴量(wk_*)を書き込む。

    窓: レース前2〜14日=本追い切り、〜28日=乗り込み量。
      wk_best4 : 窓内ベスト4F偏差(秒、負=速い)
      wk_best1 : 窓内ベストラスト1F偏差(秒、負=速い)
      wk_n28   : 28日以内の調教本数
      wk_self  : ベスト4F偏差 - 自身の過去(15〜180日)中央値偏差。負=平常より速い=上向き
      wk_has   : 調教データあり=1
    """
    n_hit = 0
    for r in records:
        hid = norm_hid(r.get("horse_id", ""))
        runs = by_horse.get(hid)
        r.setdefault("wk_has", "")
        r.setdefault("wk_best4", "")
        r.setdefault("wk_best1", "")
        r.setdefault("wk_n28", "")
        r.setdefault("wk_self", "")
        if not runs or not r.get("date"):
            continue
        try:
            rd = int(r["date"].replace("-", ""))
        except ValueError:
            continue
        best4 = best1 = None
        n28 = 0
        own = []
        for di, d4, d1 in reversed(runs):
            gap = _wk_days_between(rd, di)
            if gap < 2:
                continue
            if gap > 180:
                break
            if gap <= 28:
                n28 += 1
            if gap <= 14:
                if best4 is None or d4 < best4:
                    best4 = d4
                if d1 is not None and (best1 is None or d1 < best1):
                    best1 = d1
            if 15 <= gap:
                own.append(d4)
        if n28 == 0:
            continue
        n_hit += 1
        r["wk_has"] = 1
        r["wk_n28"] = n28
        if best4 is not None:
            r["wk_best4"] = round(best4, 2)
            if len(own) >= 3:
                own.sort()
                r["wk_self"] = round(best4 - own[len(own) // 2], 2)
        if best1 is not None:
            r["wk_best1"] = round(best1, 2)
    return n_hit


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("input", help="TARGETが出力したCSV")
    ap.add_argument("--out", default="train_data.csv")
    ap.add_argument("--workout", action="append", default=[],
                    help="調教CSV(ウッドC/坂路等)。複数指定可: --workout ウッドC.csv --workout 坂路.csv")
    args = ap.parse_args()

    rows = open_csv(args.input)
    records = normalize(rows)
    if not records:
        print("有効な行がありません。列マッピングを確認してください。")
        sys.exit(1)

    # 各馬の時系列を辿って前走特徴量を付与する
    records, class_levels = attach_history_features(records)

    # 調教データの結合(任意)
    if args.workout:
        by_horse = load_workout_csv(args.workout)
        n_hit = merge_workouts(records, by_horse)
        print(f"調教特徴量の結合: {n_hit}行 ({n_hit/len(records)*100:.0f}%) "
              f"※調教データの収録期間外のレースは0%で正常")

    # 特徴量の充足率を報告(履歴が正しく紐付いたかの確認)
    n_prevtime = sum(1 for r in records if r["prev_time_dev"] != "")
    n_prevfin = sum(1 for r in records if r["prev_finish"] != "")
    n_margin = sum(1 for r in records if r["prev_margin"] != "")
    n_pci = sum(1 for r in records if r["prev_pci"] != "")
    n_sire = sum(1 for r in records if r["sire"])
    n_region = sum(1 for r in records if r["region"])
    n_cc = sum(1 for r in records if r["class_change"] != "")
    print(f"前走特徴量の付与: 前走着順あり {n_prevfin}行 / "
          f"前走時計偏差あり {n_prevtime}行 (全{len(records)}行)")
    print(f"新特徴量の充足率: 前走着差 {n_margin}行 / 前走PCI {n_pci}行 / "
          f"クラス変動 {n_cc}行 / 血統(父) {n_sire}行 / 所属地 {n_region}行")
    if class_levels:
        print(f"クラスコードのランク化: {len(class_levels)}種類 → class_levels.json に保存")
        with open("class_levels.json", "w", encoding="utf-8") as f:
            json.dump(class_levels, f, ensure_ascii=False, indent=1)
    else:
        print("クラスコードのランク化: 材料不足のためスキップ(class_change無効)")
    if n_sire == 0:
        print("注意: 父馬名列が検出されませんでした。血統特徴量は無効になります。")
    if n_pci == 0:
        print("注意: PCI列が検出されませんでした。ペース特徴量は無効になります。")

    with open(args.out, "w", newline="", encoding="utf-8") as f:
        # 内部フィールド(_始まり)はCANONICAL_FIELDSに無いので extrasaction='ignore' で除外
        w = csv.DictWriter(f, fieldnames=CANONICAL_FIELDS, extrasaction="ignore")
        w.writeheader()
        w.writerows(records)

    races = {r["race_key"] for r in records}
    with_result = sum(1 for r in records if r["finish"] != "")
    print(f"変換完了: {args.out}")
    print(f"  行数: {len(records)}  レース数: {len(races)}")
    print(f"  着順あり: {with_result}行 (学習に使用可能)")

    # 異常検知: レース数が行数に近い場合、レースキーの生成に失敗している。
    # (1レースに複数頭いるはずなので、本来 レース数 << 行数 になる)
    if len(records) > 20 and len(races) > len(records) * 0.5:
        print()
        print("!! 警告: レース数が行数とほぼ同じです。1行=1レースとして扱われています。")
        print("   本来は1レースに複数頭(10〜18行)が含まれるはずです。")
        print("   サンプルのrace_key(先頭5件):")
        for r in records[:5]:
            print(f"     {r['race_key']!r}  (date={r['date']!r} track={r['track']!r} "
                  f"race_no={r['race_no']!r})")
        print("   ↑ このrace_keyが1行ごとに全部バラバラなら、date/track/race_noの")
        print("     いずれかが正しく取得できていません。上の「列マッピング診断」を")
        print("     見て、date/track/race_noが正しい列を指しているか確認してください。")
        sys.exit(1)

    print(f"  次: python train_model.py {args.out} --walk-forward 2012")


if __name__ == "__main__":
    main()
