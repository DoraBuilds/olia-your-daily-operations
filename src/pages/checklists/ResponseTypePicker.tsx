import type { CSSProperties } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ResponseType } from "./types";
import { RESPONSE_TYPES, multipleChoiceSets } from "./data";

export type ResponseTypePickerAnchorRect = Pick<DOMRect, "top" | "right" | "bottom" | "left" | "width" | "height">;

function getAnchoredStyle(anchorRect: ResponseTypePickerAnchorRect): CSSProperties {
  const viewportWidth = typeof window !== "undefined" ? window.innerWidth : 1280;
  const viewportHeight = typeof window !== "undefined" ? window.innerHeight : 800;
  const padding = 16;
  const panelWidth = Math.min(380, viewportWidth - padding * 2);
  const panelMaxHeight = Math.min(460, viewportHeight - padding * 2);
  const preferredTop = anchorRect.bottom + 12;
  const fitsBelow = preferredTop + panelMaxHeight <= viewportHeight - padding;
  const top = fitsBelow
    ? preferredTop
    : Math.max(padding, anchorRect.top - panelMaxHeight - 12);
  const left = Math.min(
    Math.max(anchorRect.left, padding),
    Math.max(padding, viewportWidth - panelWidth - padding),
  );

  return {
    top,
    left,
    width: panelWidth,
    maxHeight: panelMaxHeight,
  };
}

export function ResponseTypePicker({ onSelect, onClose, anchorRect }: {
  onSelect: (type: ResponseType, mcSetId?: string) => void;
  onClose: () => void;
  anchorRect?: ResponseTypePickerAnchorRect | null;
}) {
  const isAnchored = Boolean(anchorRect);
  const panelStyle = anchorRect ? getAnchoredStyle(anchorRect) : undefined;

  return (
    <div
      className={cn(
        "fixed inset-0 z-[60] bg-foreground/20 backdrop-blur-sm animate-fade-in",
        isAnchored ? "" : "flex items-end justify-center pb-16 sm:items-center sm:pb-0 sm:px-4 sm:py-8",
      )}
      onClick={onClose}
      role="presentation"
    >
      <div
        className={cn(
          "bg-card flex flex-col",
          isAnchored
            ? "fixed rounded-2xl shadow-2xl"
            : "w-full max-w-lg rounded-t-2xl max-h-[85vh] animate-fade-in sm:max-w-2xl sm:rounded-2xl sm:max-h-[90vh]",
        )}
        style={panelStyle}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
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
