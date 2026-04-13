from sqlalchemy import create_engine
from sqlalchemy.pool import QueuePool, StaticPool
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import os
from dotenv import load_dotenv

load_dotenv(override=True)

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./stock_summarizer.db")

# PostgreSQL이면 pg8000 드라이버 사용 + 비밀번호 URL 인코딩
if DATABASE_URL.startswith("postgresql://"):
    from urllib.parse import urlparse, quote, urlunparse
    parsed = urlparse(DATABASE_URL)
    if parsed.password:
        encoded_pw = quote(parsed.password, safe="")
        DATABASE_URL = DATABASE_URL.replace(
            f":{parsed.password}@", f":{encoded_pw}@", 1
        )
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+pg8000://", 1)

# DB별 최적 설정
if DATABASE_URL.startswith("sqlite"):
    engine = create_engine(
        DATABASE_URL,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
else:
    engine = create_engine(
        DATABASE_URL,
        poolclass=QueuePool,
        pool_size=3,
        max_overflow=5,
        pool_pre_ping=True,
        pool_recycle=300,
        connect_args={"ssl_context": True},
    )

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
