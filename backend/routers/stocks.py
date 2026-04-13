from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import date
from database import get_db
from models import StockMention
from services.investor_trading import fetch_all_investor_trades
from services.market_data import fetch_market_dashboard, fetch_stock_indicators
from services.analyst import fetch_analyst_consensus, fetch_strong_buy_picks
from services.cache import get_cache, set_cache

router = APIRouter()


@router.get("/market-dashboard")
def market_dashboard(db: Session = Depends(get_db)):
    """시장 대시보드 (캐시 1시간)"""
    cached = get_cache(db, "market_dashboard", max_age_hours=1)
    if cached:
        return cached
    data = fetch_market_dashboard()
    if data:
        set_cache(db, "market_dashboard", data)
    return data


@router.get("/indicators/{code}")
def stock_indicators(code: str, db: Session = Depends(get_db)):
    """개별 종목 기술적 지표 (캐시 6시간)"""
    cache_key = f"indicators_{code}"
    cached = get_cache(db, cache_key, max_age_hours=24)
    if cached:
        return cached
    result = fetch_stock_indicators(code)
    if result and "error" not in result:
        set_cache(db, cache_key, result)
    return result or {"error": "데이터 없음"}


@router.get("/batch")
def batch_stock_info(codes: str = Query(..., description="종목코드 쉼표구분"), db: Session = Depends(get_db)):
    """여러 종목의 지표+애널리스트를 한번에 조회 (캐시 활용)"""
    code_list = [c.strip() for c in codes.split(",") if c.strip()]
    result = {}
    for code in code_list[:10]:  # 최대 10개
        # 지표
        ind_key = f"indicators_{code}"
        ind = get_cache(db, ind_key, max_age_hours=24)
        if not ind:
            ind = fetch_stock_indicators(code)
            if ind and "error" not in ind:
                set_cache(db, ind_key, ind)
        # 애널리스트
        ana_key = f"analyst_{code}"
        ana = get_cache(db, ana_key, max_age_hours=12)
        if not ana:
            ana = fetch_analyst_consensus(code)
            if ana:
                set_cache(db, ana_key, ana)
        result[code] = {"indicators": ind, "analyst": ana}
    return result


@router.get("/analyst/{code}")
def analyst_consensus(code: str, db: Session = Depends(get_db)):
    """애널리스트 컨센서스 (캐시 12시간)"""
    cache_key = f"analyst_{code}"
    cached = get_cache(db, cache_key, max_age_hours=12)
    if cached:
        return cached
    result = fetch_analyst_consensus(code)
    if result:
        set_cache(db, cache_key, result)
        return result
    return {"error": "데이터 없음"}


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
    db: Session = Depends(get_db),
):
    """외국인/기관/개인 순매수·순매도 (캐시 6시간)"""
    td = None
    if target_date:
        try:
            td = date.fromisoformat(target_date)
        except ValueError:
            pass

    cache_key = f"investor_trades_{target_date or 'latest'}_{limit}"
    cached = get_cache(db, cache_key, max_age_hours=24)
    if cached:
        return cached

    data = fetch_all_investor_trades(limit=limit, target_date=td)
    if data:
        set_cache(db, cache_key, data)
    return data


@router.get("/{stock_name}/videos")
def stock_videos(stock_name: str, db: Session = Depends(get_db)):
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
