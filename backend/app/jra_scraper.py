"""
JRA公式サイトの出馬表ページ（accessD.html）からデータを取得・解析するモジュール。

設計方針:
- 個人の私的利用を前提とした、1リクエスト=1レースの単発取得のみ。
- 巡回・連続クロールは行わない（呼び出し元のAPIも1回のリクエストにつき1URLのみ受け付ける）。
- サイト構造の変更で解析が失敗した場合は、その旨を例外として呼び出し元に伝え、
  手動CSV入力にフォールバックできるようにする。

実際のページ構造（馬1頭あたり2行で構成される）:
  行A（基本情報行）: [枠] [馬番] [馬名(link) 性齢 / 脚質マーク 前走情報 (着度数) 騎手(link)(斤量) 調教師(link)(所属)]
  行B（過去走詳細行）: [(枠列は前行のrowspanで継続)] [前走見出しテキスト] [前走〜4走前の詳細を連結したテキスト]

行Bの過去走テキストには「前走」「前々走」「3走前」「4走前」というラベルで4走分の
日付・競馬場・クラス・距離・馬場状態・頭数・着順・タイム・馬体重・騎手・通過順・上がり3F・相手馬(着差)
が連結されている。
"""
import re
import requests
from bs4 import BeautifulSoup

USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

ALLOWED_HOSTS = {"www.jra.go.jp", "sp.jra.jp", "jra.jp"}

STYLES = ["逃げ", "先行", "差し", "追込"]

# JRA公式の脚質マーク(1文字)と、アプリ内の脚質表記の対応
JRA_STYLE_MARK_MAP = {
    "逃": "逃げ",
    "先": "先行",
    "差": "差し",
    "追": "追込",
}


class JraFetchError(Exception):
    """JRAサイトの取得・解析に失敗した場合の例外。"""
    pass


def _validate_url(url: str) -> None:
    from urllib.parse import urlparse
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise JraFetchError("URLの形式が正しくありません。")
    if parsed.netloc not in ALLOWED_HOSTS:
        raise JraFetchError(
            "JRA公式サイト（jra.go.jp / jra.jp）の出馬表ページのURLのみ取り込めます。"
        )


def fetch_jra_html(url: str) -> str:
    """JRA出馬表ページのHTMLを取得する。1回の呼び出しで1リクエストのみ送信する。"""
    _validate_url(url)
    headers = {
        "User-Agent": USER_AGENT,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ja,en-US;q=0.9,en;q=0.8",
    }
    try:
        res = requests.get(url, headers=headers, timeout=15)
    except requests.RequestException as e:
        raise JraFetchError(f"JRAサイトへの接続に失敗しました: {e}")

    if res.status_code != 200:
        raise JraFetchError(
            f"JRAサイトがステータスコード {res.status_code} を返しました。"
            "ページが存在しないか、アクセスが制限されている可能性があります。"
        )

    res.encoding = "cp932"
    return res.text


def _clean_text(s: str) -> str:
    if not s:
        return ""
    return re.sub(r"\s+", " ", s).strip()


def _normalize_table_rows(table) -> list:
    """rowspanで省略されたセルを補完し、各行のセル位置を揃える。
    戻り値は行ごとのセル(Tag or None)リストのリスト。
    """
    rows = table.find_all("tr")
    grid = []
    pending = {}

    for row in rows:
        cells = row.find_all(["td", "th"])
        row_result = {}
        carried_over_keys = set()

        for c_idx, (remaining, tag) in pending.items():
            if remaining > 0:
                row_result[c_idx] = tag
                carried_over_keys.add(c_idx)

        c_idx = 0
        newly_added = {}
        for cell in cells:
            while c_idx in row_result:
                c_idx += 1
            row_result[c_idx] = cell
            rowspan = int(cell.get("rowspan", 1) or 1)
            if rowspan > 1:
                newly_added[c_idx] = [rowspan - 1, cell]
            c_idx += 1

        next_pending = {}
        for k in carried_over_keys:
            remaining, tag = pending[k]
            new_remaining = remaining - 1
            if new_remaining > 0:
                next_pending[k] = [new_remaining, tag]
        for k, v in newly_added.items():
            next_pending[k] = v
        pending = next_pending

        max_col = max(row_result.keys(), default=-1) + 1
        ordered = [row_result.get(i) for i in range(max_col)]
        grid.append(ordered)

    return grid


def _cell_text(cell) -> str:
    if cell is None:
        return ""
    return _clean_text(cell.get_text())


