import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ResponseType } from "./types";
import { RESPONSE_TYPES, multipleChoiceSets } from "./data";

export function ResponseTypePicker({ onSelect, onClose }: {
  onSelect: (type: ResponseType, mcSetId?: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center pb-16 bg-foreground/20 backdrop-blur-sm animate-fade-in">
      <div className="bg-card w-full max-w-lg rounded-t-2xl flex flex-col max-h-[85vh] animate-fade-in">
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-border shrink-0">
          <h2 className="font-display text-lg text-foreground">Type of response</h2>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-muted transition-colors">
            <X size={18} className="text-muted-foreground" />
          </button>
        </div>
        <div className="overflow-y-auto flex-1 pb-20">
          <p className="px-5 pt-4 pb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Responses</p>
          {RESPONSE_TYPES.map(rt => (
            <button key={rt.key} onClick={() => { onSelect(rt.key); onClose(); }}
              className="w-full flex items-center gap-3 px-5 py-3 hover:bg-muted/50 transition-colors text-left">
              <rt.icon size={18} className="text-sage shrink-0" />
              <span className="text-sm text-foreground">{rt.label}</span>
            </button>
          ))}
          <p className="px-5 pt-4 pb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Multiple choice</p>
          {multipleChoiceSets.map(mc => (
            <button key={mc.id} onClick={() => { onSelect("multiple_choice", mc.id); onClose(); }}
              className="w-full flex items-center gap-3 px-5 py-3 hover:bg-muted/50 transition-colors text-left">
              <div className="flex gap-1 flex-wrap">
                {mc.choices.map((c, i) => (
                  <span key={i} className={cn("text-xs px-2 py-0.5 rounded-full font-medium", mc.colors[i])}>{c}</span>
                ))}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
