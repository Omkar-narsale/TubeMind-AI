import { create } from "zustand";
import { learningService } from "@/services/api";
import { logger } from "@/utils/logger";
import { useSettingsStore } from "@/stores/settingsStore";

// Supported language codes the backend can safely handle
const SUPPORTED_LANGUAGES = new Set([
  "auto", "en", "hi", "mr", "ta", "te", "kn", "gu", "pa",
  "es", "fr", "de", "ja", "ko", "zh",
]);

/** Resolve language from settings, falling back to "en" for unsupported values */
function resolveLanguage(): string {
  const raw = useSettingsStore.getState().settings.responseLanguage || "auto";
  const lang = raw.toLowerCase().trim();
  if (SUPPORTED_LANGUAGES.has(lang)) {
    console.debug("[DEBUG][learningStore] resolveLanguage:", lang);
    return lang;
  }
  console.warn("[DEBUG][learningStore] unsupported language, falling back to en:", raw);
  return "en";
}

// In-flight tracking to prevent duplicate concurrent requests
const inFlight = new Set<string>();

interface LearningState {
  summary: Record<string, { short?: string; detailed?: string; bullet?: string }>;
  studyNotes: Record<string, string>;
  takeaways: Record<string, string[]>;
  interviewQuestions: Record<string, string>;
  flashcards: Record<string, string>;
  quiz: Record<string, string>;
  
  loadingSummary: boolean;
  loadingNotes: boolean;
  loadingTakeaways: boolean;
  loadingInterview: boolean;
  loadingFlashcards: boolean;
  loadingQuiz: boolean;
  
  errorSummary: string | null;
  errorNotes: string | null;
  errorTakeaways: string | null;
  errorInterview: string | null;
  errorFlashcards: string | null;
  errorQuiz: string | null;

  generateSummary: (videoId: string, type: "short" | "detailed" | "bullet", force?: boolean) => Promise<void>;
  generateStudyNotes: (videoId: string, force?: boolean) => Promise<void>;
  generateTakeaways: (videoId: string, force?: boolean) => Promise<void>;
  generateInterviewQuestions: (videoId: string, force?: boolean) => Promise<void>;
  generateFlashcards: (videoId: string, force?: boolean) => Promise<void>;
  generateQuiz: (videoId: string, force?: boolean) => Promise<void>;
}

