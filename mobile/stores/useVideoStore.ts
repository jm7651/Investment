import { create } from "zustand";
import { Video, videosApi } from "../lib/api";

interface VideoStore {
  videos: Video[];
  loading: boolean;
  fetching: boolean;
  fetch: (channelId?: number) => Promise<void>;
  fetchFromChannel: (channelId: number) => Promise<void>;
}

export const useVideoStore = create<VideoStore>((set) => ({
  videos: [],
  loading: false,
  fetching: false,

  fetch: async (channelId) => {
    set({ loading: true });
    try {
      const videos = await videosApi.list(
        channelId ? { channel_id: channelId } : undefined
      );
      set({ videos });
    } finally {
      set({ loading: false });
    }
  },

  fetchFromChannel: async (channelId) => {
    set({ fetching: true });
    try {
      await videosApi.fetch(channelId);
      const videos = await videosApi.list();
      set({ videos });
    } finally {
      set({ fetching: false });
    }
  },
}));
