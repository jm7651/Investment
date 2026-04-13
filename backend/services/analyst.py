import requests
from bs4 import BeautifulSoup

HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}

# 시총 상위 + 주요 종목 코드 (확장 가능)
SCAN_CODES = [
    "005930", "000660", "005380", "000270", "035420", "068270",
    "006400", "051910", "003670", "055550", "005490", "035720", "105560",
    "028260", "034730", "096770", "032830", "207940", "066570", "003550",
    "000720", "012330", "009150", "086790", "033780", "018260", "011200",
    "010130", "036570", "024110", "259960", "316140", "373220", "352820",
    "000810", "042700", "003490", "047050", "017670", "030200", "029780",
    "138040", "004020", "011170", "002790", "010950", "064350", "012450",
    "010120", "267260", "112610",
]


def fetch_analyst_consensus(code: str) -> dict | None:
    """종목 애널리스트 컨센서스 (투자의견, 목표주가, 증권사별 리포트)
    출처: FnGuide, Refinitiv via WiseReport/네이버증권"""
    try:
        url = f"https://navercomp.wisereport.co.kr/v2/company/c1010001.aspx?cmp_cd={code}&target=consensus_0"
        resp = requests.get(url, headers=HEADERS, timeout=10)
        soup = BeautifulSoup(resp.text, "html.parser")

        # 종목명 추출
        name = ""
        name_tag = soup.find("span", class_="name")
        if name_tag:
            name = name_tag.get_text(strip=True)

        result = {
            "code": code,
            "name": name,
            "consensus": None,
            "analysts": [],
            "source": "FnGuide, Refinitiv",
        }

        for table in soup.find_all("table"):
            rows = table.find_all("tr")
            if len(rows) < 2:
                continue

            first_row_text = " ".join(
                t.get_text(strip=True) for t in rows[0].find_all(["th", "td"])
            )

            if "투자의견" in first_row_text and "목표주가" in first_row_text:
                vals = [t.get_text(strip=True) for t in rows[1].find_all(["th", "td"])]
                if len(vals) >= 5:
                    opinion_score = _parse_float(vals[0])
                    target_price = _parse_int(vals[1])
                    eps = _parse_int(vals[2])
                    per = _parse_float(vals[3])
                    analyst_count = _parse_int(vals[4])
                    opinion_label = _score_to_label(opinion_score)

                    result["consensus"] = {
                        "opinion_score": opinion_score,
                        "opinion": opinion_label,
                        "target_price": target_price,
                        "eps": eps,
                        "per": per,
                        "analyst_count": analyst_count,
                    }

            if "제공처" in first_row_text and "목표가" in first_row_text:
                for r in rows[1:]:
                    cols = [t.get_text(strip=True) for t in r.find_all("td")]
                    if len(cols) < 6:
                        continue
                    broker = cols[0]
                    date_str = cols[1]
                    target = _parse_int(cols[2])
                    prev_target = _parse_int(cols[3])
                    change_pct = _parse_float(cols[4])
                    opinion = _normalize_opinion(cols[5])
                    if not broker or not target:
                        continue
                    result["analysts"].append({
                        "broker": broker,
                        "date": date_str,
                        "target_price": target,
                        "prev_target_price": prev_target,
                        "change_pct": change_pct,
                        "opinion": opinion,
                    })

        if not result["consensus"] and not result["analysts"]:
            return None

        return result
    except Exception as e:
        print(f"애널리스트 컨센서스 실패 ({code}): {e}")
        return None


