import { create } from "zustand";
import { ragService, RAGSearchResult } from "@/services/api";
import { logger } from "@/utils/logger";

interface RAGState {
  loading: boolean;
  results: RAGSearchResult[];
  query: string;
  error: string | null;
  searchQuery: (videoId: string, query: string) => Promise<void>;
  clearResults: () => void;
}

export const useRAGStore = create<RAGState>((set) => ({
  loading: false,
  results: [],
  query: "",
  error: null,

  searchQuery: async (videoId: string, query: string) => {
    if (!videoId || !query.trim()) return;

    set({ loading: true, query, error: null });
    logger.info("Executing semantic RAG search for query:", query);

    try {
      const results = await ragService.search(videoId, query);
      set({ results, loading: false, error: null });
      logger.info(`RAG search completed. Found ${results.length} matched contexts.`);
    } catch (err: any) {
      logger.error("RAG search failed:", err);
      set({
        results: [],
        loading: false,
        error: err.message || "Failed to retrieve matching contexts",
      });
    }
  },

  clearResults: () => {
    set({
      loading: false,
      results: [],
      query: "",
      error: null,
    });
  },
}));
export default useRAGStore;