def _parse_basic_info(detail_cell) -> dict:
    """基本情報セル（馬名・性齢・脚質マーク・着度数・騎手・調教師）を解析する。"""
    links = detail_cell.find_all("a")
    name = _clean_text(links[0].get_text()) if links else ""

    text = _cell_text(detail_cell)

    style = ""
    style_match = re.search(r"/\s*([逃先差追])", text)
    if style_match:
        style = JRA_STYLE_MARK_MAP.get(style_match.group(1), "")

    record = ""
    record_match = re.search(r"\((\d+)[,，](\d+)[,，](\d+)[,，](\d+)\)", text)
    if record_match:
        record = f"{record_match.group(1)}-{record_match.group(2)}-{record_match.group(3)}-{record_match.group(4)}"

    # 騎手・調教師: 馬名以降のリンクのうち、最後から2番目が騎手、最後が調教師であることが多い
    jockey = ""
    trainer = ""
    if len(links) >= 2:
        jockey = _clean_text(links[-2].get_text())
        trainer = _clean_text(links[-1].get_text())
    elif len(links) == 1 and name:
        # リンクが馬名のみの場合（騎手未定など）
        pass

    return {
        "name": name,
        "style": style,
        "record": record,
        "jockey": jockey,
        "trainer": trainer,
    }


def _split_past_races(history_text: str) -> dict:
    """過去走詳細テキストを「前走」「前々走」「3走前」「4走前」に分割する。"""
    labels = ["前走", "前々走", "3走前", "4走前"]
    positions = []
    for label in labels:
        for m in re.finditer(re.escape(label), history_text):
            positions.append((m.start(), label))
    positions.sort()

    seen = set()
    filtered = []
    for pos, label in positions:
        if label in seen:
            continue
        seen.add(label)
        filtered.append((pos, label))
    filtered.sort()

    segments = {}
    for i, (pos, label) in enumerate(filtered):
        end = filtered[i + 1][0] if i + 1 < len(filtered) else len(history_text)
        segments[label] = history_text[pos + len(label):end].strip()

    return segments


def _parse_one_race_segment(segment: str) -> dict:
    """1走分のテキストセグメントを構造化データに変換する。"""
    if not segment or segment[:4].strip() in ("なし", "前走非開催") or "非開催" in segment[:8]:
        return None

    result = {
        "date": "", "track": "", "class_name": "", "surface": "", "distance": 0,
        "condition": "", "headcount": 0, "rank": 0, "popularity": 0,
        "time": "", "weight": 0, "jockey": "", "corner_positions": "", "last_3f": "",
    }

    date_match = re.search(r"(\d{4})年(\d{1,2})月(\d{1,2})日", segment)
    if not date_match:
        return None
    result["date"] = f"{date_match.group(1)}-{int(date_match.group(2)):02d}-{int(date_match.group(3)):02d}"

    track_match = re.search(r"\d{4}年\d{1,2}月\d{1,2}日\s*([札幌函館福島新潟東京中山中京京都阪神小倉]+)", segment)
    if track_match:
        result["track"] = track_match.group(1)

    surf_dist_match = re.search(r"(芝|ダート)\s*(\d{3,4})", segment)
    if surf_dist_match:
        result["surface"] = "ダート" if surf_dist_match.group(1) == "ダート" else "芝"
        result["distance"] = int(surf_dist_match.group(2))

    cond_match = re.search(r"(良|稍重|重|不良)\s*\d{1,2}頭", segment)
    if cond_match:
        result["condition"] = cond_match.group(1)

    headcount_match = re.search(r"(\d{1,2})頭", segment)
    if headcount_match:
        result["headcount"] = int(headcount_match.group(1))

    after_headcount = segment[headcount_match.end():] if headcount_match else segment
    rank_match = re.match(r"\s*(\d{1,2})着", after_headcount)
    if rank_match:
        result["rank"] = int(rank_match.group(1))

    pop_match = re.search(r"(\d{1,2})番人気", segment[:30])
    if pop_match:
        result["popularity"] = int(pop_match.group(1))

    time_match = re.search(r"(\d{1,2}:\d{2}\.\d)", segment)
    if time_match:
        result["time"] = time_match.group(1)

    weight_match = re.search(r"(\d{3,4})kg", segment)
    if weight_match:
        result["weight"] = int(weight_match.group(1))

    corner_match = re.search(r"((?:\d{1,2}-)+\d{1,2})\s*3F", segment)
    if corner_match:
        result["corner_positions"] = corner_match.group(1)

    last3f_match = re.search(r"3F\s*(\d{2}\.\d)", segment)
    if last3f_match:
        result["last_3f"] = last3f_match.group(1)

    class_match = re.search(r"\[([^\]]+)\]", segment)
    if class_match:
        result["class_name"] = class_match.group(1)

    if time_match and weight_match:
        between = _clean_text(segment[time_match.end():weight_match.start()])
        if between:
            result["jockey"] = between

    jockey_name_match = re.search(r"kg\s*([^\s(（0-9][^\s(（]*)\s*[(（]\d{2}\.\d[)）]", segment)
    if jockey_name_match:
        result["jockey"] = jockey_name_match.group(1)

    return result


def _parse_history(history_cell) -> dict:
    """過去走詳細セルを解析し、前走〜4走前の構造化データを返す。"""
    text = _cell_text(history_cell)
    segments = _split_past_races(text)
    history = {}
    for label in ["前走", "前々走", "3走前", "4走前"]:
        seg = segments.get(label, "")
        history[label] = _parse_one_race_segment(seg)
    return history


