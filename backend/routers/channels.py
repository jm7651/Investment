from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models import Channel
from pydantic import BaseModel
from services.youtube import resolve_channel_id

router = APIRouter()

class ChannelCreate(BaseModel):
    youtube_id: str  # UC..., @핸들, 또는 URL 모두 가능
    name: str
    thumbnail_url: str = None

@router.get("/")
def list_channels(db: Session = Depends(get_db)):
    return db.query(Channel).all()

@router.post("/")
def add_channel(body: ChannelCreate, db: Session = Depends(get_db)):
    # URL, @핸들 → UC... 채널 ID로 자동 변환
    channel_id = resolve_channel_id(body.youtube_id)
    if not channel_id.startswith("UC"):
        raise HTTPException(status_code=400, detail="채널 ID를 찾을 수 없습니다. URL, @핸들, 또는 UC... ID를 입력하세요")

    existing = db.query(Channel).filter(Channel.youtube_id == channel_id).first()
    if existing:
        raise HTTPException(status_code=400, detail="이미 등록된 채널입니다")

    ch = Channel(
        youtube_id=channel_id,
        name=body.name,
        thumbnail_url=body.thumbnail_url,
    )
    db.add(ch)
    db.commit()
    db.refresh(ch)
    return ch

@router.delete("/{channel_id}")
def delete_channel(channel_id: int, db: Session = Depends(get_db)):
    ch = db.query(Channel).filter(Channel.id == channel_id).first()
    if not ch:
        raise HTTPException(status_code=404, detail="채널을 찾을 수 없습니다")
    db.delete(ch)
    db.commit()
    return {"ok": True}
