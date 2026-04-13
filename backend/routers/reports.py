from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from datetime import date, timedelta
from database import get_db
from models import Report, DailySummary, StockMention
from services.naver_research import (
    fetch_report_list, fetch_reports_by_date,
    download_and_extract_pdf, parse_naver_date,
)
from services.claude import summarize_video, summarize_daily_reports
from services.investor_trading import fetch_all_investor_trades
from services.cache import get_cache, set_cache
from services.analyst import fetch_analyst_consensus
from services.market_data import fetch_stock_indicators

router = APIRouter()


# ──────────── 종목 추천 (애널리스트 적극매수 + 상승여력) ────────────

@router.get("/picks")
def analyst_picks(db: Session = Depends(get_db)):
    """시장 전체에서 애널리스트 적극매수 + 상승여력 높은 종목 (캐시 12시간)
    출처: FnGuide, Refinitiv"""
    cached = get_cache(db, "analyst_picks", max_age_hours=12)
    if cached:
        return cached

    from services.analyst import fetch_strong_buy_picks
    picks = fetch_strong_buy_picks(limit=10)
    result = {
        "picks": picks,
        "source": "FnGuide, Refinitiv",
    }
    if picks:
        set_cache(db, "analyst_picks", result)
    return result


# ──────────── 날짜별 종합 요약 ────────────

@router.get("/daily/dates")
def get_available_dates(db: Session = Depends(get_db)):
    """최근 영업일 7일 + 각 날짜의 요약 상태 반환"""
    today = date.today()
    dates = []
    d = today
    while len(dates) < 7:
        if d.weekday() < 5:  # 월~금
            existing = db.query(DailySummary).filter(DailySummary.date == d).first()
            dates.append({
                "date": d.isoformat(),
                "label": f"{d.month}/{d.day}",
                "weekday": ["월", "화", "수", "목", "금"][d.weekday()],
                "status": existing.status if existing else "none",
                "report_count": existing.report_count if existing else 0,
            })
        d -= timedelta(days=1)
    return dates


@router.get("/daily/{date_str}")
def get_daily_summary(date_str: str, db: Session = Depends(get_db)):
    """특정 날짜의 종합 요약 조회 (캐시)"""
    try:
        target = date.fromisoformat(date_str)
    except ValueError:
        raise HTTPException(status_code=400, detail="날짜 형식: YYYY-MM-DD")

    existing = db.query(DailySummary).filter(DailySummary.date == target).first()
    if not existing:
        raise HTTPException(status_code=404, detail="해당 날짜 요약이 없습니다")
    return existing


