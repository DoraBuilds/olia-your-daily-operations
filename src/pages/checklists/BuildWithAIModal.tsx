import { useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { X, Sparkles, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import type { SectionDef } from "./types";

export function BuildWithAIModal({ onClose, onGenerate }: { onClose: () => void; onGenerate: (title: string, sections: SectionDef[]) => void }) {
  const { t } = useTranslation("checklists");
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
      if (!title || !Array.isArray(sections)) throw new Error(t("buildAI.unexpectedResponse"));
      onGenerate(title, sections);
      onClose();
    } catch (e: any) {
      setError(e?.message ?? t("buildAI.genericError"));
    } finally {
      setGenerating(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end justify-center pb-16 bg-foreground/20 backdrop-blur-sm animate-fade-in sm:items-center sm:pb-0 sm:px-4 sm:py-8">
      <div className="bg-card w-full max-w-lg rounded-t-2xl p-5 pb-20 space-y-5 animate-fade-in sm:max-w-2xl sm:rounded-2xl sm:pb-8">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg text-foreground flex items-center gap-2">
            {t("buildAI.heading")}
            <Sparkles size={16} className="text-lavender" />
          </h2>
          <button onClick={onClose} className="btn-icon">
            <X size={18} className="text-muted-foreground" />
          </button>
        </div>
        <p className="text-sm text-muted-foreground">{t("buildAI.description")}</p>
        <textarea
          autoFocus
          placeholder={t("buildAI.promptPlaceholder")}
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
          {generating ? t("buildAI.generating") : t("buildAI.generate")}
        </button>
      </div>
    </div>,
    document.body
  );
}
