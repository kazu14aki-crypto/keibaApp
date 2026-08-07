# -*- coding: utf-8 -*-
"""
netkeiba_scraper.py — 過去レース結果(着順・確定単勝オッズ)の収集

【必ず読むこと】
  * このスクリプトはあなたのPC(ローカル)で実行する想定です。
  * netkeibaの利用規約とrobots.txtを事前に確認し、自己責任で使用してください。
    アクセス間隔は既定3秒に設定しており、短縮しないでください。
  * 大量・高速アクセスはサーバー負荷・アカウント制限の原因になります。
  * 最も確実で規約上もクリーンな方法は JRA-VAN Data Lab (月額約2,090円) +
    TARGET frontier JV でのCSVエクスポートです。過去30年分の全レース・
    全馬・確定オッズ・調教・血統が1日で手に入ります。本気でモデルを
    作るなら、スクレイピングよりJRA-VANを強く推奨します。

用途:
  (1) 市場ベンチマークの実測: 実際のJRAデータで「オッズのlogLoss」を測り、
      backtest.pyの demo ではなく現実の壁の高さを知る。
  (2) フェーズ4(機械学習モデル)の特徴量ベースデータ。
  ※ このデータにはKiriScoreが含まれないため、KiriScore自体の
     バックテストには使えません(それは export_from_app.py の役割)。

使い方 (PowerShell):
  pip install requests beautifulsoup4
  python netkeiba_scraper.py --year 2025 --places 05 06 09 --out results_2025.csv
    places: 01札幌 02函館 03福島 04新潟 05東京 06中山 07中京 08京都 09阪神 10小倉
  中断しても再実行すれば取得済みレースはスキップされます(レジューム対応)。
"""

import argparse
import csv
import os
import re
import sys
import time

try:
    import requests
    from bs4 import BeautifulSoup
except ImportError:
    print("pip install requests beautifulsoup4 を先に実行してください")
    sys.exit(1)

BASE = "https://db.netkeiba.com/race/"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) personal-research-script"
SLEEP_SEC = 3.0  # これより短くしないこと


def build_race_ids(year, places):
    """JRAのrace_id体系: YYYY + 場コード2桁 + 開催回2桁 + 日目2桁 + レース番号2桁"""
    ids = []
    for place in places:
        for kai in range(1, 7):
            for day in range(1, 13):
                for r in range(1, 13):
                    ids.append(f"{year}{place}{kai:02d}{day:02d}{r:02d}")
    return ids


def parse_result_page(html, race_id):
    """結果ページから (date, [(馬番, 着順, 単勝オッズ, 人気)]) を抽出"""
    soup = BeautifulSoup(html, "html.parser")
    table = soup.find("table", class_=re.compile("race_table"))
    if table is None:
        return None

    date = ""
    date_link = soup.find("a", href=re.compile(r"/race/list/\d{8}"))
    if date_link:
        m = re.search(r"(\d{4})(\d{2})(\d{2})", date_link.get("href", ""))
        if m:
            date = f"{m.group(1)}-{m.group(2)}-{m.group(3)}"

    rows = []
    for tr in table.find_all("tr")[1:]:
        tds = tr.find_all("td")
        if len(tds) < 13:
            continue
        finish_txt = tds[0].get_text(strip=True)
        if not finish_txt.isdigit():
            continue  # 取消・除外・中止はスキップ
        try:
            horse_num = int(tds[2].get_text(strip=True))
            odds = float(tds[12].get_text(strip=True))
            popularity = int(tds[13].get_text(strip=True)) if len(tds) > 13 else 0
        except (ValueError, IndexError):
            continue
        rows.append((horse_num, int(finish_txt), odds, popularity))
    return (date, rows) if rows else None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--year", type=int, required=True)
    ap.add_argument("--places", nargs="+", default=["05", "06", "08", "09"],
                    help="場コード(既定: 東京 中山 京都 阪神)")
    ap.add_argument("--out", default="netkeiba_results.csv")
    args = ap.parse_args()

    done = set()
    if os.path.exists(args.out):
        with open(args.out, newline="", encoding="utf-8") as f:
            for row in csv.DictReader(f):
                done.add(row["race_id"])
        print(f"レジューム: {len(done)}レース取得済み、スキップします")

    mode = "a" if done else "w"
    with open(args.out, mode, newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        if not done:
            writer.writerow(["race_id", "date", "horse_num", "finish", "odds", "popularity"])

        session = requests.Session()
        session.headers["User-Agent"] = UA
        ids = build_race_ids(args.year, args.places)
        found = 0
        for i, rid in enumerate(ids):
            if rid in done:
                continue
            try:
                resp = session.get(BASE + rid + "/", timeout=15)
                if resp.status_code == 200:
                    resp.encoding = "euc-jp"  # netkeiba dbページはEUC-JP
                    parsed = parse_result_page(resp.text, rid)
                    if parsed:
                        date, rows = parsed
                        for num, finish, odds, pop in rows:
                            writer.writerow([rid, date, num, finish, odds, pop])
                        f.flush()
                        found += 1
                        if found % 20 == 0:
                            print(f"  {found}レース取得 (走査 {i+1}/{len(ids)})")
            except requests.RequestException:
                pass  # 通信エラーは次回レジュームで再取得
            time.sleep(SLEEP_SEC)

    print(f"完了: {found}レースを {args.out} に追記しました")
    print("注意: このCSVにはscoreがありません。市場ベンチマーク測定と")
    print("将来の特徴量モデル用です。KiriScoreの検証は export_from_app.py で。")


if __name__ == "__main__":
    main()
