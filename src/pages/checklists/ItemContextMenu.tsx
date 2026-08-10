import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Move, Pencil, Copy, Download, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function ItemContextMenu({ type, onAction, onClose }: {
  type: "folder" | "checklist";
  onAction: (action: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation("checklists");
  const folderActions = [
    { key: "move", label: t("contextMenu.moveToFolder"), icon: Move },
    { key: "rename", label: t("contextMenu.rename"), icon: Pencil },
    { key: "delete", label: t("contextMenu.delete"), icon: Trash2 },
  ];
  const checklistActions = [
    { key: "edit", label: t("contextMenu.edit"), icon: Pencil },
    { key: "duplicate", label: t("contextMenu.duplicate"), icon: Copy },
    { key: "move", label: t("contextMenu.moveToFolder"), icon: Move },
    { key: "download", label: t("contextMenu.downloadPdf"), icon: Download },
    { key: "delete", label: t("contextMenu.delete"), icon: Trash2 },
  ];
  const actions = type === "folder" ? folderActions : checklistActions;

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end justify-center pb-16 bg-foreground/20 backdrop-blur-sm animate-fade-in sm:items-center sm:pb-0 sm:px-4 sm:py-8" onClick={onClose}>
      <div className="bg-card w-full max-w-lg rounded-t-2xl p-2 pb-20 animate-fade-in sm:max-w-xl sm:rounded-2xl sm:pb-4" onClick={e => e.stopPropagation()}>
        {actions.map(a => (
          <button key={a.key} onClick={() => { onAction(a.key); onClose(); }}
            className={cn("w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-muted/50 transition-colors text-left",
              a.key === "delete" && "text-status-error")}>
            <a.icon size={16} className={a.key === "delete" ? "text-status-error" : "text-muted-foreground"} />
            <span className={cn("text-sm", a.key === "delete" ? "text-status-error" : "text-foreground")}>{a.label}</span>
          </button>
        ))}
      </div>
    </div>,
    document.body
  );
}
