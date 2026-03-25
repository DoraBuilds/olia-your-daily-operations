import { useEffect } from "react";
import { X, Pencil, CheckSquare, Square, Hash, Type, Calendar, Camera, PenLine, User, Info, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ChecklistItem, ResponseType } from "./types";
import { RESPONSE_TYPES } from "./data";

function MockResponse({ responseType }: { responseType: ResponseType }) {
  if (responseType === "checkbox") {
    return (
      <div className="flex gap-2 mt-2">
        {["Yes", "No", "N/A"].map(opt => (
          <div key={opt} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-muted/50 text-xs text-muted-foreground">
            <Square size={11} /> {opt}
          </div>
        ))}
      </div>
    );
  }
  if (responseType === "multiple_choice") {
    return (
      <div className="flex gap-2 mt-2 flex-wrap">
        {["Option A", "Option B", "Option C"].map(opt => (
          <div key={opt} className="px-3 py-1.5 rounded-lg border border-border bg-muted/50 text-xs text-muted-foreground">{opt}</div>
        ))}
      </div>
    );
  }
  if (responseType === "number") {
    return (
      <div className="mt-2 flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-muted/50 w-28">
        <Hash size={11} className="text-muted-foreground shrink-0" />
        <span className="text-xs text-muted-foreground">0.00</span>
      </div>
    );
  }
  if (responseType === "text") {
    return (
      <div className="mt-2 flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-muted/50">
        <Type size={11} className="text-muted-foreground shrink-0" />
        <span className="text-xs text-muted-foreground">Type your answer…</span>
      </div>
    );
  }
  // "datetime" removed from builder — legacy questions show text preview (falls through below)
  if (responseType === "media") {
    return (
      <div className="mt-2 flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-border bg-muted/30 w-32">
        <Camera size={11} className="text-muted-foreground shrink-0" />
        <span className="text-xs text-muted-foreground">Take photo</span>
      </div>
    );
  }
  // "signature" and "person" removed from builder — legacy saved checklists
  // that still contain these types fall through to the default text preview below.
  if (responseType === "instruction") {
    return (
      <div className="mt-2 px-3 py-2 rounded-lg bg-muted/40 border-l-2 border-l-sage/40">
        <div className="flex items-center gap-1.5">
          <Info size={11} className="text-sage shrink-0" />
          <span className="text-xs text-muted-foreground italic">Instruction content will appear here</span>
        </div>
      </div>
    );
  }
  return null;
}

export function ChecklistPreviewModal({ checklist, onClose, onEdit }: {
  checklist: ChecklistItem;
  onClose: () => void;
  onEdit: () => void;
}) {
  const sections = checklist.sections?.length ? checklist.sections : [{
    id: "preview-sec",
    name: "",
    questions: Array.from({ length: checklist.questionsCount || 1 }, (_, i) => ({
      id: `pq-${i}`,
      text: `Question ${i + 1}`,
      responseType: "checkbox" as ResponseType,
      required: i < 2,
    })),
  }];

  const totalQ = sections.reduce((sum, s) => sum + s.questions.length, 0);

  // ESC key closes the preview
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-foreground/20 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div className="bg-card w-full rounded-t-2xl flex flex-col max-h-[85vh] animate-fade-in" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-start justify-between px-5 pt-5 pb-3 border-b border-border shrink-0">
          <div className="flex-1 min-w-0 pr-3">
            <h2 className="font-display text-lg text-foreground leading-snug">{checklist.title}</h2>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className="text-xs text-muted-foreground">{totalQ} question{totalQ !== 1 ? "s" : ""}</span>
              {checklist.schedule && (
                <>
                  <span className="text-muted-foreground/40 text-xs">·</span>
                  <span className="text-xs text-muted-foreground">{checklist.schedule}</span>
                </>
              )}
              {checklist.time_of_day && checklist.time_of_day !== "anytime" && (
                <>
                  <span className="text-muted-foreground/40 text-xs">·</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-sage-light text-sage-deep capitalize">{checklist.time_of_day}</span>
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={onEdit}
              className="flex items-center gap-1.5 text-xs font-medium text-sage px-3 py-1.5 rounded-full border border-sage/40 hover:bg-sage-light transition-colors">
              <Pencil size={12} /> Edit
            </button>
            <button
              onClick={onClose}
              className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-muted hover:bg-muted/80 transition-colors text-xs font-medium text-muted-foreground"
            >
              <X size={14} />
              Close
            </button>
          </div>
        </div>

        {/* Questions */}
        <div className="overflow-y-auto flex-1">
          {sections.map((section, si) => (
            <div key={section.id}>
              {section.name && (
                <div className="px-5 pt-4 pb-2 flex items-center gap-3">
                  <div className="flex-1 h-px bg-border" />
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{section.name}</p>
                  <div className="flex-1 h-px bg-border" />
                </div>
              )}
              {section.questions.map((q, qi) => {
                const rtDef = RESPONSE_TYPES.find(r => r.key === q.responseType);
                const RtIcon = rtDef?.icon || CheckSquare;
                const globalIdx = sections.slice(0, si).reduce((sum, s) => sum + s.questions.length, 0) + qi;
                return (
                  <div key={q.id} className={cn("px-5 py-4", qi < section.questions.length - 1 && "border-b border-border/60")}>
                    <div className="flex items-start gap-3">
                      <div className="w-6 h-6 rounded-lg bg-muted flex items-center justify-center shrink-0 mt-0.5">
                        <span className="text-[10px] font-semibold text-muted-foreground">{globalIdx + 1}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start gap-2">
                          <p className="text-sm text-foreground flex-1">{q.text || `Question ${globalIdx + 1}`}</p>
                          {q.required && (
                            <span className="text-[10px] text-status-error font-medium shrink-0 mt-0.5">Required</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1 mt-1">
                          <RtIcon size={10} className="text-muted-foreground" />
                          <span className="text-[10px] text-muted-foreground">{rtDef?.label || "Multiple choice"}</span>
                        </div>
                        <MockResponse responseType={q.responseType} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}

          {/* Footer note */}
          <div className="px-5 py-4 border-t border-border mt-2">
            <p className="text-xs text-muted-foreground text-center">
              This is a structural preview. Staff will see and interact with this checklist from the Kiosk.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
