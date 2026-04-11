import requests
from datetime import date
from bs4 import BeautifulSoup

HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}

# 시가총액 상위 50 종목 (KOSPI + 일부 KOSDAQ)
TOP_STOCK_CODES = [
    "005930", "000660", "005935", "005380", "000270", "035420", "068270",
    "006400", "051910", "003670", "055550", "005490", "035720", "105560",
    "028260", "034730", "096770", "032830", "207940", "066570", "003550",
    "000720", "012330", "009150", "086790", "033780", "018260", "011200",
    "010130", "036570", "024110", "259960", "316140", "373220", "352820",
    "000810", "042700", "122630", "003490", "047050", "017670", "030200",
    "009540", "015760", "034020", "029780", "138040", "004020", "011170",
    "002790",
]


def _format_date_for_naver(d: date) -> str:
    """date → '2026.04.10' 형식"""
    return d.strftime("%Y.%m.%d")


def _parse_investor_row(cols: list, target_str: str) -> dict | None:
    """frgn.naver 테이블 행 파싱. cols = [날짜, 종가, 전일비, 등락률, 거래량, 기관, 외국인, ...]"""
    if len(cols) < 7:
        return None
    date_text = cols[0].get_text(strip=True)
    if target_str not in date_text:
        return None

    def parse_num(td) -> int:
        text = td.get_text(strip=True).replace(",", "").replace("+", "")
        return int(text) if text.lstrip("-").isdigit() else 0

    return {
        "price": parse_num(cols[1]),
        "institution": parse_num(cols[5]),
        "foreign": parse_num(cols[6]),
    }


def fetch_investor_data_for_date(target_date: date, limit: int = 10) -> dict:
    """시총 상위 종목들의 외국인/기관 순매매를 가져와서 TOP N 추출"""
    target_str = _format_date_for_naver(target_date)
    all_data = []

    for code in TOP_STOCK_CODES:
        try:
            url = f"https://finance.naver.com/item/frgn.naver?code={code}"
            resp = requests.get(url, headers=HEADERS, timeout=5)
            html = resp.content.decode("euc-kr", errors="replace")
            soup = BeautifulSoup(html, "html.parser")

            # 종목명
            name_tag = soup.find("div", class_="wrap_company")
            name = name_tag.find("h2").get_text(strip=True) if name_tag and name_tag.find("h2") else code

            # 외국인/기관 테이블에서 target_date 행 찾기
            for table in soup.find_all("table"):
                for tr in table.find_all("tr"):
                    cols = tr.find_all("td")
                    result = _parse_investor_row(cols, target_str)
                    if result:
                        all_data.append({
                            "name": name,
                            "code": code,
                            "price": result["price"],
                            "institution": result["institution"],
                            "foreign": result["foreign"],
                            "date": target_str,
                        })
                        break
                else:
                    continue
                break
        except Exception as e:
            continue

    if not all_data:
        return {}

    # 외국인 순매수/순매도 TOP N
    foreign_buy = sorted([d for d in all_data if d["foreign"] > 0], key=lambda x: -x["foreign"])[:limit]
    foreign_sell = sorted([d for d in all_data if d["foreign"] < 0], key=lambda x: x["foreign"])[:limit]

    # 기관 순매수/순매도 TOP N
    inst_buy = sorted([d for d in all_data if d["institution"] > 0], key=lambda x: -x["institution"])[:limit]
    inst_sell = sorted([d for d in all_data if d["institution"] < 0], key=lambda x: x["institution"])[:limit]

    # 개인 = -(외국인+기관) 근사치
    for d in all_data:
        d["individual"] = -(d["foreign"] + d["institution"])
    indiv_buy = sorted([d for d in all_data if d["individual"] > 0], key=lambda x: -x["individual"])[:limit]
    indiv_sell = sorted([d for d in all_data if d["individual"] < 0], key=lambda x: x["individual"])[:limit]

    def to_list(items, key):
        return [
            {
                "name": d["name"],
                "code": d["code"],
                "quantity": d[key],
                "amount": 0,
                "volume": 0,
                "date": d["date"],
            }
            for d in items
        ]

    return {
        "foreign": {
            "label": "외국인",
            "buy": to_list(foreign_buy, "foreign"),
            "sell": to_list(foreign_sell, "foreign"),
        },
        "institution": {
            "label": "기관",
            "buy": to_list(inst_buy, "institution"),
            "sell": to_list(inst_sell, "institution"),
        },
        "individual": {
            "label": "개인",
            "buy": to_list(indiv_buy, "individual"),
            "sell": to_list(indiv_sell, "individual"),
        },
    }


def fetch_all_investor_trades(limit: int = 10, target_date: date | None = None) -> dict:
    """외국인/기관/개인 순매수 TOP N"""
    td = target_date or date.today()
    return fetch_investor_data_for_date(td, limit)
