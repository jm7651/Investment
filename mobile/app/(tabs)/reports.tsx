import { useEffect, useState, useCallback, useRef } from "react";
import {
  View,
  ScrollView,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Alert,
  Platform,
} from "react-native";
import {
  DateInfo,
  DailySummary,
  InvestorTrades,
  TradeItem,
  CrosscheckResult,
  CrosscheckItem,
  MarketDashboard,
  DailyPicks,
  StockPick,
  reportsApi,
  stocksApi,
} from "../../lib/api";
import StockBadge from "../../components/StockBadge";

// ── 투자자 매매 동향 컴포넌트 ──

const INVESTOR_COLORS = {
  foreign: { bg: "#dbeafe", text: "#2563eb", label: "외국인" },
  institution: { bg: "#fce7f3", text: "#db2777", label: "기관" },
  individual: { bg: "#dcfce7", text: "#16a34a", label: "개인" },
};

function formatQuantity(qty: number): string {
  const abs = Math.abs(qty);
  if (abs >= 1000000) return `${(abs / 1000000).toFixed(1)}백만주`;
  if (abs >= 10000) return `${(abs / 10000).toFixed(1)}만주`;
  if (abs >= 1000) return `${(abs / 1000).toFixed(1)}천주`;
  return `${abs}주`;
}

function InvestorCard({
  investorKey,
  data,
}: {
  investorKey: string;
  data: { label: string; buy: TradeItem[]; sell: TradeItem[] };
}) {
  const color =
    INVESTOR_COLORS[investorKey as keyof typeof INVESTOR_COLORS] ||
    INVESTOR_COLORS.foreign;
  const [tab, setTab] = useState<"buy" | "sell">("buy");
  const items = tab === "buy" ? data.buy : data.sell;

  const webCardStyle = Platform.OS === "web" ? { minWidth: 300, flex: 1, maxWidth: "100%" as any } : { minWidth: "100%" as any };

  return (
    <View style={[investorStyles.card, webCardStyle]}>
      <View style={[investorStyles.header, { backgroundColor: color.bg }]}>
        <Text style={[investorStyles.label, { color: color.text }]}>
          {data.label}
        </Text>
        {data.buy[0]?.date && (
          <Text style={investorStyles.date}>{data.buy[0].date}</Text>
        )}
      </View>
      <View style={investorStyles.tabRow}>
        <Pressable
          style={[investorStyles.tab, tab === "buy" && investorStyles.tabBuy]}
          onPress={() => setTab("buy")}
        >
          <Text
            style={[
              investorStyles.tabText,
              tab === "buy" && { color: "#dc2626", fontWeight: "500" },
            ]}
          >
            순매수
          </Text>
        </Pressable>
        <Pressable
          style={[investorStyles.tab, tab === "sell" && investorStyles.tabSell]}
          onPress={() => setTab("sell")}
        >
          <Text
            style={[
              investorStyles.tabText,
              tab === "sell" && { color: "#2563eb", fontWeight: "500" },
            ]}
          >
            순매도
          </Text>
        </Pressable>
      </View>
      {items.map((item, i) => (
        <View key={`${item.code}-${i}`} style={investorStyles.row}>
          <Text style={investorStyles.rank}>{i + 1}</Text>
          <View style={{ flex: 1, marginLeft: 8 }}>
            <Text style={investorStyles.name}>{item.name}</Text>
            <Text style={investorStyles.code}>{item.code}</Text>
          </View>
          <Text
            style={[
              investorStyles.amount,
              { color: item.quantity >= 0 ? "#dc2626" : "#2563eb" },
            ]}
          >
            {item.quantity >= 0 ? "+" : ""}
            {formatQuantity(item.quantity)}
          </Text>
        </View>
      ))}
    </View>
  );
}

