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
  source?: string;
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
  language?: string;
  timestamp_seconds?: number;
  window_seconds?: number;
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
    console.debug("[DEBUG][api] chatService.chat payload:", JSON.stringify(payload));
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
    console.debug("[DEBUG][api] chatService.chat response:", JSON.stringify(body));
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

    console.debug("[DEBUG][api] chatService.chatStream payload:", JSON.stringify(payload));

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
  getSummary: async (videoId: string, type: "short" | "detailed" | "bullet", language?: string): Promise<LearningResponse> => {
    const baseUrl = getBaseUrl();
    const url = `${baseUrl}/learning/summary`;
    const payload = { video_id: videoId, summary_type: type, language: language || "auto" };
    console.debug("[DEBUG][api] getSummary payload:", JSON.stringify(payload));
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const errText = await response.text().catch(() => "unknown");
      console.error("[DEBUG][api] getSummary HTTP error:", response.status, errText);
      throw new Error(`Failed to generate summary (HTTP ${response.status})`);
    }
    const json = await response.json();
    console.debug("[DEBUG][api] getSummary response:", JSON.stringify(json));
    return json;
  },

  getStudyNotes: async (videoId: string, language?: string): Promise<LearningResponse> => {
    const baseUrl = getBaseUrl();
    const url = `${baseUrl}/learning/study-notes`;
    const payload = { video_id: videoId, language: language || "auto" };
    console.debug("[DEBUG][api] getStudyNotes payload:", JSON.stringify(payload));
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const errText = await response.text().catch(() => "unknown");
      console.error("[DEBUG][api] getStudyNotes HTTP error:", response.status, errText);
      throw new Error(`Failed to generate study notes (HTTP ${response.status})`);
    }
    const json = await response.json();
    console.debug("[DEBUG][api] getStudyNotes response:", JSON.stringify(json));
    return json;
  },

  getKeyTakeaways: async (videoId: string, language?: string): Promise<LearningResponse> => {
    const baseUrl = getBaseUrl();
    const url = `${baseUrl}/learning/key-takeaways`;
    const payload = { video_id: videoId, language: language || "auto" };
    console.debug("[DEBUG][api] getKeyTakeaways payload:", JSON.stringify(payload));
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const errText = await response.text().catch(() => "unknown");
      console.error("[DEBUG][api] getKeyTakeaways HTTP error:", response.status, errText);
      throw new Error(`Failed to generate key takeaways (HTTP ${response.status})`);
    }
    const json = await response.json();
    console.debug("[DEBUG][api] getKeyTakeaways response:", JSON.stringify(json));
    return json;
  },



  getInterviewQuestions: async (videoId: string, language?: string): Promise<LearningResponse> => {
    const baseUrl = getBaseUrl();
    const url = `${baseUrl}/learning/interview-questions`;
    const payload = { video_id: videoId, language: language || "auto" };
    console.debug("[DEBUG][api] getInterviewQuestions payload:", JSON.stringify(payload));
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const errText = await response.text().catch(() => "unknown");
      console.error("[DEBUG][api] getInterviewQuestions HTTP error:", response.status, errText);
      throw new Error(`Failed to generate interview questions (HTTP ${response.status})`);
    }
    const json = await response.json();
    console.debug("[DEBUG][api] getInterviewQuestions response:", JSON.stringify(json));
    return json;
  },

  getFlashcards: async (videoId: string, language?: string): Promise<LearningResponse> => {
    const baseUrl = getBaseUrl();
    const url = `${baseUrl}/learning/flashcards`;
    const payload = { video_id: videoId, language: language || "auto" };
    console.debug("[DEBUG][api] getFlashcards payload:", JSON.stringify(payload));
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const errText = await response.text().catch(() => "unknown");
      console.error("[DEBUG][api] getFlashcards HTTP error:", response.status, errText);
      throw new Error(`Failed to generate flashcards (HTTP ${response.status})`);
    }
    const json = await response.json();
    console.debug("[DEBUG][api] getFlashcards response:", JSON.stringify(json));
    return json;
  },

  getQuiz: async (videoId: string, language?: string): Promise<LearningResponse> => {
    const baseUrl = getBaseUrl();
    const url = `${baseUrl}/learning/quiz`;
    const payload = { video_id: videoId, language: language || "auto" };
    console.debug("[DEBUG][api] getQuiz payload:", JSON.stringify(payload));
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const errText = await response.text().catch(() => "unknown");
      console.error("[DEBUG][api] getQuiz HTTP error:", response.status, errText);
      throw new Error(`Failed to generate quiz (HTTP ${response.status})`);
    }
    const json = await response.json();
    console.debug("[DEBUG][api] getQuiz response:", JSON.stringify(json));
    return json;
  },
};

