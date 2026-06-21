from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from sqlalchemy import select

from app.db import get_db, Race
from app.schemas import RaceCreate, RaceUpdate

router = APIRouter(prefix="/races", tags=["races"])


@router.get("")
def list_races(db: Session = Depends(get_db)):
    """レース一覧（開催日が新しい順）。"""
    stmt = select(Race).order_by(Race.date.desc().nullslast(), Race.created_at.desc())
    races = db.execute(stmt).scalars().all()
    return [r.to_dict() for r in races]


@router.get("/{race_id}")
def get_race(race_id: str, db: Session = Depends(get_db)):
    race = db.get(Race, race_id)
    if not race:
        raise HTTPException(status_code=404, detail="レースが見つかりません。")
    return race.to_dict(include_horses=True)


@router.post("")
def create_race(payload: RaceCreate, db: Session = Depends(get_db)):
    data = payload.model_dump()
    if data.get("date") == "":
        data["date"] = None
    race = Race(**data)
    db.add(race)
    db.commit()
    db.refresh(race)
    return race.to_dict()


@router.patch("/{race_id}")
def update_race(race_id: str, payload: RaceUpdate, db: Session = Depends(get_db)):
    race = db.get(Race, race_id)
    if not race:
        raise HTTPException(status_code=404, detail="レースが見つかりません。")
    patch = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not patch:
        raise HTTPException(status_code=400, detail="更新内容がありません。")
    if patch.get("date") == "":
        patch["date"] = None
    for k, v in patch.items():
        setattr(race, k, v)
    db.commit()
    db.refresh(race)
    return race.to_dict()


@router.delete("/{race_id}")
def delete_race(race_id: str, db: Session = Depends(get_db)):
    race = db.get(Race, race_id)
    if not race:
        raise HTTPException(status_code=404, detail="レースが見つかりません。")
    db.delete(race)
    db.commit()
    return {"deleted": True}