function MarketDashboardBar({ data }: { data: MarketDashboard }) {
  const items = [
    { key: "kospi", label: "코스피", data: data.kospi },
    { key: "kosdaq", label: "코스닥", data: data.kosdaq },
    { key: "usd_krw", label: "USD/KRW", data: data.usd_krw },
    { key: "wti", label: "WTI", data: data.wti },
    { key: "gold", label: "금", data: data.gold },
  ].filter((i) => i.data);

  return (
    <View style={dashStyles.bar}>
      {items.map((item) => {
        const d = item.data!;
        const isUp = d.change >= 0;
        return (
          <View key={item.key} style={dashStyles.item}>
            <Text style={dashStyles.label}>{item.label}</Text>
            <Text style={dashStyles.value}>
              {d.value >= 1000 ? d.value.toLocaleString() : d.value.toFixed(2)}
            </Text>
            <Text
              style={[
                dashStyles.change,
                { color: isUp ? "#dc2626" : "#2563eb" },
              ]}
            >
              {isUp ? "▲" : "▼"} {Math.abs(d.change).toLocaleString()} ({d.rate >= 0 ? "+" : ""}{d.rate.toFixed(2)}%)
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const dashStyles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    backgroundColor: "#171A20",
    paddingVertical: 10,
    paddingHorizontal: 8,
    gap: 4,
  },
  item: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 4,
  },
  label: { fontSize: 10, color: "#8E8E8E", fontWeight: "500" },
  value: { fontSize: 13, color: "#fff", fontWeight: "500", marginTop: 2 },
  change: { fontSize: 10, fontWeight: "600", marginTop: 1 },
});

function PickCard({ pick }: { pick: StockPick }) {
  return (
    <View style={pickStyles.card}>
      <View style={pickStyles.header}>
        <Text style={pickStyles.name}>{pick.name}</Text>
        <View style={pickStyles.opinionBadge}>
          <Text style={pickStyles.opinionText}>{pick.opinion}</Text>
        </View>
      </View>
      <View style={pickStyles.priceRow}>
        <View>
          <Text style={pickStyles.priceLabel}>현재가</Text>
          <Text style={pickStyles.priceValue}>{pick.current_price.toLocaleString()}</Text>
        </View>
        <Text style={pickStyles.arrow}>→</Text>
        <View>
          <Text style={pickStyles.priceLabel}>목표가</Text>
          <Text style={pickStyles.targetValue}>{pick.target_price.toLocaleString()}</Text>
        </View>
        <View style={pickStyles.upsideBadge}>
          <Text style={pickStyles.upsideText}>+{pick.upside_pct}%</Text>
        </View>
      </View>
      <Text style={pickStyles.meta2}>{pick.analyst_count}개 증권사 컨센서스</Text>
    </View>
  );
}

function PicksSection({ picks, source }: { picks: StockPick[]; source: string }) {
  if (!picks.length) return null;
  return (
    <View style={pickStyles.section}>
      <View style={pickStyles.sectionHeader}>
        <Text style={pickStyles.sectionTitle}>애널리스트 추천 종목</Text>
        <Text style={pickStyles.sourceText}>출처: {source}</Text>
      </View>
      <View style={pickStyles.grid}>
        {picks.map((p, i) => (
          <PickCard key={`${p.code}-${i}`} pick={p} />
        ))}
      </View>
    </View>
  );
}

const pickStyles = StyleSheet.create({
  section: { marginHorizontal: 16, marginTop: 16 },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  sectionTitle: { fontSize: 16, fontWeight: "500", color: "#171A20" },
  sourceText: { fontSize: 10, color: "#8E8E8E" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 4,
    padding: 14,
    borderWidth: 1,
    borderColor: "#EEEEEE",
    ...(Platform.OS === "web"
      ? { minWidth: 220, flexGrow: 1, flexBasis: "30%" }
      : { minWidth: "100%" as any }),
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  name: { fontSize: 14, fontWeight: "500", color: "#171A20" },
  opinionBadge: {
    backgroundColor: "rgba(22,163,74,0.08)",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  opinionText: { fontSize: 11, fontWeight: "500", color: "#16a34a" },
  priceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  priceLabel: { fontSize: 10, color: "#8E8E8E" },
  priceValue: { fontSize: 14, fontWeight: "500", color: "#393C41" },
  targetValue: { fontSize: 14, fontWeight: "500", color: "#3E6AE1" },
  arrow: { fontSize: 14, color: "#D0D1D2" },
  upsideBadge: {
    backgroundColor: "rgba(22,163,74,0.1)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    marginLeft: "auto",
  },
  upsideText: { fontSize: 14, fontWeight: "500", color: "#16a34a" },
  meta2: { fontSize: 11, color: "#8E8E8E", marginTop: 4 },
  reason: { fontSize: 12, color: "#5C5E62", marginBottom: 6 },
  meta: { flexDirection: "row", gap: 6 },
  metaChip: {
    fontSize: 10,
    color: "#5C5E62",
    backgroundColor: "#F4F4F4",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: "hidden",
  },
});

function MentionedStockCard({ stock }: { stock: any }) {
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    if (stock.code) {
      Promise.all([
        stocksApi.analyst(stock.code).catch(() => null),
        stocksApi.indicators(stock.code).catch(() => null),
      ]).then(([a, ind]) => {
        setData({ analyst: a, indicators: ind });
      });
    }
  }, [stock.code]);

  const c = data?.analyst?.consensus;
  const ind = data?.indicators;
  const upside =
    c?.target_price && ind?.current
      ? (((c.target_price - ind.current) / ind.current) * 100).toFixed(1)
      : null;

  return (
    <View style={mentionStyles.card}>
      <View style={mentionStyles.top}>
        <StockBadge stock={stock} />
        <Text style={mentionStyles.reason}>{stock.reason}</Text>
      </View>
      {c && (
        <View style={mentionStyles.analystRow}>
          <View style={mentionStyles.analystItem}>
            <Text style={mentionStyles.label}>투자의견</Text>
            <Text style={[mentionStyles.value, {
              color: c.opinion === "매수" || c.opinion === "강력매수" ? "#16a34a" : c.opinion === "매도" ? "#dc2626" : "#5C5E62"
            }]}>{c.opinion}</Text>
          </View>
          <View style={mentionStyles.analystItem}>
            <Text style={mentionStyles.label}>현재가</Text>
            <Text style={mentionStyles.value}>{ind?.current?.toLocaleString() || "-"}</Text>
          </View>
          <View style={mentionStyles.analystItem}>
            <Text style={mentionStyles.label}>목표가</Text>
            <Text style={[mentionStyles.value, { color: "#3E6AE1" }]}>{c.target_price?.toLocaleString()}</Text>
          </View>
          {upside && (
            <View style={mentionStyles.analystItem}>
              <Text style={mentionStyles.label}>상승여력</Text>
              <Text style={[mentionStyles.value, {
                color: Number(upside) >= 0 ? "#16a34a" : "#dc2626"
              }]}>{Number(upside) >= 0 ? "+" : ""}{upside}%</Text>
            </View>
          )}
          <View style={mentionStyles.analystItem}>
            <Text style={mentionStyles.label}>추정기관</Text>
            <Text style={mentionStyles.value}>{c.analyst_count}개</Text>
          </View>
        </View>
      )}
      {ind && !ind.error && (
        <View style={mentionStyles.indicators}>
          {ind.ma5_position && <Text style={mentionStyles.chip}>5일선 {ind.ma5_position}</Text>}
          {ind.ma20_position && <Text style={mentionStyles.chip}>20일선 {ind.ma20_position}</Text>}
          {ind.rsi != null && <Text style={[mentionStyles.chip, {
            color: ind.rsi >= 70 ? "#dc2626" : ind.rsi <= 30 ? "#3E6AE1" : "#5C5E62"
          }]}>RSI {ind.rsi}</Text>}
        </View>
      )}
    </View>
  );
}

const mentionStyles = StyleSheet.create({
  card: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#EEEEEE",
    borderRadius: 4,
    padding: 10,
    marginBottom: 6,
  },
  top: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  reason: { fontSize: 12, color: "#5C5E62", flex: 1 },
  analystRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: "#F4F4F4",
  },
  analystItem: { alignItems: "center" },
  label: { fontSize: 9, color: "#8E8E8E", marginBottom: 1 },
  value: { fontSize: 12, fontWeight: "500", color: "#171A20" },
  indicators: {
    flexDirection: "row",
    gap: 6,
    marginTop: 6,
  },
  chip: {
    fontSize: 10,
    color: "#5C5E62",
    backgroundColor: "#F4F4F4",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: "hidden",
  },
});

