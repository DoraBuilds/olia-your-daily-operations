import { X, ClipboardList, FileUp, Sparkles, FolderPlus, ChevronRight } from "lucide-react";

export function CreateMenuSheet({ onClose, onBuildOwn, onConvertFile, onBuildAI, onCreateFolder }: {
  onClose: () => void;
  onBuildOwn: () => void;
  onConvertFile: () => void;
  onBuildAI: () => void;
  onCreateFolder: () => void;
}) {
  const items = [
    { label: "Build your own checklist", icon: ClipboardList, action: onBuildOwn },
    { label: "Convert file", sublabel: "Excel, image or PDF", icon: FileUp, action: onConvertFile },
    { label: "Build with AI", icon: Sparkles, action: onBuildAI, hasAiIcon: true },
    { label: "Create a folder", icon: FolderPlus, action: onCreateFolder },
  ];

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-foreground/20 px-4 pb-8 backdrop-blur-sm animate-fade-in sm:items-center sm:px-6 sm:py-10">
      <div className="bg-card w-full max-w-md rounded-3xl border border-border p-5 pb-6 space-y-1 shadow-2xl animate-fade-in">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-lg text-foreground">Create new</h2>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-muted transition-colors">
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
    </div>
  );
}
