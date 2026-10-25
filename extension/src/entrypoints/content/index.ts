import { isYouTubeWatchPage, extractVideoId } from "../../utils/youtube";
import { logger } from "../../utils/logger";

logger.info("Content script running on youtube.com domain.");

function getYouTubeVideoDetails() {
  const url = window.location.href;
  
  if (!isYouTubeWatchPage(url)) {
    return null;
  }
  
  const videoId = extractVideoId(url);
  // Retrieve video title from YouTube's player metadata or document header
  const titleElement = document.querySelector("#container h1.ytd-watch-metadata") || 
                       document.querySelector("h1.title.style-scope.ytd-video-primary-info-renderer") ||
                       document.querySelector("meta[name='title']");
                       
  let title = document.title;
  if (titleElement) {
    if (titleElement.tagName === "META") {
      title = (titleElement as HTMLMetaElement).content;
    } else {
      title = (titleElement as HTMLElement).innerText;
    }
  }

  return {
    url,
    videoId,
    title: title ? title.replace(" - YouTube", "").trim() : null
  };
}

function checkAndReport() {
  const details = getYouTubeVideoDetails();
  if (details && details.videoId) {
    logger.info("YouTube watch page detected with video id:", details.videoId);
    chrome.runtime.sendMessage({
      type: "YOUTUBE_VIDEO_DETECTED",
      url: details.url,
      videoId: details.videoId,
      title: details.title
    }).catch(() => {
      // Message port might not be open yet
    });
  }
}

// Listen for messages from background script or popup
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  logger.debug("Content script received message:", message);
  
  if (message.action === "GET_CURRENT_VIDEO_DETAILS") {
    const details = getYouTubeVideoDetails();
    sendResponse(details);
  } else if (message.action === "SEEK_TO_TIMESTAMP") {
    const video = document.querySelector("video");
    if (video) {
      video.currentTime = message.seconds;
      video.play().catch(() => {});
      sendResponse({ success: true });
    } else {
      sendResponse({ success: false, error: "Video element not found" });
    }
  } else if (message.action === "GET_CURRENT_TIME") {
    const video = document.querySelector("video");
    if (video) {
      sendResponse({ success: true, currentTime: video.currentTime || 0 });
    } else {
      sendResponse({ success: false, currentTime: 0, error: "Video element not found" });
    }
  }
  return true;
});

// Run immediate check
checkAndReport();

// Handle client-side SPA navigation changes on YouTube (e.g. clicking another thumbnail)
let lastUrl = window.location.href;
const observer = new MutationObserver(() => {
  const currentUrl = window.location.href;
  if (currentUrl !== lastUrl) {
    lastUrl = currentUrl;
    logger.debug("SPA URL navigation detected:", currentUrl);
    checkAndReport();
  }
});
observer.observe(document, { subtree: true, childList: true });
