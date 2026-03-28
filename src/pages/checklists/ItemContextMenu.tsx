import { Move, Pencil, Copy, Download, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function ItemContextMenu({ type, onAction, onClose }: {
  type: "folder" | "checklist";
  onAction: (action: string) => void;
  onClose: () => void;
}) {
  const folderActions = [
    { key: "move", label: "Move to folder", icon: Move },
    { key: "rename", label: "Rename", icon: Pencil },
    { key: "delete", label: "Delete", icon: Trash2 },
  ];
  const checklistActions = [
    { key: "edit", label: "Edit", icon: Pencil },
    { key: "duplicate", label: "Duplicate", icon: Copy },
    { key: "move", label: "Move to folder", icon: Move },
    { key: "download", label: "Download as PDF", icon: Download },
    { key: "delete", label: "Delete", icon: Trash2 },
  ];
  const actions = type === "folder" ? folderActions : checklistActions;

  return (
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
    </div>
  );
}
