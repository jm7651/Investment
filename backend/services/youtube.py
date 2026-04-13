import yt_dlp
import os
import re
import urllib.request
from googleapiclient.discovery import build

YOUTUBE_API_KEY = os.getenv("YOUTUBE_API_KEY")


def resolve_channel_id(input_str: str) -> str:
    """URL, @핸들, 또는 채널 ID를 받아서 UC... 채널 ID로 변환"""
    input_str = input_str.strip().rstrip("/")

    # 이미 UC로 시작하는 채널 ID
    if re.match(r"^UC[\w-]{20,}$", input_str):
        return input_str

    # URL에서 /channel/UC... 추출
    m = re.search(r"/channel/(UC[\w-]+)", input_str)
    if m:
        return m.group(1)

    # @핸들 추출 (URL이든 @만이든)
    handle = None
    m = re.search(r"/@([\w.-]+)", input_str)
    if m:
        handle = m.group(1)
    elif input_str.startswith("@"):
        handle = input_str[1:]

    if handle:
        # yt-dlp로 정확한 채널 ID 추출
        try:
            ydl_opts = {"quiet": True, "extract_flat": True, "playlistend": 1}
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(f"https://www.youtube.com/@{handle}/videos", download=False)
                cid = info.get("channel_id")
                if cid:
                    return cid
        except Exception:
            pass
        # fallback: HTML에서 externalId 패턴으로 추출
        try:
            url = f"https://www.youtube.com/@{handle}"
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            resp = urllib.request.urlopen(req, timeout=10)
            html = resp.read().decode("utf-8", errors="replace")
            m2 = re.search(r'"externalId":"(UC[^"]+)"', html)
            if m2:
                return m2.group(1)
        except Exception as e:
            print(f"채널 ID 추출 실패 (@{handle}): {e}")

    return input_str  # 변환 실패 시 원본 반환

def get_transcript(video_id: str) -> str | None:
    """자막 추출 (youtube-transcript-api 우선, yt-dlp fallback)"""
    # 1) youtube-transcript-api (서버리스 호환)
    try:
        from youtube_transcript_api import YouTubeTranscriptApi
        ytt = YouTubeTranscriptApi()
        transcript = ytt.fetch(video_id, languages=["ko", "en"])
        text = " ".join(t.text for t in transcript)
        if len(text) > 50:
            return text
    except Exception as e:
        print(f"youtube-transcript-api 실패 {video_id}: {e}")

    # 2) yt-dlp fallback (로컬에서만)
    try:
        ydl_opts = {
            "skip_download": True,
            "writesubtitles": True,
            "writeautomaticsub": True,
            "subtitleslangs": ["ko", "en"],
            "quiet": True,
        }
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(
                f"https://www.youtube.com/watch?v={video_id}",
                download=False
            )
            for subs_dict in [info.get("subtitles", {}), info.get("automatic_captions", {})]:
                for lang in ["ko", "en"]:
                    if lang not in subs_dict:
                        continue
                    entries = subs_dict[lang]
                    if not entries:
                        continue
                    texts = [e.get("text", "") for e in entries if e.get("text")]
                    if texts:
                        return " ".join(texts)
    except Exception as e:
        print(f"yt-dlp 자막 실패 {video_id}: {e}")

    return None

def get_channel_recent_videos(channel_id: str, max_results: int = 10) -> list:
    """채널 최신 영상 목록 조회 (RSS 우선 → yt-dlp → YouTube API)"""
    # 1) RSS 피드 (가장 빠르고 서버리스에서도 동작)
    videos = _get_videos_rss(channel_id, max_results)
    if videos:
        return videos

    # 2) yt-dlp (로컬에서만 동작)
    videos = _get_videos_ytdlp(channel_id, max_results)
    if videos:
        return videos

    # 3) YouTube Data API fallback
    if not YOUTUBE_API_KEY:
        return []
    try:
        youtube = build("youtube", "v3", developerKey=YOUTUBE_API_KEY)
        res = youtube.search().list(
            channelId=channel_id,
            part="snippet",
            order="date",
            maxResults=max_results,
            type="video"
        ).execute()
        return [
            {
                "youtube_id": item["id"]["videoId"],
                "title": item["snippet"]["title"],
                "published_at": item["snippet"]["publishedAt"],
            }
            for item in res.get("items", [])
        ]
    except Exception as e:
        print(f"YouTube API 오류: {e}")
        return []


def _get_videos_rss(channel_id: str, max_results: int = 15) -> list:
    """YouTube RSS 피드로 최신 영상 목록 (서버리스 호환, 최대 15개)"""
    try:
        import requests as req
        url = f"https://www.youtube.com/feeds/videos.xml?channel_id={channel_id}"
        resp = req.get(url, timeout=10)
        if resp.status_code != 200:
            return []

        xml = resp.text
        entries = re.findall(r"<entry>(.*?)</entry>", xml, re.DOTALL)
        videos = []
        for e in entries[:max_results]:
            vid_m = re.search(r"<yt:videoId>(.*?)</yt:videoId>", e)
            title_m = re.search(r"<title>(.*?)</title>", e)
            pub_m = re.search(r"<published>(.*?)</published>", e)
            if not vid_m:
                continue
            videos.append({
                "youtube_id": vid_m.group(1),
                "title": title_m.group(1) if title_m else "",
                "published_at": pub_m.group(1) if pub_m else None,
            })
        return videos
    except Exception as e:
        print(f"RSS 피드 실패 ({channel_id}): {e}")
        return []


def _get_video_date(video_id: str) -> str | None:
    """YouTube 영상 페이지에서 publishDate 추출 (빠름)"""
    try:
        import requests as req
        resp = req.get(
            f"https://www.youtube.com/watch?v={video_id}",
            headers={"User-Agent": "Mozilla/5.0"},
            timeout=3,
        )
        m = re.search(r'"publishDate":"([^"]+)"', resp.text)
        if m:
            return m.group(1)  # "2026-04-12T04:30:09-07:00"
    except Exception:
        pass
    return None


def _get_videos_ytdlp(channel_id: str, max_results: int = 10) -> list:
    """yt-dlp로 채널 최신 영상 목록 추출 + 날짜"""
    url = f"https://www.youtube.com/channel/{channel_id}/videos"
    ydl_opts = {
        "quiet": True,
        "extract_flat": True,
        "playlistend": max_results,
        "extractor_args": {"youtube": {"lang": ["ko"]}},
    }
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            entries = info.get("entries", [])
            videos = []
            for e in entries:
                vid = e.get("id")
                if not vid:
                    continue
                # 날짜 가져오기
                pub_date = _get_video_date(vid)
                videos.append({
                    "youtube_id": vid,
                    "title": e.get("title", ""),
                    "published_at": pub_date,
                    "duration": e.get("duration", 0),
                })
            return videos
    except Exception as e:
        print(f"yt-dlp 채널 목록 실패 ({channel_id}): {e}")
        return []
