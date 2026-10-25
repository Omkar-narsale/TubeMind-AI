import { useEffect, useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Loading } from "@/components/Loading";
import { useSettingsStore } from "@/stores/settingsStore";
import { useConnectionStore } from "@/stores/connectionStore";
import { useVideoStore } from "@/stores/videoStore";
import { useTranscriptStore } from "@/stores/transcriptStore";
import { useRAGStore } from "@/stores/ragStore";
import { isYouTubeWatchPage, extractVideoId, seekToTimestamp, getCurrentVideoTime } from "@/utils/youtube";
import { youtubeService, exportService, VideoMetadata } from "@/services/api";
import { Settings, Youtube, Send, Radio, User, Bot, AlertTriangle, FileText, Trash2, Sliders, Copy, Check, RotateCcw, Download, FileCode, Archive, Loader2, Layers, HelpCircle, ChevronLeft, ChevronRight, RotateCw, Award, Target, X, ExternalLink, Sparkles, BookOpen, CheckCircle2, PlayCircle } from "lucide-react";
import { useChatStore } from "@/stores/chatStore";
import { useLearningStore } from "@/stores/learningStore";
import { usePlaylistStore } from "@/stores/playlistStore";

interface ExportButtonsProps {
  feature: string;
  content: string;
  videoTitle?: string;
  youtubeUrl?: string;
  language?: string;
}

function ExportButtonGroup({ feature, content, videoTitle, youtubeUrl, language }: ExportButtonsProps) {
  const { settings, updateSettings } = useSettingsStore();
  const [exporting, setExporting] = useState<"pdf" | "docx" | "md" | "obsidian" | "notion" | null>(null);
  const [copied, setCopied] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [notionUrl, setNotionUrl] = useState<string | null>(null);
  const [showNotionModal, setShowNotionModal] = useState(false);
  const [notionToken, setNotionToken] = useState(settings.notionApiKey || "");
  const [notionParent, setNotionParent] = useState(settings.notionDatabaseId || "");

  if (!content) return null;

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExport = async (format: "pdf" | "docx" | "md" | "obsidian") => {
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
        showToast("PDF downloaded.");
      } else if (format === "docx") {
        await exportService.exportDOCX(payload);
        showToast("DOCX downloaded.");
      } else if (format === "md") {
        await exportService.exportMarkdown(payload);
        showToast("Markdown downloaded.");
      } else if (format === "obsidian") {
        await exportService.exportObsidian({
          ...payload,
          vault_name: settings.obsidianVaultName || undefined,
        });
        showToast("Obsidian note exported!");
      }
    } catch (err: any) {
      showToast(`Export failed: ${err.message || "Unknown error"}`);
    } finally {
      setExporting(null);
    }
  };

  const handleNotionSync = async (tokenToUse?: string, parentToUse?: string) => {
    const key = (tokenToUse ?? settings.notionApiKey ?? "").trim();
    const parent = (parentToUse ?? settings.notionDatabaseId ?? "").trim();

    if (!key || !parent) {
      setShowNotionModal(true);
      return;
    }

    setExporting("notion");
    try {
      const res = await exportService.exportNotion({
        api_key: key,
        parent_id: parent,
        video_title: videoTitle || "YouTube Video",
        youtube_url: youtubeUrl || "",
        feature,
        language: language || "English",
        content,
      });

      if (res.url) {
        setNotionUrl(res.url);
      }
      showToast("Synced to Notion!");
      setShowNotionModal(false);
    } catch (err: any) {
      showToast(`Notion error: ${err.message || "Sync failed"}`);
    } finally {
      setExporting(null);
    }
  };

  const handleSaveAndSyncNotion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!notionToken.trim() || !notionParent.trim()) {
      showToast("Please provide both token and database/page ID");
      return;
    }
    await updateSettings({
      notionApiKey: notionToken.trim(),
      notionDatabaseId: notionParent.trim(),
    });
    await handleNotionSync(notionToken.trim(), notionParent.trim());
  };

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {toast && (
        <span className="text-[10px] text-emerald-400 font-medium animate-in fade-in mr-1">
          {toast}
        </span>
      )}
      {notionUrl && (
        <a
          href={notionUrl}
          target="_blank"
          rel="noreferrer"
          className="px-2 py-0.5 rounded bg-emerald-950/60 border border-emerald-800 text-emerald-300 text-[10px] font-semibold flex items-center gap-1 hover:bg-emerald-900/60 transition-colors mr-1"
          title="Open page in Notion"
        >
          <span>View Notion</span>
          <ExternalLink className="h-2.5 w-2.5" />
        </a>
      )}

      {/* Standard Export Formats */}
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

      {/* Second Brain: Obsidian */}
      <button
        onClick={() => handleExport("obsidian")}
        disabled={!!exporting}
        className="px-2 py-1 rounded bg-purple-950/40 hover:bg-purple-900/50 text-purple-200 text-[10px] font-semibold flex items-center gap-1 border border-purple-800/60 transition-colors disabled:opacity-50"
        title="Export to Obsidian (with YAML frontmatter, callouts & timestamps)"
      >
        {exporting === "obsidian" ? <Loader2 className="h-3 w-3 animate-spin text-purple-400" /> : <BookOpen className="h-3 w-3 text-purple-400" />}
        Obsidian
      </button>

      {/* Second Brain: Notion */}
      <button
        onClick={() => handleNotionSync()}
        disabled={!!exporting}
        className="px-2 py-1 rounded bg-slate-900 hover:bg-slate-800 text-amber-200 text-[10px] font-semibold flex items-center gap-1 border border-amber-800/40 hover:border-amber-600/60 transition-colors disabled:opacity-50 shadow-sm"
        title="Sync directly to Notion workspace"
      >
        {exporting === "notion" ? <Loader2 className="h-3 w-3 animate-spin text-amber-400" /> : <Sparkles className="h-3 w-3 text-amber-400" />}
        Notion
      </button>

      <button
        onClick={handleCopy}
        className="text-slate-500 hover:text-slate-300 transition-colors p-1 rounded hover:bg-slate-950"
        title="Copy response"
      >
        {copied ? <Check className="h-3.5 w-3.5 text-emerald-400 animate-in fade-in" /> : <Copy className="h-3.5 w-3.5" />}
      </button>

      {/* Modal for Notion credentials if missing */}
      {showNotionModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-sm w-full p-4 space-y-3.5 shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-100">
                <Sparkles className="h-4 w-4 text-amber-400" />
                <span>Connect Notion Second Brain</span>
              </div>
              <button
                onClick={() => setShowNotionModal(false)}
                className="text-slate-500 hover:text-slate-300 p-1 rounded-full"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <form onSubmit={handleSaveAndSyncNotion} className="space-y-3 text-left">
              <div className="space-y-1">
                <label className="text-[10px] font-semibold text-slate-400 block uppercase tracking-wider">
                  Notion Secret (API Token)
                </label>
                <input
                  type="password"
                  value={notionToken}
                  onChange={(e) => setNotionToken(e.target.value)}
                  placeholder="ntn_... or secret_..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-primary font-mono"
                  required
                />
                <span className="text-[9px] text-slate-500 block">
                  From <a href="https://notion.so/profile/integrations" target="_blank" rel="noreferrer" className="text-primary hover:underline">notion.so/profile/integrations</a>
                </span>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-semibold text-slate-400 block uppercase tracking-wider">
                  Database ID or Page ID
                </label>
                <input
                  type="text"
                  value={notionParent}
                  onChange={(e) => setNotionParent(e.target.value)}
                  placeholder="32-character ID from Notion URL"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-primary font-mono"
                  required
                />
                <span className="text-[9px] text-slate-500 block">
                  Make sure you invited your Notion integration to this database/page.
                </span>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowNotionModal(false)}
                  className="px-3 py-1.5 rounded-xl border border-slate-800 text-[11px] text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={exporting === "notion"}
                  className="px-3 py-1.5 rounded-xl bg-primary text-white text-[11px] font-semibold hover:bg-primary/90 flex items-center gap-1.5 disabled:opacity-50"
                >
                  {exporting === "notion" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                  Save & Sync
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
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

interface FlashcardItem {
  front: string;
  back: string;
  category?: string;
  timestamp?: string;
}

function extractJsonArray(rawText: string): any[] | null {
  if (!rawText) return null;
  let text = rawText.trim();
  // Strip code block markers and markdown preamble/postamble
  text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

  // 1. Direct parse attempt
  try {
    const res = JSON.parse(text);
    if (Array.isArray(res)) return res;
  } catch {}

  // 2. Extract bounded array between first '[' and last ']'
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start !== -1 && end > start) {
    try {
      const res = JSON.parse(text.slice(start, end + 1));
      if (Array.isArray(res)) return res;
    } catch {}
  }

  // 3. Salvage truncated JSON array up to the last '}'
  if (start !== -1) {
    const lastBrace = text.lastIndexOf("}");
    if (lastBrace > start) {
      try {
        const candidate = text.slice(start, lastBrace + 1) + "]";
        const res = JSON.parse(candidate);
        if (Array.isArray(res)) return res;
      } catch {}
    }
  }

  return null;
}

