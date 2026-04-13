from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import date, timedelta
from collections import defaultdict
from database import get_db
from models import StockMention, DailySummary
from services.investor_trading import fetch_all_investor_trades
from services.market_data import fetch_market_dashboard, fetch_stock_indicators
from services.analyst import fetch_analyst_consensus, fetch_strong_buy_picks
from services.cache import get_cache, set_cache

router = APIRouter()


@router.get("/market-dashboard")
def market_dashboard(db: Session = Depends(get_db)):
    """시장 대시보드 (캐시 1시간)"""
    cached = get_cache(db, "market_dashboard", max_age_hours=4)
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
    cached = get_cache(db, cache_key, max_age_hours=336)
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
        ind = get_cache(db, ind_key, max_age_hours=336)
        if not ind:
            ind = fetch_stock_indicators(code)
            if ind and "error" not in ind:
                set_cache(db, ind_key, ind)
        # 애널리스트
        ana_key = f"analyst_{code}"
        ana = get_cache(db, ana_key, max_age_hours=336)
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
    cached = get_cache(db, cache_key, max_age_hours=336)
    if cached:
        return cached
    result = fetch_analyst_consensus(code)
    if result:
        set_cache(db, cache_key, result)
        return result
    return {"error": "데이터 없음"}


@router.get("/heatmap")
def stock_heatmap(days: int = Query(7, ge=3, le=14), db: Session = Depends(get_db)):
    """종목 히트맵: 최근 N일간 리포트 언급 빈도 (캐시 4시간)"""
    cache_key = f"heatmap_{days}"
    cached = get_cache(db, cache_key, max_age_hours=4)
    if cached:
        return cached

    summaries = (
        db.query(DailySummary)
        .filter(DailySummary.status == "summarized")
        .order_by(DailySummary.date.desc())
        .limit(days)
        .all()
    )

    if not summaries:
        return {"dates": [], "stocks": []}

    dates_list = sorted(set(ds.date.isoformat() for ds in summaries))

    # 종목별 일자별 데이터
    stock_data = defaultdict(lambda: {"days": {}, "total": 0, "latest_sentiment": "neutral"})

    for ds in summaries:
        day = ds.date.isoformat()
        for s in (ds.stocks_mentioned or []):
            name = s.get("name", "")
            if not name:
                continue
            sentiment = s.get("sentiment", "neutral")
            count = s.get("mentioned_count", 1)
            stock_data[name]["days"][day] = {"count": count, "sentiment": sentiment}
            stock_data[name]["total"] += count
            stock_data[name]["latest_sentiment"] = sentiment
            if "code" not in stock_data[name]:
                stock_data[name]["code"] = s.get("code")

    # 2일 이상 언급된 종목만, 총 언급 횟수 순
    stocks = []
    for name, data in stock_data.items():
        if len(data["days"]) < 2:
            continue
        # 연속 언급일 계산
        streak = _calc_streak(data["days"], dates_list)
        stocks.append({
            "name": name,
            "code": data.get("code"),
            "total_mentions": data["total"],
            "days_mentioned": len(data["days"]),
            "streak": streak,
            "latest_sentiment": data["latest_sentiment"],
            "daily": {d: data["days"].get(d, None) for d in dates_list},
        })

    stocks.sort(key=lambda x: (-x["days_mentioned"], -x["total_mentions"]))

    result = {"dates": dates_list, "stocks": stocks[:20]}
    set_cache(db, cache_key, result)
    return result


def _calc_streak(days_dict: dict, all_dates: list) -> int:
    """최근부터 연속 언급일 수 계산"""
    streak = 0
    for d in reversed(all_dates):
        if d in days_dict:
            streak += 1
        else:
            break
    return streak


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
    cached = get_cache(db, cache_key, max_age_hours=336)
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
