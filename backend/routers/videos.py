from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from datetime import date, timedelta
from collections import Counter
from database import get_db
from models import Video, Channel, StockMention
from services.youtube import get_channel_recent_videos, get_transcript
from services.claude import summarize_video
from services.cache import get_cache, set_cache

router = APIRouter()

@router.get("/")
def list_videos(channel_id: int = None, status: str = None, db: Session = Depends(get_db)):
    query = db.query(Video)
    if channel_id:
        query = query.filter(Video.channel_id == channel_id)
    if status:
        query = query.filter(Video.status == status)
    return query.order_by(Video.id.desc()).limit(50).all()

@router.get("/feed/weekly")
def weekly_feed(
    channel_id: int = None,
    db: Session = Depends(get_db),
):
    cache_key = f"weekly_feed_{channel_id or 'all'}"
    cached = get_cache(db, cache_key, max_age_hours=336)
    if cached:
        return cached
    """요약 완료된 영상을 주간 단위로 그룹 + 종목 집계"""
    query = db.query(Video).filter(Video.status == "summarized")
    if channel_id:
        query = query.filter(Video.channel_id == channel_id)
    videos = query.order_by(Video.id.desc()).limit(100).all()

    # 주간 그룹핑 (월요일 기준)
    weeks: dict[str, dict] = {}
    for v in videos:
        # published_at 기준, 없으면 오늘
        try:
            v_date = v.published_at.date() if v.published_at else date.today()
        except Exception:
            v_date = date.today()
        monday = v_date - timedelta(days=v_date.weekday())
        sunday = monday + timedelta(days=6)

        # 몇째주 계산
        week_num = (monday.day - 1) // 7 + 1
        week_key = monday.isoformat()
        week_label = f"{monday.month}월 {week_num}주차 ({monday.month}/{monday.day}~{sunday.month}/{sunday.day})"

        if week_key not in weeks:
            weeks[week_key] = {
                "week_key": week_key,
                "label": week_label,
                "start": monday.isoformat(),
                "end": sunday.isoformat(),
                "videos": [],
                "stock_summary": [],
            }
        weeks[week_key]["videos"].append({
            "id": v.id,
            "youtube_id": v.youtube_id,
            "title": v.title,
            "summary": v.summary,
            "stocks_mentioned": v.stocks_mentioned,
            "status": v.status,
            "channel_id": v.channel_id,
        })

    # 주간별 종목 집계
    for wk in weeks.values():
        counter: Counter = Counter()
        stock_info: dict[str, dict] = {}
        for v in wk["videos"]:
            for s in (v.get("stocks_mentioned") or []):
                name = s.get("name", "")
                if not name:
                    continue
                counter[name] += 1
                if name not in stock_info:
                    stock_info[name] = {
                        "name": name,
                        "code": s.get("code"),
                        "sentiment": s.get("sentiment", "neutral"),
                        "count": 0,
                    }
                stock_info[name]["count"] = counter[name]
                stock_info[name]["sentiment"] = s.get("sentiment", stock_info[name]["sentiment"])

        wk["stock_summary"] = sorted(
            stock_info.values(), key=lambda x: -x["count"]
        )[:15]

    result = sorted(weeks.values(), key=lambda x: x["week_key"], reverse=True)
    if result:
        set_cache(db, cache_key, result)
    return result


@router.get("/{video_id}")
def get_video(video_id: int, db: Session = Depends(get_db)):
    video = db.query(Video).filter(Video.id == video_id).first()
    if not video:
        raise HTTPException(status_code=404, detail="영상을 찾을 수 없습니다")
    return video

@router.post("/fetch/{channel_id}")
def fetch_videos(
    channel_id: int,
    count: int = Query(10, ge=1, le=50),
    db: Session = Depends(get_db),
):
    """채널의 최신 영상 목록만 수집 (요약 안 함)"""
    channel = db.query(Channel).filter(Channel.id == channel_id).first()
    if not channel:
        raise HTTPException(status_code=404, detail="채널을 찾을 수 없습니다")

    recent = get_channel_recent_videos(channel.youtube_id, max_results=count)
    if not recent:
        raise HTTPException(status_code=400, detail="영상을 가져올 수 없습니다")

    new_videos = []
    for v in recent:
        exists = db.query(Video).filter(Video.youtube_id == v["youtube_id"]).first()
        if exists:
            new_videos.append(exists)
            continue

        # 날짜 파싱
        pub_at = None
        if v.get("published_at"):
            try:
                from datetime import datetime as dt
                pub_at = dt.fromisoformat(v["published_at"].replace("Z", "+00:00"))
            except Exception:
                pass

        video = Video(
            youtube_id=v["youtube_id"],
            channel_id=channel.id,
            title=v["title"],
            published_at=pub_at,
            status="pending",
        )
        db.add(video)
        db.commit()
        db.refresh(video)
        new_videos.append(video)

    return new_videos


@router.post("/{video_id}/summarize")
def summarize_single_video(video_id: int, db: Session = Depends(get_db)):
    """개별 영상 자막 추출 + AI 요약"""
    video = db.query(Video).filter(Video.id == video_id).first()
    if not video:
        raise HTTPException(status_code=404, detail="영상을 찾을 수 없습니다")

    # 자막 추출
    transcript = video.transcript or get_transcript(video.youtube_id)
    if not transcript:
        video.status = "failed"
        db.commit()
        raise HTTPException(status_code=400, detail="자막을 가져올 수 없습니다")

    video.transcript = transcript

    # AI 요약
    result = summarize_video(transcript, video.title)
    if not result:
        video.status = "failed"
        db.commit()
        raise HTTPException(status_code=500, detail="요약 실패")

    video.summary = result.get("summary")
    video.stocks_mentioned = result.get("stocks", [])
    video.status = "summarized"

    # 기존 종목 멘션 삭제 후 재생성
    db.query(StockMention).filter(StockMention.video_id == video.id).delete()
    for stock in result.get("stocks", []):
        mention = StockMention(
            video_id=video.id,
            stock_name=stock.get("name"),
            stock_code=stock.get("code"),
            market=stock.get("market"),
            sentiment=stock.get("sentiment"),
            reason=stock.get("reason"),
            mentioned_count=stock.get("mentioned_count", 1),
        )
        db.add(mention)

    db.commit()
    db.refresh(video)
    return video
