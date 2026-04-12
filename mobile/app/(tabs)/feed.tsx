import { useState, useCallback, useEffect } from "react";
import {
  View,
  ScrollView,
  Text,
  Image,
  StyleSheet,
  Pressable,
  RefreshControl,
  Platform,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import {
  Channel,
  WeeklyGroup,
  WeeklyStockSummary,
  WeeklyVideoItem,
  videosApi,
  channelsApi,
} from "../../lib/api";
import StockBadge from "../../components/StockBadge";

const SENTIMENT_COLORS: Record<string, { bg: string; text: string }> = {
  bullish: { bg: "#dcfce7", text: "#16a34a" },
  bearish: { bg: "#fee2e2", text: "#dc2626" },
  neutral: { bg: "#F4F4F4", text: "#5C5E62" },
};

function StockSummaryBar({ stocks }: { stocks: WeeklyStockSummary[] }) {
  if (!stocks.length) return null;
  return (
    <View style={styles.stockBar}>
      {stocks.map((s, i) => {
        const c = SENTIMENT_COLORS[s.sentiment] || SENTIMENT_COLORS.neutral;
        return (
          <View key={i} style={[styles.stockChip, { backgroundColor: c.bg }]}>
            <Text style={[styles.stockChipText, { color: c.text }]}>
              {s.name}
            </Text>
            <View style={styles.stockChipCount}>
              <Text style={styles.stockChipCountText}>{s.count}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

function MiniVideoCard({ video }: { video: WeeklyVideoItem }) {
  const router = useRouter();
  const thumb = `https://img.youtube.com/vi/${video.youtube_id}/mqdefault.jpg`;

  return (
    <Pressable
      style={styles.miniCard}
      onPress={() => router.push(`/video/${video.id}`)}
    >
      <Image source={{ uri: thumb }} style={styles.miniThumb} resizeMode="cover" />
      <View style={styles.miniBody}>
        <Text style={styles.miniTitle} numberOfLines={2}>
          {video.title}
        </Text>
        {video.summary && (
          <Text style={styles.miniSummary} numberOfLines={2}>
            {video.summary}
          </Text>
        )}
        {video.stocks_mentioned && video.stocks_mentioned.length > 0 && (
          <View style={styles.miniStocks}>
            {video.stocks_mentioned.slice(0, 3).map((s, i) => (
              <StockBadge key={i} stock={s} />
            ))}
          </View>
        )}
      </View>
    </Pressable>
  );
}

function WeekCard({
  week,
  defaultOpen,
}: {
  week: WeeklyGroup;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <View style={styles.weekCard}>
      <Pressable style={styles.weekHeader} onPress={() => setOpen(!open)}>
        <View>
          <Text style={styles.weekLabel}>{week.label}</Text>
          <Text style={styles.weekCount}>영상 {week.videos.length}개 요약</Text>
        </View>
        <Text style={styles.weekChevron}>{open ? "▲" : "▼"}</Text>
      </Pressable>

      <StockSummaryBar stocks={week.stock_summary} />

      {open && (
        <View style={styles.weekVideos}>
          {week.videos.map((v) => (
            <MiniVideoCard key={v.id} video={v} />
          ))}
        </View>
      )}
    </View>
  );
}

export default function FeedScreen() {
  const [weeks, setWeeks] = useState<WeeklyGroup[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterChannelId, setFilterChannelId] = useState<number | null>(null);

  const fetchFeed = useCallback(async () => {
    setLoading(true);
    try {
      const data = await videosApi.weeklyFeed(filterChannelId || undefined);
      setWeeks(data);
    } finally {
      setLoading(false);
    }
  }, [filterChannelId]);

  useFocusEffect(
    useCallback(() => {
      fetchFeed();
      channelsApi.list().then(setChannels).catch(() => {});
    }, [filterChannelId])
  );

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={loading} onRefresh={fetchFeed} />
      }
    >
      {/* 필터 바 */}
      {channels.length > 0 && (
        <View style={styles.filterBar}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterScroll}
          >
            <Pressable
              style={[
                styles.filterChip,
                !filterChannelId && styles.filterChipActive,
              ]}
              onPress={() => setFilterChannelId(null)}
            >
              <Text
                style={[
                  styles.filterText,
                  !filterChannelId && styles.filterTextActive,
                ]}
              >
                전체
              </Text>
            </Pressable>
            {channels.map((ch) => (
              <Pressable
                key={ch.id}
                style={[
                  styles.filterChip,
                  filterChannelId === ch.id && styles.filterChipActive,
                ]}
                onPress={() =>
                  setFilterChannelId(
                    filterChannelId === ch.id ? null : ch.id
                  )
                }
              >
                <Text
                  style={[
                    styles.filterText,
                    filterChannelId === ch.id && styles.filterTextActive,
                  ]}
                >
                  {ch.name}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}

      {/* 주간 카드 */}
      {weeks.length > 0 ? (
        <View style={{ paddingBottom: 20 }}>
          {weeks.map((w, i) => (
            <WeekCard key={w.week_key} week={w} defaultOpen={i === 0} />
          ))}
        </View>
      ) : (
        <View style={styles.center}>
          <Text style={styles.emptyIcon}>📭</Text>
          <Text style={styles.emptyText}>요약된 영상이 없어요</Text>
          <Text style={styles.emptyHint}>
            채널 탭에서 영상을 수집하고 요약해보세요
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FFFFFF" },
  // 필터
  filterBar: {
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#F4F4F4",
    paddingVertical: 8,
  },
  filterScroll: { paddingHorizontal: 12, gap: 6 },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 4,
    backgroundColor: "#F4F4F4",
  },
  filterChipActive: { backgroundColor: "#3E6AE1" },
  filterText: { fontSize: 13, fontWeight: "500", color: "#5C5E62" },
  filterTextActive: { color: "#fff", fontWeight: "500" },
  // 주간 카드
  weekCard: {
    backgroundColor: "#fff",
    borderRadius: 4,
    marginHorizontal: 16,
    marginTop: 12,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  weekHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 14,
  },
  weekLabel: { fontSize: 16, fontWeight: "500", color: "#171A20" },
  weekCount: { fontSize: 12, color: "#8E8E8E", marginTop: 2 },
  weekChevron: { fontSize: 12, color: "#8E8E8E" },
  // 종목 집계 바
  stockBar: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    paddingHorizontal: 14,
    paddingBottom: 10,
  },
  stockChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  stockChipText: { fontSize: 12, fontWeight: "600" },
  stockChipCount: {
    backgroundColor: "rgba(0,0,0,0.1)",
    borderRadius: 8,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  stockChipCountText: { fontSize: 10, fontWeight: "500", color: "#393C41" },
  // 영상 그리드
  weekVideos: {
    ...(Platform.OS === "web"
      ? { flexDirection: "row" as const, flexWrap: "wrap" as const }
      : { flexDirection: "column" as const }),
    gap: 8,
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: "#F4F4F4",
  },
  miniCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 4,
    overflow: "hidden",
    ...(Platform.OS === "web"
      ? { minWidth: 200, maxWidth: "19%", flexGrow: 1, flexBasis: "18%" }
      : { minWidth: "100%" as any }),
  },
  miniThumb: {
    width: "100%",
    aspectRatio: 16 / 9,
    backgroundColor: "#e2e8f0",
  },
  miniBody: { padding: 8 },
  miniTitle: {
    fontSize: 12,
    fontWeight: "600",
    color: "#1e293b",
    lineHeight: 17,
  },
  miniSummary: {
    fontSize: 11,
    color: "#5C5E62",
    marginTop: 4,
    lineHeight: 15,
  },
  miniStocks: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 3,
    marginTop: 6,
  },
  // empty
  center: {
    justifyContent: "center",
    alignItems: "center",
    padding: 60,
  },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 16, fontWeight: "600", color: "#393C41" },
  emptyHint: {
    fontSize: 13,
    color: "#8E8E8E",
    marginTop: 4,
    textAlign: "center",
  },
});
