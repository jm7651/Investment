import { View, Text, StyleSheet } from "react-native";
import { StockItem } from "../lib/api";

const SENTIMENT = {
  bullish: { bg: "rgba(22,163,74,0.08)", text: "#16a34a", icon: "▲" },
  bearish: { bg: "rgba(220,38,38,0.08)", text: "#dc2626", icon: "▼" },
  neutral: { bg: "#F4F4F4", text: "#5C5E62", icon: "−" },
};

interface Props {
  stock: StockItem;
}

export default function StockBadge({ stock }: Props) {
  const s = SENTIMENT[stock.sentiment] || SENTIMENT.neutral;

  return (
    <View style={[styles.badge, { backgroundColor: s.bg }]}>
      <Text style={[styles.text, { color: s.text }]}>
        {s.icon} {stock.name}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  text: {
    fontSize: 11,
    fontWeight: "500",
  },
});
