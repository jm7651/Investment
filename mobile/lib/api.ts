import axios from "axios";

// Expo 개발 시 localhost 대신 실제 IP 사용 필요 (Android 에뮬레이터: 10.0.2.2)
import { Platform } from "react-native";

const PROD_URL = "https://stock-summarizer-api.onrender.com";
const LOCAL_URL = Platform.OS === "web" ? "http://localhost:8000" : "http://10.0.2.2:8000";
const BASE_URL = process.env.EXPO_PUBLIC_API_URL || PROD_URL;

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 180000,
});

// === Types ===

export interface Channel {
  id: number;
  youtube_id: string;
  name: string;
  thumbnail_url: string | null;
  is_favorite: number;
  created_at: string;
}

export interface StockItem {
  name: string;
  code: string | null;
  market: string | null;
  sentiment: "bullish" | "bearish" | "neutral";
  reason: string;
  mentioned_count: number;
}

export interface Video {
  id: number;
  youtube_id: string;
  channel_id: number;
  title: string;
  published_at: string;
  summary: string | null;
  stocks_mentioned: StockItem[] | null;
  transcript: string | null;
  status: "pending" | "summarized" | "failed";
}

export interface StockAggregate {
  name: string;
  code: string | null;
  market: string | null;
  mention_count: number;
  latest_sentiment: string;
}

// === API Functions ===

export const channelsApi = {
  list: () => api.get<Channel[]>("/channels/").then((r) => r.data),
  add: (data: { youtube_id: string; name: string; thumbnail_url?: string }) =>
    api.post<Channel>("/channels/", data).then((r) => r.data),
  delete: (id: number) => api.delete(`/channels/${id}`).then((r) => r.data),
};

export const videosApi = {
  list: (params?: { channel_id?: number; status?: string }) =>
    api.get<Video[]>("/videos/", { params }).then((r) => r.data),
  get: (id: number) => api.get<Video>(`/videos/${id}`).then((r) => r.data),
  fetch: (channelId: number, count: number = 10) =>
    api.post<Video[]>(`/videos/fetch/${channelId}`, null, { params: { count }, timeout: 120000 }).then((r) => r.data),
  summarize: (id: number) =>
    api.post<Video>(`/videos/${id}/summarize`, null, { timeout: 120000 }).then((r) => r.data),
  weeklyFeed: (channelId?: number) =>
    api.get<WeeklyGroup[]>("/videos/feed/weekly", { params: channelId ? { channel_id: channelId } : undefined }).then((r) => r.data),
};

export interface WeeklyStockSummary {
  name: string;
  code: string | null;
  sentiment: string;
  count: number;
}

export interface WeeklyVideoItem {
  id: number;
  youtube_id: string;
  title: string;
  summary: string | null;
  stocks_mentioned: StockItem[] | null;
  status: string;
  channel_id: number;
}

export interface WeeklyGroup {
  week_key: string;
  label: string;
  start: string;
  end: string;
  videos: WeeklyVideoItem[];
  stock_summary: WeeklyStockSummary[];
}

export interface Report {
  id: number;
  nid: string;
  title: string;
  broker: string;
  pdf_url: string;
  published_date: string;
  views: number;
  summary: string | null;
  stocks_mentioned: StockItem[] | null;
  key_themes: string[] | null;
  status: "pending" | "summarized" | "failed";
}

export interface MarketIndex {
  value: number;
  change: number;
  rate: number;
}

export interface MarketDashboard {
  kospi?: MarketIndex;
  kosdaq?: MarketIndex;
  usd_krw?: MarketIndex;
  wti?: MarketIndex;
  gold?: MarketIndex;
}

export interface StockIndicators {
  code: string;
  current: number;
  ma5: number | null;
  ma20: number | null;
  ma5_position: string | null;
  ma20_position: string | null;
  rsi: number | null;
  high_52w: number | null;
  low_52w: number | null;
  from_high_pct: number | null;
}

export interface AnalystReport {
  broker: string;
  date: string;
  target_price: number;
  prev_target_price: number | null;
  change_pct: number | null;
  opinion: string;
}

