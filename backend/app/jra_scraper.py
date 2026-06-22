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


def _extract_number_from_cell(cell) -> str:
    """セルからテキストの数字を取得する。テキストが空の場合、
    セル内の画像のalt属性やファイル名から数字を抽出するフォールバックを試みる。
    """
    if cell is None:
        return ""
    text = _cell_text(cell)
    if text:
        return text
    # 画像のalt属性やsrcファイル名に数字が含まれていないか確認する
    img = cell.find("img")
    if img:
        alt = img.get("alt", "")
        m = re.search(r"(\d{1,2})", alt)
        if m:
            return m.group(1)
        src = img.get("src", "")
        m = re.search(r"(\d{1,2})", src)
        if m:
            return m.group(1)
    return ""


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

    # 騎手・調教師の判定は、detail_cell内のリンク数によってページパターンを判別する。
    # - 重賞パターン: リンクは「馬名・調教師」の2つのみ。騎手は別セル（性齢/騎手セル）にある。
    # - 未勝利戦パターン: リンクは「馬名・騎手・調教師」の3つ。騎手の直後に斤量「(57.0)」、
    #   調教師の直後に所属地名「(栗東)」が続く。
    jockey = ""
    trainer = ""
    other_links = links[1:]  # links[0] は馬名

    if len(other_links) <= 1:
        # 重賞パターン: 残り1つのリンクは確実に調教師。騎手はここでは確定できないため、
        # 呼び出し元（メインループ）の隣接セル探索に委ねる。
        if other_links:
            trainer = _clean_text(other_links[0].get_text())
    else:
        # 未勝利戦パターン（リンクが2つ以上残っている）: 直後のテキストパターンで役割を判定する。
        for link in other_links:
            link_text = _clean_text(link.get_text())
            if not link_text:
                continue
            next_text = ""
            nxt = link.next_sibling
            steps = 0
            while nxt is not None and steps < 5 and len(next_text) < 20:
                if isinstance(nxt, str):
                    next_text += nxt
                else:
                    break
                nxt = nxt.next_sibling
                steps += 1
            next_text = next_text.strip()

            if re.match(r"^[（(]\d{2}\.\d[)）]", next_text):
                jockey = link_text
            elif re.match(r"^[（(][^\d]", next_text):
                trainer = link_text
            elif not jockey and not trainer:
                # パターンに当てはまらない場合、最初に見つかったものを騎手の暫定候補とする
                jockey = link_text

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
    """1走分のテキストセグメントを構造化データに変換する。

    実データ上の並び順（例）:
    「2026年5月17日 東京 府中牝馬S GⅢ 18着 18頭5番1番人気 戸崎圭太 56.0kg
      1800芝 1:31.8 良 106 504kg 1313 3F 33.2 エンブロイダー(0.9)」
    のように、タイムの直後に「馬場状態」「レーティング(数字、重賞のみ)」「馬体重」の順で並ぶ。
    騎手名は「距離+芝/ダート」表記の直前、斤量(kg)表記の直前に位置する。
    """
    if not segment or segment[:4].strip() in ("なし", "前走非開催") or "非開催" in segment[:8]:
        return None

    result = {
        "date": "", "track": "", "class_name": "", "surface": "", "distance": 0,
        "condition": "", "headcount": 0, "rank": 0, "popularity": 0,
        "time": "", "weight": 0, "jockey": "", "corner_positions": "", "last_3f": "",
        "rating": 0, "impost": 0.0,
    }

    date_match = re.search(r"(\d{4})年(\d{1,2})月(\d{1,2})日", segment)
    if not date_match:
        return None
    result["date"] = f"{date_match.group(1)}-{int(date_match.group(2)):02d}-{int(date_match.group(3)):02d}"

    track_match = re.search(r"\d{4}年\d{1,2}月\d{1,2}日\s*([札幌函館福島新潟東京中山中京京都阪神小倉]+)", segment)
    if track_match:
        result["track"] = track_match.group(1)

    # クラス名: 「[○○S]」のようなmarkdownリンク表記、または競馬場名の直後に続く
    # レース名（次に着順や頭数の数字が来るまでの文字列）から抽出する。
    class_match = re.search(r"\[([^\]]+)\]", segment)
    if class_match:
        result["class_name"] = class_match.group(1)
    elif track_match:
        after_track = segment[track_match.end():]
        # 競馬場名の直後から、最初に現れる「○着」または「○頭」の手前までをレース名候補とする
        name_match = re.match(r"\s*([^\d]{2,20}?)(?=\s*\d{1,2}着|\s*\d{1,2}頭)", after_track)
        if name_match:
            candidate = _clean_text(name_match.group(1))
            # グレード表記（GⅠ/GⅡ/GⅢ等）が混じっていても許容する
            if candidate and candidate not in ("良", "稍重", "重", "不良"):
                result["class_name"] = candidate

    # 距離・芝/ダート: 「1800芝」のように数字が先のパターンと、
    # 「ダート1800」のように種別が先のパターンの両方に対応する。
    surf_dist_match = re.search(r"(\d{3,4})\s*(芝|ダート|ダ)(?!\w)", segment)
    if surf_dist_match:
        result["distance"] = int(surf_dist_match.group(1))
        result["surface"] = "ダート" if surf_dist_match.group(2) in ("ダート", "ダ") else "芝"
    else:
        surf_dist_match = re.search(r"(芝|ダート)\s*(\d{3,4})", segment)
        if surf_dist_match:
            result["surface"] = "ダート" if surf_dist_match.group(1) == "ダート" else "芝"
            result["distance"] = int(surf_dist_match.group(2))

    headcount_match = re.search(r"(\d{1,2})頭", segment)
    if headcount_match:
        result["headcount"] = int(headcount_match.group(1))

    after_headcount = segment[headcount_match.end():] if headcount_match else segment
    rank_match = re.match(r"\s*(\d{1,2})\s*番?\s*\d*\s*着|\s*(\d{1,2})着", after_headcount)
    # 「○頭」の直前に「○着」が来るケース（着順が頭数より前に出現するページもあるため両対応）
    rank_before_match = re.search(r"(\d{1,2})着\s*\d{1,2}頭", segment)
    if rank_before_match:
        result["rank"] = int(rank_before_match.group(1))
    elif rank_match:
        g = rank_match.group(1) or rank_match.group(2)
        if g:
            result["rank"] = int(g)

    pop_match = re.search(r"(\d{1,2})番人気", segment[:60])
    if pop_match:
        result["popularity"] = int(pop_match.group(1))

    time_match = re.search(r"(\d{1,2}:\d{2}\.\d)", segment)
    if time_match:
        result["time"] = time_match.group(1)

    weight_match = re.search(r"(\d{3,4})kg", segment)
    if weight_match:
        result["weight"] = int(weight_match.group(1))

    # 馬場状態: タイムの直後（重賞ではこの後にレーティング数字が続くこともある）、
    # または距離・種別表記の直後（未勝利戦等のページ構造）のいずれかから取得する。
    cond_found = False
    cond_end_pos = None
    if time_match:
        after_time = segment[time_match.end():]
        cond_match = re.match(r"\s*(良|稍重|重|不良)", after_time)
        if cond_match:
            result["condition"] = cond_match.group(1)
            cond_found = True
            cond_end_pos = time_match.end() + cond_match.end()
    if not cond_found:
        cond_match2 = re.search(r"(?:芝|ダート|ダ)\s*(良|稍重|重|不良)", segment)
        if cond_match2:
            result["condition"] = cond_match2.group(1)
            cond_found = True
    if not cond_found and surf_dist_match:
        after_surf = segment[surf_dist_match.end():]
        cond_match3 = re.match(r"\s*(良|稍重|重|不良)", after_surf)
        if cond_match3:
            result["condition"] = cond_match3.group(1)

    # レーティング（重賞のみ付与される強さ指数）: 馬場状態の直後、馬体重(kg)表記の手前に
    # 単独で現れる2〜3桁の数字。未勝利戦等では付与されないため、見つからなければ0のまま。
    if cond_end_pos is not None and weight_match:
        between_cond_weight = segment[cond_end_pos:weight_match.start()]
        rating_match = re.search(r"(\d{2,3})", between_cond_weight)
        if rating_match:
            result["rating"] = int(rating_match.group(1))

    # 通過順表示: 「3 3」のように半角スペース区切り、または「3-3」のようにハイフン区切りの数字列。
    # 末尾に「3F」が続く直前のパターンを通過順とみなす。
    corner_match = re.search(r"((?:\d{1,2}[\s-]+)+\d{1,2})\s*3F", segment)
    if corner_match:
        result["corner_positions"] = re.sub(r"[\s-]+", "-", corner_match.group(1).strip())

    last3f_match = re.search(r"3F\s*(\d{2}\.\d)", segment)
    if last3f_match:
        result["last_3f"] = last3f_match.group(1)

    # 騎手名: 「斤量(kg)表記の直前」、または「(57.0)のような斤量括弧表記の直前」にある
    # 人名らしき文字列。姓と名の間にスペースが入ることがあるため、直前から逆方向に
    # 全角/半角スペース区切りの語を最大2つまで含める。
    jockey_found = False
    weight_kg_match = re.search(r"([^\s0-9(（]+(?:[ \u3000][^\s0-9(（]+)?)\s*(\d{2}\.\d)\s*kg", segment)
    if weight_kg_match:
        candidate = _clean_text(weight_kg_match.group(1))
        if candidate and candidate not in ("良", "稍重", "重", "不良"):
            result["jockey"] = candidate
            jockey_found = True
        result["impost"] = float(weight_kg_match.group(2))
    if not jockey_found:
        # 「(57.0)」の直前にある語を逆方向に取得し、もし"kg"を含んでいたら
        # それより後ろの部分だけを候補とする（"500kg 横山琉人"のような連結を分離するため）
        bracket_match = re.search(r"([^(（]{1,20})[（(](\d{2}\.\d)[)）]", segment)
        if bracket_match:
            raw_candidate = bracket_match.group(1)
            # 末尾の空白を除いた上で、"kg"が含まれていればそれ以降の部分のみを使う
            if "kg" in raw_candidate:
                raw_candidate = raw_candidate.rsplit("kg", 1)[-1]
            candidate = _clean_text(raw_candidate)
            if candidate and candidate not in ("良", "稍重", "重", "不良"):
                result["jockey"] = candidate
            if not result["impost"]:
                result["impost"] = float(bracket_match.group(2))

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

    dist_match = re.search(r"([\d,]{3,6})\s*(?:m|メートル)", course_text)
    if dist_match:
        distance = int(dist_match.group(1).replace(",", ""))
    if "ダート" in course_text:
        surface = "ダート"

    track_names = ["札幌", "函館", "福島", "新潟", "東京", "中山", "中京", "京都", "阪神", "小倉"]

    # 優先パターン: 「3回東京6回」のような開催情報表記（h2見出しや回次表記に頻出）から競馬場名を抽出する。
    # これは過去走データ内の競馬場名より確実に「今回開催される競馬場」を指す。
    meeting_text = race_name + " " + body_text[:400]
    track = ""
    meeting_match = re.search(r"\d+回([札幌函館福島新潟東京中山中京京都阪神小倉]+)\d+日", meeting_text)
    if meeting_match:
        track = meeting_match.group(1)
    else:
        search_range = body_text[:600]
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

    # ヘッダー行から「前走」「前々走」「3走前」「4走前」の列インデックスを特定する。
    # 重賞ページ等では各列が独立しており、同じ行内に過去4走分の情報が横並びで存在するため、
    # ここで列位置を把握しておき、行ごとの処理で直接参照する。
    history_col_map = {}
    if grid:
        header_cells = grid[0]
        for idx, c in enumerate(header_cells):
            if c is None:
                continue
            header_text = _cell_text(c)
            for label in ["前走", "前々走", "3走前", "4走前"]:
                if header_text == label or header_text.startswith(label):
                    history_col_map.setdefault(label, idx)

    current_waku = None
    fallback_num = 0
    i = 0
    while i < len(grid):
        cells = grid[i]
        if len(cells) < 3:
            i += 1
            continue

        waku_text = _extract_number_from_cell(cells[0])
        waku_match = re.match(r"^(\d)$", waku_text)
        if waku_match:
            current_waku = int(waku_match.group(1))

        num_text = _extract_number_from_cell(cells[1])
        num_match = re.match(r"^(\d{1,2})$", num_text)

        # detail_cell（馬名リンクを含むセル）をこの行の中から探す。
        # レース種別によって列位置が変わる（重賞ページでは枠・馬番セルが
        # 画像表示のみでテキストが空になることがある）ため、列番号に依存せず
        # 「馬名らしきリンクを含むセル」を直接探索する。
        detail_cell = None
        detail_idx = None
        for idx, c in enumerate(cells):
            if c is None or idx < 2 and not num_match:
                pass
            if c is not None and c.find("a"):
                cell_text = _cell_text(c)
                # 「父：」「調教師所属」等を含む、馬名以降の情報が詰まったセルを基本情報セルとみなす
                if re.search(r"父[：:]", cell_text) or re.search(r"/\s*[逃先差追]", cell_text):
                    detail_cell = c
                    detail_idx = idx
                    break

        # 上記で見つからない場合、馬番セルの次にあるリンク付きセルを採用（従来ロジックのフォールバック）
        if detail_cell is None and num_match:
            candidate_idx = 2
            if candidate_idx < len(cells) and cells[candidate_idx] is not None and cells[candidate_idx].find("a"):
                detail_cell = cells[candidate_idx]
                detail_idx = candidate_idx

        if detail_cell is None:
            i += 1
            continue

        basic = _parse_basic_info(detail_cell)
        if not basic["name"]:
            i += 1
            continue

        # 騎手が基本情報セル内で見つからなかった場合、隣接セル（性齢/騎手セルなど）からも探す。
        # 過去走情報セル（前走/前々走など）には別の騎手名が含まれているため、必ず除外する。
        # 優先順位: detail_idxの直後のセル → それ以外の非過去走セル、の順に探す。
        current_impost = 0.0
        if not basic["jockey"]:
            def is_history_cell(cell_text):
                return ("前走" in cell_text) or ("非開催" in cell_text) or ("なし" in cell_text[:10])

            candidate_indices = []
            if detail_idx is not None:
                candidate_indices.append(detail_idx + 1)
            candidate_indices += [idx for idx in range(len(cells)) if idx not in candidate_indices and idx != detail_idx]

            for idx in candidate_indices:
                if idx < 0 or idx >= len(cells):
                    continue
                c = cells[idx]
                if c is None:
                    continue
                cell_text = _cell_text(c)
                if is_history_cell(cell_text):
                    continue
                jockey_link = c.find("a")
                if jockey_link:
                    jockey_text = _clean_text(jockey_link.get_text())
                    # 性齢・斤量と一緒に騎手名がある典型パターン（例: "牡4/鹿毛 55.5kg [騎手]"）
                    is_typical_jockey_cell = (
                        re.search(r"\d{2}\.\d\s*kg", cell_text)
                        or re.search(r"^\S{1,2}\d\s*/", cell_text)
                    )
                    # detail_cellの直後セルで、かつそのセル内のリンクが1つだけの場合は
                    # 上記パターンに厳密一致しなくても騎手とみなす（最も信頼できる位置のため）
                    is_immediate_next = (detail_idx is not None and idx == detail_idx + 1)
                    only_one_link = len(c.find_all("a")) == 1
                    if is_typical_jockey_cell or (is_immediate_next and only_one_link):
                        basic["jockey"] = jockey_text
                        # 同じセル内にある今回の斤量（例: "54.0kg"）も同時に取得する
                        impost_match = re.search(r"(\d{2}\.\d)\s*kg", cell_text)
                        if impost_match:
                            current_impost = float(impost_match.group(1))
                        break

        # 血統情報: 基本情報セルから「父：○○ 母：○○」を抽出
        pedigree = ""
        detail_text_full = _cell_text(detail_cell)
        sire_dam_match = re.search(r"父[：:]\s*([^\s]+)\s*母[：:]\s*([^\s(（]+)(?:[（(]母の父[：:]\s*([^\s)）]+)[)）])?", detail_text_full)
        if sire_dam_match:
            sire = sire_dam_match.group(1)
            pedigree = f"{sire}系"

        # 枠番・馬番が画像表示等でテキスト取得できない場合は出現順で連番を振る
        if num_match:
            num = int(num_match.group(1))
        else:
            fallback_num += 1
            num = fallback_num
        if not (1 <= num <= 18):
            i += 1
            continue

        history = {"前走": None, "前々走": None, "3走前": None, "4走前": None}

        # 方式1: ヘッダーで特定した列インデックスから、同じ行内の対応セルを直接読む
        # （重賞ページ等、1行に1頭の全情報が収まっている構造で機能する）
        if history_col_map:
            for label, col_idx in history_col_map.items():
                if col_idx < len(cells) and cells[col_idx] is not None:
                    cell_text = _cell_text(cells[col_idx])
                    if cell_text and ("非開催" not in cell_text) and len(cell_text) > 5:
                        history[label] = _parse_one_race_segment(cell_text)

        # 方式2（フォールバック）: 同一行内に見つからなかった場合、次の行が
        # 過去走情報の続きである可能性を確認する（未勝利戦等、rowspan構造のページ向け）
        if all(v is None for v in history.values()) and i + 1 < len(grid):
            next_cells = grid[i + 1]
            next_text_all = " ".join(_cell_text(c) for c in next_cells if c is not None)
            next_has_horse = any(
                c is not None and c.find("a") and (
                    re.search(r"父[：:]", _cell_text(c)) or re.search(r"/\s*[逃先差追]", _cell_text(c))
                )
                for c in next_cells
            )
            looks_like_history = ("前走" in next_text_all) or ("非開催" in next_text_all)

            if not next_has_horse and looks_like_history:
                candidates = [c for c in next_cells if c is not None]
                if candidates:
                    history_cell = max(candidates, key=lambda c: len(_cell_text(c)))
                    history = _parse_history(history_cell)
                    i += 1

        style = basic["style"] or infer_style_from_history(history)

        horses.append({
            "num": num,
            "waku": current_waku or min(8, (num + 1) // 2),
            "name": basic["name"],
            "jockey": basic["jockey"],
            "pedigree": pedigree,
            "style": style,
            "history": history,
            "current_impost": current_impost,
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
