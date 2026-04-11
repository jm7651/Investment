import urllib.request
from datetime import date, timedelta
from bs4 import BeautifulSoup
import fitz  # PyMuPDF

BASE_URL = "https://finance.naver.com/research"
LIST_URL = f"{BASE_URL}/invest_list.naver"

HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}


def parse_naver_date(date_str: str) -> date | None:
    """'26.04.10' → date(2026, 4, 10)"""
    try:
        parts = date_str.strip().split(".")
        if len(parts) == 3:
            y, m, d = int(parts[0]) + 2000, int(parts[1]), int(parts[2])
            return date(y, m, d)
    except (ValueError, IndexError):
        pass
    return None


def format_naver_date(d: date) -> str:
    """date(2026, 4, 10) → '26.04.10'"""
    return d.strftime("%y.%m.%d")


def fetch_report_list(page: int = 1) -> list[dict]:
    """네이버 증권 투자전략 리포트 목록을 가져옵니다"""
    url = f"{LIST_URL}?&page={page}"
    req = urllib.request.Request(url, headers=HEADERS)
    resp = urllib.request.urlopen(req)
    html = resp.read().decode("euc-kr", errors="replace")

    soup = BeautifulSoup(html, "html.parser")
    table = soup.find("table", class_="type_1")
    if not table:
        return []

    reports = []
    rows = table.find_all("tr")
    for row in rows:
        cols = row.find_all("td")
        if len(cols) < 5:
            continue

        title_tag = cols[0].find("a")
        pdf_tag = cols[2].find("a")
        if not title_tag or not pdf_tag:
            continue

        title = title_tag.get_text(strip=True)
        detail_url = title_tag.get("href", "")
        nid = ""
        if "nid=" in detail_url:
            nid = detail_url.split("nid=")[1].split("&")[0]

        pdf_url = pdf_tag.get("href", "")
        broker = cols[1].get_text(strip=True)
        date_str = cols[3].get_text(strip=True)
        views = cols[4].get_text(strip=True)

        reports.append({
            "nid": nid,
            "title": title,
            "broker": broker,
            "pdf_url": pdf_url,
            "date": date_str,
            "views": int(views.replace(",", "")) if views.isdigit() else 0,
        })

    return reports


def fetch_reports_by_date(target_date: date) -> list[dict]:
    """특정 날짜의 리포트만 수집 (여러 페이지 탐색)"""
    target_str = format_naver_date(target_date)
    all_reports = []

    for page in range(1, 20):  # 최대 20페이지까지 탐색
        reports = fetch_report_list(page=page)
        if not reports:
            break

        for r in reports:
            r_date = parse_naver_date(r["date"])
            if r_date == target_date:
                all_reports.append(r)
            elif r_date and r_date < target_date:
                # 타겟 날짜보다 이전 리포트가 나오면 중단
                return all_reports

    return all_reports


def download_and_extract_pdf(pdf_url: str, max_pages: int = 15) -> str | None:
    """PDF를 다운로드하고 텍스트를 추출합니다"""
    if not pdf_url:
        return None
    try:
        req = urllib.request.Request(pdf_url, headers=HEADERS)
        resp = urllib.request.urlopen(req, timeout=30)
        pdf_bytes = resp.read()

        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        text_parts = []
        for i, page in enumerate(doc):
            if i >= max_pages:
                break
            text_parts.append(page.get_text())
        doc.close()

        text = "\n".join(text_parts).strip()
        return text if len(text) > 100 else None
    except Exception as e:
        print(f"PDF 추출 실패: {e}")
        return None
