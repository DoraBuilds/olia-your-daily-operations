import { useState } from "react";
import { AlertCircle, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import type { GeneratedTrainingModule, TrainingCategory } from "@/lib/training-ai";

export function TrainingAIModal({
  onClose,
  onGenerate,
}: {
  onClose: () => void;
  onGenerate: (module: GeneratedTrainingModule) => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [category, setCategory] = useState<TrainingCategory>("onboarding");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!prompt.trim()) return;

    setGenerating(true);
    setError(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke("generate-training", {
        body: { prompt: prompt.trim(), category },
      });

      if (fnError) throw new Error(fnError.message);
      if (data?.error) throw new Error(data.error);
      if (!data || typeof data !== "object") throw new Error("Unexpected response from AI. Please try again.");

      onGenerate(data as GeneratedTrainingModule);
      onClose();
    } catch (err: any) {
      setError(err?.message ?? "Something went wrong. Please try again.");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center pb-16 bg-foreground/20 backdrop-blur-sm animate-fade-in sm:items-center sm:pb-0 sm:px-4 sm:py-8">
      <div className="bg-card w-full max-w-lg rounded-t-2xl p-5 pb-20 space-y-5 animate-fade-in sm:max-w-2xl sm:rounded-2xl sm:pb-8">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg text-foreground flex items-center gap-2">
            Build training with AI
            <Sparkles size={16} className="text-lavender" />
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-muted transition-colors">
            <X size={18} className="text-muted-foreground" />
          </button>
        </div>

        <p className="text-sm text-muted-foreground">
          Describe the training module you need and AI will generate a practical step-by-step guide.
        </p>

        <div className="flex gap-2">
          {[
            { key: "onboarding" as const, label: "Onboarding" },
            { key: "troubleshooting" as const, label: "Troubleshooting" },
          ].map(option => (
            <button
              key={option.key}
              type="button"
              onClick={() => setCategory(option.key)}
              className={cn(
                "px-3 py-1.5 rounded-full border text-xs transition-colors",
                category === option.key
                  ? "bg-sage text-primary-foreground border-sage"
                  : "border-border text-muted-foreground hover:border-sage/40",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>

        <textarea
          autoFocus
          placeholder="e.g. Train a new server to handle a customer complaint calmly and professionally"
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
          className={cn(
            "w-full py-3 rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2",
            prompt.trim() && !generating
              ? "bg-sage text-primary-foreground hover:bg-sage-deep"
              : "bg-muted text-muted-foreground cursor-not-allowed",
          )}
        >
          <Sparkles size={14} />
          {generating ? "Generating…" : "Generate training module"}
        </button>
      </div>
    </div>
  );
}
