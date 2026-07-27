import { create } from "zustand";
import { learningService } from "@/services/api";
import { logger } from "@/utils/logger";

interface LearningState {
  summary: Record<string, { short?: string; detailed?: string; bullet?: string }>;
  studyNotes: Record<string, string>;
  takeaways: Record<string, string[]>;
  
  loadingSummary: boolean;
  loadingNotes: boolean;
  loadingTakeaways: boolean;
  
  errorSummary: string | null;
  errorNotes: string | null;
  errorTakeaways: string | null;

  generateSummary: (videoId: string, type: "short" | "detailed" | "bullet", force?: boolean) => Promise<void>;
  generateStudyNotes: (videoId: string, force?: boolean) => Promise<void>;
  generateTakeaways: (videoId: string, force?: boolean) => Promise<void>;
}

export const useLearningStore = create<LearningState>((set, get) => ({
  summary: {},
  studyNotes: {},
  takeaways: {},
  
  loadingSummary: false,
  loadingNotes: false,
  loadingTakeaways: false,
  
  errorSummary: null,
  errorNotes: null,
  errorTakeaways: null,

  generateSummary: async (videoId: string, type: "short" | "detailed" | "bullet", force = false) => {
    if (!videoId) return;
    
    const existing = get().summary[videoId]?.[type];
    if (existing && !force) return;

    set({ loadingSummary: true, errorSummary: null });
    try {
      const response = await learningService.getSummary(videoId, type);
      set((state) => ({
        summary: {
          ...state.summary,
          [videoId]: {
            ...(state.summary[videoId] || {}),
            [type]: response.data,
          },
        },
        loadingSummary: false,
      }));
    } catch (err: any) {
      logger.error("Failed to generate summary:", err);
      set({ loadingSummary: false, errorSummary: err.message || "Failed to generate summary" });
    }
  },

  generateStudyNotes: async (videoId: string, force = false) => {
    if (!videoId) return;
    
    const existing = get().studyNotes[videoId];
    if (existing && !force) return;

    set({ loadingNotes: true, errorNotes: null });
    try {
      const response = await learningService.getStudyNotes(videoId);
      set((state) => ({
        studyNotes: {
          ...state.studyNotes,
          [videoId]: response.data,
        },
        loadingNotes: false,
      }));
    } catch (err: any) {
      logger.error("Failed to generate study notes:", err);
      set({ loadingNotes: false, errorNotes: err.message || "Failed to generate study notes" });
    }
  },

  generateTakeaways: async (videoId: string, force = false) => {
    if (!videoId) return;
    
    const existing = get().takeaways[videoId];
    if (existing && !force) return;

    set({ loadingTakeaways: true, errorTakeaways: null });
    try {
      const response = await learningService.getKeyTakeaways(videoId);
      
      // Parse takeaways from text blocks (split lines starting with checkmarks or bullet points)
      const rawText = response.data || "";
      const lines = rawText
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.startsWith("✓") || l.startsWith("•") || l.startsWith("-") || l.length > 0)
        .map((l) => {
          // clean prefix if present
          if (l.startsWith("✓") || l.startsWith("•") || l.startsWith("-")) {
            return l.substring(1).trim();
          }
          return l;
        })
        .filter((l) => l.length > 0);

      set((state) => ({
        takeaways: {
          ...state.takeaways,
          [videoId]: lines.length > 0 ? lines : [rawText],
        },
        loadingTakeaways: false,
      }));
    } catch (err: any) {
      logger.error("Failed to generate key takeaways:", err);
      set({ loadingTakeaways: false, errorTakeaways: err.message || "Failed to generate key takeaways" });
    }
  },
}));
