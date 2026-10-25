import { useEffect } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSettingsStore } from "@/stores/settingsStore";
import { Save, RotateCcw, ShieldCheck, Cpu, KeySquare } from "lucide-react";

export function App() {
  const { settings, loading, loadSettings, updateSettings, resetSettings } = useSettingsStore();

  useEffect(() => {
    loadSettings();
  }, []);

  const handleSave = () => {
    // Already synced dynamically, but we can explicitly show feedback
    alert("Configurations persisted successfully to sync storage!");
  };

  const handleReset = async () => {
    if (confirm("Are you sure you want to reset all preferences to default values?")) {
      await resetSettings();
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center">
        <p className="animate-pulse text-sm text-slate-500">Loading settings...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6 selection:bg-primary selection:text-primary-foreground">
      <div className="w-full max-w-xl space-y-6">
        
        {/* Page title header */}
        <header className="flex flex-col space-y-1">
          <h1 className="text-3xl font-extrabold text-white tracking-tight">
            TubeMind <span className="text-primary font-black">AI</span>
          </h1>
          <p className="text-sm text-slate-400">Settings and System Configuration</p>
        </header>

        {/* Configurations Card */}
        <Card className="bg-slate-900 border-slate-900 text-slate-100 shadow-xl shadow-slate-950/50">
          <CardHeader className="border-b border-slate-950 pb-4">
            <CardTitle className="text-lg font-semibold text-white">General Settings</CardTitle>
            <CardDescription className="text-slate-400 text-xs">
              Configure parameters to connect to the backend server and theme layouts.
            </CardDescription>
          </CardHeader>
          
          <CardContent className="space-y-5 pt-5">
            {/* Backend URL Input */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
                Backend API Server Endpoint
              </label>
              <Input
                value={settings.backendUrl}
                onChange={(e) => updateSettings({ backendUrl: e.target.value })}
                className="bg-slate-950 border-slate-950 text-slate-100 text-sm focus-visible:ring-primary h-10 rounded-xl"
                placeholder="http://127.0.0.1:8000"
              />
              <span className="text-[10px] text-slate-500 block">
                Default: http://127.0.0.1:8000. Changes apply globally across popup and side panel.
              </span>
            </div>

            {/* Color Theme Preference */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
                Interface Color Scheme
              </label>
              <select
                value={settings.theme}
                onChange={(e) => updateSettings({ theme: e.target.value as any })}
                className="w-full bg-slate-950 border border-slate-950 rounded-xl p-2.5 text-sm text-slate-300 focus:outline-none focus:ring-1 focus:ring-primary h-10 transition-all duration-200"
              >
                <option value="system">System Preference</option>
                <option value="dark">Dark Theme</option>
                <option value="light">Light Theme</option>
              </select>
            </div>

            {/* AI Model selector (disabled) */}
            <div className="space-y-2 opacity-50 select-none pointer-events-none pt-2">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Cpu className="h-4 w-4 text-primary" /> Target AI Model (Future Feature)
              </label>
              <select
                disabled
                className="w-full bg-slate-950 border border-slate-950 rounded-xl p-2.5 text-sm text-slate-400 h-10"
              >
                <option value="tubemind-model-v1">TubeMind LLM Model v1 (Standard)</option>
                <option value="deepseek-r1">DeepSeek R1 (Premium)</option>
              </select>
            </div>

            {/* API Key configuration (disabled) */}
            <div className="space-y-2 opacity-50 select-none pointer-events-none">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <KeySquare className="h-4 w-4 text-primary" /> API Key Section (Future Feature)
              </label>
              <Input
                disabled
                type="password"
                className="bg-slate-950 border-slate-950 text-slate-400 text-sm h-10 rounded-xl"
                placeholder="tm-ai_live_••••••••••••••••"
              />
            </div>
          </CardContent>
          
          <CardFooter className="flex items-center justify-between border-t border-slate-950 mt-4 pt-4">
            <Button
              onClick={handleReset}
              variant="outline"
              className="border-slate-950 hover:bg-slate-950 text-slate-400 hover:text-white flex items-center gap-2 rounded-xl transition-all duration-200"
            >
              <RotateCcw className="h-4 w-4" /> Reset Defaults
            </Button>
            
            <Button
              onClick={handleSave}
              className="bg-primary hover:bg-primary/90 text-white flex items-center gap-2 rounded-xl transition-all duration-200"
            >
              <Save className="h-4 w-4" /> Save Settings
            </Button>
          </CardFooter>
        </Card>

        {/* Second Brain Integration Card */}
        <Card className="bg-slate-900 border-slate-900 text-slate-100 shadow-xl shadow-slate-950/50">
          <CardHeader className="border-b border-slate-950 pb-4">
            <CardTitle className="text-lg font-semibold text-white flex items-center gap-2">
              <span>Second Brain Direct Sync</span>
              <span className="text-[10px] font-bold bg-primary/20 text-primary border border-primary/30 px-2 py-0.5 rounded-full uppercase">
                Notion & Obsidian
              </span>
            </CardTitle>
            <CardDescription className="text-slate-400 text-xs">
              Export study notes, summaries, and takeaways directly into your Notion workspace or Obsidian knowledge vault with 1 click.
            </CardDescription>
          </CardHeader>
          
          <CardContent className="space-y-4 pt-5">
            {/* Notion API Key */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
                Notion Integration Secret (API Token)
              </label>
              <Input
                type="password"
                value={settings.notionApiKey || ""}
                onChange={(e) => updateSettings({ notionApiKey: e.target.value })}
                className="bg-slate-950 border-slate-950 text-slate-100 text-sm focus-visible:ring-primary h-10 rounded-xl font-mono"
                placeholder="ntn_... or secret_..."
              />
              <span className="text-[10px] text-slate-500 block">
                Create an internal integration at <a href="https://www.notion.so/profile/integrations" target="_blank" rel="noreferrer" className="text-primary hover:underline">notion.so/profile/integrations</a> and share your notes database with it.
              </span>
            </div>

            {/* Notion Database / Page ID */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
                Notion Database ID or Parent Page ID
              </label>
              <Input
                value={settings.notionDatabaseId || ""}
                onChange={(e) => updateSettings({ notionDatabaseId: e.target.value })}
                className="bg-slate-950 border-slate-950 text-slate-100 text-sm focus-visible:ring-primary h-10 rounded-xl font-mono"
                placeholder="32-character ID or full Notion URL"
              />
              <span className="text-[10px] text-slate-500 block">
                Found in your Notion page URL: https://notion.so/workspace/Page-Title-[ID]
              </span>
            </div>

            {/* Obsidian Vault Name */}
            <div className="space-y-1.5 pt-1">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
                Obsidian Vault Name (Optional)
              </label>
              <Input
                value={settings.obsidianVaultName || ""}
                onChange={(e) => updateSettings({ obsidianVaultName: e.target.value })}
                className="bg-slate-950 border-slate-950 text-slate-100 text-sm focus-visible:ring-primary h-10 rounded-xl"
                placeholder="e.g. My Vault, KnowledgeBase"
              />
              <span className="text-[10px] text-slate-500 block">
                Enables 1-click launch via obsidian:// protocol to directly write notes into your vault.
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Security / Health disclaimer */}
        <div className="rounded-xl bg-slate-900 border border-slate-950 p-4 text-xs text-slate-400 flex gap-3 shadow-md shadow-slate-950/20">
          <ShieldCheck className="h-5 w-5 shrink-0 text-emerald-500" />
          <div className="space-y-1">
            <h4 className="font-bold text-white leading-none">Settings Sync Activated</h4>
            <p className="leading-relaxed text-[11px]">
              Settings are stored securely using Google Chrome Sync storage and will automatically synchronize across your active browser sessions.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