export const useLearningStore = create<LearningState>((set, get) => ({
  summary: {},
  studyNotes: {},
  takeaways: {},
  interviewQuestions: {},
  flashcards: {},
  quiz: {},
  
  loadingSummary: false,
  loadingNotes: false,
  loadingTakeaways: false,
  loadingInterview: false,
  loadingFlashcards: false,
  loadingQuiz: false,
  
  errorSummary: null,
  errorNotes: null,
  errorTakeaways: null,
  errorInterview: null,
  errorFlashcards: null,
  errorQuiz: null,

  generateSummary: async (videoId: string, type: "short" | "detailed" | "bullet", force = false) => {
    if (!videoId) return;
    
    const existing = get().summary[videoId]?.[type];
    if (existing && !force) {
      console.debug("[DEBUG][learningStore] generateSummary: cached, skipping", videoId, type);
      return;
    }

    // Prevent duplicate in-flight requests
    const flightKey = `summary:${videoId}:${type}`;
    if (inFlight.has(flightKey)) {
      console.debug("[DEBUG][learningStore] generateSummary: already in-flight, skipping", flightKey);
      return;
    }
    inFlight.add(flightKey);

    set({ loadingSummary: true, errorSummary: null });
    try {
      const lang = resolveLanguage();
      console.debug("[DEBUG][learningStore] generateSummary: calling API", { videoId, type, lang });
      const response = await learningService.getSummary(videoId, type, lang);
      console.debug("[DEBUG][learningStore] generateSummary: state update, data length:", response.data?.length);
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
    } finally {
      inFlight.delete(flightKey);
    }
  },

  generateStudyNotes: async (videoId: string, force = false) => {
    if (!videoId) return;
    
    const existing = get().studyNotes[videoId];
    if (existing && !force) {
      console.debug("[DEBUG][learningStore] generateStudyNotes: cached, skipping", videoId);
      return;
    }

    const flightKey = `notes:${videoId}`;
    if (inFlight.has(flightKey)) {
      console.debug("[DEBUG][learningStore] generateStudyNotes: already in-flight, skipping", flightKey);
      return;
    }
    inFlight.add(flightKey);

    set({ loadingNotes: true, errorNotes: null });
    try {
      const lang = resolveLanguage();
      console.debug("[DEBUG][learningStore] generateStudyNotes: calling API", { videoId, lang });
      const response = await learningService.getStudyNotes(videoId, lang);
      console.debug("[DEBUG][learningStore] generateStudyNotes: state update, data length:", response.data?.length);
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
    } finally {
      inFlight.delete(flightKey);
    }
  },

  generateTakeaways: async (videoId: string, force = false) => {
    if (!videoId) return;
    
    const existing = get().takeaways[videoId];
    if (existing && !force) {
      console.debug("[DEBUG][learningStore] generateTakeaways: cached, skipping", videoId);
      return;
    }

    const flightKey = `takeaways:${videoId}`;
    if (inFlight.has(flightKey)) {
      console.debug("[DEBUG][learningStore] generateTakeaways: already in-flight, skipping", flightKey);
      return;
    }
    inFlight.add(flightKey);

    set({ loadingTakeaways: true, errorTakeaways: null });
    try {
      const lang = resolveLanguage();
      console.debug("[DEBUG][learningStore] generateTakeaways: calling API", { videoId, lang });
      const response = await learningService.getKeyTakeaways(videoId, lang);
      
      const rawText = response.data || "";
      const lines = rawText
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.startsWith("✓") || l.startsWith("•") || l.startsWith("-") || l.length > 0)
        .map((l) => {
          if (l.startsWith("✓") || l.startsWith("•") || l.startsWith("-")) {
            return l.substring(1).trim();
          }
          return l;
        })
        .filter((l) => l.length > 0);

      console.debug("[DEBUG][learningStore] generateTakeaways: parsed lines:", lines.length);
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
    } finally {
      inFlight.delete(flightKey);
    }
  },

  generateInterviewQuestions: async (videoId: string, force = false) => {
    if (!videoId) return;
    
    const existing = get().interviewQuestions[videoId];
    if (existing && !force) {
      console.debug("[DEBUG][learningStore] generateInterviewQuestions: cached, skipping", videoId);
      return;
    }

    const flightKey = `interview:${videoId}`;
    if (inFlight.has(flightKey)) {
      console.debug("[DEBUG][learningStore] generateInterviewQuestions: already in-flight, skipping", flightKey);
      return;
    }
    inFlight.add(flightKey);

    set({ loadingInterview: true, errorInterview: null });
    try {
      const lang = resolveLanguage();
      console.debug("[DEBUG][learningStore] generateInterviewQuestions: calling API", { videoId, lang });
      const response = await learningService.getInterviewQuestions(videoId, lang);
      console.debug("[DEBUG][learningStore] generateInterviewQuestions: state update, data length:", response.data?.length);
      set((state) => ({
        interviewQuestions: {
          ...state.interviewQuestions,
          [videoId]: response.data,
        },
        loadingInterview: false,
      }));
    } catch (err: any) {
      logger.error("Failed to generate interview questions:", err);
      set({ loadingInterview: false, errorInterview: err.message || "Failed to generate interview questions" });
    } finally {
      inFlight.delete(flightKey);
    }
  },

  generateFlashcards: async (videoId: string, force = false) => {
    if (!videoId) return;

    const existing = get().flashcards[videoId];
    if (existing && !force) {
      console.debug("[DEBUG][learningStore] generateFlashcards: cached, skipping", videoId);
      return;
    }

    const flightKey = `flashcards:${videoId}`;
    if (inFlight.has(flightKey)) {
      console.debug("[DEBUG][learningStore] generateFlashcards: already in-flight, skipping", flightKey);
      return;
    }
    inFlight.add(flightKey);

    set({ loadingFlashcards: true, errorFlashcards: null });
    try {
      const lang = resolveLanguage();
      console.debug("[DEBUG][learningStore] generateFlashcards: calling API", { videoId, lang });
      const response = await learningService.getFlashcards(videoId, lang);
      set((state) => ({
        flashcards: {
          ...state.flashcards,
          [videoId]: response.data,
        },
        loadingFlashcards: false,
      }));
    } catch (err: any) {
      logger.error("Failed to generate flashcards:", err);
      set({ loadingFlashcards: false, errorFlashcards: err.message || "Failed to generate flashcards" });
    } finally {
      inFlight.delete(flightKey);
    }
  },

  generateQuiz: async (videoId: string, force = false) => {
    if (!videoId) return;

    const existing = get().quiz[videoId];
    if (existing && !force) {
      console.debug("[DEBUG][learningStore] generateQuiz: cached, skipping", videoId);
      return;
    }

    const flightKey = `quiz:${videoId}`;
    if (inFlight.has(flightKey)) {
      console.debug("[DEBUG][learningStore] generateQuiz: already in-flight, skipping", flightKey);
      return;
    }
    inFlight.add(flightKey);

    set({ loadingQuiz: true, errorQuiz: null });
    try {
      const lang = resolveLanguage();
      console.debug("[DEBUG][learningStore] generateQuiz: calling API", { videoId, lang });
      const response = await learningService.getQuiz(videoId, lang);
      set((state) => ({
        quiz: {
          ...state.quiz,
          [videoId]: response.data,
        },
        loadingQuiz: false,
      }));
    } catch (err: any) {
      logger.error("Failed to generate quiz:", err);
      set({ loadingQuiz: false, errorQuiz: err.message || "Failed to generate quiz" });
    } finally {
      inFlight.delete(flightKey);
    }
  },
}));
