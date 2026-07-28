export interface VideoInfo {
  videoId: string | null;
  url: string;
  title: string | null;
  isValid: boolean;
}

export type BackendStatus = "checking" | "connected" | "offline";

export interface ExtensionSettings {
  backendUrl: string;
  theme: "light" | "dark" | "system";
  selectedModel: string;
  apiKey: string;
  responseLanguage?: string;
}


export type MessageType =
  | "YOUTUBE_VIDEO_DETECTED"
  | "GET_CURRENT_VIDEO_DETAILS"
  | "URL_CHANGE_DETECTED"
  | "TRIGGER_SIDE_PANEL_OPEN"
  | "SETTINGS_UPDATED"
  | "PING"
  | "PONG";

export interface MessagePayload {
  type: MessageType;
  videoId?: string | null;
  url?: string;
  title?: string | null;
  settings?: ExtensionSettings;
}

export interface ConnectionState {
  status: BackendStatus;
  lastChecked: number;
}