@router.get("/daily/{date_str}/crosscheck")
def crosscheck_daily(date_str: str, db: Session = Depends(get_db)):
    """리포트 sentiment vs 실제 투자자 수급 교차 확인 (캐시 6시간)"""
    cache_key = f"crosscheck_{date_str}"
    cached = get_cache(db, cache_key, max_age_hours=336)
    if cached:
        return cached

    try:
        target = date.fromisoformat(date_str)
    except ValueError:
        raise HTTPException(status_code=400, detail="날짜 형식: YYYY-MM-DD")

    # 1) 일일 요약에서 종목 sentiment 가져오기
    daily = db.query(DailySummary).filter(DailySummary.date == target).first()
    if not daily or not daily.stocks_mentioned:
        raise HTTPException(status_code=404, detail="해당 날짜 요약이 없습니다")

    # 2) 투자자 매매 데이터 가져오기
    trades = fetch_all_investor_trades(limit=50, target_date=target)
    if not trades:
        raise HTTPException(status_code=404, detail="투자자 매매 데이터 없음")

    # code → 수급 데이터 매핑
    trade_map = {}  # code -> {foreign: qty, institution: qty}
    for investor_key in ["foreign", "institution"]:
        investor_data = trades.get(investor_key, {})
        for item in investor_data.get("buy", []) + investor_data.get("sell", []):
            code = item["code"]
            if code not in trade_map:
                trade_map[code] = {"foreign": 0, "institution": 0}
            trade_map[code][investor_key] = item["quantity"]

    # 3) 교차 확인
    crosschecks = []
    counts = {"confirmed": 0, "divergent": 0, "neutral": 0}

    for stock in daily.stocks_mentioned:
        code = stock.get("code")
        sentiment = stock.get("sentiment", "neutral")
        name = stock.get("name", "")
        reason = stock.get("reason", "")

        if not name:
            continue

        # 수급 데이터 매칭 — 없으면 스킵 (외국 종목 등)
        has_trade = code and code in trade_map
        if not has_trade:
            continue

        fq = trade_map[code]["foreign"]
        iq = trade_map[code]["institution"]

        # 시그널 판단
        if sentiment == "neutral":
            signal = "neutral"
            note = "리포트 중립 의견"
        elif sentiment == "bullish":
            if fq > 0 and iq > 0:
                signal = "confirmed"
                note = "매수 추천 + 외국인·기관 모두 순매수"
            elif fq > 0 or iq > 0:
                buyer = "외국인" if fq > 0 else "기관"
                seller = "기관" if fq > 0 else "외국인"
                if (fq < 0 and abs(fq) > abs(iq)) or (iq < 0 and abs(iq) > abs(fq)):
                    signal = "divergent"
                    note = f"매수 추천이지만 {seller} 순매도"
                else:
                    signal = "confirmed"
                    note = f"매수 추천 + {buyer} 순매수"
            else:
                signal = "divergent"
                note = "매수 추천이지만 외국인·기관 모두 순매도"
        else:  # bearish
            if fq < 0 and iq < 0:
                signal = "confirmed"
                note = "매도 의견 + 외국인·기관 모두 순매도"
            elif fq < 0 or iq < 0:
                seller = "외국인" if fq < 0 else "기관"
                if (fq > 0 and fq > abs(iq)) or (iq > 0 and iq > abs(fq)):
                    signal = "divergent"
                    note = f"매도 의견이지만 {('외국인' if fq > 0 else '기관')} 순매수"
                else:
                    signal = "confirmed"
                    note = f"매도 의견 + {seller} 순매도"
            else:
                signal = "divergent"
                note = "매도 의견이지만 외국인·기관 모두 순매수"

        counts[signal] += 1
        crosschecks.append({
            "name": name,
            "code": code,
            "report_sentiment": sentiment,
            "report_reason": reason,
            "foreign_quantity": fq,
            "institution_quantity": iq,
            "signal": signal,
            "note": note,
        })

    # signal 우선순위: divergent > confirmed > neutral
    order = {"divergent": 0, "confirmed": 1, "neutral": 2}
    crosschecks.sort(key=lambda x: order.get(x["signal"], 3))

    result = {
        "date": date_str,
        "crosschecks": crosschecks,
        "summary": counts,
    }
    if crosschecks:
        set_cache(db, cache_key, result)
    return result


@router.post("/daily/{date_str}")
def create_daily_summary(date_str: str, db: Session = Depends(get_db)):
    """특정 날짜 리포트 수집 → PDF 추출 → 종합 요약"""
    try:
        target = date.fromisoformat(date_str)
    except ValueError:
        raise HTTPException(status_code=400, detail="날짜 형식: YYYY-MM-DD")

    # 이미 성공한 게 있으면 반환
    existing = db.query(DailySummary).filter(DailySummary.date == target).first()
    if existing and existing.status == "summarized":
        return existing
    # failed면 삭제하고 재시도
    if existing and existing.status == "failed":
        db.delete(existing)
        db.commit()
        existing = None

    # 1) 해당 날짜 리포트 크롤링
    reports = fetch_reports_by_date(target)
    if not reports:
        raise HTTPException(status_code=404, detail=f"{date_str}에 리포트가 없습니다")

    # 2) 각 리포트 PDF 텍스트 추출 + DB 저장
    report_texts = []
    for r in reports:
        # 개별 리포트 DB 저장 (중복 방지)
        db_report = db.query(Report).filter(Report.nid == r["nid"]).first()
        if not db_report:
            db_report = Report(
                nid=r["nid"],
                title=r["title"],
                broker=r["broker"],
                pdf_url=r["pdf_url"],
                published_date=r["date"],
                views=r["views"],
                status="pending",
            )
            db.add(db_report)
            db.commit()
            db.refresh(db_report)

        # PDF 텍스트
        text = db_report.pdf_text
        if not text:
            text = download_and_extract_pdf(r["pdf_url"])
            if text:
                db_report.pdf_text = text
                db.commit()

        if text:
            # 각 리포트를 요약용으로 앞부분만 추출 (전체가 너무 길어지므로)
            snippet = text[:2000] if len(text) > 2000 else text
            report_texts.append(f"[{r['broker']}] {r['title']}\n{snippet}")

    if not report_texts:
        raise HTTPException(status_code=400, detail="PDF 텍스트 추출 실패")

    # 3) 전체 텍스트 합쳐서 Claude 종합 요약
    combined = "\n\n---\n\n".join(report_texts)
    result = summarize_daily_reports(combined, date_str)

    if not result:
        # DailySummary failed 상태로 저장
        if not existing:
            existing = DailySummary(date=target, status="failed", report_count=len(reports))
            db.add(existing)
        else:
            existing.status = "failed"
        db.commit()
        raise HTTPException(status_code=500, detail="AI 종합 요약 실패")

    # 4) DailySummary 저장
    if not existing:
        existing = DailySummary(date=target)
        db.add(existing)

    existing.summary = result.get("summary")
    existing.stocks_mentioned = result.get("stocks", [])
    existing.key_themes = result.get("key_themes", [])
    existing.risk_warnings = result.get("risk_warnings", [])
    existing.report_count = len(reports)
    existing.status = "summarized"
    db.commit()
    db.refresh(existing)

    return existing


