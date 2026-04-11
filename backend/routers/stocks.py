from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import date
from database import get_db
from models import StockMention
from services.investor_trading import fetch_all_investor_trades
from services.market_data import fetch_market_dashboard, fetch_stock_indicators
from services.analyst import fetch_analyst_consensus

router = APIRouter()


@router.get("/market-dashboard")
def market_dashboard():
    """시장 대시보드 (코스피, 코스닥, 환율, WTI, 금)"""
    return fetch_market_dashboard()


@router.get("/indicators/{code}")
def stock_indicators(code: str):
    """개별 종목 기술적 지표 (이평선, RSI, 52주 고저)"""
    result = fetch_stock_indicators(code)
    if not result:
        return {"error": "데이터 없음"}
    return result


@router.get("/analyst/{code}")
def analyst_consensus(code: str):
    """애널리스트 컨센서스 (투자의견, 목표주가, 증권사별)
    출처: FnGuide, Refinitiv"""
    result = fetch_analyst_consensus(code)
    if not result:
        return {"error": "데이터 없음"}
    return result

@router.get("/")
def list_stocks(db: Session = Depends(get_db)):
    """종목별 언급 횟수 집계"""
    results = (
        db.query(
            StockMention.stock_name,
            StockMention.stock_code,
            StockMention.market,
            func.count(StockMention.id).label("mention_count"),
            func.max(StockMention.sentiment).label("latest_sentiment"),
        )
        .group_by(StockMention.stock_name)
        .order_by(func.count(StockMention.id).desc())
        .all()
    )
    return [
        {
            "name": r.stock_name,
            "code": r.stock_code,
            "market": r.market,
            "mention_count": r.mention_count,
            "latest_sentiment": r.latest_sentiment,
        }
        for r in results
    ]

@router.get("/investor-trades")
def investor_trades(
    limit: int = Query(10, ge=1, le=30),
    target_date: str = Query(None, description="YYYY-MM-DD"),
):
    """외국인/기관/개인 순매수·순매도 TOP N. target_date로 날짜 지정 가능"""
    td = None
    if target_date:
        try:
            td = date.fromisoformat(target_date)
        except ValueError:
            pass
    return fetch_all_investor_trades(limit=limit, target_date=td)


@router.get("/{stock_name}/videos")
def stock_videos(stock_name: str, db: Session = Depends(get_db)):
    """특정 종목이 언급된 영상 목록"""
    mentions = (
        db.query(StockMention)
        .filter(StockMention.stock_name == stock_name)
        .all()
    )
    return [
        {
            "video_id": m.video_id,
            "sentiment": m.sentiment,
            "reason": m.reason,
            "mentioned_count": m.mentioned_count,
        }
        for m in mentions
    ]
