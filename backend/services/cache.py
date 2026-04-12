from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from models import CachedData


def get_cache(db: Session, key: str, max_age_hours: int = 12) -> dict | list | None:
    """캐시 조회. max_age_hours 이내면 반환, 아니면 None"""
    cached = db.query(CachedData).filter(CachedData.key == key).first()
    if not cached:
        return None
    if datetime.utcnow() - cached.updated_at > timedelta(hours=max_age_hours):
        return None  # 만료
    return cached.data


def set_cache(db: Session, key: str, data: dict | list):
    """캐시 저장/업데이트"""
    cached = db.query(CachedData).filter(CachedData.key == key).first()
    if cached:
        cached.data = data
        cached.updated_at = datetime.utcnow()
    else:
        cached = CachedData(key=key, data=data, updated_at=datetime.utcnow())
        db.add(cached)
    db.commit()
