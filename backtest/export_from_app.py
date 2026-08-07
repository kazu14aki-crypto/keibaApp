# -*- coding: utf-8 -*-
"""
export_from_app.py — KiriScoreアプリからバックテスト用CSVを生成する

アプリに記録済みのレース(採点済み・結果着順入力済み・オッズ入力済み)を
APIから吸い出し、backtest.py が読める形式のCSVに変換する。

使い方 (PowerShell):
  python export_from_app.py --url https://keibaapp-wy1f.onrender.com --password アプリのパスワード --out kiriscore_data.csv

必要条件:
  * 各レースで「採点基準を自動計算」実行済み (factorsに点数が入っている)
  * 各馬の result_rank (結果着順) が入力済み
  * 各馬の odds (単勝オッズ) が入力済み ← 期待値検証に必須
  オッズ未入力のレースもエクスポートされるが、backtest.pyのブレンド較正
  には使えない(モデル単体のβ較正には使える)。

運用のコツ (フェーズ2の時短):
  毎週土日、興味のあるレースだけでなく「その日の全重賞+特別戦」を
  機械的に取り込み→自動計算→発走直前にオッズ入力→月曜に着順入力、
  というルーチンを組むと、週30〜50レース×2ヶ月で300レース超が貯まる。
  1レースあたりの作業は3分程度。データが100レースを超えた時点で
  一度 backtest.py にかけ、β・ブレンドwを較正すること。
"""

import argparse
import csv
import json
import sys
import urllib.request


def api_request(base_url, path, token=None, method="GET", body=None):
    url = base_url.rstrip("/") + path
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = "Bearer " + token
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode())


def total_score(factors):
    """frontend/src/lib/scoring.js の totalScore と同一: 全ファクター合算。"""
    if not factors:
        return 0
    return sum(v for v in factors.values() if isinstance(v, (int, float)))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", required=True, help="アプリのバックエンドURL (例: https://keibaapp-wy1f.onrender.com)")
    ap.add_argument("--password", required=True, help="アプリのログインパスワード")
    ap.add_argument("--out", default="kiriscore_data.csv", help="出力CSVパス")
    args = ap.parse_args()

    print("ログイン中…")
    login = api_request(args.url, "/auth/login", method="POST", body={"password": args.password})
    token = login.get("access_token") or login.get("token")
    if not token:
        print("ログイン失敗。レスポンス:", login)
        sys.exit(1)

    print("レース一覧を取得中…")
    races = api_request(args.url, "/races", token=token)

    rows = []
    n_with_results = 0
    n_with_odds = 0
    for race_summary in races:
        rid = race_summary["id"]
        race = api_request(args.url, f"/races/{rid}", token=token)
        horses = race.get("horses", [])
        if not horses:
            continue

        # result_rank が数字で入っている馬だけを対象にする
        parsed = []
        for h in horses:
            rank_str = str(h.get("result_rank") or "").strip()
            if not rank_str.isdigit():
                continue
            parsed.append({
                "num": h.get("num"),
                "score": total_score(h.get("factors")),
                "odds": float(h.get("odds") or 0),
                "finish": int(rank_str),
                "odds_captured_at": h.get("odds_captured_at") or "",
            })

        # 勝ち馬が記録されているレースのみ有効
        if not parsed or not any(p["finish"] == 1 for p in parsed):
            continue
        if len(parsed) < 5:
            continue

        n_with_results += 1
        if any(p["odds"] > 1 for p in parsed):
            n_with_odds += 1

        for p in parsed:
            rows.append({
                "race_id": rid,
                "date": race.get("date") or "",
                "horse_num": p["num"],
                "score": p["score"],
                "odds": p["odds"],
                "finish": p["finish"],
                "odds_captured_at": p["odds_captured_at"],
            })

    with open(args.out, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["race_id", "date", "horse_num", "score", "odds", "finish", "odds_captured_at"])
        writer.writeheader()
        writer.writerows(rows)

    print(f"完了: {args.out}")
    print(f"  結果記録済みレース : {n_with_results} 件")
    print(f"  うちオッズ入力済み : {n_with_odds} 件 (ブレンド較正に使えるのはこの分)")
    print(f"  総行数            : {len(rows)} 行")
    captured = sum(1 for r in rows if r["odds_captured_at"])
    print(f"  時点記録済み行    : {captured} 行 (未記録オッズは厳密検証では除外されます)")
    if n_with_results < 30:
        print("  ※ backtest.py の実行には最低30レース(推奨100以上)が必要です。")
    print(f"\n次のステップ: python backtest.py {args.out}")


if __name__ == "__main__":
    main()
