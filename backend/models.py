from sqlalchemy import Column, Integer, String, Text, DateTime, Date, ForeignKey, JSON
from sqlalchemy.orm import relationship
from database import Base
from datetime import datetime

class Channel(Base):
    __tablename__ = "channels"
    id = Column(Integer, primary_key=True)
    youtube_id = Column(String, unique=True, nullable=False)
    name = Column(String)
    thumbnail_url = Column(String)
    is_favorite = Column(Integer, default=1)
    created_at = Column(DateTime, default=datetime.utcnow)
    videos = relationship("Video", back_populates="channel")

class Video(Base):
    __tablename__ = "videos"
    id = Column(Integer, primary_key=True)
    youtube_id = Column(String, unique=True, nullable=False)
    channel_id = Column(Integer, ForeignKey("channels.id"))
    title = Column(String)
    published_at = Column(DateTime)
    summary = Column(Text)
    stocks_mentioned = Column(JSON)
    transcript = Column(Text)
    status = Column(String, default="pending")
    channel = relationship("Channel", back_populates="videos")
    stock_mentions = relationship("StockMention", back_populates="video")

class StockMention(Base):
    __tablename__ = "stock_mentions"
    id = Column(Integer, primary_key=True)
    video_id = Column(Integer, ForeignKey("videos.id"))
    stock_name = Column(String)
    stock_code = Column(String)
    market = Column(String)
    sentiment = Column(String)
    reason = Column(Text)
    mentioned_count = Column(Integer, default=1)
    video = relationship("Video", back_populates="stock_mentions")

class Report(Base):
    __tablename__ = "reports"
    id = Column(Integer, primary_key=True)
    nid = Column(String, unique=True, nullable=False)  # 네이버 리포트 ID
    title = Column(String)
    broker = Column(String)            # 증권사
    pdf_url = Column(String)
    published_date = Column(String)    # 26.04.10 형식
    views = Column(Integer, default=0)
    pdf_text = Column(Text)            # 추출된 원문
    summary = Column(Text)             # AI 요약
    stocks_mentioned = Column(JSON)    # 추출된 종목
    key_themes = Column(JSON)          # 핵심 테마
    status = Column(String, default="pending")  # pending | summarized | failed
    created_at = Column(DateTime, default=datetime.utcnow)

class CachedData(Base):
    __tablename__ = "cached_data"
    id = Column(Integer, primary_key=True)
    key = Column(String, unique=True, nullable=False)
    data = Column(JSON)
    updated_at = Column(DateTime, default=datetime.utcnow)

class DailySummary(Base):
    __tablename__ = "daily_summaries"
    id = Column(Integer, primary_key=True)
    date = Column(Date, unique=True, nullable=False)
    summary = Column(Text)
    stocks_mentioned = Column(JSON)
    key_themes = Column(JSON)
    risk_warnings = Column(JSON)
    report_count = Column(Integer, default=0)
    status = Column(String, default="pending")  # pending | summarized | failed
    created_at = Column(DateTime, default=datetime.utcnow)
