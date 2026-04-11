import { create } from "zustand";
import { Channel, channelsApi } from "../lib/api";

interface ChannelStore {
  channels: Channel[];
  loading: boolean;
  fetch: () => Promise<void>;
  add: (youtube_id: string, name: string) => Promise<void>;
  remove: (id: number) => Promise<void>;
}

export const useChannelStore = create<ChannelStore>((set, get) => ({
  channels: [],
  loading: false,

  fetch: async () => {
    set({ loading: true });
    try {
      const channels = await channelsApi.list();
      set({ channels });
    } finally {
      set({ loading: false });
    }
  },

  add: async (youtube_id, name) => {
    const channel = await channelsApi.add({ youtube_id, name });
    set({ channels: [...get().channels, channel] });
  },

  remove: async (id) => {
    await channelsApi.delete(id);
    set({ channels: get().channels.filter((c) => c.id !== id) });
  },
}));
