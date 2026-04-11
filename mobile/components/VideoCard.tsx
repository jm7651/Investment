import { View, Text, Image, StyleSheet, Pressable, Platform } from "react-native";
import { useRouter } from "expo-router";
import { Video } from "../lib/api";
import StockBadge from "./StockBadge";

function getThumbnail(youtubeId: string) {
  return `https://img.youtube.com/vi/${youtubeId}/mqdefault.jpg`;
}

export default function VideoCard({ video }: { video: Video }) {
  const router = useRouter();

  return (
    <Pressable
      style={styles.card}
      onPress={() => router.push(`/video/${video.id}`)}
    >
      <Image
        source={{ uri: getThumbnail(video.youtube_id) }}
        style={styles.thumbnail}
        resizeMode="cover"
      />
      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={2}>
          {video.title}
        </Text>
        {video.status === "summarized" && video.summary && (
          <Text style={styles.summary} numberOfLines={3}>
            {video.summary}
          </Text>
        )}
        {video.stocks_mentioned && video.stocks_mentioned.length > 0 && (
          <View style={styles.stocks}>
            {video.stocks_mentioned.slice(0, 4).map((stock, i) => (
              <StockBadge key={i} stock={stock} />
            ))}
          </View>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 4,
    overflow: "hidden",
    ...(Platform.OS === "web"
      ? { minWidth: 200, maxWidth: "19%", flexGrow: 1, flexBasis: "18%" }
      : { minWidth: "100%" as any }),
  },
  thumbnail: {
    width: "100%",
    aspectRatio: 16 / 9,
    backgroundColor: "#F4F4F4",
  },
  body: {
    padding: 12,
  },
  title: {
    fontSize: 14,
    fontWeight: "500",
    color: "#171A20",
    lineHeight: 20,
  },
  summary: {
    fontSize: 12,
    color: "#393C41",
    marginTop: 6,
    lineHeight: 17,
  },
  stocks: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    marginTop: 8,
  },
});
