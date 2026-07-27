import { useSettingsStore } from "@/stores/settingsStore";
import { logger } from "@/utils/logger";

export interface APIResponse<T> {
  success: boolean;
  message?: string;
  data?: T;
  error?: {
    code: string;
    message: string;
    field?: string;
  };
}

export interface VideoChannelInfo {
  id: string;
  title: string;
  thumbnail_url?: string;
}

export interface VideoMetadata {
  video_id: string;
  title: string;
  description: string;
  published_at: string;
  channel: VideoChannelInfo;
  duration: string;
  view_count?: number;
  like_count?: number;
}

export interface TranscriptSegment {
  text: string;
  start: number;
  duration: number;
}

export interface VideoTranscript {
  success: boolean;
  video_id: string;
  language: string;
  generated: boolean;
  segments: TranscriptSegment[];
}

export class APIError extends Error {
  code: string;
  field?: string;

  constructor(message: string, code: string, field?: string) {
    super(message);
    this.name = "APIError";
    this.code = code;
    this.field = field;
  }
}

function getBaseUrl(): string {
  try {
    const settings = useSettingsStore.getState().settings;
    if (settings && settings.backendUrl) {
      // Remove trailing slash if present
      const cleanUrl = settings.backendUrl.replace(/\/$/, "");
      return `${cleanUrl}/api/v1`;
    }
  } catch (error) {
    logger.debug("Failed resolving base url from store; using env fallback.");
  }
  const fallback = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000/api/v1";
  return fallback.replace(/\/$/, "");
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const baseUrl = getBaseUrl();
  const url = `${baseUrl}${path}`;
  
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
    },
    ...options,
  });

  const body: APIResponse<T> = await response.json().catch(() => ({
    success: false,
    error: {
      code: "PARSE_ERROR",
      message: "Failed to parse API response",
    },
  }));

  if (!response.ok || !body.success) {
    throw new APIError(
      body.error?.message || "An error occurred fetching data from backend",
      body.error?.code || "UNKNOWN_ERROR",
      body.error?.field
    );
  }

  return body.data as T;
}

export const youtubeService = {
  getVideoMetadata: async (videoUrl: string): Promise<VideoMetadata> => {
    return request<VideoMetadata>("/youtube/metadata", {
      method: "POST",
      body: JSON.stringify({ video_url: videoUrl }),
    });
  },

  getVideoTranscript: async (videoId: string): Promise<VideoTranscript> => {
    // Note: this calls GET /api/v1/transcript/{video_id}
    const baseUrl = getBaseUrl();
    const url = `${baseUrl}/transcript/${videoId}`;
    const response = await fetch(url, {
      headers: { "Content-Type": "application/json" }
    });
    
    if (!response.ok) {
      throw new APIError("Failed to load transcript", "TRANSCRIPT_FETCH_ERROR");
    }
    
    return response.json();
  },
};

export const systemService = {
  checkHealth: async (rootUrlOverride?: string): Promise<{ success: boolean; status: string; service: string }> => {
    let rootUrl = rootUrlOverride;
    if (!rootUrl) {
      // derive root domain by removing /api/v1
      rootUrl = getBaseUrl().replace(/\/api\/v1$/, "");
    }
    rootUrl = rootUrl.replace(/\/$/, "");
    
    const response = await fetch(`${rootUrl}/health`, {
      headers: { "Content-Type": "application/json" }
    });
    
    if (!response.ok) {
      throw new Error(`Health request returned HTTP ${response.status}`);
    }
    
    return response.json();
  }
};

export interface RAGSearchResult {
  score: number;
  text: string;
  start: number;
  end: number;
  chunk_index: number;
}

export interface RAGSearchResponse {
  success: boolean;
  results: RAGSearchResult[];
}

export const ragService = {
  search: async (videoId: string, query: string): Promise<RAGSearchResult[]> => {
    const baseUrl = getBaseUrl();
    const url = `${baseUrl}/rag/search`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ video_id: videoId, query }),
    });
    
    if (!response.ok) {
      throw new Error("Failed to execute semantic search");
    }
    
    const body: RAGSearchResponse = await response.json();
    return body.results;
  }
};