# ──────────── 기존 개별 리포트 API ────────────

@router.get("/")
def list_reports(
    page: int = Query(1, ge=1),
    status: str = None,
    date: str = None,
    db: Session = Depends(get_db),
):
    query = db.query(Report).order_by(Report.id.desc())
    if status:
        query = query.filter(Report.status == status)
    if date:
        query = query.filter(Report.published_date == date)
    return query.limit(30).all()


@router.post("/scrape")
def scrape_reports(page: int = Query(1, ge=1), db: Session = Depends(get_db)):
    reports = fetch_report_list(page=page)
    added = []
    for r in reports:
        exists = db.query(Report).filter(Report.nid == r["nid"]).first()
        if exists:
            continue
        report = Report(
            nid=r["nid"], title=r["title"], broker=r["broker"],
            pdf_url=r["pdf_url"], published_date=r["date"],
            views=r["views"], status="pending",
        )
        db.add(report)
        db.commit()
        db.refresh(report)
        added.append({"nid": report.nid, "title": report.title})
    return {"scraped": len(reports), "new": len(added), "reports": added}


@router.post("/{report_id}/summarize")
def summarize_report(report_id: int, db: Session = Depends(get_db)):
    report = db.query(Report).filter(Report.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="리포트를 찾을 수 없습니다")

    pdf_text = report.pdf_text
    if not pdf_text:
        pdf_text = download_and_extract_pdf(report.pdf_url)
        if not pdf_text:
            report.status = "failed"
            db.commit()
            raise HTTPException(status_code=400, detail="PDF 텍스트 추출 실패")
        report.pdf_text = pdf_text

    result = summarize_video(pdf_text, report.title)
    if not result:
        report.status = "failed"
        db.commit()
        raise HTTPException(status_code=500, detail="AI 요약 실패")

    report.summary = result.get("summary")
    report.stocks_mentioned = result.get("stocks", [])
    report.key_themes = result.get("key_themes", [])
    report.status = "summarized"
    db.commit()
    return report


@router.post("/retry-failed")
def retry_failed_reports(db: Session = Depends(get_db)):
    failed = db.query(Report).filter(Report.status == "failed").all()
    results = []
    for report in failed:
        pdf_text = report.pdf_text
        if not pdf_text:
            pdf_text = download_and_extract_pdf(report.pdf_url)
            if not pdf_text:
                results.append({"id": report.id, "status": "failed"})
                continue
            report.pdf_text = pdf_text
        result = summarize_video(pdf_text, report.title)
        if result:
            report.summary = result.get("summary")
            report.stocks_mentioned = result.get("stocks", [])
            report.key_themes = result.get("key_themes", [])
            report.status = "summarized"
        db.commit()
        results.append({"id": report.id, "status": report.status})
    return {"retried": len(results), "results": results}


@router.get("/{report_id}")
def get_report(report_id: int, db: Session = Depends(get_db)):
    report = db.query(Report).filter(Report.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="리포트를 찾을 수 없습니다")
    return report
