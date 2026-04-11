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
import { Report, reportsApi } from "../../lib/api";
import StockBadge from "../../components/StockBadge";

export default function ReportDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [summarizing, setSummarizing] = useState(false);

  useEffect(() => {
    if (id) {
      reportsApi
        .get(Number(id))
        .then(setReport)
        .finally(() => setLoading(false));
    }
  }, [id]);

  const handleSummarize = async () => {
    if (!report) return;
    setSummarizing(true);
    try {
      const updated = await reportsApi.summarize(report.id);
      setReport(updated);
    } catch {
      Alert.alert("오류", "요약에 실패했습니다");
    } finally {
      setSummarizing(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#7c3aed" />
      </View>
    );
  }

  if (!report) {
    return (
      <View style={styles.center}>
        <Text>리포트를 찾을 수 없습니다</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.brokerRow}>
        <Text style={styles.broker}>{report.broker}</Text>
        <Text style={styles.date}>{report.published_date}</Text>
      </View>

      <Text style={styles.title}>{report.title}</Text>

      <View style={styles.statusRow}>
        <View
          style={[
            styles.statusBadge,
            {
              backgroundColor:
                report.status === "summarized"
                  ? "#dcfce7"
                  : report.status === "failed"
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
                  report.status === "summarized"
                    ? "#16a34a"
                    : report.status === "failed"
                    ? "#dc2626"
                    : "#d97706",
              },
            ]}
          >
            {report.status === "summarized"
              ? "요약 완료"
              : report.status === "failed"
              ? "요약 실패"
              : "대기중"}
          </Text>
        </View>

        {(report.status === "failed" || report.status === "pending") && (
          <Pressable
            style={styles.retryBtn}
            onPress={handleSummarize}
            disabled={summarizing}
          >
            {summarizing ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.retryBtnText}>
                {report.status === "failed" ? "재시도" : "요약하기"}
              </Text>
            )}
          </Pressable>
        )}
      </View>

      {report.summary && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>AI 요약</Text>
          <Text style={styles.summaryText}>{report.summary}</Text>
        </View>
      )}

      {report.stocks_mentioned && report.stocks_mentioned.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>언급 종목</Text>
          {report.stocks_mentioned.map((stock, i) => (
            <View key={i} style={styles.stockRow}>
              <StockBadge stock={stock} />
              <Text style={styles.stockReason}>{stock.reason}</Text>
            </View>
          ))}
        </View>
      )}

      {report.key_themes && report.key_themes.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>핵심 테마</Text>
          <View style={styles.themes}>
            {report.key_themes.map((theme, i) => (
              <View key={i} style={styles.themeBadge}>
                <Text style={styles.themeText}>#{theme}</Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8fafc" },
  content: { padding: 20 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  brokerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  broker: {
    fontSize: 13,
    fontWeight: "600",
    color: "#7c3aed",
    backgroundColor: "#f3e8ff",
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 6,
    overflow: "hidden",
  },
  date: { fontSize: 13, color: "#94a3b8" },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: "#0f172a",
    lineHeight: 28,
    marginTop: 10,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 12,
  },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  statusText: { fontSize: 12, fontWeight: "600" },
  retryBtn: {
    backgroundColor: "#7c3aed",
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
  themes: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  themeBadge: {
    backgroundColor: "#f1f5f9",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
  },
  themeText: { fontSize: 13, color: "#475569" },
});
