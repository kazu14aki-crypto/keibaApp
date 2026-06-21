from typing import Optional, List
from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    password: str


class LoginResponse(BaseModel):
    token: str


class RaceCreate(BaseModel):
    name: str
    date: Optional[str] = None
    track: str = "東京"
    surface: str = "芝"
    distance: int = 2000
    condition: str = "良"
    grade: Optional[str] = ""
    memo: Optional[str] = ""


class RaceUpdate(BaseModel):
    name: Optional[str] = None
    date: Optional[str] = None
    track: Optional[str] = None
    surface: Optional[str] = None
    distance: Optional[int] = None
    condition: Optional[str] = None
    grade: Optional[str] = None
    memo: Optional[str] = None


class HorseFactors(BaseModel):
    waku: int = 0
    jockey: int = 0
    pedigree: int = 0
    time: int = 0
    condition: int = 0
    form: int = 0
    season: int = 3


class HorseCreate(BaseModel):
    num: int
    waku: int
    name: str = ""
    jockey: str = ""
    pedigree: str = ""
    style: str = "先行"
    last_time: Optional[str] = ""
    last_3f: Optional[str] = ""
    current_weight: Optional[int] = 0
    note: Optional[str] = ""
    factors: HorseFactors = Field(default_factory=HorseFactors)


class HorseUpdate(BaseModel):
    num: Optional[int] = None
    waku: Optional[int] = None
    name: Optional[str] = None
    jockey: Optional[str] = None
    pedigree: Optional[str] = None
    style: Optional[str] = None
    last_time: Optional[str] = None
    last_3f: Optional[str] = None
    current_weight: Optional[int] = None
    result_rank: Optional[str] = None
    note: Optional[str] = None
    factors: Optional[HorseFactors] = None


class HorsesBulkImport(BaseModel):
    horses: List[HorseCreate]
