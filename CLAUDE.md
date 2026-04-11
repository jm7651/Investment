# YouTube Stock Summarizer

## 프로젝트 목적
유튜브 주식 채널 영상을 자동 요약하고 추천 종목을 추출하는 모바일 앱

## 기술 스택
- Frontend: Expo (React Native), React Query, Zustand
- Backend: FastAPI, SQLAlchemy, APScheduler
- AI: Anthropic Claude API (요약 + 종목 추출)
- Data: YouTube Data API v3, yt-dlp (자막), KIS API

## 핵심 규칙
- 종목 추출은 Claude API를 통해 구조화된 JSON으로 반환
- 영상 자막은 yt-dlp로 먼저 시도, 없으면 YouTube API transcript
- KIS API는 Phase 2에서 연동 (Phase 1은 mock 데이터)
- 모든 API 키는 .env 파일 관리

## 현재 작업 Phase
Phase 1: 채널 등록 → 영상 수집 → AI 요약 → 종목 카드 표시
