import { logger } from "./logger";

/**
 * Validates whether the given URL is a standard YouTube watch page.
 * Rejects shorts, channel pages, homepage, searches, music, etc.
 */
export function isYouTubeWatchPage(urlString: string): boolean {
  try {
    if (!urlString) return false;
    const url = new URL(urlString);
    
    // Check hostname
    const host = url.hostname.toLowerCase();
    if (host !== "youtube.com" && host !== "www.youtube.com") {
      return false;
    }
    
    // Check path is exactly /watch
    if (url.pathname !== "/watch") {
      return false;
    }
    
    // Check if it has the "v" parameter
    const videoId = url.searchParams.get("v");
    if (!videoId || videoId.trim() === "") {
      return false;
    }
    
    return true;
  } catch (error) {
    logger.debug("Failed parsing url check for watch page:", urlString);
    return false;
  }
}

/**
 * Extracts the video ID from a YouTube watch URL.
 */
export function extractVideoId(urlString: string): string | null {
  try {
    if (!isYouTubeWatchPage(urlString)) return null;
    const url = new URL(urlString);
    return url.searchParams.get("v");
  } catch (error) {
    return null;
  }
}

/**
 * Seeks the active YouTube tab's video player to the specified timestamp.
 */
export function seekToTimestamp(seconds: number) {
  if (typeof chrome !== "undefined" && chrome.tabs) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs[0];
      if (activeTab && activeTab.id) {
        chrome.tabs.sendMessage(activeTab.id, {
          action: "SEEK_TO_TIMESTAMP",
          seconds: seconds,
        }, (_response) => {
          if (chrome.runtime.lastError) {
            logger.debug("Failed sending SEEK_TO_TIMESTAMP message: " + chrome.runtime.lastError.message);
          } else {
            logger.info("Successfully seeked video player to seconds: " + seconds);
          }
        });
      }
    });
  } else {
    logger.info("[Mock] Seeking YouTube player to seconds: " + seconds);
  }
}
