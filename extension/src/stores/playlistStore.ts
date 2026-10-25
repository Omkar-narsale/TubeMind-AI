import { create } from "zustand";
import {
  playlistService,
  PlaylistVideoItem,
  PlaylistIndexStatus,
  PlaylistSearchResult,
} from "@/services/api";
import { extractPlaylistId } from "@/utils/youtube";
import { logger } from "@/utils/logger";

export interface PlaylistChatMessage {
  id: string;
  sender: "user" | "assistant";
  text: string;
  sources?: PlaylistSearchResult[];
  timestamp: number;
}

interface PlaylistState {
  playlistId: string | null;
  playlistTitle: string | null;
  videoCount: number;
  videos: PlaylistVideoItem[];
  mode: "single" | "course";
  isIndexed: boolean;
  indexing: boolean;
  indexingError: string | null;
  status: PlaylistIndexStatus | null;
  messages: Record<string, PlaylistChatMessage[]>;
  loading: boolean;
  streaming: boolean;
  error: string | null;

  setMode: (mode: "single" | "course") => void;
  detectAndLoadPlaylist: (url: string) => Promise<void>;
  startIndexing: (maxVideos?: number) => Promise<void>;
  sendPlaylistMessage: (query: string) => Promise<void>;
  clearPlaylistChat: () => void;
}

export const usePlaylistStore = create<PlaylistState>((set, get) => ({
  playlistId: null,
  playlistTitle: null,
  videoCount: 0,
  videos: [],
  mode: "single",
  isIndexed: false,
  indexing: false,
  indexingError: null,
  status: null,
  messages: {},
  loading: false,
  streaming: false,
  error: null,

  setMode: (mode: "single" | "course") => {
    set({ mode });
  },

  detectAndLoadPlaylist: async (url: string) => {
    const pid = extractPlaylistId(url);
    if (!pid) {
      if (get().playlistId !== null) {
        set({
          playlistId: null,
          playlistTitle: null,
          videoCount: 0,
          videos: [],
          mode: "single",
          isIndexed: false,
          status: null,
        });
      }
      return;
    }

    if (get().playlistId === pid && get().videos.length > 0) {
      return;
    }

    set({ playlistId: pid, loading: true, indexingError: null });

    try {
      // 1. Check if already indexed
      try {
        const existingStatus = await playlistService.getStatus(pid);
        if (existingStatus && existingStatus.is_ready) {
          set({
            playlistId: pid,
            playlistTitle: existingStatus.title,
            videoCount: existingStatus.total_videos,
            isIndexed: true,
            status: existingStatus,
          });
        }
      } catch {
        // Not yet indexed
      }

      // 2. Fetch playlist info
      const info = await playlistService.getInfo(url);
      set({
        playlistId: info.playlist_id,
        playlistTitle: info.title,
        videoCount: info.video_count,
        videos: info.videos,
        loading: false,
      });
      logger.info(`Detected playlist: ${info.title} (${info.video_count} videos)`);
    } catch (err: any) {
      logger.debug("Failed loading playlist info:", err.message);
      set({ loading: false });
    }
  },

  startIndexing: async (maxVideos = 10) => {
    const { playlistId, videos } = get();
    if (!playlistId) return;

    set({ indexing: true, indexingError: null });

    try {
      const res = await playlistService.index(playlistId, maxVideos, videos);
      set({
        indexing: false,
        isIndexed: res.is_ready,
        status: res,
        playlistTitle: res.title || get().playlistTitle,
      });
      logger.info(`Playlist indexed: ${res.indexed_videos}/${res.total_videos} videos`);
    } catch (err: any) {
      set({
        indexing: false,
        indexingError: err.message || "Indexing course failed",
      });
    }
  },

  sendPlaylistMessage: async (query: string) => {
    const { playlistId, messages } = get();
    if (!playlistId || !query.trim()) return;

    const userMsg: PlaylistChatMessage = {
      id: `user-${Date.now()}`,
      sender: "user",
      text: query,
      timestamp: Date.now(),
    };

    const currentMessages = messages[playlistId] || [];
    set({
      messages: {
        ...messages,
        [playlistId]: [...currentMessages, userMsg],
      },
      loading: true,
      error: null,
    });

    const aiMsgId = `ai-${Date.now()}`;
    const placeholderMsg: PlaylistChatMessage = {
      id: aiMsgId,
      sender: "assistant",
      text: "",
      sources: [],
      timestamp: Date.now(),
    };

    set((state) => ({
      messages: {
        ...state.messages,
        [playlistId]: [...(state.messages[playlistId] || []), placeholderMsg],
      },
      loading: false,
      streaming: true,
    }));

    try {
      let accumulatedText = "";
      let retrievedSources: PlaylistSearchResult[] = [];

      const historyPayload = currentMessages.map((m) => ({
        role: m.sender === "user" ? "user" : "assistant",
        content: m.text,
      }));

      await playlistService.chatStream(
        {
          playlist_id: playlistId,
          query,
          history: historyPayload,
        },
        (context) => {
          retrievedSources = context;
          set((state) => ({
            messages: {
              ...state.messages,
              [playlistId]: (state.messages[playlistId] || []).map((msg) =>
                msg.id === aiMsgId ? { ...msg, sources: retrievedSources } : msg
              ),
            },
          }));
        },
        (chunk) => {
          accumulatedText += chunk;
          set((state) => ({
            messages: {
              ...state.messages,
              [playlistId]: (state.messages[playlistId] || []).map((msg) =>
                msg.id === aiMsgId
                  ? { ...msg, text: accumulatedText, sources: retrievedSources }
                  : msg
              ),
            },
          }));
        },
        () => {
          set({ streaming: false });
        },
        (err) => {
          set({
            streaming: false,
            error: err.message || "Failed answering playlist query",
          });
        }
      );
    } catch (err: any) {
      set({
        streaming: false,
        error: err.message || "Failed playlist chat stream",
      });
    }
  },

  clearPlaylistChat: () => {
    const { playlistId, messages } = get();
    if (!playlistId) return;
    set({
      messages: {
        ...messages,
        [playlistId]: [],
      },
    });
  },
}));