def fetch_strong_buy_picks(limit: int = 10) -> list[dict]:
    """시장 전체에서 적극매수 + 상승여력 높은 종목 스캔 (경량화)
    출처: FnGuide, Refinitiv"""
    picks = []

    # 시총 상위 20개만 빠르게 스캔
    top20 = SCAN_CODES[:20]

    for code in top20:
        try:
            # 컨센서스 + 현재가를 한번에 (컨센서스 페이지에서)
            url = f"https://navercomp.wisereport.co.kr/v2/company/c1010001.aspx?cmp_cd={code}&target=consensus_0"
            resp = requests.get(url, headers=HEADERS, timeout=3)
            soup = BeautifulSoup(resp.text, "html.parser")

            name = ""
            name_tag = soup.find("span", class_="name")
            if name_tag:
                name = name_tag.get_text(strip=True)

            # 현재가 추출 (같은 페이지에서)
            current_price = None
            for span in soup.find_all("span"):
                text = span.get_text(strip=True).replace(",", "")
                parent_text = span.parent.get_text() if span.parent else ""
                if "현재가" in parent_text and text.isdigit() and int(text) > 1000:
                    current_price = int(text)
                    break

            score = None
            target_price = None
            analyst_count = None

            for table in soup.find_all("table"):
                rows = table.find_all("tr")
                if len(rows) < 2:
                    continue
                header = " ".join(
                    t.get_text(strip=True) for t in rows[0].find_all(["th", "td"])
                )
                if "투자의견" not in header or "목표주가" not in header:
                    continue

                vals = [t.get_text(strip=True) for t in rows[1].find_all(["th", "td"])]
                if len(vals) < 5:
                    continue

                score = _parse_float(vals[0])
                target_price = _parse_int(vals[1])
                analyst_count = _parse_int(vals[4])
                break

            if not score or score < 4.0 or not target_price:
                continue

            # 현재가 못 구하면 별도 요청
            if not current_price:
                current_price = _get_current_price(code)

            if not current_price:
                continue

            upside = round((target_price - current_price) / current_price * 100, 1)
            if upside < 15:
                continue

            picks.append({
                "name": name or code,
                "code": code,
                "opinion": _score_to_label(score),
                "opinion_score": score,
                "current_price": current_price,
                "target_price": target_price,
                "upside_pct": upside,
                "analyst_count": analyst_count,
            })
        except Exception:
            continue

    picks.sort(key=lambda x: -x["upside_pct"])
    return picks[:limit]


def _get_current_price(code: str) -> int | None:
    """네이버 일별 시세에서 현재가 조회"""
    try:
        url = f"https://finance.naver.com/item/sise_day.naver?code={code}"
        resp = requests.get(url, headers=HEADERS, timeout=5)
        html = resp.content.decode("euc-kr", errors="replace")
        soup = BeautifulSoup(html, "html.parser")
        for tr in soup.find_all("tr"):
            tds = tr.find_all("td")
            if len(tds) >= 7:
                price = tds[1].get_text(strip=True).replace(",", "")
                if price.isdigit():
                    return int(price)
    except Exception:
        pass
    return None


def _parse_int(s: str) -> int | None:
    s = s.replace(",", "").replace(" ", "")
    try:
        return int(s)
    except (ValueError, TypeError):
        return None


def _parse_float(s: str) -> float | None:
    s = s.replace(",", "").replace(" ", "")
    try:
        return float(s)
    except (ValueError, TypeError):
        return None


def _score_to_label(score: float | None) -> str:
    if score is None:
        return "N/A"
    if score >= 4.5:
        return "강력매수"
    if score >= 3.5:
        return "매수"
    if score >= 2.5:
        return "중립"
    if score >= 1.5:
        return "매도"
    return "강력매도"


def _normalize_opinion(s: str) -> str:
    s = s.strip().upper()
    if s in ("BUY", "매수", "OUTPERFORM", "OVERWEIGHT"):
        return "매수"
    if s in ("HOLD", "중립", "NEUTRAL", "MARKET PERFORM", "EQUAL-WEIGHT"):
        return "중립"
    if s in ("SELL", "매도", "UNDERPERFORM", "UNDERWEIGHT"):
        return "매도"
    if s in ("STRONG BUY", "강력매수", "강력 매수"):
        return "강력매수"
    return s