export interface ExportPayload {
  video_title?: string;
  youtube_url?: string;
  feature: string;
  language?: string;
  content: string;
  summary_type?: string;
}

export interface ExportAllPayload {
  video_title?: string;
  youtube_url?: string;
  language?: string;
  contents: Record<string, string>;
}

export interface ObsidianExportPayload extends ExportPayload {
  vault_name?: string;
  tags?: string[];
}

export interface NotionExportPayload {
  api_key?: string;
  parent_id?: string;
  video_title?: string;
  youtube_url?: string;
  feature: string;
  language?: string;
  content: string;
  tags?: string[];
}

export interface NotionExportResult {
  success: boolean;
  page_id?: string;
  url?: string;
  message: string;
}

export const exportService = {
  exportPDF: async (payload: ExportPayload): Promise<void> => {
    const baseUrl = getBaseUrl();
    const response = await fetch(`${baseUrl}/export/pdf`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const err = await response.text().catch(() => "unknown");
      throw new Error(`Failed to generate PDF: ${err}`);
    }
    const blob = await response.blob();
    _triggerFileDownload(blob, _getFilenameFromHeader(response) || `${payload.feature}.pdf`);
  },

  exportDOCX: async (payload: ExportPayload): Promise<void> => {
    const baseUrl = getBaseUrl();
    const response = await fetch(`${baseUrl}/export/docx`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const err = await response.text().catch(() => "unknown");
      throw new Error(`Failed to generate DOCX: ${err}`);
    }
    const blob = await response.blob();
    _triggerFileDownload(blob, _getFilenameFromHeader(response) || `${payload.feature}.docx`);
  },

  exportMarkdown: async (payload: ExportPayload): Promise<void> => {
    const baseUrl = getBaseUrl();
    const response = await fetch(`${baseUrl}/export/markdown`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const err = await response.text().catch(() => "unknown");
      throw new Error(`Failed to generate Markdown: ${err}`);
    }
    const blob = await response.blob();
    _triggerFileDownload(blob, _getFilenameFromHeader(response) || `${payload.feature}.md`);
  },

  exportObsidian: async (payload: ObsidianExportPayload, openInApp = false): Promise<string | null> => {
    const baseUrl = getBaseUrl();
    const response = await fetch(`${baseUrl}/export/obsidian`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const err = await response.text().catch(() => "unknown");
      throw new Error(`Failed to generate Obsidian note: ${err}`);
    }
    const obsidianUri = response.headers.get("X-Obsidian-URI");
    if (openInApp && obsidianUri) {
      window.location.href = obsidianUri;
    } else {
      const blob = await response.blob();
      _triggerFileDownload(blob, _getFilenameFromHeader(response) || `${payload.feature}_obsidian.md`);
    }
    return obsidianUri;
  },

  exportNotion: async (payload: NotionExportPayload): Promise<NotionExportResult> => {
    const baseUrl = getBaseUrl();
    const response = await fetch(`${baseUrl}/export/notion`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const errorJson = await response.json().catch(() => ({}));
      throw new Error(errorJson.detail || `Failed to sync to Notion (HTTP ${response.status})`);
    }
    return await response.json();
  },

  exportAllZip: async (payload: ExportAllPayload): Promise<void> => {
    const baseUrl = getBaseUrl();
    const response = await fetch(`${baseUrl}/export/all`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const err = await response.text().catch(() => "unknown");
      throw new Error(`Failed to generate ZIP: ${err}`);
    }
    const blob = await response.blob();
    _triggerFileDownload(blob, _getFilenameFromHeader(response) || "TubeMind_All_Content.zip");
  },
};

export interface PlaylistVideoItem {
  video_id: string;
  title: string;
  duration?: number;
  position?: number;
  url?: string;
}