export interface ChatMessageInput {
  role: "user" | "assistant";
  content: string;
}

export interface ChatRequest {
  video_id: string;
  query: string;
  history: ChatMessageInput[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
}

export interface ChatMetadata {
  model_name: string;
  retrieval_count: number;
  response_time: number;
}

export interface ChatResponseData {
  success: boolean;
  answer: string;
  context: RAGSearchResult[];
  metadata: ChatMetadata;
}

export const chatService = {
  chat: async (payload: ChatRequest): Promise<ChatResponseData> => {
    const baseUrl = getBaseUrl();
    const url = `${baseUrl}/chat`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      throw new APIError(
        errorBody.error?.message || "Failed to execute chat request",
        errorBody.error?.code || "CHAT_ERROR"
      );
    }

    const body = await response.json();
    return body.data;
  },

  chatStream: async (
    payload: ChatRequest,
    onContext: (context: RAGSearchResult[]) => void,
    onChunk: (chunk: string) => void,
    onReplace: (text: string) => void,
    onMetadata: (metadata: any) => void,
    onDone: () => void,
    onError: (err: any) => void
  ): Promise<() => void> => {
    const baseUrl = getBaseUrl();
    const url = `${baseUrl}/chat`;
    const controller = new AbortController();

    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, stream: true }),
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          const errorBody = await response.json().catch(() => ({}));
          throw new Error(errorBody.error?.message || "Failed to initiate stream");
        }

        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error("No readable stream in response body");
        }

        const decoder = new TextDecoder();
        let buffer = "";
        
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            onDone();
            break;
          }
          buffer += decoder.decode(value, { stream: true });
          
          const lines = buffer.split("\n\n");
          buffer = lines.pop() || "";
          
          for (const line of lines) {
            const cleanLine = line.trim();
            if (!cleanLine.startsWith("data:")) continue;
            
            try {
              const parsed = JSON.parse(cleanLine.substring(5).trim());
              const { event, data } = parsed;
              
              if (event === "context") {
                const contextList = typeof data === "string" ? JSON.parse(data) : data;
                onContext(contextList);
              } else if (event === "token") {
                onChunk(data);
              } else if (event === "replace") {
                onReplace(data);
              } else if (event === "metadata") {
                const meta = typeof data === "string" ? JSON.parse(data) : data;
                onMetadata(meta);
              } else if (event === "error") {
                throw new Error(data);
              }
            } catch (err: any) {
              onError(err);
            }
          }
        }
      })
      .catch((err) => {
        if (err.name !== "AbortError") {
          onError(err);
        }
      });

    return () => {
      controller.abort();
    };
  },
};

export interface LearningResponse {
  success: boolean;
  data: string;
}

export const learningService = {
  getSummary: async (videoId: string, type: "short" | "detailed" | "bullet"): Promise<LearningResponse> => {
    const baseUrl = getBaseUrl();
    const url = `${baseUrl}/learning/summary`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ video_id: videoId, summary_type: type }),
    });
    if (!response.ok) {
      throw new Error("Failed to generate summary");
    }
    return response.json();
  },

  getStudyNotes: async (videoId: string): Promise<LearningResponse> => {
    const baseUrl = getBaseUrl();
    const url = `${baseUrl}/learning/study-notes`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ video_id: videoId }),
    });
    if (!response.ok) {
      throw new Error("Failed to generate study notes");
    }
    return response.json();
  },

  getKeyTakeaways: async (videoId: string): Promise<LearningResponse> => {
    const baseUrl = getBaseUrl();
    const url = `${baseUrl}/learning/key-takeaways`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ video_id: videoId }),
    });
    if (!response.ok) {
      throw new Error("Failed to generate key takeaways");
    }
    return response.json();
  },
};

export default youtubeService;
