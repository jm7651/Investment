import anthropic
import json
import os
import re
from dotenv import load_dotenv

load_dotenv(override=True)

client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

SYSTEM_PROMPT = """당신은 주식 투자 유튜브 영상을 분석하는 전문 애널리스트입니다.
영상 자막이나 리포트를 받으면 다음을 수행하세요:

1. 핵심 요약 (3~5문장)
2. 종목 추출 (최대 5개만, 가장 중요한 것만)

반드시 아래 JSON 형식으로만 응답하세요. 코드펜스 없이 순수 JSON만 출력하세요.
종목은 최대 5개까지만 추출하세요. reason은 10자 이내로 짧게 작성하세요.

{
  "summary": "요약 텍스트",
  "stocks": [
    {
      "name": "종목명",
      "code": "종목코드 또는 null",
      "market": "KOSPI|KOSDAQ|NASDAQ|NYSE|null",
      "sentiment": "bullish|bearish|neutral",
      "reason": "짧은 이유",
      "mentioned_count": 1
    }
  ],
  "key_themes": ["테마1", "테마2"],
  "risk_warnings": ["리스크1"]
}"""


def _extract_json(text: str) -> dict | None:
    """Claude 응답에서 JSON을 추출합니다"""
    text = text.strip()
    # 1) ```json ... ``` 블록 추출
    m = re.search(r"```(?:json)?\s*\n?(.*?)```", text, re.DOTALL)
    if m:
        text = m.group(1).strip()
    # 2) { } 블록 찾기
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1:
        text = text[start:end + 1]
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        # 잘린 JSON 복구 시도: 열린 괄호들을 닫아줌
        fixed = text
        open_braces = fixed.count("{") - fixed.count("}")
        open_brackets = fixed.count("[") - fixed.count("]")
        # 마지막 불완전한 항목 제거
        last_comma = fixed.rfind(",")
        if last_comma > fixed.rfind("}"):
            fixed = fixed[:last_comma]
        fixed += "}" * open_braces + "]" * open_brackets
        # 다시 닫기
        open_braces = fixed.count("{") - fixed.count("}")
        open_brackets = fixed.count("[") - fixed.count("]")
        fixed += "]" * open_brackets + "}" * open_braces
        try:
            return json.loads(fixed)
        except json.JSONDecodeError as e:
            print(f"JSON 복구 실패: {e}")
            return None


DAILY_SYSTEM_PROMPT = """당신은 주식 시장 일일 브리핑을 작성하는 수석 애널리스트입니다.
하루치 여러 증권사 리포트 요약본을 받으면 종합 분석을 수행하세요.

반드시 아래 JSON 형식으로만 응답하세요. 코드펜스 없이 순수 JSON만 출력하세요.
종목은 최대 10개, reason은 15자 이내로 짧게.

{
  "summary": "오늘의 시장 종합 요약 (5~8문장, 핵심 흐름 위주)",
  "stocks": [
    {
      "name": "종목명",
      "code": "종목코드 또는 null",
      "market": "KOSPI|KOSDAQ|NASDAQ|NYSE|null",
      "sentiment": "bullish|bearish|neutral",
      "reason": "짧은 이유",
      "mentioned_count": 1
    }
  ],
  "key_themes": ["테마1", "테마2", "테마3"],
  "risk_warnings": ["리스크1"]
}"""


def summarize_daily_reports(reports_text: str, date_str: str) -> dict | None:
    """여러 리포트를 종합하여 일일 브리핑 생성"""
    # 토큰 제한: 앞뒤로 자르기
    if len(reports_text) > 30000:
        reports_text = reports_text[:15000] + "\n...(중략)...\n" + reports_text[-12000:]
    try:
        message = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=4096,
            system=DAILY_SYSTEM_PROMPT,
            messages=[{
                "role": "user",
                "content": f"{date_str} 증권사 리포트 종합:\n\n{reports_text}"
            }]
        )
        raw = message.content[0].text
        return _extract_json(raw)
    except Exception as e:
        print(f"Claude 일일 요약 오류: {e}")
        return None


def summarize_video(transcript: str, title: str) -> dict | None:
    if len(transcript) > 15000:
        transcript = transcript[:8000] + "\n...(중략)...\n" + transcript[-5000:]
    try:
        message = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=4096,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": f"제목: {title}\n\n본문:\n{transcript}"}]
        )
        raw = message.content[0].text
        return _extract_json(raw)
    except Exception as e:
        print(f"Claude API 오류: {e}")
        return None