function parseFlashcards(text: string): FlashcardItem[] {
  if (!text) return [];

  // 1. Array parsing (direct, bounded, or salvaged)
  const arrayData = extractJsonArray(text);
  if (arrayData && Array.isArray(arrayData) && arrayData.length > 0) {
    const validCards = arrayData
      .filter((item) => item && (item.front || item.question || item.term))
      .map((item) => ({
        front: item.front || item.question || item.term || "Question",
        back: item.back || item.answer || item.definition || "",
        category: item.category || "Core Concept",
        timestamp: item.timestamp || ""
      }));
    if (validCards.length > 0) return validCards;
  }

  // 2. Regex object recovery (extract any individual {"front": ...} objects)
  const objectRegex = /\{[^{}]*"(?:front|question|term)"\s*:[^{}]*\}/gi;
  const matches = text.match(objectRegex);
  if (matches && matches.length > 0) {
    const recovered: FlashcardItem[] = [];
    for (const m of matches) {
      try {
        const item = JSON.parse(m);
        if (item && (item.front || item.question || item.term)) {
          recovered.push({
            front: item.front || item.question || item.term || "Question",
            back: item.back || item.answer || item.definition || "",
            category: item.category || "Core Concept",
            timestamp: item.timestamp || ""
          });
        }
      } catch {}
    }
    if (recovered.length > 0) return recovered;
  }

  // 3. Line-by-line fallback parsing
  const cards: FlashcardItem[] = [];
  const blocks = text.split(/(?:^|\n)(?=Card\s*\d*[:\-\s]|Front[:\-\s]|Q\d*[:\-\s])/i);
  for (const b of blocks) {
    if (!b.trim()) continue;
    const fMatch = b.match(/(?:Front|Q\d*|Question)\s*[:\-\s]\s*(.*?)(?=\n(?:Back|A\d*|Answer)|$)/is);
    const bMatch = b.match(/(?:Back|A\d*|Answer)\s*[:\-\s]\s*(.*?)(?=\n(?:Category|Tag)|$)/is);
    if (fMatch && bMatch) {
      cards.push({
        front: fMatch[1].trim(),
        back: bMatch[1].trim(),
        category: "Concept"
      });
    }
  }
  return cards;
}

