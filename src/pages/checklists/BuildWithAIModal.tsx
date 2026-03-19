import { useState } from "react";
import { X, Sparkles, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import type { SectionDef } from "./types";

export function BuildWithAIModal({ onClose, onGenerate }: { onClose: () => void; onGenerate: (title: string, sections: SectionDef[]) => void }) {
  const [prompt, setPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setGenerating(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke(
        "generate-checklist",
        { body: { prompt: prompt.trim() } }
      );
      if (fnError) throw new Error(fnError.message);
      if (data?.error) throw new Error(data.error);

      const { title, sections } = data as { title: string; sections: SectionDef[] };
      if (!title || !Array.isArray(sections)) throw new Error("Unexpected response from AI. Please try again.");
      onGenerate(title, sections);
      onClose();
    } catch (e: any) {
      setError(e?.message ?? "Something went wrong. Please try again.");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center pb-16 bg-foreground/20 backdrop-blur-sm animate-fade-in">
      <div className="bg-card w-full max-w-lg rounded-t-2xl p-5 pb-20 space-y-5 animate-fade-in">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg text-foreground flex items-center gap-2">
            Build with AI
            <Sparkles size={16} className="text-lavender" />
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-muted transition-colors">
            <X size={18} className="text-muted-foreground" />
          </button>
        </div>
        <p className="text-sm text-muted-foreground">Describe the checklist you need and AI will generate it for you.</p>
        <textarea
          autoFocus
          placeholder="e.g. Create a daily opening checklist for a restaurant kitchen with food safety, cleanliness, and equipment checks…"
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          rows={4}
          className="w-full border border-border rounded-xl px-4 py-3 text-sm bg-muted resize-none focus:outline-none focus:ring-1 focus:ring-ring"
        />
        {error && (
          <div className="flex items-start gap-2 text-status-error text-xs">
            <AlertCircle size={14} className="shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}
        <button
          disabled={!prompt.trim() || generating}
          onClick={handleGenerate}
          className={cn("w-full py-3 rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2",
            prompt.trim() && !generating ? "bg-sage text-primary-foreground hover:bg-sage-deep" : "bg-muted text-muted-foreground cursor-not-allowed"
          )}
        >
          <Sparkles size={14} />
          {generating ? "Generating…" : "Generate checklist"}
        </button>
      </div>
    </div>
  );
}
