import { useEffect, useState } from "react";
import {
  View,
  ScrollView,
  Text,
  TextInput,
  Image,
  StyleSheet,
  Pressable,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Platform,
} from "react-native";
import { Channel, Video, channelsApi, videosApi } from "../../lib/api";
import StockBadge from "../../components/StockBadge";

function SkeletonCards({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={styles.skeletonItem}>
          <View style={styles.skeletonTitle} />
          <View style={styles.skeletonBtn} />
        </View>
      ))}
    </>
  );
}

function VideoItem({
  video,
  onSummarize,
}: {
  video: Video;
  onSummarize: (id: number) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const handleSummarize = async () => {
    setLoading(true);
    try {
      await onSummarize(video.id);
    } finally {
      setLoading(false);
    }
  };

  const thumbUrl = `https://img.youtube.com/vi/${video.youtube_id}/mqdefault.jpg`;

  return (
    <View style={styles.videoItem}>
      <Pressable
        onPress={() => video.status === "summarized" && setExpanded(!expanded)}
      >
        <View style={styles.videoHeader}>
          <Image source={{ uri: thumbUrl }} style={styles.videoThumb} />
          <View style={styles.videoTitleWrap}>
            <Text
              style={styles.videoTitle}
              numberOfLines={expanded ? undefined : 2}
            >
              {video.title}
            </Text>
            {video.status === "summarized" && (
              <Text style={styles.expandIcon}>{expanded ? "▲" : "▼"}</Text>
            )}
          </View>
        </View>
      </Pressable>

      {video.status === "pending" && (
        <Pressable
          style={[styles.summarizeBtn, loading && { opacity: 0.6 }]}
          onPress={handleSummarize}
          disabled={loading}
        >
          {loading ? (
            <View style={styles.summarizingRow}>
              <ActivityIndicator size="small" color="#3E6AE1" />
              <Text style={styles.summarizeBtnText}>
                자막 추출 + 요약 중...
              </Text>
            </View>
          ) : (
            <Text style={styles.summarizeBtnText}>요약하기</Text>
          )}
        </Pressable>
      )}

      {video.status === "failed" && (
        <Pressable
          style={[styles.retryBtn, loading && { opacity: 0.6 }]}
          onPress={handleSummarize}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#dc2626" />
          ) : (
            <Text style={styles.retryBtnText}>재시도</Text>
          )}
        </Pressable>
      )}

      {video.status === "summarized" && !expanded && (
        <Text style={styles.summarizedBadge}>요약 완료 (눌러서 보기)</Text>
      )}

      {video.status === "summarized" && expanded && (
        <View style={styles.summarySection}>
          {video.summary && (
            <Text style={styles.summaryText}>{video.summary}</Text>
          )}
          {video.stocks_mentioned && video.stocks_mentioned.length > 0 && (
            <View style={styles.stocksRow}>
              {video.stocks_mentioned.map((stock, i) => (
                <View key={i} style={styles.stockItem}>
                  <StockBadge stock={stock} />
                  <Text style={styles.stockReason}>{stock.reason}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      )}
    </View>
  );
}

function ChannelCard({
  channel,
  onDelete,
}: {
  channel: Channel;
  onDelete: (id: number) => void;
}) {
  const [videos, setVideos] = useState<Video[]>([]);
  const [fetching, setFetching] = useState(false);
  const [fetchingMore, setFetchingMore] = useState(false);
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [totalFetched, setTotalFetched] = useState(10);

  const summarizedCount = videos.filter((v) => v.status === "summarized").length;

  // 어코디언 열 때 DB에서 기존 영상 로드
  const toggleOpen = async () => {
    if (!open && !loaded) {
      // 첫 열기: DB에서 기존 영상 로드
      try {
        const existing = await videosApi.list({ channel_id: channel.id });
        if (existing.length > 0) {
          setVideos(existing);
          setTotalFetched(existing.length);
        }
        setLoaded(true);
      } catch {
        setLoaded(true);
      }
    }
    setOpen(!open);
  };

  const handleFetch = async () => {
    setFetching(true);
    try {
      const result = await videosApi.fetch(channel.id, 10);
      if (Array.isArray(result)) {
        setVideos(result);
        setTotalFetched(10);
        setLoaded(true);
      }
    } catch (e: any) {
      Alert.alert("오류", e?.response?.data?.detail || "영상 수집 실패");
    } finally {
      setFetching(false);
    }
  };

  const handleFetchMore = async () => {
    setFetchingMore(true);
    const nextCount = totalFetched + 10;
    try {
      const result = await videosApi.fetch(channel.id, nextCount);
      if (Array.isArray(result)) {
        setVideos(result);
        setTotalFetched(nextCount);
      }
    } catch {
      Alert.alert("오류", "추가 수집 실패");
    } finally {
      setFetchingMore(false);
    }
  };

  const handleSummarize = async (videoId: number) => {
    try {
      const updated = await videosApi.summarize(videoId);
      setVideos((prev) =>
        prev.map((v) => (v.id === videoId ? updated : v))
      );
    } catch (e: any) {
      Alert.alert("오류", e?.response?.data?.detail || "요약 실패");
    }
  };

  const handleDelete = () => {
    Alert.alert("채널 삭제", `${channel.name}을(를) 삭제할까요?`, [
      { text: "취소", style: "cancel" },
      {
        text: "삭제",
        style: "destructive",
        onPress: () => onDelete(channel.id),
      },
    ]);
  };

  return (
    <View style={styles.channelCard}>
      {/* 어코디언 헤더 */}
      <Pressable style={styles.channelHeader} onPress={toggleOpen}>
        <View style={styles.channelInfo}>
          <View style={styles.channelNameRow}>
            <Text style={styles.channelName}>{channel.name}</Text>
            {summarizedCount > 0 && (
              <View style={styles.countBadge}>
                <Text style={styles.countBadgeText}>{summarizedCount}</Text>
              </View>
            )}
          </View>
          <Text style={styles.channelId}>{channel.youtube_id}</Text>
        </View>
        <View style={styles.channelActions}>
          <Pressable
            style={[styles.fetchBtn, fetching && { opacity: 0.6 }]}
            onPress={(e) => {
              e.stopPropagation?.();
              handleFetch();
              if (!open) setOpen(true);
            }}
            disabled={fetching}
          >
            {fetching ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.fetchBtnText}>
                {videos.length > 0 ? "새로고침" : "영상 수집"}
              </Text>
            )}
          </Pressable>
          <Pressable
            style={styles.deleteBtn}
            onPress={(e) => {
              e.stopPropagation?.();
              handleDelete();
            }}
          >
            <Text style={styles.deleteBtnText}>삭제</Text>
          </Pressable>
          <Text style={styles.chevron}>{open ? "▲" : "▼"}</Text>
        </View>
      </Pressable>

      {/* 어코디언 본문 */}
      {open && (
        <View style={styles.videoList}>
          {fetching ? (
            <>
              <Text style={styles.videoListTitle}>영상 수집 중...</Text>
              <View style={styles.videoGrid}>
                <SkeletonCards count={10} />
              </View>
            </>
          ) : videos.length > 0 ? (
            <>
              <Text style={styles.videoListTitle}>
                영상 {videos.length}개
                {summarizedCount > 0 &&
                  ` (요약 ${summarizedCount}개)`}
              </Text>
              <View style={styles.videoGrid}>
                {videos.map((v) => (
                  <VideoItem
                    key={v.id}
                    video={v}
                    onSummarize={handleSummarize}
                  />
                ))}
              </View>
              <Pressable
                style={[
                  styles.moreBtn,
                  fetchingMore && { opacity: 0.6 },
                ]}
                onPress={handleFetchMore}
                disabled={fetchingMore}
              >
                {fetchingMore ? (
                  <View style={styles.summarizingRow}>
                    <ActivityIndicator size="small" color="#3E6AE1" />
                    <Text style={styles.moreBtnText}>수집 중...</Text>
                  </View>
                ) : (
                  <Text style={styles.moreBtnText}>10개 더 수집하기</Text>
                )}
              </Pressable>
            </>
          ) : (
            <View style={styles.emptyVideos}>
              <Text style={styles.noVideos}>
                아직 수집된 영상이 없습니다
              </Text>
              <Pressable style={styles.fetchFirstBtn} onPress={handleFetch}>
                <Text style={styles.fetchFirstBtnText}>영상 수집하기</Text>
              </Pressable>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

export default function ChannelsScreen() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(false);
  const [youtubeId, setYoutubeId] = useState("");
  const [name, setName] = useState("");

  const fetchChannels = async () => {
    setLoading(true);
    try {
      const data = await channelsApi.list();
      setChannels(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchChannels();
  }, []);

  const handleAdd = async () => {
    if (!youtubeId.trim() || !name.trim()) {
      Alert.alert("입력 오류", "채널 URL/ID와 이름을 모두 입력하세요");
      return;
    }
    try {
      const ch = await channelsApi.add({
        youtube_id: youtubeId.trim(),
        name: name.trim(),
      });
      setChannels((prev) => [...prev, ch]);
      setYoutubeId("");
      setName("");
    } catch (e: any) {
      Alert.alert("오류", e?.response?.data?.detail || "채널 추가 실패");
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await channelsApi.delete(id);
      setChannels((prev) => prev.filter((c) => c.id !== id));
    } catch {
      Alert.alert("오류", "삭제 실패");
    }
  };

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={loading} onRefresh={fetchChannels} />
      }
    >
      <View style={styles.form}>
        <TextInput
          style={styles.input}
          placeholder="URL, @핸들, 또는 채널ID"
          value={youtubeId}
          onChangeText={setYoutubeId}
          autoCapitalize="none"
        />
        <TextInput
          style={styles.input}
          placeholder="채널 이름"
          value={name}
          onChangeText={setName}
        />
        <Pressable style={styles.addBtn} onPress={handleAdd}>
          <Text style={styles.addBtnText}>채널 추가</Text>
        </Pressable>
      </View>

      {channels.length > 0 ? (
        <View style={styles.grid}>
          {channels.map((item) => (
            <ChannelCard key={item.id} channel={item} onDelete={handleDelete} />
          ))}
        </View>
      ) : (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>등록된 채널이 없습니다</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FFFFFF" },
  form: {
    padding: 16,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#EEEEEE",
    backgroundColor: "#fff",
  },
  input: {
    borderWidth: 1,
    borderColor: "#D0D1D2",
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    backgroundColor: "#FFFFFF",
  },
  addBtn: {
    backgroundColor: "#3E6AE1",
    borderRadius: 8,
    padding: 12,
    alignItems: "center",
  },
  addBtnText: { color: "#fff", fontWeight: "600", fontSize: 14 },
  grid: {
    paddingBottom: 20,
  },
  channelCard: {
    backgroundColor: "#fff",
    borderRadius: 4,
    marginHorizontal: 16,
    marginTop: 10,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0,
    shadowRadius: 4,
    elevation: 2,
  },
  channelHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 14,
  },
  channelInfo: { flex: 1 },
  channelNameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  channelName: { fontSize: 15, fontWeight: "500", color: "#171A20" },
  countBadge: {
    backgroundColor: "#393C41",
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  countBadgeText: { color: "#fff", fontSize: 10, fontWeight: "500" },
  channelId: { fontSize: 11, color: "#8E8E8E", marginTop: 2 },
  channelActions: { flexDirection: "row", alignItems: "center", gap: 6 },
  fetchBtn: {
    backgroundColor: "#393C41",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 6,
  },
  fetchBtnText: { color: "#fff", fontSize: 12, fontWeight: "600" },
  deleteBtn: {
    backgroundColor: "#fee2e2",
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 6,
  },
  deleteBtnText: { color: "#dc2626", fontSize: 12, fontWeight: "600" },
  chevron: { fontSize: 12, color: "#8E8E8E", marginLeft: 4 },
  videoList: {
    borderTopWidth: 1,
    borderTopColor: "#F4F4F4",
    padding: 12,
  },
  videoListTitle: {
    fontSize: 12,
    fontWeight: "600",
    color: "#5C5E62",
    marginBottom: 8,
  },
  skeletonItem: {
    backgroundColor: "#F4F4F4",
    borderRadius: 8,
    padding: 12,
    ...(Platform.OS === "web"
      ? { minWidth: 280, flexGrow: 1, flexBasis: "30%" }
      : { minWidth: "100%" as any }),
  },
  skeletonTitle: {
    backgroundColor: "#EEEEEE",
    borderRadius: 4,
    height: 14,
    width: "80%",
    marginBottom: 8,
  },
  skeletonBtn: {
    backgroundColor: "#EEEEEE",
    borderRadius: 6,
    height: 32,
    width: 80,
  },
  videoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  videoItem: {
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    padding: 10,
    ...(Platform.OS === "web"
      ? { minWidth: 280, flexGrow: 1, flexBasis: "30%" }
      : { minWidth: "100%" as any }),
  },
  videoHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  videoThumb: {
    width: 80,
    height: 45,
    borderRadius: 4,
    backgroundColor: "#EEEEEE",
  },
  videoTitleWrap: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  videoTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#171A20",
    flex: 1,
    lineHeight: 19,
  },
  expandIcon: {
    fontSize: 10,
    color: "#8E8E8E",
    marginLeft: 8,
    marginTop: 2,
  },
  summarizeBtn: {
    backgroundColor: "rgba(62,106,225,0.08)",
    padding: 8,
    borderRadius: 6,
    alignItems: "center",
    marginTop: 8,
  },
  summarizeBtnText: { color: "#3E6AE1", fontWeight: "600", fontSize: 12 },
  summarizingRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  retryBtn: {
    backgroundColor: "#fee2e2",
    padding: 8,
    borderRadius: 6,
    alignItems: "center",
    marginTop: 8,
  },
  retryBtnText: { color: "#dc2626", fontWeight: "600", fontSize: 12 },
  summarizedBadge: {
    fontSize: 11,
    color: "#393C41",
    marginTop: 6,
    fontWeight: "500",
  },
  summarySection: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#EEEEEE",
  },
  summaryText: { fontSize: 13, color: "#393C41", lineHeight: 20 },
  stocksRow: { marginTop: 8, gap: 6 },
  stockItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginVertical: 2,
  },
  stockReason: { fontSize: 12, color: "#5C5E62", flex: 1 },
  moreBtn: {
    backgroundColor: "#eff6ff",
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 4,
  },
  moreBtnText: { color: "#3E6AE1", fontWeight: "600", fontSize: 13 },
  emptyVideos: { alignItems: "center", padding: 16 },
  fetchFirstBtn: {
    backgroundColor: "#393C41",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    marginTop: 8,
  },
  fetchFirstBtnText: { color: "#fff", fontWeight: "600", fontSize: 13 },
  noVideos: { color: "#8E8E8E", fontSize: 13 },
  empty: { padding: 32, alignItems: "center" },
  emptyText: { color: "#8E8E8E", fontSize: 14 },
});