const SIGNAL_STYLES = {
  confirmed: { bg: "#dcfce7", border: "#16a34a", icon: "✓", color: "#16a34a", label: "일치" },
  divergent: { bg: "#fee2e2", border: "#dc2626", icon: "!", color: "#dc2626", label: "불일치" },
  neutral: { bg: "#F4F4F4", border: "#8E8E8E", icon: "−", color: "#5C5E62", label: "중립" },
};

function CrosscheckCard({ item }: { item: CrosscheckItem }) {
  const s = SIGNAL_STYLES[item.signal];

  return (
    <View style={[crossStyles.card, { borderLeftColor: s.border }]}>
      <View style={crossStyles.cardTop}>
        <View style={[crossStyles.signalBadge, { backgroundColor: s.bg }]}>
          <Text style={[crossStyles.signalIcon, { color: s.color }]}>{s.icon}</Text>
          <Text style={[crossStyles.signalLabel, { color: s.color }]}>{s.label}</Text>
        </View>
        <Text style={crossStyles.stockName}>{item.name}</Text>
        <Text style={crossStyles.stockCode}>{item.code}</Text>
      </View>
      <View style={crossStyles.flowRow}>
        <View style={crossStyles.flowItem}>
          <Text style={crossStyles.flowLabel}>리포트</Text>
          <Text
            style={[
              crossStyles.flowValue,
              { color: item.report_sentiment === "bullish" ? "#16a34a" : item.report_sentiment === "bearish" ? "#dc2626" : "#5C5E62" },
            ]}
          >
            {item.report_sentiment === "bullish" ? "▲ 매수" : item.report_sentiment === "bearish" ? "▼ 매도" : "− 중립"}
          </Text>
        </View>
        {item.foreign_quantity != null ? (
          <>
            <Text style={crossStyles.flowArrow}>vs</Text>
            <View style={crossStyles.flowItem}>
              <Text style={crossStyles.flowLabel}>외국인</Text>
              <Text style={[crossStyles.flowValue, { color: item.foreign_quantity >= 0 ? "#dc2626" : "#3E6AE1" }]}>
                {item.foreign_quantity >= 0 ? "▲" : "▼"} {formatQuantity(item.foreign_quantity)}
              </Text>
            </View>
            <View style={crossStyles.flowItem}>
              <Text style={crossStyles.flowLabel}>기관</Text>
              <Text style={[crossStyles.flowValue, { color: (item.institution_quantity ?? 0) >= 0 ? "#dc2626" : "#3E6AE1" }]}>
                {(item.institution_quantity ?? 0) >= 0 ? "▲" : "▼"} {formatQuantity(item.institution_quantity ?? 0)}
              </Text>
            </View>
          </>
        ) : (
          <Text style={crossStyles.flowNoData}>수급 데이터 없음</Text>
        )}
      </View>
      <Text style={crossStyles.note}>{item.note}</Text>
    </View>
  );
}

