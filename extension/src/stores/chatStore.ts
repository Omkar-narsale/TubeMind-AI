import { create } from "zustand";
import { chatService, ChatMessageInput, RAGSearchResult } from "@/services/api";
import { logger } from "@/utils/logger";
import { useSettingsStore } from "@/stores/settingsStore";

export interface ChatMetadata {
  model_name: string;
  retrieval_count: number;
  response_time: number;
}

export interface ChatMessage {
  id: string;
  sender: "user" | "assistant";
  text: string;
  timestamp: number;
  context?: RAGSearchResult[];
  metadata?: ChatMetadata;
}

interface ChatState {
  loading: boolean;
  streaming: boolean;
  messages: Record<string, ChatMessage[]>; // videoId -> messages
  temperature: number;
  maxTokens: number;
  streamingEnabled: boolean;
  error: string | null;
  
  sendMessage: (videoId: string, query: string) => Promise<void>;
  retryMessage: (videoId: string) => Promise<void>;
  clearChat: (videoId: string) => void;
  setTemperature: (temp: number) => void;
  setMaxTokens: (tokens: number) => void;
  setStreamingEnabled: (enabled: boolean) => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  loading: false,
  streaming: false,
  messages: {},
  temperature: 0.7,
  maxTokens: 1024,
  streamingEnabled: true,
  error: null,

  sendMessage: async (videoId: string, query: string) => {
    if (!videoId || !query.trim()) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: "user",
      text: query,
      timestamp: Date.now(),
    };

    // Add user message to history
    set((state) => {
      const currentMessages = state.messages[videoId] || [];
      return {
        messages: {
          ...state.messages,
          [videoId]: [...currentMessages, userMessage],
        },
        loading: true,
        error: null,
      };
    });

    const currentHistory = get().messages[videoId] || [];
    // Convert to API history format
    const historyPayload: ChatMessageInput[] = currentHistory
      .slice(0, -1) // Exclude current query which is passed separately
      .map((msg) => ({
        role: msg.sender === "user" ? "user" : "assistant",
        content: msg.text,
      }));

    const { temperature, maxTokens, streamingEnabled } = get();

    if (streamingEnabled) {
      const aiMessageId = `ai-${Date.now()}`;
      const placeholderMessage: ChatMessage = {
        id: aiMessageId,
        sender: "assistant",
        text: "",
        timestamp: Date.now(),
      };

      set((state) => ({
        messages: {
          ...state.messages,
          [videoId]: [...(state.messages[videoId] || []), placeholderMessage],
        },
        loading: false, // Turn off loader, transition to streaming
        streaming: true,
      }));

      try {
        let accumulatedText = "";
        const lang = useSettingsStore.getState().settings.responseLanguage || "auto";
        console.debug("[DEBUG][chatStore] chatStream language:", lang);
        await chatService.chatStream(
          {
            video_id: videoId,
            query,
            history: historyPayload,
            temperature,
            max_tokens: maxTokens,
            language: lang,
          },
          (context) => {
            // Update the message citations
            set((state) => {
              const videoMessages = state.messages[videoId] || [];
              const updated = videoMessages.map((m) =>
                m.id === aiMessageId ? { ...m, context } : m
              );
              return {
                messages: {
                  ...state.messages,
                  [videoId]: updated,
                },
              };
            });
          },
          (chunk) => {
            accumulatedText += chunk;
            set((state) => {
              const videoMessages = state.messages[videoId] || [];
              const updated = videoMessages.map((m) =>
                m.id === aiMessageId ? { ...m, text: accumulatedText } : m
              );
              return {
                messages: {
                  ...state.messages,
                  [videoId]: updated,
                },
              };
            });
          },
          (replaceText) => {
            accumulatedText = replaceText;
            set((state) => {
              const videoMessages = state.messages[videoId] || [];
              const updated = videoMessages.map((m) =>
                m.id === aiMessageId ? { ...m, text: replaceText } : m
              );
              return {
                messages: {
                  ...state.messages,
                  [videoId]: updated,
                },
              };
            });
          },
          (metadata) => {
            // Update the message metadata
            set((state) => {
              const videoMessages = state.messages[videoId] || [];
              const updated = videoMessages.map((m) =>
                m.id === aiMessageId ? { ...m, metadata } : m
              );
              return {
                messages: {
                  ...state.messages,
                  [videoId]: updated,
                },
              };
            });
          },
          () => {
            set({ streaming: false });
          },
          (err) => {
            logger.error("Streaming chat failed:", err);
            set((state) => {
              const videoMessages = state.messages[videoId] || [];
              const updated = videoMessages.map((m) =>
                m.id === aiMessageId
                  ? { ...m, text: m.text + `\n[Stream Error: ${err.message || "Failed to retrieve stream"}]` }
                  : m
              );
              return {
                messages: {
                  ...state.messages,
                  [videoId]: updated,
                },
                streaming: false,
                error: err.message || "Streaming failed",
              };
            });
          }
        );
      } catch (err: any) {
        set({ streaming: false, error: err.message || "Failed to start streaming" });
      }
    } else {
      try {
        const lang = useSettingsStore.getState().settings.responseLanguage || "auto";
        console.debug("[DEBUG][chatStore] chat (non-streaming) language:", lang);
        const response = await chatService.chat({
          video_id: videoId,
          query,
          history: historyPayload,
          temperature,
          max_tokens: maxTokens,
          stream: false,
          language: lang,
        });

        const aiMessage: ChatMessage = {
          id: `ai-${Date.now()}`,
          sender: "assistant",
          text: response.answer,
          timestamp: Date.now(),
          context: response.context,
          metadata: response.metadata,
        };

        set((state) => ({
          messages: {
            ...state.messages,
            [videoId]: [...(state.messages[videoId] || []), aiMessage],
          },
          loading: false,
        }));
      } catch (err: any) {
        logger.error("Chat failed:", err);
        const errorMessage: ChatMessage = {
          id: `ai-err-${Date.now()}`,
          sender: "assistant",
          text: `Error: ${err.message || "Failed to generate answer."}`,
          timestamp: Date.now(),
        };
        set((state) => ({
          messages: {
            ...state.messages,
            [videoId]: [...(state.messages[videoId] || []), errorMessage],
          },
          loading: false,
          error: err.message || "Chat failed",
        }));
      }
    }
  },

  clearChat: (videoId: string) => {
    set((state) => {
      const updatedMessages = { ...state.messages };
      delete updatedMessages[videoId];
      return {
        messages: updatedMessages,
        error: null,
      };
    });
  },

  retryMessage: async (videoId: string) => {
    const videoMessages = get().messages[videoId] || [];
    const lastUserIdx = [...videoMessages].reverse().findIndex((m) => m.sender === "user");
    if (lastUserIdx === -1) return;

    const actualIdx = videoMessages.length - 1 - lastUserIdx;
    const lastUserQuery = videoMessages[actualIdx].text;
    const trimmedHistory = videoMessages.slice(0, actualIdx);

    set((state) => ({
      messages: {
        ...state.messages,
        [videoId]: trimmedHistory,
      },
      error: null,
    }));

    await get().sendMessage(videoId, lastUserQuery);
  },

  setTemperature: (temp: number) => set({ temperature: temp }),
  setMaxTokens: (tokens: number) => set({ maxTokens: tokens }),
  setStreamingEnabled: (enabled: boolean) => set({ streamingEnabled: enabled }),
}));

export default useChatStore;
