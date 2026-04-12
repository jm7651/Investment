import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import engine, Base
from routers import channels, videos, stocks, reports

# 테이블 생성
Base.metadata.create_all(bind=engine)

app = FastAPI(title="YouTube Stock Summarizer")

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
