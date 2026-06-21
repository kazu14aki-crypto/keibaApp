from datetime import datetime, timedelta, timezone
from fastapi import HTTPException, Header
from jose import jwt, JWTError
from app.config import JWT_SECRET, JWT_ALGORITHM, JWT_EXPIRE_HOURS


def create_access_token() -> str:
    """ログイン成功時にアクセストークンを発行する。"""
    expire = datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRE_HOURS)
    payload = {"sub": "owner", "exp": expire}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def verify_token(token: str) -> bool:
    try:
        jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return True
    except JWTError:
        return False


async def require_auth(authorization: str = Header(default=None)) -> None:
    """全APIエンドポイントで使う認証ガード。

    フロントは Authorization: Bearer <token> を付けてリクエストする。
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="認証が必要です。再度ログインしてください。")
    token = authorization.split(" ", 1)[1]
    if not verify_token(token):
        raise HTTPException(status_code=401, detail="セッションの有効期限が切れました。再度ログインしてください。")
