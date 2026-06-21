import csv
import io
from fastapi import APIRouter, HTTPException, UploadFile, File, Query, Depends
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import select
from pydantic import BaseModel

from app.db import get_db, Horse, Race
from app.schemas import HorseCreate, HorseUpdate
from app.jra_scraper import fetch_and_parse, JraFetchError

router = APIRouter(prefix="/horses", tags=["horses"])

STYLES = ["逃げ", "先行", "差し", "追込"]


class JraUrlImport(BaseModel):
    url: str


def _empty_factors():
    return {"waku": 0, "jockey": 0, "pedigree": 0, "time": 0, "condition": 0, "form": 0}


@router.post("/race/{race_id}")
def add_horse(race_id: str, payload: HorseCreate, db: Session = Depends(get_db)):
    race = db.get(Race, race_id)
    if not race:
        raise HTTPException(status_code=404, detail="レースが見つかりません。")
    data = payload.model_dump()
    data["factors"] = data["factors"]
    horse = Horse(race_id=race_id, **data)
    db.add(horse)
    db.commit()
    db.refresh(horse)
    return horse.to_dict()


@router.patch("/{horse_id}")
def update_horse(horse_id: str, payload: HorseUpdate, db: Session = Depends(get_db)):
    horse = db.get(Horse, horse_id)
    if not horse:
        raise HTTPException(status_code=404, detail="出走馬が見つかりません。")
    patch = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not patch:
        raise HTTPException(status_code=400, detail="更新内容がありません。")
    for k, v in patch.items():
        setattr(horse, k, v)
    db.commit()
    db.refresh(horse)
    return horse.to_dict()


@router.delete("/{horse_id}")
def delete_horse(horse_id: str, db: Session = Depends(get_db)):
    horse = db.get(Horse, horse_id)
    if not horse:
        raise HTTPException(status_code=404, detail="出走馬が見つかりません。")
    db.delete(horse)
    db.commit()
    return {"deleted": True}


@router.get("/search")
def search_horses(q: str = Query(..., min_length=1), db: Session = Depends(get_db)):
    """馬名での横断検索。レース情報も合わせて返す。"""
    stmt = (
        select(Horse)
        .options(joinedload(Horse.race))
        .where(Horse.name.ilike(f"%{q}%"))
        .order_by(Horse.created_at.desc())
        .limit(50)
    )
    horses = db.execute(stmt).scalars().all()
    return [h.to_dict(include_race=True) for h in horses]


def _parse_csv_text(text: str):
    reader = csv.reader(io.StringIO(text))
    rows = list(reader)
    if len(rows) < 2:
        return []
    header = [h.strip() for h in rows[0]]

    def find_col(cands):
        for i, h in enumerate(header):
            if any(c in h for c in cands):
                return i
        return -1

    idx = {
        "num": find_col(["馬番", "番"]),
        "waku": find_col(["枠番", "枠"]),
        "name": find_col(["馬名", "名前"]),
        "jockey": find_col(["騎手"]),
        "pedigree": find_col(["血統", "父"]),
        "style": find_col(["脚質"]),
    }

    horses = []
    for i, cols in enumerate(rows[1:]):
        cols = [c.strip() for c in cols]
        if not any(c for c in cols):
            continue
        num = i + 1
        if idx["num"] >= 0 and idx["num"] < len(cols):
            try:
                num = int(cols[idx["num"]])
            except ValueError:
                pass
        waku = min(8, (num + 1) // 2)
        if idx["waku"] >= 0 and idx["waku"] < len(cols):
            try:
                waku = int(cols[idx["waku"]])
            except ValueError:
                pass
        style = "先行"
        if idx["style"] >= 0 and idx["style"] < len(cols) and cols[idx["style"]] in STYLES:
            style = cols[idx["style"]]

        horses.append({
            "num": num,
            "waku": waku,
            "name": cols[idx["name"]] if idx["name"] >= 0 and idx["name"] < len(cols) else "",
            "jockey": cols[idx["jockey"]] if idx["jockey"] >= 0 and idx["jockey"] < len(cols) else "",
            "pedigree": cols[idx["pedigree"]] if idx["pedigree"] >= 0 and idx["pedigree"] < len(cols) else "",
            "style": style,
            "last_time": "",
            "last_3f": "",
            "note": "",
            "factors": _empty_factors(),
        })
    return horses


@router.post("/race/{race_id}/import-csv")
async def import_csv(race_id: str, file: UploadFile = File(...), db: Session = Depends(get_db)):
    race = db.get(Race, race_id)
    if not race:
        raise HTTPException(status_code=404, detail="レースが見つかりません。")

    content = await file.read()
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = content.decode("shift_jis", errors="ignore")

    parsed = _parse_csv_text(text)
    if not parsed:
        raise HTTPException(status_code=400, detail="CSVを読み取れませんでした。ヘッダー行と1行以上のデータが必要です。")

    # 既存の出走馬を入れ替え
    db.query(Horse).filter(Horse.race_id == race_id).delete()
    new_horses = [Horse(race_id=race_id, **h) for h in parsed]
    db.add_all(new_horses)
    db.commit()
    for h in new_horses:
        db.refresh(h)
    return {"imported": len(new_horses), "horses": [h.to_dict() for h in new_horses]}


@router.post("/race/{race_id}/import-jra-url")
def import_from_jra_url(race_id: str, payload: JraUrlImport, db: Session = Depends(get_db)):
    """JRA公式サイトの出馬表ページURLから出走馬を取り込む。

    1回のリクエストにつきJRAサイトへのHTTPリクエストは1回のみ送信する
    （連続巡回・大量取得は行わない設計）。
    """
    race = db.get(Race, race_id)
    if not race:
        raise HTTPException(status_code=404, detail="レースが見つかりません。")

    try:
        result = fetch_and_parse(payload.url)
    except JraFetchError as e:
        raise HTTPException(status_code=422, detail=str(e))

    parsed = [
        {
            "num": h["num"],
            "waku": h["waku"],
            "name": h["name"],
            "jockey": h["jockey"],
            "pedigree": h["pedigree"],
            "style": h["style"],
            "last_time": (h.get("history") or {}).get("前走", {}).get("time", "") if (h.get("history") or {}).get("前走") else "",
            "last_3f": (h.get("history") or {}).get("前走", {}).get("last_3f", "") if (h.get("history") or {}).get("前走") else "",
            "note": "",
            "factors": _empty_factors(),
            "history": h.get("history") or {"前走": None, "前々走": None, "3走前": None, "4走前": None},
        }
        for h in result["horses"]
    ]

    # レース基本情報も取得できていれば反映（既存値が空の項目のみ補完）
    race_patch = {}
    if result.get("track") and not race.track:
        race_patch["track"] = result["track"]
    if result.get("surface"):
        race_patch["surface"] = result["surface"]
    if result.get("distance"):
        race_patch["distance"] = result["distance"]
    if result.get("race_name") and (not race.name or race.name == "無題のレース"):
        race_patch["name"] = result["race_name"]
    if race_patch:
        for k, v in race_patch.items():
            setattr(race, k, v)

    db.query(Horse).filter(Horse.race_id == race_id).delete()
    new_horses = [Horse(race_id=race_id, **h) for h in parsed]
    db.add_all(new_horses)
    db.commit()
    for h in new_horses:
        db.refresh(h)

    return {
        "imported": len(new_horses),
        "horses": [h.to_dict() for h in new_horses],
        "race_name": result.get("race_name", ""),
    }