export interface AnalystConsensus {
  code: string;
  consensus: {
    opinion_score: number;
    opinion: string;
    target_price: number;
    eps: number;
    per: number;
    analyst_count: number;
  } | null;
  analysts: AnalystReport[];
  source: string;
}

export interface TradeItem {
  name: string;
  code: string;
  quantity: number;
  amount: number;
  volume: number;
  date: string;
}

export interface InvestorTrades {
  [key: string]: {
    label: string;
    buy: TradeItem[];
    sell: TradeItem[];
  };
}

export const stocksApi = {
  marketDashboard: () =>
    api.get<MarketDashboard>("/stocks/market-dashboard").then((r) => r.data),
  indicators: (code: string) =>
    api.get<StockIndicators>(`/stocks/indicators/${code}`).then((r) => r.data),
  analyst: (code: string) =>
    api.get<AnalystConsensus>(`/stocks/analyst/${code}`).then((r) => r.data),
  list: () => api.get<StockAggregate[]>("/stocks/").then((r) => r.data),
  videos: (stockName: string) =>
    api.get(`/stocks/${encodeURIComponent(stockName)}/videos`).then((r) => r.data),
  investorTrades: (limit?: number, targetDate?: string) =>
    api.get<InvestorTrades>("/stocks/investor-trades", { params: { limit, target_date: targetDate } }).then((r) => r.data),
};

export interface DateInfo {
  date: string;       // "2026-04-10"
  label: string;      // "4/10"
  weekday: string;    // "목"
  status: "none" | "pending" | "summarized" | "failed";
  report_count: number;
}

export interface DailySummary {
  id: number;
  date: string;
  summary: string | null;
  stocks_mentioned: StockItem[] | null;
  key_themes: string[] | null;
  risk_warnings: string[] | null;
  report_count: number;
  status: "pending" | "summarized" | "failed";
}

export interface StockPick {
  name: string;
  code: string;
  opinion: string;
  opinion_score: number;
  current_price: number;
  target_price: number;
  upside_pct: number;
  analyst_count: number;
}

export interface DailyPicks {
  picks: StockPick[];
  source: string;
}

export interface CrosscheckItem {
  name: string;
  code: string | null;
  report_sentiment: "bullish" | "bearish" | "neutral";
  report_reason: string;
  foreign_quantity: number | null;
  institution_quantity: number | null;
  signal: "confirmed" | "divergent" | "neutral";
  note: string;
}

export interface CrosscheckResult {
  date: string;
  crosschecks: CrosscheckItem[];
  summary: { confirmed: number; divergent: number; neutral: number };
}

export const reportsApi = {
  list: () => api.get<Report[]>("/reports/").then((r) => r.data),
  get: (id: number) => api.get<Report>(`/reports/${id}`).then((r) => r.data),
  scrape: (page?: number) =>
    api.post("/reports/scrape", null, { params: { page } }).then((r) => r.data),
  summarize: (id: number) =>
    api.post(`/reports/${id}/summarize`).then((r) => r.data),
  scrapeAndSummarize: (page?: number, maxCount?: number) =>
    api.post("/reports/scrape-and-summarize", null, { params: { page, max_count: maxCount } }).then((r) => r.data),
  retryFailed: () =>
    api.post("/reports/retry-failed").then((r) => r.data),
  // 날짜별 종합 요약
  getDates: () =>
    api.get<DateInfo[]>("/reports/daily/dates").then((r) => r.data),
  getDaily: (date: string) =>
    api.get<DailySummary>(`/reports/daily/${date}`).then((r) => r.data),
  createDaily: (date: string) =>
    api.post<DailySummary>(`/reports/daily/${date}`, null, { timeout: 120000 }).then((r) => r.data),
  crosscheck: (date: string) =>
    api.get<CrosscheckResult>(`/reports/daily/${date}/crosscheck`).then((r) => r.data),
  picks: () =>
    api.get<DailyPicks>("/reports/picks").then((r) => r.data),
};

export default api;
