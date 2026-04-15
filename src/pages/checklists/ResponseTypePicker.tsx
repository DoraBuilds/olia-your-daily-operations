import type { CSSProperties } from "react";
import { createPortal } from "react-dom";
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
  const availableBelow = Math.max(0, viewportHeight - anchorRect.bottom - padding - 12);
  const availableAbove = Math.max(0, anchorRect.top - padding - 12);
  const prefersBelow = availableBelow >= 260 || availableBelow >= availableAbove;
  const maxHeight = Math.min(460, Math.max(260, prefersBelow ? availableBelow : availableAbove));
  const top = prefersBelow
    ? anchorRect.bottom + 12
    : Math.max(padding, anchorRect.top - maxHeight - 12);
  const left = Math.min(
    Math.max(anchorRect.left, padding),
    Math.max(padding, viewportWidth - panelWidth - padding),
  );

  return {
    top,
    left,
    width: panelWidth,
    maxHeight,
  };
}

export function ResponseTypePicker({ onSelect, onClose, anchorRect }: {
  onSelect: (type: ResponseType, mcSetId?: string) => void;
  onClose: () => void;
  anchorRect?: ResponseTypePickerAnchorRect | null;
}) {
  // Always render into document.body via a portal so CSS transforms or
  // backdrop-filter on any ancestor (e.g. animate-fade-in uses translateY,
  // which creates a new containing block for position:fixed children) cannot
  // displace this overlay from its intended viewport-fixed position.
  const panelStyle = anchorRect ? getAnchoredStyle(anchorRect) : undefined;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] bg-foreground/20 backdrop-blur-sm flex items-center justify-center px-4 py-8"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="bg-card flex flex-col w-full max-w-lg rounded-2xl shadow-2xl max-h-[85vh]"
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
        <div className="overflow-y-auto flex-1 pb-6">
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
    </div>,
    document.body,
  );
}
