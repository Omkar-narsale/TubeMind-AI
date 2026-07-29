import { useEffect, useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Loading } from "@/components/Loading";
import { useSettingsStore } from "@/stores/settingsStore";
import { useConnectionStore } from "@/stores/connectionStore";
import { useVideoStore } from "@/stores/videoStore";
import { useTranscriptStore } from "@/stores/transcriptStore";
import { useRAGStore } from "@/stores/ragStore";
import { isYouTubeWatchPage, extractVideoId, seekToTimestamp } from "@/utils/youtube";
import { youtubeService, exportService, VideoMetadata } from "@/services/api";
import { Settings, Youtube, Send, Radio, User, Bot, AlertTriangle, FileText, Trash2, Sliders, Copy, Check, RotateCcw, Download, FileCode, Archive, Loader2 } from "lucide-react";
import { useChatStore } from "@/stores/chatStore";
import { useLearningStore } from "@/stores/learningStore";

interface ExportButtonsProps {
  feature: string;
  content: string;
  videoTitle?: string;
  youtubeUrl?: string;
  language?: string;
}

function ExportButtonGroup({ feature, content, videoTitle, youtubeUrl, language }: ExportButtonsProps) {
  const [exporting, setExporting] = useState<"pdf" | "docx" | "md" | null>(null);
  const [copied, setCopied] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  if (!content) return null;

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExport = async (format: "pdf" | "docx" | "md") => {
    if (exporting) return;
    setExporting(format);
    try {
      const payload = {
        video_title: videoTitle || "YouTube Video",
        youtube_url: youtubeUrl || "",
        feature,
        language: language || "English",
        content,
      };

      if (format === "pdf") {
        await exportService.exportPDF(payload);
        showToast("PDF downloaded successfully.");
      } else if (format === "docx") {
        await exportService.exportDOCX(payload);
        showToast("DOCX downloaded successfully.");
      } else if (format === "md") {
        await exportService.exportMarkdown(payload);
        showToast("Markdown downloaded successfully.");
      }
    } catch (err: any) {
      showToast(`Export failed: ${err.message || "Unknown error"}`);
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {toast && (
        <span className="text-[10px] text-emerald-400 font-medium animate-in fade-in mr-1">
          {toast}
        </span>
      )}
      <button
        onClick={() => handleExport("pdf")}
        disabled={!!exporting}
        className="px-2 py-1 rounded bg-slate-950 hover:bg-slate-800 text-slate-300 text-[10px] font-semibold flex items-center gap-1 border border-slate-800 transition-colors disabled:opacity-50"
        title="Export PDF"
      >
        {exporting === "pdf" ? <Loader2 className="h-3 w-3 animate-spin text-emerald-400" /> : <Download className="h-3 w-3 text-red-400" />}
        PDF
      </button>
      <button
        onClick={() => handleExport("docx")}
        disabled={!!exporting}
        className="px-2 py-1 rounded bg-slate-950 hover:bg-slate-800 text-slate-300 text-[10px] font-semibold flex items-center gap-1 border border-slate-800 transition-colors disabled:opacity-50"
        title="Export Word (.docx)"
      >
        {exporting === "docx" ? <Loader2 className="h-3 w-3 animate-spin text-emerald-400" /> : <FileText className="h-3 w-3 text-blue-400" />}
        DOCX
      </button>
      <button
        onClick={() => handleExport("md")}
        disabled={!!exporting}
        className="px-2 py-1 rounded bg-slate-950 hover:bg-slate-800 text-slate-300 text-[10px] font-semibold flex items-center gap-1 border border-slate-800 transition-colors disabled:opacity-50"
        title="Export Markdown (.md)"
      >
        {exporting === "md" ? <Loader2 className="h-3 w-3 animate-spin text-emerald-400" /> : <FileCode className="h-3 w-3 text-emerald-400" />}
        MD
      </button>
      <button
        onClick={handleCopy}
        className="text-slate-500 hover:text-slate-300 transition-colors p-1 rounded hover:bg-slate-950"
        title="Copy response"
      >
        {copied ? <Check className="h-3.5 w-3.5 text-emerald-400 animate-in fade-in" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

function ExportAllButton({ videoTitle, youtubeUrl, language }: { videoTitle?: string; youtubeUrl?: string; language?: string }) {
  const [exporting, setExporting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const { summary, studyNotes, takeaways, interviewQuestions } = useLearningStore();

  const handleExportAll = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const activeVideoId = useVideoStore.getState().currentVideo.videoId || "";
      const currentSummary = summary[activeVideoId]?.detailed || summary[activeVideoId]?.short || summary[activeVideoId]?.bullet || "";
      const currentNotes = studyNotes[activeVideoId] || "";
      const currentTakeaways = (takeaways[activeVideoId] || []).join("\n");
      const currentInterview = interviewQuestions[activeVideoId] || "";

      const contents: Record<string, string> = {};
      if (currentSummary) contents["summary"] = currentSummary;
      if (currentNotes) contents["study_notes"] = currentNotes;
      if (currentTakeaways) contents["key_takeaways"] = currentTakeaways;
      if (currentInterview) contents["interview_questions"] = currentInterview;

      if (Object.keys(contents).length === 0) {
        setToast("No generated content yet.");
        setTimeout(() => setToast(null), 2500);
        setExporting(false);
        return;
      }

      await exportService.exportAllZip({
        video_title: videoTitle || "YouTube Video",
        youtube_url: youtubeUrl || "",
        language: language || "English",
        contents,
      });

      setToast("ZIP downloaded!");
      setTimeout(() => setToast(null), 2500);
    } catch (err: any) {
      setToast(`Export failed: ${err.message || "Unknown error"}`);
      setTimeout(() => setToast(null), 3000);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="flex items-center gap-1.5">
      {toast && <span className="text-[9px] text-emerald-400 font-medium animate-in fade-in">{toast}</span>}
      <button
        onClick={handleExportAll}
        disabled={exporting}
        className="px-2 py-1 rounded bg-emerald-950/70 hover:bg-emerald-900/90 border border-emerald-800/80 text-emerald-300 text-[10px] font-bold flex items-center gap-1 transition-all shadow-sm disabled:opacity-50"
        title="Export All Content as ZIP"
      >
        {exporting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Archive className="h-3 w-3" />}
        Export All (.zip)
      </button>
    </div>
  );
}

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

interface InterviewQuestion {
  question: string;
  answer: string;
  difficulty: "Easy" | "Medium" | "Hard" | string;
}

function parseInterviewQuestions(text: string): InterviewQuestion[] {
  if (!text) return [];
  const questions: InterviewQuestion[] = [];
  
  // Split the text into blocks by "Q:" or "Question:" (case insensitive)
  const blocks = text.split(/(?:^|\n)(?=Q\d*[:\-\s]|Question\d*[:\-\s])/i);
  
  for (const block of blocks) {
    if (!block.trim()) continue;
    
    // Extract Question
    const qMatch = block.match(/(?:Q\d*|Question\d*)\s*[:\-\s]\s*(.*)/i);
    if (!qMatch) continue;
    const question = qMatch[1].trim();
    
    // Extract Answer / Expected Answer
    const aMatch = block.match(/(?:A\d*|Answer\d*|Expected\s+Answer\d*)\s*[:\-\s]\s*([\s\S]*?)(?=(?:\nDifficulty:|$))/i);
    const answer = aMatch ? aMatch[1].trim() : "";
    
    // Extract Difficulty
    const dMatch = block.match(/Difficulty\s*[:\-\s]\s*(Easy|Medium|Hard)/i);
    const difficulty = dMatch ? dMatch[1].trim() : "Medium";
    
    if (question) {
      questions.push({ question, answer, difficulty });
    }
  }
  
  // Fallback if parsing returns nothing: treat the whole text as one question
  if (questions.length === 0 && text.trim().length > 0) {
    questions.push({
      question: "Interview Questions",
      answer: text,
      difficulty: "Medium"
    });
  }
  
  return questions;
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

export function App() {
  const { settings, updateSettings, loadSettings } = useSettingsStore();
  const { status: connectionStatus, checkHealth } = useConnectionStore();
  const { currentVideo, setVideoInfo, resetVideoInfo } = useVideoStore();
  
  // Zustand Transcript Store
  const {
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
  const [activeTab, setActiveTab] = useState<"chat" | "summary" | "notes" | "takeaways" | "interview">("chat");
  const [summaryType, setSummaryType] = useState<"short" | "detailed" | "bullet">("short");

  const {
    summary,
    studyNotes,
    takeaways,
    interviewQuestions,
    loadingSummary,
    loadingNotes,
    loadingTakeaways,
    loadingInterview,
    errorSummary,
    errorNotes,
    errorTakeaways,
    errorInterview,
    generateSummary,
    generateStudyNotes,
    generateTakeaways,
    generateInterviewQuestions,
  } = useLearningStore();



  const activeVideoId = currentVideo.videoId || "";
  const currentVideoMessages = activeVideoId ? (chatMessagesMap[activeVideoId] || []) : [];
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Auto-generate active tab data if not already cached
  // Uses a cancelled flag to prevent StrictMode double-fire from sending duplicate requests
  useEffect(() => {
    let cancelled = false;
    console.debug("[DEBUG][App] useEffect[activeTab] fired:", { activeTab, videoId: currentVideo.videoId, summaryType });

    if (currentVideo.videoId && !cancelled) {
      if (activeTab === "summary") {
        generateSummary(currentVideo.videoId, summaryType);
      } else if (activeTab === "notes") {
        generateStudyNotes(currentVideo.videoId);
      } else if (activeTab === "takeaways") {
        generateTakeaways(currentVideo.videoId);
      } else if (activeTab === "interview") {
        generateInterviewQuestions(currentVideo.videoId);
      }
    }

    return () => {
      cancelled = true;
    };
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

      {/* Response Language Selector Bar */}
      <div className="px-4 py-2 border-b border-slate-900 bg-slate-900/40 flex items-center justify-between gap-2 shrink-0 flex-wrap">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1 shrink-0">
            🌐 Language
          </span>
          <select
            value={settings.responseLanguage || "auto"}
            onChange={(e) => {
              const newLang = e.target.value;
              console.debug("[DEBUG][App] Language changed to:", newLang);
              updateSettings({ responseLanguage: newLang });
              if (currentVideo.videoId) {
                if (activeTab === "summary") {
                  generateSummary(currentVideo.videoId, summaryType, true);
                } else if (activeTab === "notes") {
                  generateStudyNotes(currentVideo.videoId, true);
                } else if (activeTab === "takeaways") {
                  generateTakeaways(currentVideo.videoId, true);
                } else if (activeTab === "interview") {
                  generateInterviewQuestions(currentVideo.videoId, true);
                }
              }
            }}
            className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-0.5 text-[10px] focus:outline-none focus:ring-1 focus:ring-primary text-slate-200"
          >
            <option value="auto">Auto (Default)</option>
            <option value="en">English</option>
            <option value="hi">Hindi</option>
            <option value="mr">Marathi</option>
            <option value="ta">Tamil</option>
            <option value="te">Telugu</option>
            <option value="kn">Kannada</option>
            <option value="gu">Gujarati</option>
            <option value="pa">Punjabi</option>
            <option value="es">Spanish</option>
            <option value="fr">French</option>
            <option value="de">German</option>
            <option value="ja">Japanese</option>
            <option value="ko">Korean</option>
            <option value="zh">Chinese</option>
          </select>
        </div>

        {currentVideo.videoId && (
          <ExportAllButton
            videoTitle={metadata?.title || currentVideo.title || "YouTube Video"}
            youtubeUrl={currentVideo.url}
            language={settings.responseLanguage || "English"}
          />
        )}
      </div>

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
        ) : currentVideo.videoId ? (
          <div className="flex-1 flex flex-col min-h-0">
            {/* Tab Navigation */}
            <div className="flex border-b border-slate-900 bg-slate-950 px-2 pt-1 shrink-0 gap-1 overflow-x-auto scrollbar-none">
              {(["chat", "summary", "notes", "takeaways", "interview"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`flex-1 min-w-[70px] py-2 text-[10px] font-bold uppercase tracking-wider rounded-t-lg border-b-2 transition-all ${
                    activeTab === tab
                      ? "text-primary border-primary bg-slate-900/50"
                      : "text-slate-500 border-transparent hover:text-slate-300"
                  }`}
                >
                  {tab === "notes" ? "Study Notes" : tab === "takeaways" ? "Takeaways" : tab === "interview" ? "Interview Questions" : tab}
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
                        <span className="font-semibold text-emerald-400 flex items-center gap-1">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                          Available ({segmentCount} segments)
                        </span>
                      </div>
                      <div className="space-y-0.5">
                        <span className="text-slate-500 block">Video ID</span>
                        <span className="font-mono text-slate-300 truncate block">{currentVideo.videoId}</span>
                      </div>
                    </div>
                  </div>

                  {/* Chat Messages */}
                  {currentVideoMessages.length === 0 ? (
                    <div className="text-center py-8 space-y-2">
                      <Bot className="h-8 w-8 text-slate-700 mx-auto" />
                      <p className="text-xs text-slate-400 font-medium">Ask questions about this video</p>
                      <p className="text-[10px] text-slate-500 max-w-[200px] mx-auto">
                        I can summarize concepts, clarify technical details, or answer specific questions.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {currentVideoMessages.map((msg, index) => (
                        <div
                          key={index}
                          className={`flex gap-2.5 ${msg.sender === "user" ? "justify-end" : "justify-start"}`}
                        >
                          {msg.sender === "assistant" && (
                            <div className="h-6 w-6 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center shrink-0 mt-0.5">
                              <Bot className="h-3.5 w-3.5 text-primary" />
                            </div>
                          )}
                          
                          <div
                            className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed ${
                              msg.sender === "user"
                                ? "bg-primary text-white font-medium rounded-tr-sm"
                                : "bg-slate-900 border border-slate-800 text-slate-200 rounded-tl-sm shadow-sm"
                            }`}
                          >
                            <MarkdownRenderer content={msg.text} />
                          </div>

                          {msg.sender === "user" && (
                            <div className="h-6 w-6 rounded-full bg-slate-800 flex items-center justify-center shrink-0 mt-0.5">
                              <User className="h-3.5 w-3.5 text-slate-400" />
                            </div>
                          )}
                        </div>
                      ))}

                      {chatLoading && (
                        <div className="flex gap-2.5 justify-start">
                          <div className="h-6 w-6 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center shrink-0">
                            <Bot className="h-3.5 w-3.5 text-primary animate-spin" />
                          </div>
                          <div className="bg-slate-900 border border-slate-800 rounded-2xl px-3.5 py-2.5 text-xs text-slate-400 flex items-center gap-2">
                            <Loading variant="spinner" message="Thinking..." />
                          </div>
                        </div>
                      )}

                      {chatError && (
                        <div className="p-3 rounded-xl bg-red-950/20 border border-red-900/50 text-red-400 text-xs flex gap-2.5 items-center justify-between">
                          <div className="flex items-center gap-2">
                            <AlertTriangle className="h-4 w-4 shrink-0" />
                            <span>{chatError}</span>
                          </div>
                          <Button
                            onClick={() => currentVideo.videoId && retryMessage(currentVideo.videoId)}
                            size="sm"
                            variant="ghost"
                            className="text-red-400 hover:text-red-300 hover:bg-red-950/50 h-7 text-[10px] gap-1 px-2"
                          >
                            <RotateCcw className="h-3 w-3" />
                            Retry
                          </Button>
                        </div>
                      )}

                      <div ref={chatEndRef} />
                    </div>
                  )}
                </>
              )}

              {activeTab === "summary" && activeVideoId && (() => {
                const summaryData = summary[activeVideoId]?.[summaryType] || "";
                return (
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
                    <div className="flex justify-between items-center border-b border-slate-800/80 pb-2 flex-wrap gap-1">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        {summaryType} Summary
                      </span>
                      {summaryData && (
                        <div className="flex items-center gap-2">
                          <ExportButtonGroup
                            feature={`summary_${summaryType}`}
                            content={summaryData}
                            videoTitle={metadata?.title || currentVideo.title || ""}
                            youtubeUrl={currentVideo.url}
                            language={settings.responseLanguage || "English"}
                          />
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
                        <MarkdownRenderer content={summaryData || "No summary generated."} />
                      </div>
                    )}
                  </div>
                </div>
                );
              })()}

              {activeTab === "notes" && activeVideoId && (() => {
                const notesData = studyNotes[activeVideoId] || "";
                return (
                <div className="space-y-4 animate-in fade-in duration-200">
                  <div className="bg-slate-900 border border-slate-800/80 rounded-2xl p-4 space-y-3 shadow-sm relative group">
                    <div className="flex justify-between items-center border-b border-slate-800/80 pb-2 flex-wrap gap-1">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        Study Notes
                      </span>
                      {notesData && (
                        <div className="flex items-center gap-2">
                          <ExportButtonGroup
                            feature="study_notes"
                            content={notesData}
                            videoTitle={metadata?.title || currentVideo.title || ""}
                            youtubeUrl={currentVideo.url}
                            language={settings.responseLanguage || "English"}
                          />
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
                        <MarkdownRenderer content={notesData || "No study notes generated."} />
                      </div>
                    )}
                  </div>
                </div>
                );
              })()}

              {activeTab === "takeaways" && activeVideoId && (() => {
                const points = takeaways[activeVideoId] || [];
                const takeawaysText = points.map((p) => `✓ ${p}`).join("\n");
                return (
                <div className="space-y-4 animate-in fade-in duration-200">
                  <div className="flex justify-between items-center px-1 flex-wrap gap-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      Key Takeaways ({points.length})
                    </span>
                    {takeawaysText && (
                      <div className="flex items-center gap-2">
                        <ExportButtonGroup
                          feature="key_takeaways"
                          content={takeawaysText}
                          videoTitle={metadata?.title || currentVideo.title || ""}
                          youtubeUrl={currentVideo.url}
                          language={settings.responseLanguage || "English"}
                        />
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
                  ) : points.length > 0 ? (
                    <div className="space-y-3">
                      {points.map((point, index) => (
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
                );
              })()}

              {activeTab === "interview" && activeVideoId && (() => {
                const interviewText = interviewQuestions[activeVideoId] || "";
                const parsedQ = parseInterviewQuestions(interviewText);
                return (
                <div className="space-y-4 animate-in fade-in duration-200">
                  <div className="flex justify-between items-center px-1 flex-wrap gap-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      Interview Questions ({parsedQ.length})
                    </span>
                    {interviewText && (
                      <div className="flex items-center gap-2">
                        <ExportButtonGroup
                          feature="interview_questions"
                          content={interviewText}
                          videoTitle={metadata?.title || currentVideo.title || ""}
                          youtubeUrl={currentVideo.url}
                          language={settings.responseLanguage || "English"}
                        />
                        <button
                          onClick={() => generateInterviewQuestions(activeVideoId, true)}
                          className="text-slate-500 hover:text-slate-300 transition-colors p-1 rounded hover:bg-slate-950"
                          title="Regenerate Interview Questions"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </div>

                  {loadingInterview ? (
                    <div className="space-y-3 animate-pulse">
                      {[1, 2, 3].map((n) => (
                        <div key={n} className="bg-slate-900 border border-slate-800/80 rounded-xl p-4 h-24 w-full"></div>
                      ))}
                    </div>
                  ) : errorInterview ? (
                    <div className="p-3 rounded-xl bg-red-950/20 border border-red-900/50 text-red-400 text-xs flex gap-2.5 items-center">
                      <AlertTriangle className="h-4 w-4 shrink-0" />
                      <span>{errorInterview}</span>
                    </div>
                  ) : parsedQ.length > 0 ? (
                    <div className="space-y-4">
                      {parsedQ.map((item, index) => {
                        const difficultyColor = 
                          item.difficulty.toLowerCase() === "easy" 
                            ? "text-emerald-400 bg-emerald-950/30 border-emerald-900/50" 
                            : item.difficulty.toLowerCase() === "hard" 
                            ? "text-rose-400 bg-rose-950/30 border-rose-900/50" 
                            : "text-amber-400 bg-amber-950/30 border-amber-900/50";
                        return (
                          <div
                            key={index}
                            className="bg-slate-900 border border-slate-800/80 rounded-xl p-4 space-y-3 shadow-sm hover:shadow-md transition-shadow animate-in slide-in-from-bottom-2 duration-300"
                          >
                            <div className="flex justify-between items-center">
                              <span className="text-[10px] uppercase font-bold text-slate-500">
                                Question {index + 1}
                              </span>
                              <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold border ${difficultyColor}`}>
                                {item.difficulty}
                              </span>
                            </div>
                            <h4 className="text-xs font-bold text-slate-100 leading-relaxed">
                              {item.question}
                            </h4>
                            <div className="pt-2.5 border-t border-slate-800/60 space-y-1">
                              <span className="text-[9px] uppercase font-extrabold text-slate-500 block tracking-wider">
                                Expected Answer
                              </span>
                              <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-line">
                                {item.answer}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-[11px] text-slate-500 text-center py-10">No interview questions generated.</p>
                  )}
                </div>
                );
              })()}
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
