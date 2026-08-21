import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { X, ClipboardList, FileUp, Sparkles, FolderPlus, ChevronRight } from "lucide-react";

export function CreateMenuSheet({ onClose, onBuildOwn, onConvertFile, onBuildAI, onCreateFolder }: {
  onClose: () => void;
  onBuildOwn: () => void;
  onConvertFile: () => void;
  onBuildAI: () => void;
  onCreateFolder: () => void;
}) {
  const { t } = useTranslation("checklists");
  const items = [
    { label: t("createMenu.buildOwn"), icon: ClipboardList, action: onBuildOwn },
    { label: t("createMenu.convertFile"), sublabel: t("createMenu.convertFileSub"), icon: FileUp, action: onConvertFile },
    { label: t("createMenu.buildAI"), icon: Sparkles, action: onBuildAI, hasAiIcon: true },
    { label: t("createMenu.createFolder"), icon: FolderPlus, action: onCreateFolder },
  ];

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-foreground/20 px-4 pb-8 backdrop-blur-sm animate-fade-in sm:items-center sm:px-6 sm:py-10">
      <div className="bg-card w-full max-w-md rounded-3xl border border-border p-5 pb-6 space-y-1 shadow-2xl animate-fade-in">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-lg text-foreground">{t("createMenu.heading")}</h2>
          <button onClick={onClose} className="btn-icon" aria-label={t("close")}>
            <X size={18} className="text-muted-foreground" />
          </button>
        </div>
        {items.map(item => (
          <button key={item.label} onClick={() => { item.action(); onClose(); }}
            className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl hover:bg-muted/50 transition-colors text-left">
            <div className="w-9 h-9 rounded-xl bg-sage-light flex items-center justify-center shrink-0">
              <item.icon size={18} className="text-sage-deep" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground flex items-center gap-1.5">
                {item.label}
                {item.hasAiIcon && <Sparkles size={13} className="text-lavender" />}
              </p>
              {item.sublabel && <p className="text-xs text-muted-foreground">{item.sublabel}</p>}
            </div>
            <ChevronRight size={14} className="text-muted-foreground" />
          </button>
        ))}
      </div>
    </div>,
    document.body
  );
}