export interface PlaylistInfoResponse {
  playlist_id: string;
  title: string;
  video_count: number;
  videos: PlaylistVideoItem[];
}

export interface PlaylistIndexStatus {
  playlist_id: string;
  title: string;
  total_videos: number;
  indexed_videos: number;
  failed_videos: number;
  total_chunks: number;
  is_ready: boolean;
  video_details?: any[];
}

export interface PlaylistSearchResult {
  video_id: string;
  video_title: string;
  score: number;
  text: string;
  start: number;
  end: number;
  chunk_index: number;
  formatted_citation: string;
}

export interface PlaylistChatRequest {
  playlist_id: string;
  query: string;
  history?: Array<{ role: string; content: string }>;
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  language?: string;
}

export const playlistService = {
  getInfo: async (playlistIdOrUrl: string): Promise<PlaylistInfoResponse> => {
    const baseUrl = getBaseUrl();
    const response = await fetch(`${baseUrl}/playlist/info`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playlist_id_or_url: playlistIdOrUrl }),
    });
    if (!response.ok) {
      const err = await response.text().catch(() => "unknown");
      throw new Error(`Failed to fetch playlist info: ${err}`);
    }
    return await response.json();
  },

  index: async (playlistId: string, maxVideos = 12, videos?: PlaylistVideoItem[]): Promise<PlaylistIndexStatus> => {
    const baseUrl = getBaseUrl();
    const response = await fetch(`${baseUrl}/playlist/index`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        playlist_id: playlistId,
        max_videos: maxVideos,
        videos: videos,
      }),
    });
    if (!response.ok) {
      const err = await response.text().catch(() => "unknown");
      throw new Error(`Failed to index playlist: ${err}`);
    }
    return await response.json();
  },

  getStatus: async (playlistId: string): Promise<PlaylistIndexStatus> => {
    const baseUrl = getBaseUrl();
    const response = await fetch(`${baseUrl}/playlist/status/${playlistId}`);
    if (!response.ok) {
      const err = await response.text().catch(() => "unknown");
      throw new Error(`Failed to fetch playlist status: ${err}`);
    }
    return await response.json();
  },

  search: async (playlistId: string, query: string, topK = 6): Promise<PlaylistSearchResult[]> => {
    const baseUrl = getBaseUrl();
    const response = await fetch(`${baseUrl}/playlist/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playlist_id: playlistId, query, top_k: topK }),
    });
    if (!response.ok) {
      const err = await response.text().catch(() => "unknown");
      throw new Error(`Failed to search playlist: ${err}`);
    }
    const json = await response.json();
    return json.results;
  },

  chatStream: async (
    payload: PlaylistChatRequest,
    onContext: (context: PlaylistSearchResult[]) => void,
    onChunk: (chunk: string) => void,
    onDone: () => void,
    onError: (err: any) => void,
  ): Promise<() => void> => {
    const baseUrl = getBaseUrl();
    const controller = new AbortController();

    fetch(`${baseUrl}/playlist/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, stream: true }),
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Playlist chat failed: HTTP ${response.status}`);
        }
        const reader = response.body?.getReader();
        if (!reader) throw new Error("Response body is not readable");

        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n\n");
          buffer = lines.pop() || "";

          for (const block of lines) {
            const blockLines = block.split("\n");
            let event = "message";
            let dataStr = "";

            for (const line of blockLines) {
              if (line.startsWith("event: ")) event = line.slice(7).trim();
              if (line.startsWith("data: ")) dataStr = line.slice(6).trim();
            }

            if (!dataStr) continue;

            try {
              const data = JSON.parse(dataStr);
              if (event === "context") onContext(data);
              else if (event === "chunk") onChunk(data.token || "");
              else if (event === "done") onDone();
              else if (event === "error") onError(data.message);
            } catch {
              // Ignore invalid JSON chunk
            }
          }
        }
        onDone();
      })
      .catch((err) => {
        if (err.name !== "AbortError") onError(err);
      });

    return () => controller.abort();
  },
};

function _getFilenameFromHeader(response: Response): string | null {
  const cd = response.headers.get("Content-Disposition");
  if (cd) {
    const match = cd.match(/filename="?([^"]+)"?/);
    if (match) return match[1];
  }
  return null;
}

function _triggerFileDownload(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

export default youtubeService;


