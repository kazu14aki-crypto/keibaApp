import uuid
from datetime import datetime, date as date_type
from sqlalchemy import create_engine, String, Integer, Float, Text, Date, DateTime, ForeignKey, JSON
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship, sessionmaker
from sqlalchemy.dialects.postgresql import UUID

from app.config import DATABASE_URL

engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


class Base(DeclarativeBase):
    pass


def gen_uuid() -> str:
    return str(uuid.uuid4())


DEFAULT_FACTORS = {"waku": 0, "jockey": 0, "pedigree": 0, "time": 0, "condition": 0, "form": 0, "season": 3, "impost": 5}


class Race(Base):
    __tablename__ = "races"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    name: Mapped[str] = mapped_column(String, nullable=False)
    date: Mapped[date_type | None] = mapped_column(Date, nullable=True)
    track: Mapped[str] = mapped_column(String, nullable=False, default="東京")
    surface: Mapped[str] = mapped_column(String, nullable=False, default="芝")
    distance: Mapped[int] = mapped_column(Integer, nullable=False, default=2000)
    condition: Mapped[str] = mapped_column(String, nullable=False, default="良")
    grade: Mapped[str] = mapped_column(String, nullable=True, default="")
    memo: Mapped[str] = mapped_column(Text, nullable=True, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    horses: Mapped[list["Horse"]] = relationship(back_populates="race", cascade="all, delete-orphan")

    def to_dict(self, include_horses=False):
        d = {
            "id": self.id,
            "name": self.name,
            "date": self.date.isoformat() if self.date else None,
            "track": self.track,
            "surface": self.surface,
            "distance": self.distance,
            "condition": self.condition,
            "grade": self.grade,
            "memo": self.memo,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
        if include_horses:
            d["horses"] = [h.to_dict() for h in sorted(self.horses, key=lambda h: h.num)]
        return d


class Horse(Base):
    __tablename__ = "horses"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    race_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("races.id", ondelete="CASCADE"))
    num: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    waku: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    name: Mapped[str] = mapped_column(String, nullable=True, default="")
    jockey: Mapped[str] = mapped_column(String, nullable=True, default="")
    pedigree: Mapped[str] = mapped_column(String, nullable=True, default="")
    style: Mapped[str] = mapped_column(String, nullable=True, default="先行")
    last_time: Mapped[str] = mapped_column(String, nullable=True, default="")
    last_3f: Mapped[str] = mapped_column(String, nullable=True, default="")
    current_weight: Mapped[int] = mapped_column(Integer, nullable=True, default=0)
    current_impost: Mapped[float] = mapped_column(Float, nullable=True, default=0.0)
    result_rank: Mapped[str] = mapped_column(String, nullable=True, default="")
    note: Mapped[str] = mapped_column(Text, nullable=True, default="")
    factors: Mapped[dict] = mapped_column(JSON, nullable=False, default=lambda: dict(DEFAULT_FACTORS))
    history: Mapped[dict] = mapped_column(JSON, nullable=True, default=lambda: {"前走": None, "前々走": None, "3走前": None, "4走前": None})
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    race: Mapped["Race"] = relationship(back_populates="horses")

    def to_dict(self, include_race=False):
        d = {
            "id": self.id,
            "race_id": self.race_id,
            "num": self.num,
            "waku": self.waku,
            "name": self.name,
            "jockey": self.jockey,
            "pedigree": self.pedigree,
            "style": self.style,
            "last_time": self.last_time,
            "last_3f": self.last_3f,
            "current_weight": self.current_weight or 0,
            "current_impost": self.current_impost or 0.0,
            "result_rank": self.result_rank,
            "note": self.note,
            "factors": self.factors or dict(DEFAULT_FACTORS),
            "history": self.history or {"前走": None, "前々走": None, "3走前": None, "4走前": None},
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
        if include_race and self.race:
            d["races"] = {
                "id": self.race.id,
                "name": self.race.name,
                "date": self.race.date.isoformat() if self.race.date else None,
                "track": self.race.track,
                "surface": self.race.surface,
                "distance": self.race.distance,
                "condition": self.race.condition,
            }
        return d


def init_db():
    """テーブルが無ければ作成する（初回起動時に自動実行）。"""
    Base.metadata.create_all(engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
