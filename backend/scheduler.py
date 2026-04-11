from apscheduler.schedulers.background import BackgroundScheduler
from database import SessionLocal
from models import Channel, Video
from services.youtube import get_channel_recent_videos, get_transcript
from services.claude import summarize_video
from datetime import datetime

def fetch_and_summarize():
    db = SessionLocal()
    try:
        channels = db.query(Channel).filter(Channel.is_favorite == 1).all()
        for channel in channels:
            videos = get_channel_recent_videos(channel.youtube_id, max_results=3)
            for v in videos:
                exists = db.query(Video).filter(Video.youtube_id == v["youtube_id"]).first()
                if exists:
                    continue
                video = Video(
                    youtube_id=v["youtube_id"],
                    channel_id=channel.id,
                    title=v["title"],
                    published_at=datetime.fromisoformat(v["published_at"].replace("Z", "+00:00")),
                    status="pending"
                )
                db.add(video)
                db.commit()
                db.refresh(video)

                transcript = get_transcript(video.youtube_id)
                if not transcript:
                    video.status = "failed"
                    db.commit()
                    continue

                result = summarize_video(transcript, video.title)
                if result:
                    video.summary = result.get("summary")
                    video.stocks_mentioned = result.get("stocks", [])
                    video.transcript = transcript
                    video.status = "summarized"
                else:
                    video.status = "failed"
                db.commit()
    finally:
        db.close()

def start_scheduler():
    scheduler = BackgroundScheduler()
    scheduler.add_job(fetch_and_summarize, "interval", hours=2)
    scheduler.start()
    return scheduler
