"""
JRA公式サイトの出馬表ページ（accessD.html）からデータを取得・解析するモジュール。

設計方針:
- 個人の私的利用を前提とした、1リクエスト=1レースの単発取得のみ。
- 巡回・連続クロールは行わない（呼び出し元のAPIも1回のリクエストにつき1URLのみ受け付ける）。
- サイト構造の変更で解析が失敗した場合は、その旨を例外として呼び出し元に伝え、
  手動CSV入力にフォールバックできるようにする。
"""
import re
import requests
from bs4 import BeautifulSoup

USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

ALLOWED_HOSTS = {"www.jra.go.jp", "sp.jra.jp", "jra.jp"}

STYLES = ["逃げ", "先行", "差し", "追込"]


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

    # JRAサイトはShift-JIS系（CP932）でエンコードされていることが多い
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
    # pending: col_index -> [remaining_rowspan, cell_tag]
    pending = {}

    for row in rows:
        cells = row.find_all(["td", "th"])
        row_result = {}
        carried_over_keys = set()

        # まず、前の行から持ち越されたrowspanセルをこの行に配置
        for c_idx, (remaining, tag) in pending.items():
            if remaining > 0:
                row_result[c_idx] = tag
                carried_over_keys.add(c_idx)

        # 新規セルを、埋まっていない最小の列インデックスから順に配置
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

        # pendingの更新: 持ち越し分はカウントダウン、新規追加分はそのまま登録
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


def parse_shutuba(html: str) -> dict:
    """出馬表HTMLを解析し、レース情報と出走馬リストを返す。

    戻り値:
        {
            "race_name": str,
            "track": str,
            "surface": str,
            "distance": int,
            "horses": [
                {"num": int, "waku": int, "name": str, "jockey": str, "pedigree": str, "style": str},
                ...
            ]
        }
    """
    soup = BeautifulSoup(html, "lxml")

    # --- レース名・コース情報の抽出 ---
    race_name = ""
    h2 = soup.find("h2")
    if h2:
        race_name = _clean_text(h2.get_text())

    track = ""
    surface = "芝"
    distance = 0

    course_text = ""
    course_label = soup.find(string=re.compile(r"コース[：:]"))
    if course_label:
        course_text = _clean_text(str(course_label.parent.get_text() if course_label.parent else course_label))
    else:
        # ページ全体から距離表記を拾う最終手段
        m = re.search(r"(\d{3,4})メートル", soup.get_text())
        if m:
            distance = int(m.group(1))

    dist_match = re.search(r"([\d,]{3,6})\s*(?:m|メートル)", course_text)
    if dist_match:
        distance = int(dist_match.group(1).replace(",", ""))
    if "ダート" in course_text or re.search(r"ダ[ー・]", course_text):
        surface = "ダート"

    # 競馬場名はタイトルやパンくずから抽出
    title_text = soup.get_text()
    for t in ["札幌", "函館", "福島", "新潟", "東京", "中山", "中京", "京都", "阪神", "小倉"]:
        if t in title_text[:2000]:
            track = t
            break

    # --- 出走馬テーブルの抽出 ---
    # JRAの出馬表は1テーブル内に「枠」「馬番」「馬名等」の列を持ち、
    # 同枠2頭目以降は枠セルがrowspanで省略される構造になっている。
    horses = []
    table = soup.find("table")
    if not table:
        raise JraFetchError("出走馬テーブルが見つかりませんでした。ページ構造が想定と異なる可能性があります。")

    grid = _normalize_table_rows(table)
    current_waku = None

    for cells in grid:
        if len(cells) < 3:
            continue

        # 列0: 枠番（rowspanで補完済み）、列1: 馬番、列2: 詳細（馬名・血統等）、列3: 騎手
        waku_text = _cell_text(cells[0])
        waku_match = re.match(r"^(\d)$", waku_text)
        if waku_match:
            current_waku = int(waku_match.group(1))

        num_text = _cell_text(cells[1]) if len(cells) > 1 else ""
        num_match = re.match(r"^(\d{1,2})$", num_text)
        if not num_match:
            continue
        num = int(num_match.group(1))
        if not (1 <= num <= 18):
            continue

        detail_cell = cells[2] if len(cells) > 2 else None
        if detail_cell is None:
            continue

        # 馬名: 詳細セル内の最初のリンク
        name = ""
        name_link = detail_cell.find("a")
        if name_link:
            name = _clean_text(name_link.get_text())

        detail_text = _cell_text(detail_cell)

        # 血統: 「父：」を含む箇所
        pedigree = ""
        sire_match = re.search(r"父[：:]\s*([^\s]+)", detail_text)
        if sire_match:
            pedigree = sire_match.group(1) + "系"

        # 騎手: 詳細セルの次の列
        jockey = ""
        if len(cells) > 3:
            jockey_cell_text = _cell_text(cells[3])
            jockey_match = re.match(r"^([^\d(（]+)", jockey_cell_text)
            if jockey_match:
                jockey = jockey_match.group(1).strip()

        if not name:
            continue

        horses.append({
            "num": num,
            "waku": current_waku or min(8, (num + 1) // 2),
            "name": name,
            "jockey": jockey,
            "pedigree": pedigree,
            "style": "先行",  # JRAページに脚質情報はないため既定値。人による手入力を想定。
        })

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
