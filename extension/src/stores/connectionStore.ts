import { create } from "zustand";
import { BackendStatus } from "@/types";
import { logger } from "@/utils/logger";

interface ConnectionState {
  status: BackendStatus;
  lastChecked: number;
  checkHealth: (backendUrl: string) => Promise<BackendStatus>;
}

export const useConnectionStore = create<ConnectionState>((set) => ({
  status: "checking",
  lastChecked: 0,

  checkHealth: async (backendUrl: string) => {
    set({ status: "checking" });
    const checkUrl = `${backendUrl}/health`;
    
    try {
      logger.debug("Checking API health at:", checkUrl);
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 3500); // 3.5s timeout

      const response = await fetch(checkUrl, {
        signal: controller.signal,
        headers: { "Content-Type": "application/json" }
      });
      clearTimeout(id);

      const data = await response.json();
      if (response.ok && data.success && data.status === "healthy") {
        set({ status: "connected", lastChecked: Date.now() });
        return "connected";
      } else {
        set({ status: "offline", lastChecked: Date.now() });
        return "offline";
      }
    } catch (error) {
      logger.warn("Backend health check failed at url:", checkUrl, error);
      set({ status: "offline", lastChecked: Date.now() });
      return "offline";
    }
  },
}));
export default useConnectionStore;
