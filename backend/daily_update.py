"""
매일 1회 실행하는 자동 업데이트 스크립트

사용법:
  cd backend
  python daily_update.py

기능:
  1. 오늘 날짜 리포트 수집 + AI 요약
  2. 추천 종목 캐시 갱신
  3. 시장 대시보드 캐시 갱신
  4. 투자자 매매 동향 캐시 갱신
  5. 히트맵 캐시 갱신
  6. 주간 피드 캐시 갱신
"""

import sys
import time
from datetime import date, timedelta

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from database import _get_engine, Base, _get_session_local
from models import DailySummary, CachedData
from services.naver_research import fetch_reports_by_date, download_and_extract_pdf
from services.claude import summarize_daily_reports
from services.analyst import fetch_strong_buy_picks
from services.market_data import fetch_market_dashboard
from services.investor_trading import fetch_all_investor_trades
from services.cache import get_cache, set_cache

# DB 초기화
Base.metadata.create_all(bind=_get_engine())
db = _get_session_local()()

today = date.today()
print(f"=== 일일 업데이트 시작: {today} ===\n")


# ── 1. 오늘 리포트 수집 + 요약 ──
def update_daily_report(target_date):
    dt_str = target_date.isoformat()
    existing = db.query(DailySummary).filter(DailySummary.date == target_date).first()

    if existing and existing.status == "summarized":
        print(f"[리포트] {dt_str}: 이미 완료")
        return True

    if existing and existing.status == "failed":
        db.delete(existing)
        db.commit()
        print(f"[리포트] {dt_str}: failed 삭제")

    reports = fetch_reports_by_date(target_date)
    if not reports:
        print(f"[리포트] {dt_str}: 리포트 없음 (주말/공휴일?)")
        return False

    texts = []
    for r in reports:
        t = download_and_extract_pdf(r["pdf_url"])
        if t:
            texts.append(f'[{r["broker"]}] {r["title"]}\n{t[:2000]}')

    if not texts:
        print(f"[리포트] {dt_str}: PDF 추출 실패")
        return False

    result = summarize_daily_reports("\n\n---\n\n".join(texts), dt_str)
    if result:
        ds = DailySummary(
            date=target_date,
            summary=result.get("summary"),
            stocks_mentioned=result.get("stocks", []),
            key_themes=result.get("key_themes", []),
            risk_warnings=result.get("risk_warnings", []),
            report_count=len(reports),
            status="summarized",
        )
        db.add(ds)
        db.commit()
        print(f"[리포트] {dt_str}: 완료! ({len(reports)}건, 종목 {len(result.get('stocks', []))}개)")
        return True
    else:
        print(f"[리포트] {dt_str}: AI 요약 실패")
        return False


# 오늘 + 어제 (혹시 빠진 거)
for d in [today, today - timedelta(days=1)]:
    if d.weekday() < 5:  # 평일만
        update_daily_report(d)
        time.sleep(65)  # rate limit 대기

# 빠진 날짜 채우기 (최근 7일)
print("\n[리포트] 빠진 날짜 확인...")
for i in range(2, 8):
    d = today - timedelta(days=i)
    if d.weekday() >= 5:
        continue
    existing = db.query(DailySummary).filter(DailySummary.date == d).first()
    if not existing or existing.status == "failed":
        print(f"  {d}: 빠져있음, 수집 시작")
        if existing:
            db.delete(existing)
            db.commit()
        update_daily_report(d)
        time.sleep(65)


# ── 2. 추천 종목 캐시 갱신 ──
print("\n[추천종목] 갱신 중...")
time.sleep(65)
picks = fetch_strong_buy_picks(limit=10)
set_cache(db, "analyst_picks", {"picks": picks, "source": "FnGuide, Refinitiv"})
print(f"[추천종목] {len(picks)}개 저장")
for p in picks:
    print(f"  {p['name']}({p['code']}) +{p['upside_pct']}%")


# ── 3. 시장 대시보드 캐시 갱신 ──
print("\n[시장] 대시보드 갱신...")
market = fetch_market_dashboard()
if market:
    set_cache(db, "market_dashboard", market)
    print(f"[시장] 저장 완료")


# ── 4. 투자자 매매 동향 캐시 ──
print("\n[투자자] 매매 동향 갱신...")
for d in [today, today - timedelta(days=1)]:
    if d.weekday() >= 5:
        continue
    key = f"investor_trades_{d.isoformat()}_10"
    data = fetch_all_investor_trades(limit=10, target_date=d)
    if data:
        set_cache(db, key, data)
        print(f"[투자자] {d}: 저장")


# ── 5. 히트맵 캐시 갱신 ──
print("\n[히트맵] 갱신...")
# 히트맵은 API 호출 시 자동 갱신되므로 기존 캐시만 삭제
old = db.query(CachedData).filter(CachedData.key.like("heatmap%")).all()
for c in old:
    db.delete(c)
db.commit()
print(f"[히트맵] 캐시 {len(old)}개 삭제 (다음 접속 시 자동 갱신)")


# ── 6. 주간 피드 캐시 갱신 ──
print("\n[피드] 주간 피드 캐시 삭제...")
old = db.query(CachedData).filter(CachedData.key.like("weekly_feed%")).all()
for c in old:
    db.delete(c)
db.commit()
print(f"[피드] 캐시 {len(old)}개 삭제 (다음 접속 시 자동 갱신)")


db.close()
print(f"\n=== 완료! ===")
