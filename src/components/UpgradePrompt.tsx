import { useNavigate } from "react-router-dom";
import { Sparkles, X } from "lucide-react";
import { PLAN_LABELS, type Plan } from "@/lib/plan-features";

interface UpgradePromptProps {
  feature: string;          // Human-readable feature name, e.g. "AI checklist builder"
  requiredPlan?: Plan;      // Which plan unlocks it (default: "growth")
  onClose: () => void;
}

export function UpgradePrompt({
  feature,
  requiredPlan = "growth",
  onClose,
}: UpgradePromptProps) {
  const navigate = useNavigate();

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-foreground/20 backdrop-blur-sm animate-fade-in">
      <div className="bg-card w-full max-w-lg rounded-t-2xl p-5 pb-10 space-y-4 animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-lavender/15 flex items-center justify-center">
              <Sparkles size={15} className="text-lavender" />
            </div>
            <h2 className="font-display text-base text-foreground">Upgrade to unlock</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-muted transition-colors"
          >
            <X size={18} className="text-muted-foreground" />
          </button>
        </div>

        {/* Body */}
        <p className="text-sm text-muted-foreground leading-relaxed">
          <span className="text-foreground font-medium">{feature}</span> is available on the{" "}
          <span className="text-foreground font-medium">{PLAN_LABELS[requiredPlan]}</span> plan
          and above.
        </p>

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl text-sm font-medium text-muted-foreground bg-muted hover:bg-muted/70 transition-colors"
          >
            Not now
          </button>
          <button
            onClick={() => { onClose(); navigate("/billing"); }}
            className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-sage text-primary-foreground hover:bg-sage-deep transition-colors"
          >
            See plans
          </button>
        </div>
      </div>
    </div>
  );
}
