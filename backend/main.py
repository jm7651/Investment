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

app.include_router(channels.router, prefix="/channels", tags=["channels"])
app.include_router(videos.router, prefix="/videos", tags=["videos"])
app.include_router(stocks.router, prefix="/stocks", tags=["stocks"])
app.include_router(reports.router, prefix="/reports", tags=["reports"])
