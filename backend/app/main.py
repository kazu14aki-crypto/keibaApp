from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.config import APP_PASSWORD, ALLOWED_ORIGINS
from app.auth import create_access_token, require_auth
from app.schemas import LoginRequest, LoginResponse
from app.db import init_db
from app.routers import races, horses

app = FastAPI(title="KiriScore API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup():
    init_db()


@app.get("/")
def health_check():
    return {"status": "ok", "service": "KiriScore API"}


@app.post("/auth/login", response_model=LoginResponse)
def login(payload: LoginRequest):
    if payload.password != APP_PASSWORD:
        raise HTTPException(status_code=401, detail="パスワードが正しくありません。")
    token = create_access_token()
    return LoginResponse(token=token)


@app.get("/auth/verify")
def verify(_: None = Depends(require_auth)):
    return {"valid": True}


app.include_router(races.router, dependencies=[Depends(require_auth)])
app.include_router(horses.router, dependencies=[Depends(require_auth)])
