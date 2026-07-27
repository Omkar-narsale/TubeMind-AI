import { create } from "zustand";
import { VideoInfo } from "@/types";
import { logger } from "@/utils/logger";

interface VideoState {
  currentVideo: VideoInfo;
  setVideoInfo: (info: Partial<VideoInfo>) => void;
  resetVideoInfo: () => void;
}

const EMPTY_VIDEO: VideoInfo = {
  videoId: null,
  url: "",
  title: null,
  isValid: false,
};

export const useVideoStore = create<VideoState>((set) => ({
  currentVideo: EMPTY_VIDEO,

  setVideoInfo: (info: Partial<VideoInfo>) => {
    set((state) => {
      const next = { ...state.currentVideo, ...info };
      logger.debug("Video store updated:", next);
      return { currentVideo: next };
    });
  },

  resetVideoInfo: () => {
    set({ currentVideo: EMPTY_VIDEO });
    logger.debug("Video store reset.");
  },
}));
export default useVideoStore;
