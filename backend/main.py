import os
import traceback
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from database import _get_engine, Base
from routers import channels, videos, stocks, reports

# 테이블 생성
try:
    Base.metadata.create_all(bind=_get_engine())
except Exception as e:
    print(f"DB init warning: {e}")

app = FastAPI(title="YouTube Stock Summarizer")

# 글로벌 에러 핸들러 — 500 대신 빈 데이터 반환
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    print(f"ERROR: {request.url} -> {exc}")
    traceback.print_exc()
    return JSONResponse(
        status_code=200,
        content={"error": str(exc), "data": None},
    )

app.add_middleware(GZipMiddleware, minimum_size=500)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/debug/env")
def debug_env():
    db_url = os.getenv("DATABASE_URL", "NOT_SET")
    return {"db_url_start": db_url[:30] if db_url else "NONE", "len": len(db_url)}

@app.post("/debug/fix")
def fix_data():
    """failed 삭제 + picks 캐시 클리어"""
    from database import get_db
    from models import DailySummary, CachedData
    db = next(get_db())
    try:
        # failed 삭제
        deleted = db.query(DailySummary).filter(DailySummary.status == "failed").delete()
        # picks 캐시 삭제
        db.query(CachedData).filter(CachedData.key == "analyst_picks").delete()
        db.commit()
        return {"deleted_failed": deleted, "picks_cache_cleared": True}
    finally:
        db.close()

@app.get("/debug/db")
def debug_db():
    from database import get_db, _get_engine
    from models import DailySummary, CachedData
    from sqlalchemy.orm import Session
    db = next(get_db())
    try:
        summaries = db.query(DailySummary).all()
        caches = db.query(CachedData).all()
        return {
            "summaries": [{"date": str(ds.date), "status": ds.status} for ds in summaries],
            "caches": [{"key": c.key, "updated": str(c.updated_at)} for c in caches],
            "engine_url": str(_get_engine().url)[:50],
        }
    finally:
        db.close()

app.include_router(channels.router, prefix="/channels", tags=["channels"])
app.include_router(videos.router, prefix="/videos", tags=["videos"])
app.include_router(stocks.router, prefix="/stocks", tags=["stocks"])
app.include_router(reports.router, prefix="/reports", tags=["reports"])
