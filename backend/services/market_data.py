import requests
from bs4 import BeautifulSoup

HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}


def _parse_naver_index(query: str) -> dict | None:
    """네이버 실시간 시세 API로 지수 조회"""
    try:
        url = f"https://polling.finance.naver.com/api/realtime?query={query}"
        resp = requests.get(url, headers=HEADERS, timeout=5)
        d = resp.json()["result"]["areas"][0]["datas"][0]
        nv = d["nv"] / 100
        cv = d["cv"] / 100
        cr = d["cr"]
        return {"value": nv, "change": cv, "rate": cr}
    except Exception:
        return None


def fetch_market_dashboard() -> dict:
    """시장 대시보드 데이터"""
    result = {}

    # 1) 코스피
    kospi = _parse_naver_index("SERVICE_INDEX:KOSPI")
    if kospi:
        result["kospi"] = kospi

    # 2) 코스닥
    kosdaq = _parse_naver_index("SERVICE_INDEX:KOSDAQ")
    if kosdaq:
        result["kosdaq"] = kosdaq

    # 3) 환율, WTI, 금 - 네이버 시장지표
    try:
        url = "https://finance.naver.com/marketindex/"
        resp = requests.get(url, headers=HEADERS, timeout=5)
        html = resp.content.decode("euc-kr", errors="replace")
        soup = BeautifulSoup(html, "html.parser")

        items = soup.select(".market_data .data_lst li")
        for item in items:
            name_tag = item.select_one(".h_lst .blind")
            value_tag = item.select_one(".value")
            change_tag = item.select_one(".change")
            if not name_tag or not value_tag:
                continue

            name = name_tag.get_text(strip=True)
            value_str = value_tag.get_text(strip=True).replace(",", "")
            change_str = change_tag.get_text(strip=True).replace(",", "") if change_tag else "0"

            try:
                value = float(value_str)
                change = float(change_str)
            except ValueError:
                continue

            # 상승/하락 판단
            up_tag = item.select_one(".blind")
            direction = item.get("class", [])

            if "미국 USD" in name:
                result["usd_krw"] = {
                    "value": value,
                    "change": change,
                    "rate": round(change / (value - change) * 100, 2) if value != change else 0,
                }
            elif "WTI" in name:
                result["wti"] = {
                    "value": value,
                    "change": change,
                    "rate": round(change / (value - change) * 100, 2) if value != change else 0,
                }
            elif "국제 금" in name:
                result["gold"] = {
                    "value": value,
                    "change": change,
                    "rate": round(change / (value - change) * 100, 2) if value != change else 0,
                }
    except Exception as e:
        print(f"시장지표 크롤링 실패: {e}")

    return result


def fetch_stock_indicators(code: str) -> dict | None:
    """개별 종목 기술적 지표 (이동평균, RSI 근사, 52주 고저)"""
    try:
        # 네이버 증권 종목 일별 시세 (여러 페이지)
        prices = []
        for page in range(1, 5):  # 4페이지 = 약 40일치
            url = f"https://finance.naver.com/item/sise_day.naver?code={code}&page={page}"
            resp = requests.get(url, headers=HEADERS, timeout=5)
            html = resp.content.decode("euc-kr", errors="replace")
            soup = BeautifulSoup(html, "html.parser")

            for tr in soup.find_all("tr"):
                tds = tr.find_all("td")
                if len(tds) >= 7:
                    price_text = tds[1].get_text(strip=True).replace(",", "")
                    if price_text.isdigit():
                        prices.append(int(price_text))

        if len(prices) < 5:
            return None

        current = prices[0]

        # 이동평균선
        ma5 = round(sum(prices[:5]) / 5) if len(prices) >= 5 else None
        ma20 = round(sum(prices[:20]) / 20) if len(prices) >= 20 else None

        # 현재가 vs 이동평균 위치
        ma5_pos = ("위" if current > ma5 else "아래") if ma5 else None
        ma20_pos = ("위" if current > ma20 else "아래") if ma20 else None

        # RSI 근사 (14일)
        rsi = None
        if len(prices) >= 15:
            gains = []
            losses = []
            for i in range(14):
                diff = prices[i] - prices[i + 1]  # 최신→과거 순이라 반대
                if diff > 0:
                    gains.append(diff)
                else:
                    losses.append(abs(diff))
            avg_gain = sum(gains) / 14 if gains else 0
            avg_loss = sum(losses) / 14 if losses else 0.001
            rs = avg_gain / avg_loss
            rsi = round(100 - (100 / (1 + rs)), 1)

        # 52주 최고/최저 - 종목 메인에서
        high_52w = None
        low_52w = None
        try:
            url2 = f"https://finance.naver.com/item/main.naver?code={code}"
            resp2 = requests.get(url2, headers=HEADERS, timeout=5)
            html2 = resp2.content.decode("euc-kr", errors="replace")
            soup2 = BeautifulSoup(html2, "html.parser")

            for em in soup2.find_all("em"):
                parent_text = em.parent.get_text() if em.parent else ""
                if "52주" in parent_text and "최고" in parent_text:
                    val = em.get_text(strip=True).replace(",", "")
                    if val.isdigit():
                        high_52w = int(val)
                elif "52주" in parent_text and "최저" in parent_text:
                    val = em.get_text(strip=True).replace(",", "")
                    if val.isdigit():
                        low_52w = int(val)
        except Exception:
            pass

        # 52주 고점 대비 위치
        from_high = None
        if high_52w and high_52w > 0:
            from_high = round((current - high_52w) / high_52w * 100, 1)

        return {
            "code": code,
            "current": current,
            "ma5": ma5,
            "ma20": ma20,
            "ma5_position": ma5_pos,
            "ma20_position": ma20_pos,
            "rsi": rsi,
            "high_52w": high_52w,
            "low_52w": low_52w,
            "from_high_pct": from_high,
        }
    except Exception as e:
        print(f"기술적 지표 실패 ({code}): {e}")
        return None
