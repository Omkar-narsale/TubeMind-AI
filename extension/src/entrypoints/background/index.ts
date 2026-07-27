import { isYouTubeWatchPage, extractVideoId } from "../../utils/youtube";
import { logger } from "../../utils/logger";

logger.info("Background Service Worker initializing...");

// Listen for extension installation
chrome.runtime.onInstalled.addListener((details) => {
  logger.info("Extension installed / updated. Reason:", details.reason);
  
  // Set initial settings if they don't exist
  chrome.storage.sync.get(["tubemind_settings"], (result) => {
    if (!result.tubemind_settings) {
      chrome.storage.sync.set({
        tubemind_settings: {
          backendUrl: "http://127.0.0.1:8000",
          theme: "system",
          selectedModel: "tubemind-model-v1",
          apiKey: "",
        }
      });
      logger.info("Default settings initialized in sync storage.");
    }
  });
});

// Listen for browser startup
chrome.runtime.onStartup.addListener(() => {
  logger.info("Chrome started. TubeMind AI background worker awakened.");
});

// Ensure clicking the action icon opens the popup, not the side panel directly
if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: false })
    .catch((err) => logger.error("Failed to reset panel behavior:", err));
}

// Manage side panel state and enable/disable dynamically based on Tab URL changes
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // We only care about URL updates
  if (changeInfo.url) {
    const url = changeInfo.url;
    logger.debug(`Tab ${tabId} updated URL to: ${url}`);
    
    try {
      if (isYouTubeWatchPage(url)) {
        // Enable side panel for this tab
        await chrome.sidePanel.setOptions({
          tabId,
          path: "sidepanel.html",
          enabled: true
        });
        logger.debug(`Side panel enabled for Tab ${tabId}`);
        
        // Notify any open UI layers about the URL change
        const videoId = extractVideoId(url);
        chrome.runtime.sendMessage({
          type: "URL_CHANGE_DETECTED",
          tabId,
          url,
          videoId,
          title: tab.title || null
        }).catch(() => {
          // Message channels might be closed if popup/sidepanel is not open
        });
      } else {
        // Disable side panel for other tabs
        await chrome.sidePanel.setOptions({
          tabId,
          enabled: false
        });
        logger.debug(`Side panel disabled for Tab ${tabId}`);
      }
    } catch (err) {
      logger.error("Error setting side panel options on URL change:", err);
    }
  }
});

// Listen for message requests from popup, side panel, or content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  logger.debug("Runtime message received in service worker:", message);
  
  // Handle content script announcing a detected YouTube video
  if (message.type === "YOUTUBE_VIDEO_DETECTED") {
    const tabId = sender.tab?.id;
    if (tabId) {
      logger.info(`YouTube watch page announced in tab ${tabId}. VideoID: ${message.videoId}`);
      // Configure sidepanel options
      chrome.sidePanel.setOptions({
        tabId,
        path: "sidepanel.html",
        enabled: true
      }).catch((err) => logger.error("Failed to enable side panel on announcement:", err));
    }
  }
  
  // Handle requests to open the side panel programmatically
  if (message.type === "TRIGGER_SIDE_PANEL_OPEN") {
    const tabId = message.tabId || sender.tab?.id;
    if (tabId) {
      chrome.sidePanel.open({ tabId })
        .then(() => {
          logger.info(`Side panel opened for tab ${tabId}`);
          sendResponse({ success: true });
        })
        .catch((err) => {
          logger.error("Failed to open side panel:", err);
          sendResponse({ success: false, error: String(err) });
        });
      return true; // Asynchronous reply
    }
  }
  
  // Generic PING-PONG validation check
  if (message.type === "PING") {
    sendResponse({ type: "PONG" });
  }
  
  return true;
});
