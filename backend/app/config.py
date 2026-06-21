import os
from dotenv import load_dotenv

load_dotenv()

# --- アプリ全体のパスワード（あなた専用ログイン） ---
APP_PASSWORD = os.environ.get("APP_PASSWORD", "")

# --- JWT設定 ---
JWT_SECRET = os.environ.get("JWT_SECRET", "")
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_HOURS = int(os.environ.get("JWT_EXPIRE_HOURS", "168"))  # 既定: 7日間

# --- Neon (PostgreSQL) 接続文字列 ---
# Neonのダッシュボード → Connection string からコピー。
# 例: postgresql://user:password@ep-xxxx.ap-northeast-1.aws.neon.tech/dbname?sslmode=require
DATABASE_URL = os.environ.get("DATABASE_URL", "")

# --- CORS許可オリジン（フロントエンドのURL） ---
ALLOWED_ORIGINS = [
    o.strip() for o in os.environ.get("ALLOWED_ORIGINS", "http://localhost:5173").split(",")
    if o.strip()
]

if not APP_PASSWORD:
    raise RuntimeError("環境変数 APP_PASSWORD が設定されていません。")
if not JWT_SECRET:
    raise RuntimeError("環境変数 JWT_SECRET が設定されていません。")
if not DATABASE_URL:
    raise RuntimeError("環境変数 DATABASE_URL が設定されていません。")
