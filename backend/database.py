from sqlalchemy import create_engine
from sqlalchemy.pool import QueuePool, StaticPool, NullPool
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import os
from dotenv import load_dotenv

load_dotenv(override=True)

Base = declarative_base()

_engine = None
_SessionLocal = None


def _get_engine():
    global _engine
    if _engine is not None:
        return _engine

    db_url = os.getenv("DATABASE_URL", "sqlite:///./stock_summarizer.db")

    if db_url.startswith("postgresql://"):
        from urllib.parse import urlparse, quote, urlunparse
        parsed = urlparse(db_url)
        if parsed.password:
            encoded_pw = quote(parsed.password, safe="")
            db_url = db_url.replace(f":{parsed.password}@", f":{encoded_pw}@", 1)
        db_url = db_url.replace("postgresql://", "postgresql+pg8000://", 1)
        _engine = create_engine(
            db_url,
            poolclass=NullPool,  # 서버리스에 적합
            connect_args={"ssl_context": True},
        )
    else:
        _engine = create_engine(
            db_url,
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )

    return _engine


def _get_session_local():
    global _SessionLocal
    if _SessionLocal is None:
        _SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=_get_engine())
    return _SessionLocal


# 하위 호환용
engine = property(lambda self: _get_engine())


def get_db():
    SessionLocal = _get_session_local()
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
