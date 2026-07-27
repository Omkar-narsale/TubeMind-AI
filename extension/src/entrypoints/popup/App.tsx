import { useEffect } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useSettingsStore } from "@/stores/settingsStore";
import { useConnectionStore } from "@/stores/connectionStore";
import { useVideoStore } from "@/stores/videoStore";
import { isYouTubeWatchPage, extractVideoId } from "@/utils/youtube";
import { Settings, Youtube, RefreshCw, Layers, Radio } from "lucide-react";

export function App() {
  const { loadSettings } = useSettingsStore();
  const { status: connectionStatus, checkHealth } = useConnectionStore();
  const { currentVideo, setVideoInfo, resetVideoInfo } = useVideoStore();

  // Load configuration and query active tab
  useEffect(() => {
    initializeState();
  }, []);

  const initializeState = async () => {
    // 1. Load sync settings
    await loadSettings();
    const currentBackendUrl = useSettingsStore.getState().settings.backendUrl;

    // 2. Perform connection health check
    await checkHealth(currentBackendUrl);

    // 3. Inspect current tab
    if (typeof chrome !== "undefined" && chrome.tabs && chrome.tabs.query) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const activeTab = tabs[0];
        if (activeTab && activeTab.url) {
          const url = activeTab.url;
          if (isYouTubeWatchPage(url)) {
            const videoId = extractVideoId(url);
            setVideoInfo({
              videoId,
              url,
              title: activeTab.title || "YouTube Video",
              isValid: true,
            });
          } else {
            resetVideoInfo();
          }
        }
      });
    } else {
      // Mock Sandbox Environment
      setVideoInfo({
        videoId: "mock_id",
        url: "https://www.youtube.com/watch?v=mock_id",
        title: "Mock Architecture Workspace Video",
        isValid: true,
      });
    }
  };

  const handleOpenSidePanel = () => {
    if (typeof chrome !== "undefined" && chrome.tabs && chrome.runtime) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const activeTab = tabs[0];
        if (activeTab && activeTab.id) {
          // Send request to background script to open sidepanel
          chrome.runtime.sendMessage({
            type: "TRIGGER_SIDE_PANEL_OPEN",
            tabId: activeTab.id
          }).catch(() => {
            // Fallback: alert
            alert("Please activate the side panel through Chrome's toolbar or sidebar icons.");
          });
        }
      });
    } else {
      alert("Side Panel operations are only fully supported inside Chrome.");
    }
  };

  const handleOpenSettings = () => {
    if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    } else {
      alert("Options page redirection requires Extension runtime context.");
    }
  };

  const handleReloadState = () => {
    initializeState();
  };

  return (
    <div className="w-[380px] min-h-[480px] bg-slate-950 text-slate-100 flex flex-col justify-between font-sans selection:bg-primary selection:text-primary-foreground p-4">
      
      {/* Top Header */}
      <header className="flex items-center justify-between pb-3 border-b border-slate-900">
        <div className="flex items-center space-x-2.5">
          {/* Extension Logo wrapper */}
          <div className="bg-gradient-to-tr from-primary to-blue-500 p-2 rounded-xl shadow-lg shadow-primary/20">
            <Radio className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="font-extrabold text-sm tracking-wide text-white leading-none">
              TubeMind <span className="text-primary">AI</span>
            </h1>
            <p className="text-[10px] text-slate-500 font-medium">Manifest V3 Extension</p>
          </div>
        </div>

        <Button
          onClick={handleReloadState}
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-slate-400 hover:text-white hover:bg-slate-900 rounded-lg transition-all duration-200"
          title="Reload Extension State"
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
      </header>

      {/* Main Content Body */}
      <main className="flex-1 py-4 space-y-4">
        
        {/* Connection Status Badge Container */}
        <div className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-slate-900/60 border border-slate-900 text-xs">
          <span className="text-slate-400 font-semibold flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-primary animate-ping" />
            Backend Connection
          </span>
          {connectionStatus === "checking" && (
            <span className="text-slate-500 font-bold animate-pulse">Checking status...</span>
          )}
          {connectionStatus === "connected" && (
            <span className="text-emerald-400 font-extrabold flex items-center gap-1">
              🟢 Connected
            </span>
          )}
          {connectionStatus === "offline" && (
            <span className="text-red-500 font-extrabold flex items-center gap-1">
              🔴 Offline
            </span>
          )}
        </div>

        {/* Youtube Detection Card */}
        <Card className="bg-slate-900/40 border-slate-900 text-slate-100 shadow-inner">
          <CardHeader className="p-4 pb-2">
            <CardDescription className="text-[10px] uppercase font-extrabold tracking-wider text-primary">
              Target Page Status
            </CardDescription>
            <CardTitle className="text-xs font-bold text-white pt-0.5">
              {currentVideo.isValid ? "YouTube Watch Page Detected" : "Unsupported Page Location"}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 text-xs">
            {currentVideo.isValid ? (
              <div className="space-y-2">
                <div className="flex items-start gap-2 bg-slate-950/60 p-2.5 rounded-lg border border-slate-900/80">
                  <Youtube className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <p className="font-semibold text-slate-200 line-clamp-2 leading-relaxed">
                      {currentVideo.title || "No Title Available"}
                    </p>
                    <p className="text-[10px] font-mono text-slate-500">ID: {currentVideo.videoId}</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-4 text-slate-500 space-y-1.5">
                <p>Please open a YouTube watch page to load details.</p>
                <p className="text-[10px] text-slate-600">e.g., youtube.com/watch?v=...</p>
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      {/* Footer Controls Area */}
      <footer className="space-y-2 pt-3 border-t border-slate-900">
        <Button
          onClick={handleOpenSidePanel}
          className="w-full bg-primary hover:bg-primary/90 text-white font-bold text-xs py-2 rounded-xl transition-all duration-200"
          disabled={!currentVideo.isValid}
        >
          <Layers className="h-4 w-4 mr-2" /> Open AI Side Panel
        </Button>
        <Button
          onClick={handleOpenSettings}
          variant="outline"
          className="w-full border-slate-900 text-slate-300 hover:bg-slate-900 hover:text-white text-xs font-semibold py-2 rounded-xl transition-all duration-200"
        >
          <Settings className="h-4 w-4 mr-2" /> Extension Settings
        </Button>
      </footer>
    </div>
  );
}

export default App;
