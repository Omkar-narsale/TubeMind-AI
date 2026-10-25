import { create } from "zustand";
import { youtubeService, TranscriptSegment } from "@/services/api";
import { logger } from "@/utils/logger";

interface TranscriptState {
  loading: boolean;
  error: string | null;
  segments: TranscriptSegment[];
  language: string;
  generated: boolean;
  source?: string;
  segmentCount: number;
  fetchTranscript: (videoId: string) => Promise<void>;
  clearTranscript: () => void;
}

export const useTranscriptStore = create<TranscriptState>((set) => ({
  loading: false,
  error: null,
  segments: [],
  language: "",
  generated: false,
  source: undefined,
  segmentCount: 0,

  fetchTranscript: async (videoId: string) => {
    if (!videoId) return;
    
    set({ loading: true, error: null });
    logger.info("Fetching transcript for VideoID:", videoId);
    
    try {
      const data = await youtubeService.getVideoTranscript(videoId);
      
      set({
        segments: data.segments,
        language: data.language,
        generated: data.generated,
        source: data.source,
        segmentCount: data.segments.length,
        loading: false,
        error: null,
      });
      logger.info("Transcript loaded successfully.", data.segments.length, "segments parsed.");
    } catch (err: any) {
      logger.error("Failed to fetch transcript:", err);
      set({
        segments: [],
        language: "",
        generated: false,
        segmentCount: 0,
        loading: false,
        error: err.message || "Transcript Unavailable",
      });
    }
  },

  clearTranscript: () => {
    set({
      loading: false,
      error: null,
      segments: [],
      language: "",
      generated: false,
      source: undefined,
      segmentCount: 0,
    });
  },
}));
export default useTranscriptStore;
