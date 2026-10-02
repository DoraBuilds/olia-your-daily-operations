import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { Sparkles, X, ExternalLink } from "lucide-react";
import { PLAN_LABELS, type Plan } from "@/lib/plan-features";
import { useTranslation, Trans } from "react-i18next";
import { useIsNativeApp } from "@/hooks/useIsNativeApp";

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
  const { t } = useTranslation("common");
  const navigate = useNavigate();
  const isNative = useIsNativeApp();

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-foreground/20 backdrop-blur-sm animate-fade-in sm:items-center sm:px-4 sm:py-8">
      <div className="bg-card w-full max-w-lg rounded-t-2xl p-5 pb-10 space-y-4 animate-fade-in sm:max-w-xl sm:rounded-2xl sm:pb-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-lavender/15 flex items-center justify-center">
              <Sparkles size={15} className="text-lavender" />
            </div>
            <h2 className="font-display text-base text-foreground">{t("upgrade.title")}</h2>
          </div>
          <button
            onClick={onClose}
            className="btn-icon"
            aria-label={t("close")}
          >
            <X size={18} className="text-muted-foreground" />
          </button>
        </div>

        {/* Body */}
        <p className="text-sm text-muted-foreground leading-relaxed">
          <Trans
            t={t}
            i18nKey="upgrade.body"
            values={{ feature, plan: PLAN_LABELS[requiredPlan] }}
            components={{ b: <span className="text-foreground font-medium" /> }}
          />
        </p>

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl text-sm font-medium text-muted-foreground bg-muted hover:bg-muted/70 transition-colors"
          >
            {t("upgrade.notNow")}
          </button>
          {isNative ? (
            <a
              href="https://olia.app/billing"
              target="_blank"
              rel="noopener noreferrer"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-sage text-primary-foreground hover:bg-sage-deep transition-colors flex items-center justify-center gap-1.5"
            >
              {t("upgrade.upgradeExternal")} <ExternalLink size={12} />
            </a>
          ) : (
            <button
              onClick={() => { onClose(); navigate("/billing"); }}
              className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-sage text-primary-foreground hover:bg-sage-deep transition-colors"
            >
              {t("upgrade.seePlans")}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