def infer_style_from_history(history: dict, fallback: str = "") -> str:
    """過去走の通過順から脚質を推定する（JRA公式マークが取れない場合のフォールバック）。"""
    if fallback:
        return fallback

    positions = []
    headcounts = []
    for label in ["前走", "前々走", "3走前", "4走前"]:
        race = history.get(label)
        if not race or not race.get("corner_positions"):
            continue
        nums = [int(x) for x in race["corner_positions"].split("-") if x.isdigit()]
        if not nums:
            continue
        positions.append(nums[0])
        if race.get("headcount"):
            headcounts.append(race["headcount"])

    if not positions:
        return "先行"

    avg_pos = sum(positions) / len(positions)
    avg_headcount = sum(headcounts) / len(headcounts) if headcounts else 14
    ratio = avg_pos / avg_headcount if avg_headcount else 0.5

    if ratio <= 0.15:
        return "逃げ"
    elif ratio <= 0.4:
        return "先行"
    elif ratio <= 0.7:
        return "差し"
    else:
        return "追込"


def parse_shutuba(html: str) -> dict:
    """出馬表HTMLを解析し、レース情報と出走馬リストを返す。"""
    soup = BeautifulSoup(html, "lxml")

    race_name = ""
    h2 = soup.find("h2") or soup.find("h3")
    if h2:
        race_name = _clean_text(h2.get_text())

    track = ""
    surface = "芝"
    distance = 0

    course_text = ""
    course_label = soup.find(string=re.compile(r"コース"))
    if course_label:
        parent_text = course_label.parent.get_text() if course_label.parent else str(course_label)
        course_text = _clean_text(parent_text)

    body_text = soup.get_text()
    if not course_text:
        course_text = body_text[:3000]

    dist_match = re.search(r"([\d,]{3,6})\s*m(?:ートル)?", course_text)
    if dist_match:
        distance = int(dist_match.group(1).replace(",", ""))
    if "ダート" in course_text:
        surface = "ダート"

    track_names = ["札幌", "函館", "福島", "新潟", "東京", "中山", "中京", "京都", "阪神", "小倉"]
    search_range = body_text[:600]  # レース名・コース情報に近い先頭部分のみを対象にする
    earliest_pos = None
    for t in track_names:
        pos = search_range.find(t)
        if pos != -1 and (earliest_pos is None or pos < earliest_pos[1]):
            earliest_pos = (t, pos)
    if earliest_pos:
        track = earliest_pos[0]

    horses = []
    table = soup.find("table")
    if not table:
        raise JraFetchError("出走馬テーブルが見つかりませんでした。ページ構造が変更された可能性があります。")

    grid = _normalize_table_rows(table)
    current_waku = None
    i = 0
    while i < len(grid):
        cells = grid[i]
        if len(cells) < 3:
            i += 1
            continue

        waku_text = _cell_text(cells[0])
        waku_match = re.match(r"^(\d)$", waku_text)
        if waku_match:
            current_waku = int(waku_match.group(1))

        num_text = _cell_text(cells[1])
        num_match = re.match(r"^(\d{1,2})$", num_text)

        if not num_match:
            i += 1
            continue

        num = int(num_match.group(1))
        if not (1 <= num <= 18):
            i += 1
            continue

        detail_cell = cells[2] if len(cells) > 2 else None
        if detail_cell is None:
            i += 1
            continue

        basic = _parse_basic_info(detail_cell)
        if not basic["name"]:
            i += 1
            continue

        history = {"前走": None, "前々走": None, "3走前": None, "4走前": None}
        if i + 1 < len(grid):
            next_cells = grid[i + 1]
            # 次の行が「新しい馬の基本情報行」かどうかを判定する。
            # 基本情報行は必ず「detail_cell（馬名リンクを含むセル）」を持つため、
            # その有無で判定する（列位置のズレに影響されない）。
            next_has_horse_link = any(
                c is not None and c.find("a") and re.search(r"/\s*[逃先差追]", _cell_text(c))
                for c in next_cells
            )
            if not next_has_horse_link:
                candidates = [c for c in next_cells if c is not None]
                if candidates:
                    history_cell = max(candidates, key=lambda c: len(_cell_text(c)))
                    cell_text = _cell_text(history_cell)
                    if "前走" in cell_text or "非開催" in cell_text:
                        history = _parse_history(history_cell)
                        i += 1

        style = basic["style"] or infer_style_from_history(history)

        horses.append({
            "num": num,
            "waku": current_waku or min(8, (num + 1) // 2),
            "name": basic["name"],
            "jockey": basic["jockey"],
            "pedigree": "",
            "style": style,
            "history": history,
        })

        i += 1

    if not horses:
        raise JraFetchError(
            "出走馬データを抽出できませんでした。JRAサイトの構造が変更された可能性があります。"
            "お手数ですが手動でのCSV取り込みをご利用ください。"
        )

    return {
        "race_name": race_name,
        "track": track,
        "surface": surface,
        "distance": distance,
        "horses": horses,
    }


def fetch_and_parse(url: str) -> dict:
    html = fetch_jra_html(url)
    return parse_shutuba(html)
