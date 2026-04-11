import { useEffect, useState } from "react";
import {
  View,
  FlatList,
  Text,
  StyleSheet,
  RefreshControl,
} from "react-native";
import { stocksApi, StockAggregate } from "../../lib/api";

const SENTIMENT_LABEL: Record<string, { color: string; label: string }> = {
  bullish: { color: "#16a34a", label: "매수" },
  bearish: { color: "#dc2626", label: "매도" },
  neutral: { color: "#64748b", label: "중립" },
};

export default function StocksScreen() {
  const [stocks, setStocks] = useState<StockAggregate[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchStocks = async () => {
    setLoading(true);
    try {
      const data = await stocksApi.list();
      setStocks(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStocks();
  }, []);

  return (
    <View style={styles.container}>
      <FlatList
        data={stocks}
        keyExtractor={(item) => item.name}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={fetchStocks} />
        }
        renderItem={({ item, index }) => {
          const s = SENTIMENT_LABEL[item.latest_sentiment] || SENTIMENT_LABEL.neutral;
          return (
            <View style={styles.row}>
              <Text style={styles.rank}>{index + 1}</Text>
              <View style={styles.info}>
                <Text style={styles.name}>
                  {item.name}
                  {item.code && (
                    <Text style={styles.code}> ({item.code})</Text>
                  )}
                </Text>
                <Text style={styles.market}>{item.market || "미분류"}</Text>
              </View>
              <View style={styles.right}>
                <Text style={styles.count}>{item.mention_count}회 언급</Text>
                <Text style={[styles.sentiment, { color: s.color }]}>
                  {s.label}
                </Text>
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>📊</Text>
            <Text style={styles.emptyText}>추출된 종목이 없습니다</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FFFFFF" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    marginHorizontal: 16,
    marginVertical: 4,
    backgroundColor: "#fff",
    borderRadius: 10,
  },
  rank: {
    fontSize: 18,
    fontWeight: "500",
    color: "#3E6AE1",
    width: 32,
    textAlign: "center",
  },
  info: { flex: 1, marginLeft: 8 },
  name: { fontSize: 15, fontWeight: "500", color: "#171A20" },
  code: { fontSize: 12, fontWeight: "400", color: "#8E8E8E" },
  market: { fontSize: 12, color: "#8E8E8E", marginTop: 2 },
  right: { alignItems: "flex-end" },
  count: { fontSize: 13, color: "#5C5E62", fontWeight: "500" },
  sentiment: { fontSize: 12, fontWeight: "500", marginTop: 2 },
  empty: { flex: 1, justifyContent: "center", alignItems: "center", padding: 32 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 14, color: "#8E8E8E" },
});
