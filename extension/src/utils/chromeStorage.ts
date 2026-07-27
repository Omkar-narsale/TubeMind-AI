import { logger } from "./logger";

export const chromeStorage = {
  get: async <T>(key: string, defaultValue: T): Promise<T> => {
    try {
      if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.sync) {
        return new Promise((resolve) => {
          chrome.storage.sync.get([key], (result) => {
            if (result[key] !== undefined) {
              resolve(result[key] as T);
            } else {
              resolve(defaultValue);
            }
          });
        });
      } else {
        // Dev server / fallback mode
        const item = localStorage.getItem(key);
        if (item !== null) {
          return JSON.parse(item) as T;
        }
        return defaultValue;
      }
    } catch (error) {
      logger.error("Failed to read storage key:", key, error);
      return defaultValue;
    }
  },

  set: async <T>(key: string, value: T): Promise<boolean> => {
    try {
      if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.sync) {
        return new Promise((resolve) => {
          chrome.storage.sync.set({ [key]: value }, () => {
            if (chrome.runtime.lastError) {
              logger.error("Chrome storage sync error:", chrome.runtime.lastError);
              resolve(false);
            } else {
              resolve(true);
            }
          });
        });
      } else {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
      }
    } catch (error) {
      logger.error("Failed to write storage key:", key, error);
      return false;
    }
  },

  remove: async (key: string): Promise<boolean> => {
    try {
      if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.sync) {
        return new Promise((resolve) => {
          chrome.storage.sync.remove([key], () => {
            resolve(true);
          });
        });
      } else {
        localStorage.removeItem(key);
        return true;
      }
    } catch (error) {
      logger.error("Failed to remove storage key:", key, error);
      return false;
    }
  },
};