function exportToAnkiCSV(cards: FlashcardItem[], videoTitle?: string) {
  if (!cards.length) return;
  const rows = [
    "#separator:comma",
    "#html:true",
    "#tags column:3",
    "Front,Back,Category"
  ];
  cards.forEach((c) => {
    const front = `"${(c.front || "").replace(/"/g, '""')}"`;
    const back = `"${(c.back || "").replace(/"/g, '""')}${c.timestamp ? `<br><small>Timestamp: ${c.timestamp}</small>` : ""}"`;
    const cat = `"${(c.category || "TubeMind").replace(/"/g, '""')}"`;
    rows.push(`${front},${back},${cat}`);
  });

  const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const safeTitle = (videoTitle || "TubeMind").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 30);
  a.download = `${safeTitle}_anki_deck.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

function FlashcardDeck({ cards, videoTitle }: { cards: FlashcardItem[]; videoTitle?: string }) {
  const [index, setIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [mastered, setMastered] = useState<Record<number, boolean>>({});

  if (!cards.length) {
    return <p className="text-[11px] text-slate-500 text-center py-10">No flashcards generated.</p>;
  }

  const current = cards[index];
  const total = cards.length;
  const masteredCount = Object.values(mastered).filter(Boolean).length;

  const nextCard = () => {
    setIsFlipped(false);
    setIndex((prev) => (prev + 1) % total);
  };

  const prevCard = () => {
    setIsFlipped(false);
    setIndex((prev) => (prev - 1 + total) % total);
  };

  const toggleMastered = (e: React.MouseEvent) => {
    e.stopPropagation();
    setMastered((prev) => ({ ...prev, [index]: !prev[index] }));
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      {/* Top Controls Bar */}
      <div className="flex items-center justify-between text-[11px] text-slate-400">
        <span className="font-semibold text-slate-300">
          Card <span className="text-primary font-bold">{index + 1}</span> of {total}
        </span>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-emerald-400 bg-emerald-950/40 border border-emerald-900/50 px-2 py-0.5 rounded-full font-bold">
            ✓ {masteredCount}/{total} Mastered
          </span>
          <button
            onClick={() => exportToAnkiCSV(cards, videoTitle)}
            className="px-2 py-1 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-primary text-[10px] font-bold flex items-center gap-1 transition-all"
            title="Download CSV for Anki import"
          >
            <Download className="h-3 w-3" />
            Anki (.csv)
          </button>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="w-full bg-slate-900 h-1.5 rounded-full overflow-hidden">
        <div
          className="bg-primary h-full transition-all duration-300"
          style={{ width: `${((index + 1) / total) * 100}%` }}
        />
      </div>

      {/* 3D Interactive Card */}
      <div
        onClick={() => setIsFlipped(!isFlipped)}
        className="min-h-[220px] bg-gradient-to-br from-slate-900 via-slate-900/90 to-slate-950 border border-slate-800 hover:border-primary/50 rounded-2xl p-5 flex flex-col justify-between cursor-pointer transition-all duration-300 shadow-lg hover:shadow-primary/10 select-none group relative"
      >
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700/60">
            {current.category || "Concept"}
          </span>
          <button
            onClick={toggleMastered}
            className={`text-[10px] font-bold px-2 py-0.5 rounded-full border transition-all ${
              mastered[index]
                ? "bg-emerald-950/70 border-emerald-500/70 text-emerald-300"
                : "bg-slate-900/80 border-slate-700 text-slate-300 hover:text-white hover:border-slate-500"
            }`}
          >
            {mastered[index] ? "✓ Mastered" : "Mark Mastered"}
          </button>
        </div>

        {/* Card Face Content */}
        <div className="my-auto py-4 text-center">
          {!isFlipped ? (
            <div className="space-y-2 animate-in fade-in duration-200">
              <span className="text-[9px] uppercase tracking-widest font-extrabold text-primary block">
                Prompt / Question
              </span>
              <h3 className="text-sm font-bold text-slate-100 leading-snug">
                {current.front}
              </h3>
            </div>
          ) : (
            <div className="space-y-3 animate-in fade-in duration-200">
              <span className="text-[9px] uppercase tracking-widest font-extrabold text-emerald-400 block">
                Answer / Definition
              </span>
              <p className="text-xs text-slate-200 leading-relaxed font-medium">
                {current.back}
              </p>
              {current.timestamp && (
                <div className="pt-1">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      seekToTimestamp(parseTimestampToSeconds(current.timestamp!));
                    }}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-primary/20 hover:bg-primary/40 border border-primary/40 text-primary text-[10px] font-mono font-bold transition-colors"
                  >
                    ▶ Jump to {current.timestamp}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-center gap-1 text-[10px] text-slate-500 group-hover:text-primary transition-colors">
          <RotateCw className="h-3 w-3" />
          <span>Click to {isFlipped ? "see question" : "reveal answer"}</span>
        </div>
      </div>

      {/* Navigation Buttons */}
      <div className="flex items-center justify-between gap-3 pt-1">
        <Button
          onClick={prevCard}
          variant="outline"
          size="sm"
          className="flex-1 bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-200 text-xs font-semibold transition-all"
        >
          <ChevronLeft className="h-4 w-4 mr-1 text-slate-400" />
          <span>Previous</span>
        </Button>
        <Button
          onClick={nextCard}
          size="sm"
          className="flex-1 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white text-xs font-bold shadow-md shadow-blue-500/20 transition-all"
        >
          <span>Next</span>
          <ChevronRight className="h-4 w-4 ml-1 text-white" />
        </Button>
      </div>
    </div>
  );
}

interface QuizItem {
  question: string;
  options: string[];
  correct_index: number;
  explanation: string;
  timestamp?: string;
}

function parseQuiz(text: string): QuizItem[] {
  if (!text) return [];

  // 1. Array parsing (direct, bounded, or salvaged)
  const arrayData = extractJsonArray(text);
  if (arrayData && Array.isArray(arrayData) && arrayData.length > 0) {
    const validQuestions = arrayData
      .filter((item) => item && (item.question || item.prompt))
      .map((item) => ({
        question: item.question || item.prompt || "Question",
        options: Array.isArray(item.options) && item.options.length >= 2 
          ? item.options 
          : ["Option A", "Option B", "Option C", "Option D"],
        correct_index: typeof item.correct_index === "number" ? item.correct_index : 0,
        explanation: item.explanation || "",
        timestamp: item.timestamp || ""
      }));
    if (validQuestions.length > 0) return validQuestions;
  }

  // 2. Regex object recovery for quiz questions
  const objectRegex = /\{[^{}]*"(?:question|prompt)"\s*:[^{}]*\}/gi;
  const matches = text.match(objectRegex);
  if (matches && matches.length > 0) {
    const recovered: QuizItem[] = [];
    for (const m of matches) {
      try {
        const item = JSON.parse(m);
        if (item && (item.question || item.prompt)) {
          recovered.push({
            question: item.question || item.prompt || "Question",
            options: Array.isArray(item.options) && item.options.length >= 2 
              ? item.options 
              : ["Option A", "Option B", "Option C", "Option D"],
            correct_index: typeof item.correct_index === "number" ? item.correct_index : 0,
            explanation: item.explanation || "",
            timestamp: item.timestamp || ""
          });
        }
      } catch {}
    }
    if (recovered.length > 0) return recovered;
  }

  return [];
}

function InteractiveQuiz({ questions }: { questions: QuizItem[] }) {
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, number>>({});

  if (!questions.length) {
    return <p className="text-[11px] text-slate-500 text-center py-10">No quiz questions generated.</p>;
  }

  const answeredCount = Object.keys(selectedAnswers).length;
  const correctCount = Object.entries(selectedAnswers).filter(
    ([qIdx, ansIdx]) => questions[Number(qIdx)]?.correct_index === ansIdx
  ).length;

  const handleSelect = (questionIndex: number, optionIndex: number) => {
    if (selectedAnswers[questionIndex] !== undefined) return; // already answered
    setSelectedAnswers((prev) => ({ ...prev, [questionIndex]: optionIndex }));
  };

  const handleReset = () => {
    setSelectedAnswers({});
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      {/* Score and Reset Header */}
      <div className="flex items-center justify-between p-3 rounded-xl bg-slate-900 border border-slate-800 text-[11px]">
        <div className="flex items-center gap-2">
          <Award className="h-4 w-4 text-primary" />
          <span className="font-bold text-slate-200">
            Score: <span className="text-emerald-400 font-extrabold">{correctCount}</span> / {questions.length}
          </span>
          <span className="text-[10px] text-slate-500">
            ({answeredCount}/{questions.length} answered)
          </span>
        </div>
        {answeredCount > 0 && (
          <button
            onClick={handleReset}
            className="text-[10px] text-primary hover:text-primary/80 font-bold flex items-center gap-1"
          >
            <RotateCcw className="h-3 w-3" />
            Retake Quiz
          </button>
        )}
      </div>

      {/* Question List */}
      <div className="space-y-4">
        {questions.map((q, qIndex) => {
          const userChoice = selectedAnswers[qIndex];
          const isAnswered = userChoice !== undefined;
          const optionLetters = ["A", "B", "C", "D"];

          return (
            <div
              key={qIndex}
              className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 space-y-3 shadow-sm hover:border-slate-700/80 transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="text-[10px] uppercase font-extrabold text-primary tracking-wider">
                  Question {qIndex + 1}
                </span>
                {q.timestamp && (
                  <button
                    onClick={() => seekToTimestamp(parseTimestampToSeconds(q.timestamp!))}
                    className="text-[9px] px-1.5 py-0.5 rounded bg-primary/20 text-primary border border-primary/30 font-mono font-bold hover:bg-primary/30 transition-colors"
                    title={`Seek to ${q.timestamp}`}
                  >
                    ▶ {q.timestamp}
                  </button>
                )}
              </div>

              <h4 className="text-xs font-bold text-slate-100 leading-snug">
                {q.question}
              </h4>

              {/* Options */}
              <div className="space-y-2 pt-1">
                {q.options.map((opt, oIndex) => {
                  let optStyle = "bg-slate-950/70 border-slate-800 text-slate-300 hover:border-slate-700 hover:bg-slate-950";
                  if (isAnswered) {
                    if (oIndex === q.correct_index) {
                      optStyle = "bg-emerald-950/60 border-emerald-500 text-emerald-200 font-bold";
                    } else if (userChoice === oIndex) {
                      optStyle = "bg-rose-950/60 border-rose-500 text-rose-200";
                    } else {
                      optStyle = "bg-slate-950/40 border-slate-900 text-slate-500 opacity-60";
                    }
                  }

                  return (
                    <button
                      key={oIndex}
                      onClick={() => handleSelect(qIndex, oIndex)}
                      disabled={isAnswered}
                      className={`w-full text-left p-2.5 rounded-lg border text-xs flex items-center gap-2.5 transition-all ${optStyle}`}
                    >
                      <span className="h-5 w-5 rounded-md bg-slate-900 border border-slate-800 text-[10px] font-extrabold flex items-center justify-center shrink-0">
                        {optionLetters[oIndex]}
                      </span>
                      <span className="flex-1 leading-snug">{opt}</span>
                      {isAnswered && oIndex === q.correct_index && (
                        <Check className="h-4 w-4 text-emerald-400 shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Explanation Card */}
              {isAnswered && (
                <div className="p-3 rounded-lg bg-slate-950 border border-slate-800/80 space-y-1.5 text-[11px] animate-in fade-in duration-200">
                  <div className="flex items-center gap-1.5 font-bold">
                    {userChoice === q.correct_index ? (
                      <span className="text-emerald-400">✓ Correct!</span>
                    ) : (
                      <span className="text-rose-400">✕ Incorrect</span>
                    )}
                  </div>
                  <p className="text-slate-300 leading-relaxed">
                    {q.explanation}
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
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
    source: transcriptSource,
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
  const [activeTab, setActiveTab] = useState<"chat" | "summary" | "notes" | "takeaways" | "interview" | "flashcards" | "quiz">("chat");
  const [summaryType, setSummaryType] = useState<"short" | "detailed" | "bullet">("short");

  const {
    summary,
    studyNotes,
    takeaways,
    interviewQuestions,
    flashcards,
    quiz,
    loadingSummary,
    loadingNotes,
    loadingTakeaways,
    loadingInterview,
    loadingFlashcards,
    loadingQuiz,
    errorSummary,
    errorNotes,
    errorTakeaways,
    errorInterview,
    errorFlashcards,
    errorQuiz,
    generateSummary,
    generateStudyNotes,
    generateTakeaways,
    generateInterviewQuestions,
    generateFlashcards,
    generateQuiz,
  } = useLearningStore();



  // Playlist / Course Store
  const {
    playlistId,
    playlistTitle,
    videoCount,
    mode: playlistMode,
    isIndexed: playlistIndexed,
    indexing: playlistIndexing,
    indexingError: playlistIndexingError,
    status: playlistStatus,
    messages: playlistMessagesMap,
    loading: playlistLoading,
    streaming: playlistStreaming,
    error: playlistError,
    setMode: setPlaylistMode,
    detectAndLoadPlaylist,
    startIndexing: startPlaylistIndexing,
    sendPlaylistMessage,
    clearPlaylistChat,
  } = usePlaylistStore();

  const [playlistInputText, setPlaylistInputText] = useState("");
  const [courseMaxVideos, setCourseMaxVideos] = useState(10);

  const activeVideoId = currentVideo.videoId || "";
  const currentVideoMessages = activeVideoId ? (chatMessagesMap[activeVideoId] || []) : [];
  const currentPlaylistMessages = playlistId ? (playlistMessagesMap[playlistId] || []) : [];
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Monitor URL for playlist
  useEffect(() => {
    if (currentVideo.url) {
      detectAndLoadPlaylist(currentVideo.url);
    }
  }, [currentVideo.url]);

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
      } else if (activeTab === "flashcards") {
        generateFlashcards(currentVideo.videoId);
      } else if (activeTab === "quiz") {
        generateQuiz(currentVideo.videoId);
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

  const [focusedTimestamp, setFocusedTimestamp] = useState<number | null>(null);
  const [loadingFocusTime, setLoadingFocusTime] = useState(false);

  const formatSecondsToBadge = (seconds: number): string => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  const handleFocusCurrentMoment = async () => {
    setLoadingFocusTime(true);
    try {
      const time = await getCurrentVideoTime();
      setFocusedTimestamp(time);
    } finally {
      setLoadingFocusTime(false);
    }
  };

  const handleSendMessage = async () => {
    const queryText = inputText.trim();
    if (!queryText || !currentVideo.videoId) return;

    const timeToPass = focusedTimestamp !== null ? focusedTimestamp : undefined;
    setInputText("");
    await sendMessage(currentVideo.videoId, queryText, timeToPass);
    setFocusedTimestamp(null);
  };

  const handleSendPlaylistMessage = async () => {
    const q = playlistInputText.trim();
    if (!q || !playlistId) return;
    setPlaylistInputText("");
    await sendPlaylistMessage(q);
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
                } else if (activeTab === "flashcards") {
                  generateFlashcards(currentVideo.videoId, true);
                } else if (activeTab === "quiz") {
                  generateQuiz(currentVideo.videoId, true);
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

      {/* Course Playlist Mode Switcher Banner */}
      {playlistId && (
        <div className="px-3.5 py-1.5 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-[9px] font-bold text-amber-400 bg-amber-950/60 border border-amber-800/60 px-1.5 py-0.5 rounded uppercase tracking-wider shrink-0">
              Playlist
            </span>
            <span className="text-[11px] text-slate-300 font-medium truncate" title={playlistTitle || undefined}>
              {playlistTitle || "Course Playlist"} ({videoCount} videos)
            </span>
          </div>

          <div className="flex items-center gap-1 shrink-0 bg-slate-950 p-0.5 rounded-lg border border-slate-800">
            <button
              onClick={() => setPlaylistMode("single")}
              className={`px-2 py-0.5 text-[10px] rounded-md font-semibold transition-all ${
                playlistMode === "single"
                  ? "bg-slate-800 text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Single Video
            </button>
            <button
              onClick={() => setPlaylistMode("course")}
              className={`px-2 py-0.5 text-[10px] rounded-md font-semibold flex items-center gap-1 transition-all ${
                playlistMode === "course"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <span>Course Mode</span>
              <BookOpen className="h-2.5 w-2.5" />
            </button>
          </div>
        </div>
      )}

      {/* Main Panel Viewport */}
      <main className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {playlistMode === "course" && playlistId ? (
          <div className="flex-1 flex flex-col min-h-0">
            {/* Course Header Banner */}
            <div className="bg-slate-900/40 border-b border-slate-900 p-3.5 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-0.5 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <BookOpen className="h-4 w-4 text-primary shrink-0" />
                    <span className="text-[10px] uppercase font-bold text-slate-400">Course Knowledge Base</span>
                  </div>
                  <h3 className="text-xs font-bold text-slate-100 truncate">
                    {playlistTitle || "YouTube Course Playlist"}
                  </h3>
                </div>

                {playlistIndexed && (
                  <button
                    onClick={clearPlaylistChat}
                    className="text-slate-500 hover:text-red-400 p-1 rounded hover:bg-slate-950 transition-colors shrink-0"
                    title="Clear Course Chat"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {playlistIndexed && playlistStatus ? (
                <div className="flex items-center justify-between text-[10px] bg-emerald-950/20 border border-emerald-900/40 rounded-xl px-2.5 py-1 text-emerald-400">
                  <span className="flex items-center gap-1 font-medium">
                    <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                    Indexed {playlistStatus.indexed_videos}/{playlistStatus.total_videos} Lectures ({playlistStatus.total_chunks} chunks)
                  </span>
                  <button
                    onClick={() => startPlaylistIndexing(courseMaxVideos)}
                    disabled={playlistIndexing}
                    className="text-[9px] text-emerald-300 hover:underline flex items-center gap-1"
                  >
                    <RotateCcw className={`h-2.5 w-2.5 ${playlistIndexing ? "animate-spin" : ""}`} />
                    Re-index
                  </button>
                </div>
              ) : null}
            </div>

            {/* If Course is NOT indexed yet, show 1-click Course Indexing Hub */}
            {!playlistIndexed ? (
              <div className="flex-1 p-6 flex flex-col items-center justify-center text-center space-y-4">
                <div className="h-12 w-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                  <BookOpen className="h-6 w-6" />
                </div>
                <div className="space-y-1 max-w-xs">
                  <h3 className="text-sm font-bold text-slate-100">Index Course for Cross-Video Q&A</h3>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    TubeMind AI will fetch transcripts for lectures in this playlist, process speech fallback, and build a unified course vector database.
                  </p>
                </div>

                <div className="flex items-center gap-2 text-xs text-slate-400 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-xl">
                  <span className="text-[11px]">Max lectures to index:</span>
                  <select
                    value={courseMaxVideos}
                    onChange={(e) => setCourseMaxVideos(parseInt(e.target.value))}
                    disabled={playlistIndexing}
                    className="bg-slate-950 border border-slate-800 rounded px-2 py-0.5 text-xs text-slate-200"
                  >
                    <option value={5}>5 lectures</option>
                    <option value={10}>10 lectures</option>
                    <option value={15}>15 lectures</option>
                    <option value={20}>20 lectures</option>
                  </select>
                </div>

                {playlistIndexingError && (
                  <div className="p-3 rounded-xl bg-red-950/30 border border-red-900/50 text-red-400 text-xs flex items-center gap-2 max-w-xs text-left">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <span>{playlistIndexingError}</span>
                  </div>
                )}

                <Button
                  onClick={() => startPlaylistIndexing(courseMaxVideos)}
                  disabled={playlistIndexing}
                  className="bg-primary hover:bg-primary/90 text-white rounded-xl px-5 py-2.5 text-xs font-bold gap-2 shadow-lg shadow-primary/20"
                >
                  {playlistIndexing ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Indexing Course Transcripts...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" />
                      <span>Index Course Lectures (1-Click)</span>
                    </>
                  )}
                </Button>
              </div>
            ) : (
              /* Course Chat Area */
              <div className="flex-1 flex flex-col min-h-0">
                <div className="flex-1 overflow-y-auto p-4 space-y-3.5 scrollbar-thin">
                  {currentPlaylistMessages.length === 0 ? (
                    <div className="text-center py-12 space-y-2.5">
                      <Bot className="h-8 w-8 text-slate-700 mx-auto" />
                      <p className="text-xs text-slate-300 font-semibold">Course AI Tutor Ready</p>
                      <p className="text-[11px] text-slate-500 max-w-xs mx-auto leading-relaxed">
                        Ask questions that span multiple lectures. The AI will synthesize concepts across videos and cite the exact lectures.
                      </p>
                      <div className="flex flex-wrap gap-1.5 justify-center pt-2 max-w-xs mx-auto">
                        {["Which lecture covered this topic?", "Compare the concepts between early and later lectures", "Provide a comprehensive course summary"].map((prompt, i) => (
                          <button
                            key={i}
                            onClick={() => sendPlaylistMessage(prompt)}
                            disabled={playlistLoading || playlistStreaming}
                            className="text-[10px] text-slate-400 bg-slate-900 hover:bg-slate-800 hover:text-slate-200 border border-slate-800 rounded-full px-2.5 py-1 text-left transition-colors"
                          >
                            "{prompt}"
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {currentPlaylistMessages.map((msg, index) => (
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
                                ? "bg-primary text-white rounded-br-none shadow-md shadow-primary/10"
                                : "bg-slate-900 text-slate-200 rounded-bl-none border border-slate-800"
                            }`}
                          >
                            {msg.sender === "assistant" ? (
                              <div className="space-y-2">
                                <MarkdownRenderer content={msg.text} />
                                {msg.sources && msg.sources.length > 0 && (
                                  <div className="pt-2 border-t border-slate-800 space-y-1">
                                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">
                                      📚 Course Sources:
                                    </span>
                                    <div className="flex flex-wrap gap-1">
                                      {msg.sources.map((src, srcIdx) => (
                                        <button
                                          key={srcIdx}
                                          onClick={() => {
                                            if (src.video_id === currentVideo.videoId) {
                                              seekToTimestamp(src.start);
                                            } else {
                                              window.open(`https://www.youtube.com/watch?v=${src.video_id}&t=${Math.floor(src.start)}s`, "_blank");
                                            }
                                          }}
                                          className="text-[9px] bg-slate-950 border border-slate-800 hover:border-primary/50 text-slate-300 px-2 py-0.5 rounded-full flex items-center gap-1 transition-colors"
                                          title={`Lecture: ${src.video_title} (${src.formatted_citation})`}
                                        >
                                          <PlayCircle className="h-2.5 w-2.5 text-primary" />
                                          <span className="truncate max-w-[140px]">{src.formatted_citation}</span>
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            ) : (
                              msg.text
                            )}
                          </div>
                        </div>
                      ))}

                      {playlistStreaming && (
                        <div className="flex gap-2.5 items-center">
                          <div className="h-6 w-6 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center shrink-0">
                            <Bot className="h-3.5 w-3.5 text-primary animate-spin" />
                          </div>
                          <div className="bg-slate-900 border border-slate-800 rounded-2xl px-3.5 py-2 text-xs text-slate-400">
                            <Loading variant="spinner" message="Synthesizing course knowledge..." />
                          </div>
                        </div>
                      )}

                      {playlistError && (
                        <div className="p-3 rounded-xl bg-red-950/20 border border-red-900/50 text-red-400 text-xs flex gap-2 items-center">
                          <AlertTriangle className="h-4 w-4 shrink-0" />
                          <span>{playlistError}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Course Input Box */}
                <div className="p-3 border-t border-slate-900 bg-slate-900/60 backdrop-blur-md flex gap-2.5 items-end">
                  <textarea
                    value={playlistInputText}
                    onChange={(e) => setPlaylistInputText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSendPlaylistMessage();
                      }
                    }}
                    placeholder={playlistLoading || playlistStreaming ? "Tutor is analyzing course..." : "Ask anything across this course..."}
                    className="flex-1 bg-slate-950 border border-slate-900 text-slate-100 rounded-2xl px-4 py-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary resize-none h-10 min-h-10 max-h-24 scrollbar-thin transition-colors"
                    rows={1}
                    disabled={playlistLoading || playlistStreaming}
                  />
                  <Button
                    onClick={handleSendPlaylistMessage}
                    size="icon"
                    className="bg-blue-600 hover:bg-blue-500 text-white h-10 w-10 rounded-2xl transition-all duration-200 hover:scale-105 active:scale-95 shrink-0 shadow-lg shadow-blue-500/20 hover:shadow-blue-500/30 disabled:bg-slate-800 disabled:text-slate-600 disabled:shadow-none"
                    disabled={playlistLoading || playlistStreaming || !playlistInputText.trim()}
                  >
                    <Send className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        ) : tabError ? (
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
              {(["chat", "summary", "notes", "takeaways", "interview", "flashcards", "quiz"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`flex-1 min-w-[65px] py-2 text-[10px] font-bold uppercase tracking-wider rounded-t-lg border-b-2 transition-all ${
                    activeTab === tab
                      ? "text-primary border-primary bg-slate-900/50"
                      : "text-slate-500 border-transparent hover:text-slate-300"
                  }`}
                >
                  {tab === "notes"
                    ? "Notes"
                    : tab === "takeaways"
                    ? "Takeaways"
                    : tab === "interview"
                    ? "Interview"
                    : tab === "flashcards"
                    ? "Cards 🗂️"
                    : tab === "quiz"
                    ? "Quiz 📝"
                    : tab}
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
                          {transcriptSource === "groq_whisper"
                            ? `🎙️ Whisper AI (${segmentCount} segments)`
                            : `Available (${segmentCount} segments)`}
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

              {/* Flashcards View */}
              {activeTab === "flashcards" && (() => {
                const rawCards = flashcards[activeVideoId] || "";
                const parsedCards = parseFlashcards(rawCards);

                return (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Layers className="h-4 w-4 text-primary" />
                        <span className="text-xs font-bold text-slate-200">Study Flashcards</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => currentVideo.videoId && generateFlashcards(currentVideo.videoId, true)}
                          disabled={loadingFlashcards}
                          className="px-2 py-1 rounded bg-slate-900 hover:bg-slate-800 text-slate-300 text-[10px] font-semibold flex items-center gap-1 border border-slate-800 transition-colors disabled:opacity-50"
                          title="Regenerate Flashcards"
                        >
                          <RotateCcw className={`h-3 w-3 ${loadingFlashcards ? "animate-spin text-primary" : ""}`} />
                          Regenerate
                        </button>
                      </div>
                    </div>

                    {loadingFlashcards ? (
                      <div className="py-12 flex flex-col items-center justify-center space-y-3">
                        <Loader2 className="h-6 w-6 animate-spin text-primary" />
                        <span className="text-xs text-slate-400 font-medium">Generating interactive flashcards...</span>
                      </div>
                    ) : errorFlashcards ? (
                      <div className="p-4 rounded-xl bg-red-950/30 border border-red-900/50 text-red-400 text-xs flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 shrink-0" />
                        <span>{errorFlashcards}</span>
                      </div>
                    ) : parsedCards.length > 0 ? (
                      <FlashcardDeck cards={parsedCards} videoTitle={metadata?.title || currentVideo.title || undefined} />
                    ) : (
                      <p className="text-[11px] text-slate-500 text-center py-10">No flashcards available for this video.</p>
                    )}
                  </div>
                );
              })()}

              {/* Quiz View */}
              {activeTab === "quiz" && (() => {
                const rawQuiz = quiz[activeVideoId] || "";
                const parsedQuiz = parseQuiz(rawQuiz);

                return (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <HelpCircle className="h-4 w-4 text-primary" />
                        <span className="text-xs font-bold text-slate-200">Interactive Quiz</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => currentVideo.videoId && generateQuiz(currentVideo.videoId, true)}
                          disabled={loadingQuiz}
                          className="px-2 py-1 rounded bg-slate-900 hover:bg-slate-800 text-slate-300 text-[10px] font-semibold flex items-center gap-1 border border-slate-800 transition-colors disabled:opacity-50"
                          title="Regenerate Quiz"
                        >
                          <RotateCcw className={`h-3 w-3 ${loadingQuiz ? "animate-spin text-primary" : ""}`} />
                          Regenerate
                        </button>
                      </div>
                    </div>

                    {loadingQuiz ? (
                      <div className="py-12 flex flex-col items-center justify-center space-y-3">
                        <Loader2 className="h-6 w-6 animate-spin text-primary" />
                        <span className="text-xs text-slate-400 font-medium">Crafting multiple-choice questions...</span>
                      </div>
                    ) : errorQuiz ? (
                      <div className="p-4 rounded-xl bg-red-950/30 border border-red-900/50 text-red-400 text-xs flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 shrink-0" />
                        <span>{errorQuiz}</span>
                      </div>
                    ) : parsedQuiz.length > 0 ? (
                      <InteractiveQuiz questions={parsedQuiz} />
                    ) : (
                      <p className="text-[11px] text-slate-500 text-center py-10">No quiz questions generated.</p>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* Input Message Box */}
            {activeTab === "chat" && (
              <div className="p-3 border-t border-slate-900 bg-slate-900/60 backdrop-blur-md space-y-2">
                {/* Moment Focus Bar */}
                <div className="flex items-center justify-between text-[11px] px-1">
                  {focusedTimestamp !== null ? (
                    <div className="flex items-center gap-1.5 bg-primary/15 border border-primary/30 px-2 py-0.5 rounded-full text-primary font-medium animate-in fade-in duration-200">
                      <Target className="h-3 w-3 animate-pulse" />
                      <span>Scene Focus: {formatSecondsToBadge(focusedTimestamp)} (±90s)</span>
                      <button
                        onClick={() => setFocusedTimestamp(null)}
                        className="hover:text-red-400 p-0.5 rounded-full transition-colors ml-0.5"
                        title="Clear scene focus"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={handleFocusCurrentMoment}
                      disabled={loadingFocusTime || chatLoading || chatStreaming}
                      className="flex items-center gap-1.5 text-slate-400 hover:text-primary transition-colors py-0.5 px-2 rounded-full border border-dashed border-slate-800 hover:border-primary/50 text-[10px] font-medium"
                      title="Pin current video playback timestamp to ask scene-specific questions"
                    >
                      {loadingFocusTime ? (
                        <Loader2 className="h-3 w-3 animate-spin text-primary" />
                      ) : (
                        <Target className="h-3 w-3 text-primary" />
                      )}
                      <span>Ask About This Moment 🎯</span>
                    </button>
                  )}
                  {focusedTimestamp !== null && (
                    <span className="text-[10px] text-slate-500 italic">
                      Context locked to playback scene
                    </span>
                  )}
                </div>

                <div className="flex gap-2.5 items-end">
                  <textarea
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage();
                      }
                    }}
                    placeholder={
                      chatLoading || chatStreaming
                        ? "Tutor is writing..."
                        : focusedTimestamp !== null
                        ? `Ask about moment around ${formatSecondsToBadge(focusedTimestamp)}...`
                        : "Ask about this video..."
                    }
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
