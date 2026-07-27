import { useEffect, useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Loading } from "@/components/Loading";
import { useSettingsStore } from "@/stores/settingsStore";
import { useConnectionStore } from "@/stores/connectionStore";
import { useVideoStore } from "@/stores/videoStore";
import { useTranscriptStore } from "@/stores/transcriptStore";
import { useRAGStore } from "@/stores/ragStore";
import { isYouTubeWatchPage, extractVideoId, seekToTimestamp } from "@/utils/youtube";
import { formatTimestamp } from "@/utils/format";
import { youtubeService, VideoMetadata } from "@/services/api";
import { Settings, Youtube, Send, Radio, User, Bot, AlertTriangle, FileText, Trash2, Sliders, Copy, Check, RotateCcw } from "lucide-react";
import { useChatStore } from "@/stores/chatStore";
import { useLearningStore } from "@/stores/learningStore";

function parseTimestampToSeconds(ts: string): number {
  const parts = ts.split(":").map(Number);
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  return 0;
}

interface MarkdownRendererProps {
  content: string;
}

function MarkdownRenderer({ content }: MarkdownRendererProps) {
  if (!content) return null;

  const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g;
  const parts = [];
  let lastIndex = 0;
  let match;

  while ((match = codeBlockRegex.exec(content)) !== null) {
    const textBefore = content.substring(lastIndex, match.index);
    if (textBefore) {
      parts.push({ type: "text", content: textBefore });
    }
    parts.push({
      type: "code",
      language: match[1] || "text",
      content: match[2],
    });
    lastIndex = codeBlockRegex.lastIndex;
  }
  const textAfter = content.substring(lastIndex);
  if (textAfter) {
    parts.push({ type: "text", content: textAfter });
  }

  return (
    <div className="space-y-2.5 text-xs text-slate-200">
      {parts.map((part, index) => {
        if (part.type === "code") {
          return (
            <pre key={index} className="bg-slate-950 p-3 rounded-xl border border-slate-900 overflow-x-auto text-[11px] font-mono leading-relaxed select-text my-2 text-emerald-400">
              <code>{part.content.trim()}</code>
            </pre>
          );
        } else {
          const lines = part.content.split("\n");
          return (
            <div key={index} className="space-y-1.5 leading-relaxed">
              {lines.map((line, lineIdx) => {
                const cleanLine = line.trim();
                if (!cleanLine) return null;

                const bulletMatch = cleanLine.match(/^[-*+]\s+(.*)/);
                if (bulletMatch) {
                  return (
                    <ul key={lineIdx} className="list-disc pl-4 space-y-1 my-1">
                      <li>{renderInlineText(bulletMatch[1])}</li>
                    </ul>
                  );
                }

                const headerMatch = cleanLine.match(/^(#{1,6})\s+(.*)/);
                if (headerMatch) {
                  const level = headerMatch[1].length;
                  const headerText = headerMatch[2];
                  const classes = level === 1 ? "text-sm font-bold mt-2 text-white border-b border-slate-800 pb-1" 
                                : level === 2 ? "text-xs font-bold mt-2 text-white"
                                : "text-xs font-semibold mt-1 text-slate-300";
                  return <div key={lineIdx} className={classes}>{renderInlineText(headerText)}</div>;
                }

                return <p key={lineIdx} className="mb-1">{renderInlineText(line)}</p>;
              })}
            </div>
          );
        }
      })}
    </div>
  );
}

function renderInlineText(text: string) {
  const regex = /\[(\d{1,2}:\d{2}(?::\d{2})?)\]|`([^`]+)`|\*\*([^*]+)\*\*/g;
  const parts: (string | React.ReactNode)[] = [];
  let lastIndex = 0;
  let match;
  
  while ((match = regex.exec(text)) !== null) {
    const textBefore = text.substring(lastIndex, match.index);
    if (textBefore) {
      parts.push(textBefore);
    }

    if (match[1]) {
      const ts = match[1];
      const seconds = parseTimestampToSeconds(ts);
      parts.push(
        <button
          key={match.index}
          onClick={() => seekToTimestamp(seconds)}
          className="inline-flex items-center px-1.5 py-0.5 rounded bg-primary/20 hover:bg-primary/45 border border-primary/30 text-primary font-mono text-[10px] font-bold mx-0.5 transition-colors cursor-pointer"
          title={`Seek to ${ts}`}
        >
          {ts}
        </button>
      );
    } else if (match[2]) {
      parts.push(
        <code key={match.index} className="bg-slate-950 px-1.5 py-0.5 rounded text-emerald-400 font-mono text-[10px] border border-slate-900">
          {match[2]}
        </code>
      );
    } else if (match[3]) {
      parts.push(
        <strong key={match.index} className="font-bold text-white">
          {match[3]}
        </strong>
      );
    }

    lastIndex = regex.lastIndex;
  }

  const textAfter = text.substring(lastIndex);
  if (textAfter) {
    parts.push(textAfter);
  }

  return <>{parts.length > 0 ? parts : text}</>;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  
  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className="text-slate-500 hover:text-slate-300 transition-colors p-1 rounded hover:bg-slate-950 ml-auto shrink-0 self-start"
      title="Copy response"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-400 animate-in fade-in" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

export function App() {
  const { loadSettings } = useSettingsStore();
  const { status: connectionStatus, checkHealth } = useConnectionStore();
  const { currentVideo, setVideoInfo, resetVideoInfo } = useVideoStore();
  
  // Zustand Transcript Store
  const {
    loading: loadingTranscript,
    error: transcriptError,
    segments,
    language,
    generated,
    segmentCount,
    fetchTranscript,
    clearTranscript
  } = useTranscriptStore();

  // Zustand RAG Store
  const {
    clearResults: clearRAG
  } = useRAGStore();

  // Zustand Chat Store
  const {
    loading: chatLoading,
    streaming: chatStreaming,
    messages: chatMessagesMap,
    temperature,
    maxTokens,
    streamingEnabled,
    error: chatError,
    sendMessage,
    retryMessage,
    clearChat,
    setTemperature,
    setMaxTokens,
    setStreamingEnabled,
  } = useChatStore();

  const [loadingMetadata, setLoadingMetadata] = useState(false);
  const [metadata, setMetadata] = useState<VideoMetadata | null>(null);
  const [inputText, setInputText] = useState("");
  const [tabError, setTabError] = useState<string | null>(null);
  const [showLLMSettings, setShowLLMSettings] = useState(false);
  
  // Learning features state & store
  const [activeTab, setActiveTab] = useState<"chat" | "summary" | "notes" | "takeaways">("chat");
  const [summaryType, setSummaryType] = useState<"short" | "detailed" | "bullet">("short");

  const {
    summary,
    studyNotes,
    takeaways,
    loadingSummary,
    loadingNotes,
    loadingTakeaways,
    errorSummary,
    errorNotes,
    errorTakeaways,
    generateSummary,
    generateStudyNotes,
    generateTakeaways,
  } = useLearningStore();

  const activeVideoId = currentVideo.videoId || "";
  const currentVideoMessages = activeVideoId ? (chatMessagesMap[activeVideoId] || []) : [];
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Auto-generate active tab data if not already cached
  useEffect(() => {
    if (currentVideo.videoId) {
      if (activeTab === "summary") {
        generateSummary(currentVideo.videoId, summaryType);
      } else if (activeTab === "notes") {
        generateStudyNotes(currentVideo.videoId);
      } else if (activeTab === "takeaways") {
        generateTakeaways(currentVideo.videoId);
      }
    }
  }, [activeTab, currentVideo.videoId, summaryType]);

  // Sync state and check connection
  useEffect(() => {
    const init = async () => {
      await loadSettings();
      const currentUrl = useSettingsStore.getState().settings.backendUrl;
      await checkHealth(currentUrl);
    };
    init();
  }, []);

  // Monitor Youtube tab changes
  useEffect(() => {
    const fetchActiveDetails = () => {
      if (typeof chrome !== "undefined" && chrome.tabs) {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          const activeTab = tabs[0];
          if (activeTab && activeTab.url) {
            const url = activeTab.url;
            if (isYouTubeWatchPage(url)) {
              setTabError(null);
              const videoId = extractVideoId(url);
              setVideoInfo({
                videoId,
                url,
                title: activeTab.title || "YouTube Video",
                isValid: true,
              });
            } else {
              setTabError("Please navigate to a YouTube video watch page to start interacting.");
              resetVideoInfo();
              clearTranscript();
              clearRAG();
            }
          }
        });
      } else {
        // Dev Mock Setup
        setVideoInfo({
          videoId: "mock_id_123",
          url: "https://www.youtube.com/watch?v=mock_id_123",
          title: "Mock Architecture Workspace Video",
          isValid: true,
        });
      }
    };

    fetchActiveDetails();

    const listener = (message: any) => {
      if (message.type === "URL_CHANGE_DETECTED" || message.type === "YOUTUBE_VIDEO_DETECTED") {
        if (message.videoId) {
          setTabError(null);
          setVideoInfo({
            videoId: message.videoId,
            url: message.url,
            title: message.title || "YouTube Video",
            isValid: true,
          });
        } else {
          setTabError("Please navigate to a YouTube video watch page to start interacting.");
          resetVideoInfo();
          clearTranscript();
          clearRAG();
        }
      }
    };

    if (typeof chrome !== "undefined" && chrome.runtime) {
      chrome.runtime.onMessage.addListener(listener);
      return () => chrome.runtime.onMessage.removeListener(listener);
    }
    return () => {};
  }, []);

  // Fetch Metadata & Transcript when video ID changes
  useEffect(() => {
    if (!currentVideo.videoId) {
      setMetadata(null);
      clearTranscript();
      clearRAG();
      return;
    }

    const loadVideoAssets = async () => {
      setLoadingMetadata(true);
      try {
        const meta = await youtubeService.getVideoMetadata(currentVideo.url);
        setMetadata(meta);
      } catch (err) {
        // Ignored or handled gracefully
      } finally {
        setLoadingMetadata(false);
      }

      // Fetch transcript using Zustand store
      fetchTranscript(currentVideo.videoId!);
    };

    loadVideoAssets();
  }, [currentVideo.videoId]);

  // Auto scroll chat list on updates
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [currentVideoMessages, chatLoading, chatStreaming]);

  const handleSendMessage = async () => {
    const queryText = inputText.trim();
    if (!queryText || !currentVideo.videoId) return;

    setInputText("");
    await sendMessage(currentVideo.videoId, queryText);
  };

  const handleOpenSettings = () => {
    if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    }
  };

  // Slice first 15 segments for preview
  const previewSegments = segments.slice(0, 15);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans max-h-screen select-none">
      
      {/* Side Panel Header */}
      <header className="px-4 py-3 border-b border-slate-900 bg-slate-900/40 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center space-x-2">
          <div className="bg-gradient-to-tr from-primary to-blue-500 p-1.5 rounded-lg shadow-md">
            <Radio className="h-4 w-4 text-white" />
          </div>
          <span className="font-extrabold text-sm tracking-wider text-white">
            TubeMind <span className="text-primary font-black">AI</span>
          </span>
        </div>
        
        <div className="flex items-center space-x-1.5">
          {connectionStatus === "connected" ? (
            <span className="text-[10px] text-emerald-400 bg-emerald-950/30 border border-emerald-900/50 px-2 py-0.5 rounded-full font-bold mr-1">
              🟢 Connected
            </span>
          ) : (
            <span className="text-[10px] text-red-500 bg-red-950/30 border border-red-900/50 px-2 py-0.5 rounded-full font-bold mr-1">
              🔴 Offline
            </span>
          )}

          {currentVideo.videoId && (
            <>
              <Button
                onClick={() => setShowLLMSettings(!showLLMSettings)}
                variant="ghost"
                size="icon"
                className={`h-8 w-8 rounded-lg transition-colors ${
                  showLLMSettings ? "text-primary bg-slate-900" : "text-slate-400 hover:text-white hover:bg-slate-900"
                }`}
                title="AI Settings"
              >
                <Sliders className="h-4 w-4" />
              </Button>
              
              <Button
                onClick={() => currentVideo.videoId && clearChat(currentVideo.videoId)}
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-slate-400 hover:text-red-400 hover:bg-slate-900 rounded-lg"
                title="Clear Chat"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </>
          )}
          
          <Button
            onClick={handleOpenSettings}
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-slate-400 hover:text-white hover:bg-slate-900 rounded-lg"
            title="System Settings"
          >
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {/* LLM Configuration Panel */}
      {showLLMSettings && currentVideo.videoId && (
        <div className="bg-slate-900/95 border-b border-slate-800 p-4 space-y-3 animate-in slide-in-from-top duration-200">
          <h4 className="text-xs font-bold text-slate-200 flex items-center gap-1.5 uppercase tracking-wider">
            <Sliders className="h-3.5 w-3.5 text-primary" />
            <span>AI Tutor Configuration</span>
          </h4>
          
          <div className="space-y-2">
            <div className="flex justify-between text-[10px]">
              <span className="text-slate-400">Temperature</span>
              <span className="font-mono text-primary font-bold">{temperature}</span>
            </div>
            <input
              type="range"
              min="0.0"
              max="1.0"
              step="0.1"
              value={temperature}
              onChange={(e) => setTemperature(parseFloat(e.target.value))}
              className="w-full h-1 bg-slate-950 rounded-lg appearance-none cursor-pointer accent-primary"
            />
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-[10px]">
              <span className="text-slate-400">Max Tokens</span>
              <span className="font-mono text-primary font-bold">{maxTokens}</span>
            </div>
            <input
              type="range"
              min="256"
              max="2048"
              step="128"
              value={maxTokens}
              onChange={(e) => setMaxTokens(parseInt(e.target.value))}
              className="w-full h-1 bg-slate-950 rounded-lg appearance-none cursor-pointer accent-primary"
            />
          </div>

          <div className="flex items-center justify-between pt-1">
            <span className="text-[10px] text-slate-400">Enable Streaming</span>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={streamingEnabled}
                onChange={(e) => setStreamingEnabled(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-8 h-4 bg-slate-950 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-400 peer-checked:after:bg-primary after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3.5 after:transition-all peer-checked:bg-primary/20"></div>
            </label>
          </div>
        </div>
      )}

      {/* Main Panel Viewport */}
      <main className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {tabError ? (
          /* Error State - Non YouTube watch URL */
          <div className="flex-1 p-6 flex flex-col items-center justify-center text-center space-y-4">
            <AlertTriangle className="h-12 w-12 text-amber-500" />
            <h3 className="font-bold text-sm text-slate-200">YouTube Watch Page Required</h3>
            <p className="text-xs text-slate-400 max-w-xs leading-relaxed">
              {tabError}
            </p>
          </div>
        ) : currentVideo.isValid ? (
          <div className="flex-1 flex flex-col min-h-0">
            {/* Tab Navigation */}
            <div className="flex border-b border-slate-900 bg-slate-950 px-2 pt-1 shrink-0 gap-1">
              {(["chat", "summary", "notes", "takeaways"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`flex-1 py-2 text-[10px] font-bold uppercase tracking-wider rounded-t-lg border-b-2 transition-all ${
                    activeTab === tab
                      ? "text-primary border-primary bg-slate-900/50"
                      : "text-slate-500 border-transparent hover:text-slate-300"
                  }`}
                >
                  {tab === "notes" ? "Study Notes" : tab === "takeaways" ? "Takeaways" : tab}
                </button>
              ))}
            </div>

            {/* Scrollable Context Box */}
            <div className="flex-1 overflow-y-auto min-h-0 p-4 space-y-4 scrollbar-thin">
              
              {activeTab === "chat" && (
                <>
                  {/* Video Info Card */}
                  <div className="bg-slate-900/40 border border-slate-900 rounded-2xl p-4 space-y-3">
                    <div className="flex items-start gap-2.5">
                      <Youtube className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
                      <div className="space-y-1 min-w-0">
                        <span className="text-[9px] uppercase font-bold text-slate-500">Video Title</span>
                        <h3 className="text-xs font-bold text-slate-200 leading-snug line-clamp-2">
                          {loadingMetadata ? "Loading title..." : (metadata?.title || currentVideo.title)}
                        </h3>
                      </div>
                    </div>

                    {/* Grid Details */}
                    <div className="grid grid-cols-2 gap-3 pt-2.5 border-t border-slate-950 text-[10px] text-slate-400">
                      <div className="space-y-0.5">
                        <span className="text-slate-500 block">Transcript Status</span>
                        {loadingTranscript ? (
                          <span className="text-primary animate-pulse font-bold">Loading...</span>
                        ) : transcriptError ? (
                          <span className="text-red-500 font-bold">Transcript Unavailable</span>
                        ) : (
                          <span className="text-emerald-400 font-bold">Transcript Loaded</span>
                        )}
                      </div>
                      <div className="space-y-0.5">
                        <span className="text-slate-500 block">Language</span>
                        <span className="font-semibold text-slate-200 uppercase">
                          {loadingTranscript ? "..." : (language || "N/A")}
                        </span>
                      </div>
                      <div className="space-y-0.5">
                        <span className="text-slate-500 block">Caption Type</span>
                        <span className="font-semibold text-slate-200">
                          {loadingTranscript ? "..." : (segmentCount === 0 ? "N/A" : (generated ? "Auto-Generated" : "Official"))}
                        </span>
                      </div>
                      <div className="space-y-0.5">
                        <span className="text-slate-500 block">Segment Count</span>
                        <span className="font-semibold text-slate-200">
                          {loadingTranscript ? "..." : segmentCount}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Transcript Preview Section (Only show if no chat messages yet) */}
                  {currentVideoMessages.length === 0 && (
                    <div className="bg-slate-900/40 border border-slate-900 rounded-2xl flex flex-col min-h-[220px]">
                      <div className="p-3 border-b border-slate-950 flex items-center gap-2">
                        <FileText className="h-4 w-4 text-primary" />
                        <span className="text-[10px] uppercase font-extrabold text-slate-300">Transcript Preview (First 15)</span>
                      </div>
                      
                      <div className="p-3 flex-1 overflow-y-auto max-h-[250px] space-y-3">
                        {loadingTranscript ? (
                          <div className="h-full flex items-center justify-center py-10">
                            <Loading variant="spinner" message="Analyzing YouTube track..." />
                          </div>
                        ) : transcriptError ? (
                          <div className="text-center py-10 space-y-2">
                            <AlertTriangle className="h-7 w-7 text-amber-500 mx-auto" />
                            <p className="text-[11px] text-slate-400">{transcriptError}</p>
                          </div>
                        ) : previewSegments.length > 0 ? (
                          <div className="space-y-3">
                            {previewSegments.map((segment, index) => (
                              <div
                                key={index}
                                className="group flex gap-3 text-xs p-2 rounded-xl hover:bg-slate-900/60 transition-colors"
                              >
                                <span className="text-primary font-mono font-bold select-none shrink-0 w-10">
                                  {formatTimestamp(segment.start)}
                                </span>
                                <p className="text-slate-300 leading-relaxed group-hover:text-white transition-colors">
                                  {segment.text}
                                </p>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-[11px] text-slate-500 text-center py-10">No transcript segments available.</p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Chat Board Area */}
                  {currentVideoMessages.length > 0 && (
                    <div className="space-y-6">
                      {currentVideoMessages.map((msg, idx) => {
                        const isLast = idx === currentVideoMessages.length - 1;
                        return (
                          <div
                            key={msg.id}
                            className={`flex gap-3 items-start transition-all duration-300 animate-in fade-in slide-in-from-bottom-2 ${
                              msg.sender === "user" ? "flex-row-reverse" : ""
                            }`}
                          >
                            <div className={`h-8 w-8 rounded-full shrink-0 flex items-center justify-center text-white border shadow-sm transition-transform hover:scale-105 ${
                              msg.sender === "user" 
                                ? "bg-blue-600/10 border-blue-500/30 text-blue-400" 
                                : "bg-slate-900 border-slate-800 text-primary"
                            }`}>
                              {msg.sender === "user" ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                            </div>
                            
                            {msg.sender === "user" ? (
                              <div className="flex flex-col items-end gap-1.5 max-w-[80%]">
                                <div className="p-3.5 rounded-2xl text-xs leading-relaxed bg-blue-600 text-white rounded-tr-none shadow-md border border-blue-500/20">
                                  <p className="whitespace-pre-wrap">{msg.text}</p>
                                </div>
                                <span className="text-[9px] text-slate-500 font-mono px-1">
                                  {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              </div>
                            ) : (
                              /* Assistant response area (AI Response with Markdown support) */
                              <div className="flex flex-col gap-1.5 max-w-[80%] w-full">
                                <div className="p-3.5 rounded-2xl text-xs leading-relaxed bg-slate-900 border border-slate-800/80 rounded-tl-none text-slate-100 w-full space-y-3 relative group/msg shadow-sm hover:shadow-md transition-shadow">
                                  <div className="flex justify-between items-start gap-2">
                                    <div className="flex-1 min-w-0">
                                      <MarkdownRenderer content={msg.text} />
                                      {chatStreaming && isLast && (
                                        <span className="inline-block w-1.5 h-3 bg-primary ml-1 animate-pulse" />
                                      )}
                                    </div>
                                    <CopyButton text={msg.text} />
                                  </div>
                                  
                                  {/* Metadata and Citations details */}
                                  {msg.context && msg.context.length > 0 && (
                                    <div className="pt-2.5 border-t border-slate-800/80 space-y-2">
                                      <span className="text-[9px] uppercase font-bold text-slate-400 block tracking-wider">Source Citations</span>
                                      <div className="flex flex-wrap gap-1.5">
                                        {msg.context.map((cite) => (
                                          <button
                                            key={cite.chunk_index}
                                            onClick={() => seekToTimestamp(cite.start)}
                                            className="text-[9px] px-2 py-0.5 rounded-md bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800/60 font-mono transition-all hover:scale-105 active:scale-95"
                                            title={cite.text}
                                          >
                                            [{cite.chunk_index}] {formatTimestamp(cite.start)}
                                          </button>
                                        ))}
                                      </div>
                                    </div>
                                  )}

                                  {msg.metadata && (
                                    <div className="pt-2 text-[9px] text-slate-500 flex justify-between font-mono border-t border-slate-800/40">
                                      <span>Model: {msg.metadata.model_name}</span>
                                      <span>Time: {msg.metadata.response_time}s</span>
                                    </div>
                                  )}
                                </div>
                                <span className="text-[9px] text-slate-500 font-mono px-1">
                                  {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                      
                      {/* Streaming/Loading Indicator */}
                      {chatLoading && (
                        <div className="flex gap-3 animate-pulse">
                          <div className="h-8 w-8 rounded-full bg-slate-900 border border-slate-800 shrink-0 flex items-center justify-center text-primary">
                            <Bot className="h-4 w-4" />
                          </div>
                          <div className="bg-slate-900 border border-slate-800/80 rounded-2xl rounded-tl-none p-3.5 max-w-[80%] w-full shadow-sm">
                            <div className="flex space-x-2 items-center justify-start py-1">
                              <div className="h-1.5 w-1.5 bg-primary rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                              <div className="h-1.5 w-1.5 bg-primary rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                              <div className="h-1.5 w-1.5 bg-primary rounded-full animate-bounce"></div>
                              <span className="text-[10px] text-slate-400 ml-1.5 font-medium">Tutor is searching & thinking...</span>
                            </div>
                          </div>
                        </div>
                      )}

                      {chatError && (
                        <div className="space-y-2 max-w-[80%] mx-auto py-2 animate-in fade-in zoom-in-95">
                          <div className="p-3.5 rounded-xl bg-red-950/20 border border-red-900/50 text-red-400 text-xs flex gap-2.5 items-center">
                            <AlertTriangle className="h-4 w-4 shrink-0" />
                            <span>{chatError}</span>
                          </div>
                          <div className="flex justify-center">
                            <Button
                              onClick={() => currentVideo.videoId && retryMessage(currentVideo.videoId)}
                              variant="outline"
                              size="sm"
                              className="text-[10px] h-8 border-slate-800 hover:bg-slate-900 hover:text-white text-slate-300 flex items-center gap-1.5 rounded-lg shadow-sm transition-transform active:scale-95"
                            >
                              <RotateCcw className="h-3 w-3" />
                              Retry Last Query
                            </Button>
                          </div>
                        </div>
                      )}

                      <div ref={chatEndRef} />
                    </div>
                  )}
                </>
              )}

              {activeTab === "summary" && activeVideoId && (
                <div className="space-y-4 animate-in fade-in duration-200">
                  <div className="flex gap-2">
                    {(["short", "detailed", "bullet"] as const).map((type) => (
                      <button
                        key={type}
                        onClick={() => setSummaryType(type)}
                        disabled={loadingSummary}
                        className={`flex-1 py-1.5 rounded-xl border text-[10px] transition-all ${
                          summaryType === type
                            ? "bg-white border-slate-200 text-slate-900 font-semibold shadow-sm"
                            : "bg-slate-950 border-slate-900 text-slate-400 hover:text-slate-200 hover:bg-slate-900"
                        }`}
                      >
                        {type} Summary
                      </button>
                    ))}
                  </div>

                  <div className="bg-slate-900 border border-slate-800/80 rounded-2xl p-4 space-y-3 shadow-sm relative group">
                    <div className="flex justify-between items-center border-b border-slate-800/80 pb-2">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        {summaryType} Summary
                      </span>
                      {summary[activeVideoId]?.[summaryType] && (
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => navigator.clipboard.writeText(summary[activeVideoId]?.[summaryType] || "")}
                            className="text-slate-500 hover:text-slate-300 transition-colors p-1 rounded hover:bg-slate-950"
                            title="Copy Summary"
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => generateSummary(activeVideoId, summaryType, true)}
                            className="text-slate-500 hover:text-slate-300 transition-colors p-1 rounded hover:bg-slate-950"
                            title="Regenerate Summary"
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </div>

                    {loadingSummary ? (
                      <div className="space-y-3 py-4 animate-pulse">
                        <div className="h-3.5 bg-slate-800 rounded w-3/4"></div>
                        <div className="h-3.5 bg-slate-800 rounded w-full"></div>
                        <div className="h-3.5 bg-slate-800 rounded w-5/6"></div>
                      </div>
                    ) : errorSummary ? (
                      <div className="p-3 rounded-xl bg-red-950/20 border border-red-900/50 text-red-400 text-xs flex gap-2.5 items-center">
                        <AlertTriangle className="h-4 w-4 shrink-0" />
                        <span>{errorSummary}</span>
                      </div>
                    ) : (
                      <div className="text-xs leading-relaxed text-slate-200">
                        <MarkdownRenderer content={summary[activeVideoId]?.[summaryType] || "No summary generated."} />
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activeTab === "notes" && activeVideoId && (
                <div className="space-y-4 animate-in fade-in duration-200">
                  <div className="bg-slate-900 border border-slate-800/80 rounded-2xl p-4 space-y-3 shadow-sm relative group">
                    <div className="flex justify-between items-center border-b border-slate-800/80 pb-2">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        Study Notes
                      </span>
                      {studyNotes[activeVideoId] && (
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => navigator.clipboard.writeText(studyNotes[activeVideoId] || "")}
                            className="text-slate-500 hover:text-slate-300 transition-colors p-1 rounded hover:bg-slate-950"
                            title="Copy Notes"
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => generateStudyNotes(activeVideoId, true)}
                            className="text-slate-500 hover:text-slate-300 transition-colors p-1 rounded hover:bg-slate-950"
                            title="Regenerate Notes"
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </div>

                    {loadingNotes ? (
                      <div className="space-y-3 py-4 animate-pulse">
                        <div className="h-4 bg-slate-800 rounded w-1/3 mb-2"></div>
                        <div className="h-3 bg-slate-800 rounded w-3/4"></div>
                        <div className="h-3 bg-slate-800 rounded w-full"></div>
                        <div className="h-3 bg-slate-800 rounded w-5/6"></div>
                      </div>
                    ) : errorNotes ? (
                      <div className="p-3 rounded-xl bg-red-950/20 border border-red-900/50 text-red-400 text-xs flex gap-2.5 items-center">
                        <AlertTriangle className="h-4 w-4 shrink-0" />
                        <span>{errorNotes}</span>
                      </div>
                    ) : (
                      <div className="text-xs leading-relaxed text-slate-200 prose prose-invert max-w-none">
                        <MarkdownRenderer content={studyNotes[activeVideoId] || "No study notes generated."} />
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activeTab === "takeaways" && activeVideoId && (
                <div className="space-y-4 animate-in fade-in duration-200">
                  <div className="flex justify-between items-center px-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      Key Takeaways ({takeaways[activeVideoId]?.length || 0})
                    </span>
                    {takeaways[activeVideoId] && (
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => {
                            const text = takeaways[activeVideoId]?.map((t: string) => `✓ ${t}`).join("\n");
                            navigator.clipboard.writeText(text || "");
                          }}
                          className="text-slate-500 hover:text-slate-300 transition-colors p-1 rounded hover:bg-slate-950"
                          title="Copy Takeaways"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => generateTakeaways(activeVideoId, true)}
                          className="text-slate-500 hover:text-slate-300 transition-colors p-1 rounded hover:bg-slate-950"
                          title="Regenerate Takeaways"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </div>

                  {loadingTakeaways ? (
                    <div className="space-y-3 animate-pulse">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <div key={n} className="bg-slate-900 border border-slate-800/80 rounded-xl p-3 h-12 w-full"></div>
                      ))}
                    </div>
                  ) : errorTakeaways ? (
                    <div className="p-3 rounded-xl bg-red-950/20 border border-red-900/50 text-red-400 text-xs flex gap-2.5 items-center">
                      <AlertTriangle className="h-4 w-4 shrink-0" />
                      <span>{errorTakeaways}</span>
                    </div>
                  ) : takeaways[activeVideoId]?.length > 0 ? (
                    <div className="space-y-3">
                      {takeaways[activeVideoId].map((point, index) => (
                        <div
                          key={index}
                          className="bg-slate-900 border border-slate-800/80 rounded-xl p-3.5 flex gap-3 items-start shadow-sm hover:shadow-md transition-shadow animate-in slide-in-from-bottom-2 duration-300"
                        >
                          <div className="h-5 w-5 rounded-full bg-emerald-500/10 border border-emerald-500/20 shrink-0 flex items-center justify-center text-emerald-400">
                            ✓
                          </div>
                          <span className="text-xs text-slate-200 leading-relaxed">{point}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[11px] text-slate-500 text-center py-10">No takeaways generated.</p>
                  )}
                </div>
              )}
            </div>

            {/* Input Message Box */}
            {activeTab === "chat" && (
              <div className="p-4 border-t border-slate-900 bg-slate-900/40 flex gap-2.5 items-end">
                <textarea
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  placeholder={chatLoading || chatStreaming ? "Tutor is writing..." : "Ask about this video..."}
                  className="flex-1 bg-slate-950 border border-slate-900 text-slate-100 rounded-2xl px-4 py-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary resize-none h-10 min-h-10 max-h-24 scrollbar-thin transition-colors"
                  rows={1}
                  disabled={chatLoading || chatStreaming}
                />
                <Button
                  onClick={handleSendMessage}
                  size="icon"
                  className="bg-primary hover:bg-primary/95 text-white h-10 w-10 rounded-2xl transition-all duration-200 hover:scale-105 active:scale-95 shrink-0 shadow-lg shadow-primary/20 hover:shadow-primary/30"
                  disabled={chatLoading || chatStreaming || !inputText.trim()}
                >
                  <Send className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </div>
        ) : (
          /* Landing/Empty State when no navigation details are read yet */
          <div className="flex-1 p-6 flex flex-col items-center justify-center text-center space-y-3">
            <Youtube className="h-10 w-10 text-slate-700" />
            <h3 className="font-bold text-sm text-slate-300">Searching tab details...</h3>
            <p className="text-xs text-slate-500 max-w-[200px] leading-relaxed">
              Ensure you have a YouTube video active in your current browser tab.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