export default function ReportsScreen() {
  const [dates, setDates] = useState<DateInfo[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [loadingDates, setLoadingDates] = useState(true);

  // 날짜별 로딩 상태 (여러 날짜 동시 로딩 가능)
  const [loadingSet, setLoadingSet] = useState<Set<string>>(new Set());
  // 날짜별 캐시된 요약
  const [summaryCache, setSummaryCache] = useState<Record<string, DailySummary>>({});
  // 투자자 매매 동향
  const [investorTrades, setInvestorTrades] = useState<InvestorTrades | null>(null);
  const [loadingTrades, setLoadingTrades] = useState(false);
  // 시장 대시보드
  const [market, setMarket] = useState<MarketDashboard | null>(null);
  // 추천 종목
  const [picks, setPicks] = useState<DailyPicks | null>(null);
  const [loadingPicks, setLoadingPicks] = useState(false);
  // 크로스체크
  const [crosscheck, setCrosscheck] = useState<CrosscheckResult | null>(null);
  const [loadingCross, setLoadingCross] = useState(false);
  const [crossCache, setCrossCache] = useState<Record<string, CrosscheckResult>>({});

  const addLoading = (d: string) =>
    setLoadingSet((prev) => new Set(prev).add(d));
  const removeLoading = (d: string) =>
    setLoadingSet((prev) => {
      const next = new Set(prev);
      next.delete(d);
      return next;
    });

  // 날짜 목록 로드
  const fetchDates = useCallback(async () => {
    setLoadingDates(true);
    try {
      const data = await reportsApi.getDates();
      setDates(data);
      if (data.length > 0 && !selectedDate) {
        setSelectedDate(data[0].date);
      }
    } finally {
      setLoadingDates(false);
    }
  }, []);

  // 투자자 매매 캐시 (날짜별)
  const [tradesCache, setTradesCache] = useState<Record<string, InvestorTrades>>({});

  const fetchTradesForDate = useCallback(async (dateStr: string) => {
    if (tradesCache[dateStr]) {
      setInvestorTrades(tradesCache[dateStr]);
      return;
    }
    setLoadingTrades(true);
    setInvestorTrades(null);
    try {
      const data = await stocksApi.investorTrades(10, dateStr);
      if (data && Object.keys(data).length > 0) {
        setTradesCache((prev) => ({ ...prev, [dateStr]: data }));
        setInvestorTrades(data);
      } else {
        setInvestorTrades(null);
      }
    } catch {
      setInvestorTrades(null);
    } finally {
      setLoadingTrades(false);
    }
  }, [tradesCache]);

  useEffect(() => {
    fetchDates();
    stocksApi.marketDashboard().then(setMarket).catch(() => {});
  }, []);

  // 선택 날짜 바뀌면 캐시에서 로드 시도 + 투자자 매매도 fetch
  useEffect(() => {
    if (!selectedDate) return;
    const dateInfo = dates.find((d) => d.date === selectedDate);
    if (dateInfo?.status === "summarized" && !summaryCache[selectedDate]) {
      loadDaily(selectedDate);
    }
    fetchTradesForDate(selectedDate);
    fetchCrosscheck(selectedDate);
  }, [selectedDate, dates]);

  // 추천 종목 (최초 1회)
  useEffect(() => {
    setLoadingPicks(true);
    reportsApi
      .picks()
      .then((data) => {
        if (data && data.picks.length > 0) setPicks(data);
      })
      .catch(() => {})
      .finally(() => setLoadingPicks(false));
  }, []);

  const fetchCrosscheck = useCallback(async (dateStr: string) => {
    if (crossCache[dateStr]) {
      setCrosscheck(crossCache[dateStr]);
      return;
    }
    setLoadingCross(true);
    setCrosscheck(null);
    try {
      const data = await reportsApi.crosscheck(dateStr);
      if (data && data.crosschecks.length > 0) {
        setCrossCache((prev) => ({ ...prev, [dateStr]: data }));
        setCrosscheck(data);
      }
    } catch {
      setCrosscheck(null);
    } finally {
      setLoadingCross(false);
    }
  }, [crossCache]);

  const loadDaily = async (dateStr: string) => {
    try {
      const data = await reportsApi.getDaily(dateStr);
      setSummaryCache((prev) => ({ ...prev, [dateStr]: data }));
    } catch {
      // ignore
    }
  };

  // 날짜 버튼 클릭: 이미 완료면 선택만, 아니면 백그라운드로 수집 시작
  const handleDatePress = (dateStr: string) => {
    const dateInfo = dates.find((d) => d.date === dateStr);

    // 선택 전환 (로딩 중이어도 다른 날짜 볼 수 있음)
    setSelectedDate(dateStr);

    if (dateInfo?.status === "summarized") {
      // 캐시에 없으면 로드
      if (!summaryCache[dateStr]) {
        loadDaily(dateStr);
      }
      return;
    }

    // 이미 로딩 중이면 선택만 전환
    if (loadingSet.has(dateStr)) return;

    // 백그라운드로 수집+요약 시작
    triggerDaily(dateStr);
  };

  const triggerDaily = async (dateStr: string) => {
    addLoading(dateStr);
    // 로딩 중 상태로 버튼 업데이트
    setDates((prev) =>
      prev.map((d) =>
        d.date === dateStr ? { ...d, status: "pending" as const } : d
      )
    );

    try {
      const result = await reportsApi.createDaily(dateStr);
      // 캐시에 저장
      setSummaryCache((prev) => ({ ...prev, [dateStr]: result }));
      // 날짜 상태 갱신
      setDates((prev) =>
        prev.map((d) =>
          d.date === dateStr
            ? { ...d, status: "summarized", report_count: result.report_count }
            : d
        )
      );
    } catch (e: any) {
      const msg = e?.response?.data?.detail || "요약 실패";
      // 현재 보고 있는 날짜면 알림
      Alert.alert("오류", `${dateStr}: ${msg}`);
      setDates((prev) =>
        prev.map((d) =>
          d.date === dateStr ? { ...d, status: "failed" } : d
        )
      );
    } finally {
      removeLoading(dateStr);
    }
  };

  const selectedInfo = dates.find((d) => d.date === selectedDate);
  const currentSummary = selectedDate ? summaryCache[selectedDate] : null;
  const isSelectedLoading = selectedDate ? loadingSet.has(selectedDate) : false;

  return (
    <ScrollView style={styles.container}>
      {/* 시장 대시보드 */}
      {market && <MarketDashboardBar data={market} />}

      {/* 추천 종목 */}
      {loadingPicks && (
        <View style={{ padding: 20, alignItems: "center" }}>
          <ActivityIndicator size="small" color="#3E6AE1" />
          <Text style={{ fontSize: 12, color: "#8E8E8E", marginTop: 4 }}>추천 종목 분석 중...</Text>
        </View>
      )}
      {!loadingPicks && picks && (
        <PicksSection picks={picks.picks} source={picks.source} />
      )}

      <Text style={styles.sectionHeader}>일일 리포트 브리핑</Text>

      {loadingDates ? (
        <ActivityIndicator style={{ marginVertical: 20 }} color="#3E6AE1" />
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.dateBar}
        >
          {dates.map((d) => {
            const isSelected = d.date === selectedDate;
            const isSummarized = d.status === "summarized";
            const isFailed = d.status === "failed";
            const isLoading = loadingSet.has(d.date);

            return (
              <Pressable
                key={d.date}
                style={[
                  styles.dateBtn,
                  isSelected && styles.dateBtnSelected,
                  isSummarized && !isSelected && styles.dateBtnDone,
                  isFailed && !isSelected && styles.dateBtnFailed,
                  isLoading && !isSelected && styles.dateBtnLoading,
                ]}
                onPress={() => handleDatePress(d.date)}
              >
                {isLoading ? (
                  <View style={styles.dateBtnInner}>
                    <ActivityIndicator
                      size="small"
                      color={isSelected ? "#fff" : "#3E6AE1"}
                    />
                    <Text
                      style={[
                        styles.dateBtnLabel,
                        { fontSize: 12, marginTop: 4 },
                        isSelected && styles.dateBtnTextSelected,
                      ]}
                    >
                      {d.label}
                    </Text>
                  </View>
                ) : (
                  <>
                    <Text
                      style={[
                        styles.dateBtnDay,
                        isSelected && styles.dateBtnTextSelected,
                      ]}
                    >
                      {d.weekday}
                    </Text>
                    <Text
                      style={[
                        styles.dateBtnLabel,
                        isSelected && styles.dateBtnTextSelected,
                      ]}
                    >
                      {d.label}
                    </Text>
                    {isSummarized && (
                      <Text
                        style={[
                          styles.dateBtnCount,
                          isSelected && styles.dateBtnTextSelected,
                        ]}
                      >
                        {d.report_count}건
                      </Text>
                    )}
                    {isFailed && !isSelected && (
                      <Text style={styles.dateBtnRetry}>재시도</Text>
                    )}
                  </>
                )}
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      {/* 로딩 중인 날짜가 있으면 상단에 표시 */}
      {loadingSet.size > 0 && (
        <View style={styles.bgLoadingBar}>
          <ActivityIndicator size="small" color="#3E6AE1" />
          <Text style={styles.bgLoadingText}>
            {Array.from(loadingSet)
              .map((d) => {
                const info = dates.find((x) => x.date === d);
                return info?.label || d;
              })
              .join(", ")}{" "}
            요약 중...
          </Text>
        </View>
      )}

      {/* 선택된 날짜가 로딩 중이고 캐시 없을 때 */}
      {isSelectedLoading && !currentSummary && (
        <View style={styles.loadingCard}>
          <ActivityIndicator size="large" color="#3E6AE1" />
          <Text style={styles.loadingText}>
            {selectedInfo?.label} 리포트 수집 + AI 요약 중...
          </Text>
          <Text style={styles.loadingHint}>
            다른 날짜 버튼을 눌러 동시에 수집하거나,{"\n"}완료된 날짜를 눌러
            먼저 볼 수 있어요
          </Text>
        </View>
      )}

      {/* 종합 요약 카드 */}
      {currentSummary && currentSummary.status === "summarized" && (
        <View style={styles.summaryCard}>
          <View style={styles.summaryHeader}>
            <Text style={styles.summaryTitle}>
              {selectedInfo?.label} ({selectedInfo?.weekday}) 시장 브리핑
            </Text>
            <Text style={styles.reportCount}>
              리포트 {currentSummary.report_count}건 종합
            </Text>
          </View>

          {currentSummary.summary && (
            <Text style={styles.summaryText}>{currentSummary.summary}</Text>
          )}

          {currentSummary.key_themes &&
            currentSummary.key_themes.length > 0 && (
              <View style={styles.themesSection}>
                <Text style={styles.subTitle}>핵심 테마</Text>
                <View style={styles.themes}>
                  {currentSummary.key_themes.map((theme, i) => (
                    <View key={i} style={styles.themeBadge}>
                      <Text style={styles.themeText}>#{theme}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

          {currentSummary.stocks_mentioned &&
            currentSummary.stocks_mentioned.length > 0 && (
              <View style={styles.stocksSection}>
                <Text style={styles.subTitle}>언급 종목</Text>
                {currentSummary.stocks_mentioned.map((stock, i) => (
                  <MentionedStockCard key={i} stock={stock} />
                ))}
              </View>
            )}

          {currentSummary.risk_warnings &&
            currentSummary.risk_warnings.length > 0 && (
              <View style={styles.riskSection}>
                <Text style={styles.subTitle}>리스크 요인</Text>
                {currentSummary.risk_warnings.map((warn, i) => (
                  <Text key={i} style={styles.riskText}>
                    ⚠ {warn}
                  </Text>
                ))}
              </View>
            )}
        </View>
      )}

      {/* 리포트 vs 수급 크로스체크 */}
      {loadingCross && (
        <View style={[styles.loadingCard, { padding: 24 }]}>
          <ActivityIndicator size="small" color="#f59e0b" />
          <Text style={[styles.loadingText, { color: "#f59e0b", fontSize: 13 }]}>
            크로스체크 분석 중...
          </Text>
        </View>
      )}
      {!loadingCross && crosscheck && crosscheck.crosschecks.length > 0 && (
        <>
          <Text style={[styles.sectionHeader, { marginTop: 24 }]}>
            리포트 vs 수급 크로스체크
          </Text>
          <View style={crossStyles.summaryRow}>
            <View style={[crossStyles.summaryBadge, { backgroundColor: "#dcfce7" }]}>
              <Text style={[crossStyles.summaryText, { color: "#16a34a" }]}>
                확인 {crosscheck.summary.confirmed}
              </Text>
            </View>
            <View style={[crossStyles.summaryBadge, { backgroundColor: "#fee2e2" }]}>
              <Text style={[crossStyles.summaryText, { color: "#dc2626" }]}>
                불일치 {crosscheck.summary.divergent}
              </Text>
            </View>
            <View style={[crossStyles.summaryBadge, { backgroundColor: "#F4F4F4" }]}>
              <Text style={[crossStyles.summaryText, { color: "#5C5E62" }]}>
                중립 {crosscheck.summary.neutral}
              </Text>
            </View>
          </View>
          {crosscheck.crosschecks.map((item, i) => (
            <CrosscheckCard key={`${item.code}-${i}`} item={item} />
          ))}
        </>
      )}

      {/* 투자자별 매매 동향 */}
      {loadingTrades && (
        <View style={styles.loadingCard}>
          <ActivityIndicator size="large" color="#2563eb" />
          <Text style={[styles.loadingText, { color: "#2563eb" }]}>
            투자자 매매 동향 불러오는 중...
          </Text>
        </View>
      )}
      {!loadingTrades && investorTrades && (
        <>
          <Text style={[styles.sectionHeader, { marginTop: 24 }]}>
            투자자별 매매 동향
          </Text>
          <View style={investorStyles.grid}>
            {["foreign", "institution", "individual"].map(
              (key) =>
                investorTrades[key] && (
                  <InvestorCard
                    key={key}
                    investorKey={key}
                    data={investorTrades[key]}
                  />
                )
            )}
          </View>
        </>
      )}

      {/* 아직 수집 안 된 날짜 선택 + 로딩도 아닌 경우 */}
      {!isSelectedLoading &&
        !currentSummary &&
        selectedDate &&
        selectedInfo?.status !== "summarized" && (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyIcon}>📄</Text>
            <Text style={styles.emptyText}>
              {selectedInfo?.label} 리포트가 아직 수집되지 않았습니다
            </Text>
            <Text style={styles.emptyHint}>
              날짜 버튼을 눌러 수집을 시작하세요
            </Text>
          </View>
        )}
    </ScrollView>
  );
}

const crossStyles = StyleSheet.create({
  summaryRow: {
    flexDirection: "row",
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 8,
  },
  summaryBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  summaryText: { fontSize: 13, fontWeight: "500" },
  card: {
    backgroundColor: "#fff",
    borderRadius: 4,
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 14,
    borderLeftWidth: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0,
    shadowRadius: 3,
    elevation: 1,
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  signalBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  signalIcon: { fontSize: 12, fontWeight: "500" },
  signalLabel: { fontSize: 11, fontWeight: "500" },
  stockName: { fontSize: 14, fontWeight: "500", color: "#171A20" },
  stockCode: { fontSize: 11, color: "#8E8E8E" },
  flowRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 6,
  },
  flowItem: { alignItems: "center" },
  flowLabel: { fontSize: 10, color: "#8E8E8E", marginBottom: 2 },
  flowValue: { fontSize: 12, fontWeight: "500" },
  flowArrow: { fontSize: 11, color: "#D0D1D2", fontWeight: "500" },
  flowNoData: { fontSize: 10, color: "#8E8E8E", marginLeft: 8, fontStyle: "italic" },
  note: { fontSize: 12, color: "#5C5E62", lineHeight: 17 },
  analystRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
    marginBottom: 4,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#F4F4F4",
  },
  analystItem: { alignItems: "center" },
  analystLabel: { fontSize: 10, color: "#8E8E8E", marginBottom: 2 },
  analystValue: { fontSize: 13, fontWeight: "500", color: "#171A20" },
  indicatorRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 6,
    marginBottom: 4,
  },
  indicatorChip: {
    fontSize: 10,
    color: "#5C5E62",
    backgroundColor: "#F4F4F4",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    fontWeight: "600",
    overflow: "hidden",
  },
});

const investorStyles = StyleSheet.create({
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 16,
    gap: 8,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 4,
    marginBottom: 4,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0,
    shadowRadius: 4,
    elevation: 2,
    width: "100%",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  label: { fontSize: 15, fontWeight: "500" },
  date: { fontSize: 11, color: "#8E8E8E" },
  tabRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#F4F4F4",
  },
  tab: { flex: 1, paddingVertical: 8, alignItems: "center" },
  tabBuy: { borderBottomWidth: 2, borderBottomColor: "#dc2626" },
  tabSell: { borderBottomWidth: 2, borderBottomColor: "#2563eb" },
  tabText: { fontSize: 13, color: "#8E8E8E", fontWeight: "500" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: "#F4F4F4",
  },
  rank: { width: 22, fontSize: 13, fontWeight: "500", color: "#8E8E8E", textAlign: "center" },
  name: { fontSize: 13, fontWeight: "600", color: "#171A20" },
  code: { fontSize: 10, color: "#8E8E8E" },
  amount: { fontSize: 13, fontWeight: "500" },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FFFFFF" },
  sectionHeader: {
    fontSize: 18,
    fontWeight: "500",
    color: "#171A20",
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 12,
  },
  dateBar: {
    paddingHorizontal: 12,
    gap: 8,
    paddingBottom: 4,
  },
  dateBtn: {
    width: 72,
    paddingVertical: 12,
    borderRadius: 4,
    backgroundColor: "#EEEEEE",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 72,
  },
  dateBtnSelected: { backgroundColor: "#3E6AE1" },
  dateBtnDone: { backgroundColor: "rgba(62,106,225,0.3)" },
  dateBtnFailed: { backgroundColor: "rgba(220,38,38,0.2)" },
  dateBtnLoading: { backgroundColor: "rgba(62,106,225,0.08)", borderWidth: 2, borderColor: "#3E6AE1" },
  dateBtnInner: { alignItems: "center" },
  dateBtnDay: { fontSize: 11, color: "#5C5E62", fontWeight: "500" },
  dateBtnLabel: {
    fontSize: 16,
    fontWeight: "500",
    color: "#393C41",
    marginTop: 2,
  },
  dateBtnTextSelected: { color: "#fff" },
  dateBtnCount: { fontSize: 10, color: "#3E6AE1", marginTop: 2 },
  dateBtnRetry: {
    fontSize: 10,
    color: "#dc2626",
    marginTop: 2,
    fontWeight: "600",
  },
  bgLoadingBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 16,
    marginTop: 8,
    backgroundColor: "rgba(62,106,225,0.08)",
    padding: 10,
    borderRadius: 8,
  },
  bgLoadingText: { fontSize: 12, color: "#3E6AE1", fontWeight: "500" },
  loadingCard: {
    margin: 16,
    padding: 40,
    backgroundColor: "#fff",
    borderRadius: 4,
    alignItems: "center",
  },
  loadingText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#3E6AE1",
    marginTop: 16,
  },
  loadingHint: {
    fontSize: 12,
    color: "#8E8E8E",
    marginTop: 4,
    textAlign: "center",
    lineHeight: 18,
  },
  summaryCard: {
    margin: 16,
    backgroundColor: "#fff",
    borderRadius: 4,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0,
    shadowRadius: 8,
    elevation: 3,
  },
  summaryHeader: { marginBottom: 12 },
  summaryTitle: { fontSize: 18, fontWeight: "500", color: "#171A20" },
  reportCount: {
    fontSize: 12,
    color: "#3E6AE1",
    marginTop: 2,
    fontWeight: "500",
  },
  summaryText: {
    fontSize: 14,
    color: "#393C41",
    lineHeight: 22,
    marginBottom: 16,
  },
  subTitle: {
    fontSize: 14,
    fontWeight: "500",
    color: "#5C5E62",
    marginBottom: 8,
  },
  themesSection: { marginBottom: 16 },
  themes: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  themeBadge: {
    backgroundColor: "rgba(62,106,225,0.06)",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 4,
  },
  themeText: { fontSize: 12, color: "#3E6AE1", fontWeight: "500" },
  stocksSection: { marginBottom: 16 },
  stockRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginVertical: 4,
  },
  stockReason: { fontSize: 13, color: "#5C5E62", flex: 1 },
  riskSection: { marginTop: 4 },
  riskText: {
    fontSize: 13,
    color: "#dc2626",
    marginVertical: 2,
    lineHeight: 19,
  },
  emptyCard: {
    margin: 16,
    padding: 32,
    backgroundColor: "#fff",
    borderRadius: 4,
    alignItems: "center",
  },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#393C41",
    textAlign: "center",
  },
  emptyHint: {
    fontSize: 13,
    color: "#8E8E8E",
    marginTop: 4,
    textAlign: "center",
  },
});
