import { create } from "zustand";
import { ExtensionSettings } from "@/types";
import { chromeStorage } from "@/utils/chromeStorage";
import { logger } from "@/utils/logger";

interface SettingsState {
  settings: ExtensionSettings;
  loading: boolean;
  loadSettings: () => Promise<void>;
  updateSettings: (updates: Partial<ExtensionSettings>) => Promise<void>;
  resetSettings: () => Promise<void>;
}

const DEFAULT_SETTINGS: ExtensionSettings = {
  backendUrl: "http://127.0.0.1:8000",
  theme: "system",
  selectedModel: "tubemind-model-v1",
  apiKey: "",
};

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  loading: true,

  loadSettings: async () => {
    set({ loading: true });
    try {
      const stored = await chromeStorage.get<ExtensionSettings>("tubemind_settings", DEFAULT_SETTINGS);
      
      // Apply theme
      applyTheme(stored.theme);
      
      set({ settings: stored, loading: false });
      logger.debug("Settings loaded successfully:", stored);
    } catch (error) {
      logger.error("Failed to load settings from storage:", error);
      set({ loading: false });
    }
  },

  updateSettings: async (updates: Partial<ExtensionSettings>) => {
    const current = get().settings;
    const next = { ...current, ...updates };
    
    set({ settings: next });
    
    if (updates.theme) {
      applyTheme(updates.theme);
    }

    try {
      await chromeStorage.set("tubemind_settings", next);
      
      // Notify extension runtime about updated settings
      if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({ type: "SETTINGS_UPDATED", settings: next }).catch(() => {});
      }
      
      logger.debug("Settings updated:", next);
    } catch (error) {
      logger.error("Failed to persist settings:", error);
    }
  },

  resetSettings: async () => {
    set({ settings: DEFAULT_SETTINGS });
    applyTheme(DEFAULT_SETTINGS.theme);
    try {
      await chromeStorage.set("tubemind_settings", DEFAULT_SETTINGS);
      
      if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({ type: "SETTINGS_UPDATED", settings: DEFAULT_SETTINGS }).catch(() => {});
      }
      
      logger.debug("Settings reset to defaults.");
    } catch (error) {
      logger.error("Failed to reset settings:", error);
    }
  },
}));

function applyTheme(theme: "light" | "dark" | "system") {
  if (typeof document === "undefined") return;
  const root = window.document.documentElement;
  root.classList.remove("light", "dark");

  if (theme === "system") {
    const systemTheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    root.classList.add(systemTheme);
  } else {
    root.classList.add(theme);
  }
}
