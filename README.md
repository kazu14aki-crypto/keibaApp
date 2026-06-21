# KiriScore — 独自採点 馬券分析台帳

あなた専用の非公開Webアプリです。パスワードログイン＋独自URLで運用します。

構成：React/Vite（フロントエンド）＋ FastAPI（バックエンド）＋ Neon/PostgreSQL（DB）＋ Render.com（ホスティング）

---

## 0. 全体の流れ

```
① Neonでプロジェクト作成 → 接続文字列を取得（テーブルは自動作成されます）
② GitHubにこのコードをpush
③ Renderでバックエンドをデプロイ → URLが発行される
④ Renderでフロントエンドをデプロイ（③のURLを設定）→ これが本番URL
⑤ ログインパスワードを決めて環境変数に設定
⑥ 完成。③④で発行されたURLとパスワードだけが鍵になる
```

所要時間目安：20〜35分

---

## 1. Neonのセットアップ

1. https://neon.tech にアクセスし、アカウント作成（GitHubアカウントでのサインインが簡単です）。
2. **Create a project** で新規プロジェクトを作成します。
   - Project name: 任意（例：`kirisuite`）
   - Region: `AWS Asia Pacific (Tokyo)` を推奨
   - Postgres version: デフォルトのままでOK
3. プロジェクト作成後のダッシュボードに **Connection string** が表示されます。これをコピーします。
   ```
   postgresql://user:password@ep-xxxx.ap-northeast-1.aws.neon.tech/dbname?sslmode=require
   ```
   この文字列が `DATABASE_URL` になります（後でRenderの環境変数に設定）。

> ✅ テーブル（races / horses）は、バックエンドの初回起動時に自動的に作成されます。手動でSQLを実行する必要はありません。
> 参考：`backend/schema_reference.sql` に作成されるテーブルの構造を記載しています（実行は不要です）。

> ⚠️ Neonの無料プランは、一定時間アクセスがないとDBが自動的にスリープします。次のアクセス時に数秒の遅延が発生することがありますが、データが消えることはありません。

---

## 2. GitHubリポジトリの作成

1. GitHubで新しいプライベートリポジトリを作成します（例：`kirisuite`）。**Private** を選択してください。
2. ローカルでこのフォルダ一式をpushします。

```bash
cd kirisuite
git init
git add .
git commit -m "Initial commit: KiriScore"
git branch -M main
git remote add origin https://github.com/あなたのユーザー名/kirisuite.git
git push -u origin main
```

`.gitignore` で `.env` ファイルは除外される設定になっているので、誤ってパスワードや接続文字列がpushされる心配はありません。

---

## 3. バックエンドをRenderにデプロイ

1. https://dashboard.render.com にログイン。
2. **New + → Web Service** を選択。
3. 先ほどpushしたGitHubリポジトリを連携・選択します。
4. 設定項目：
   - **Name**: `kirisuite-backend`（好きな名前でOK。これがURLの一部になります）
   - **Root Directory**: `backend`
   - **Runtime**: `Python 3`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
   - **Instance Type**: Free でOK
5. **Environment Variables** に以下を設定します：

   | キー | 値 |
   |---|---|
   | `APP_PASSWORD` | あなたが決めるログインパスワード（16文字以上推奨） |
   | `JWT_SECRET` | ランダムな64桁の文字列。下記コマンドで生成できます |
   | `JWT_EXPIRE_HOURS` | `168`（7日間。お好みで変更可） |
   | `DATABASE_URL` | 手順1でコピーしたNeonの接続文字列 |
   | `ALLOWED_ORIGINS` | いったん `*` でデプロイし、手順4でフロントURLが分かったら更新 |

   `JWT_SECRET` の生成コマンド：
   ```bash
   python3 -c "import secrets; print(secrets.token_hex(32))"
   ```

6. **Create Web Service** を押すとデプロイが始まります。数分待つと
   `https://kirisuite-backend-XXXX.onrender.com` のようなURLが発行されます。これを控えておきます。
   このとき、バックエンドの起動ログに `init_db` が走り、Neon上に自動でテーブルが作成されます。

---

## 4. フロントエンドをRenderにデプロイ

1. 再度 **New + → Web Service** を選択し、同じGitHubリポジトリを選択します。
2. 設定項目：
   - **Name**: `kirisuite-frontend`（このサブドメイン名が最終的な本番URLになります）
   - **Root Directory**: `frontend`
   - **Runtime**: `Node`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm run preview`
   - **Instance Type**: Free
3. **Environment Variables**:

   | キー | 値 |
   |---|---|
   | `VITE_API_BASE_URL` | 手順3で発行されたバックエンドのURL |

4. デプロイすると `https://kirisuite-frontend-XXXX.onrender.com` のようなURLが発行されます。
   **これが最終的にあなたがアクセスする本番URLです。**

---

## 5. 仕上げ：CORSの設定を更新

1. Renderのバックエンドサービス（`kirisuite-backend`）の設定画面に戻ります。
2. 環境変数 `ALLOWED_ORIGINS` を、手順4で発行されたフロントエンドのURLに更新します。
   ```
   ALLOWED_ORIGINS=https://kirisuite-frontend-XXXX.onrender.com
   ```
3. 保存すると自動的に再デプロイされます。

---

## 6. 完成・動作確認

1. フロントエンドのURL（`https://kirisuite-frontend-XXXX.onrender.com`）にアクセスします。
2. ログイン画面が表示されるので、手順3で設定した `APP_PASSWORD` を入力します。
3. 出馬表一覧が表示されれば成功です。

このURLとパスワードを知っている人だけがアクセスできます。検索エンジンにも載りません（`index.html` に `noindex` 設定済み）。

---

## 日常の使い方（毎週金曜）

1. JRA公式サイト等で土日の出馬表を確認します。
2. 「＋ レースを追加」でレースを作成（競馬場・距離・馬場状態を入力）。
3. 出馬表をスプレッドシートにコピー＆ペーストし、以下の列を持つCSVとして保存します：
   ```
   馬番,枠番,馬名,騎手,血統,脚質
   ```
4. レース詳細画面の「⇧ 出馬表CSVを取り込む」から読み込みます。
5. 各馬をタップして6項目をスライダーで採点します。
6. レース後、結果着順を入力すると「傾向分析」に反映されます。

---

## 無料プランの注意点

- **Render（バックエンド/フロントエンド）**：一定時間アクセスがないとスリープします。次のアクセス時に起動で30秒〜1分ほどかかることがあります。
- **Neon（DB）**：同様に一定時間操作がないとスリープしますが、データは保持されます。次回アクセス時に数秒の遅延が出る程度です。
- どちらも個人利用であれば実用上問題ありません。頻繁に使う場合はRenderの有料プラン（月7ドル程度〜）でスリープを解消できます。

---

## トラブルシューティング

- **ログインできない**：Renderのバックエンド環境変数 `APP_PASSWORD` が正しく設定されているか確認してください。
- **データが表示されない／保存できない**：ブラウザの開発者ツール（F12）のConsoleタブでエラーを確認し、`ALLOWED_ORIGINS` の設定漏れ（CORSエラー）がないか確認してください。
- **DB接続エラー**：`DATABASE_URL` の末尾に `?sslmode=require` が付いているか確認してください（Neonの接続文字列をそのままコピーしていれば問題ありません）。
- **CSV取り込みが失敗する**：文字コードはUTF-8で保存してください（Excelの場合は「CSV UTF-8（コンマ区切り）」を選択）。
