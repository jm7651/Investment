import { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Pressable,
  Alert,
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Video, videosApi } from "../../lib/api";
import StockBadge from "../../components/StockBadge";

export default function VideoDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [video, setVideo] = useState<Video | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) {
      videosApi
        .get(Number(id))
        .then(setVideo)
        .finally(() => setLoading(false));
    }
  }, [id]);

  const handleResummarize = async () => {
    if (!video) return;
    try {
      setLoading(true);
      const updated = await videosApi.summarize(video.id);
      setVideo(updated);
    } catch {
      Alert.alert("오류", "재요약에 실패했습니다");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  if (!video) {
    return (
      <View style={styles.center}>
        <Text>영상을 찾을 수 없습니다</Text>
      </View>
    );
  }

  const date = new Date(video.published_at).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{video.title}</Text>
      <Text style={styles.date}>{date}</Text>

      <View style={styles.statusRow}>
        <View
          style={[
            styles.statusBadge,
            {
              backgroundColor:
                video.status === "summarized"
                  ? "#dcfce7"
                  : video.status === "failed"
                  ? "#fee2e2"
                  : "#fef3c7",
            },
          ]}
        >
          <Text
            style={[
              styles.statusText,
              {
                color:
                  video.status === "summarized"
                    ? "#16a34a"
                    : video.status === "failed"
                    ? "#dc2626"
                    : "#d97706",
              },
            ]}
          >
            {video.status === "summarized"
              ? "요약 완료"
              : video.status === "failed"
              ? "요약 실패"
              : "대기중"}
          </Text>
        </View>

        {video.status === "failed" && (
          <Pressable style={styles.retryBtn} onPress={handleResummarize}>
            <Text style={styles.retryBtnText}>재시도</Text>
          </Pressable>
        )}
      </View>

      {video.summary && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>AI 요약</Text>
          <Text style={styles.summaryText}>{video.summary}</Text>
        </View>
      )}

      {video.stocks_mentioned && video.stocks_mentioned.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>언급 종목</Text>
          {video.stocks_mentioned.map((stock, i) => (
            <View key={i} style={styles.stockRow}>
              <StockBadge stock={stock} />
              <Text style={styles.stockReason}>{stock.reason}</Text>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8fafc" },
  content: { padding: 20 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  title: { fontSize: 20, fontWeight: "700", color: "#0f172a", lineHeight: 28 },
  date: { fontSize: 13, color: "#94a3b8", marginTop: 6 },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  statusText: { fontSize: 12, fontWeight: "600" },
  retryBtn: {
    backgroundColor: "#2563eb",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 6,
  },
  retryBtnText: { color: "#fff", fontSize: 12, fontWeight: "600" },
  section: {
    marginTop: 24,
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1e293b",
    marginBottom: 10,
  },
  summaryText: { fontSize: 14, color: "#334155", lineHeight: 22 },
  stockRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginVertical: 4,
  },
  stockReason: { fontSize: 13, color: "#475569", flex: 1 },
});
