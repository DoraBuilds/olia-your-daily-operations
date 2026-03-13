import { X, Pencil, CheckSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ChecklistItem, ResponseType } from "./types";
import { RESPONSE_TYPES } from "./data";

export function ChecklistPreviewModal({ checklist, onClose, onEdit }: {
  checklist: ChecklistItem;
  onClose: () => void;
  onEdit: () => void;
}) {
  const sections = checklist.sections || [{
    id: "preview-sec",
    name: "",
    questions: Array.from({ length: checklist.questionsCount }, (_, i) => ({
      id: `pq-${i}`,
      text: `Question ${i + 1}`,
      responseType: "checkbox" as ResponseType,
      required: i < 2,
    })),
  }];

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-foreground/20 backdrop-blur-sm animate-fade-in">
      <div className="bg-card w-full max-w-lg rounded-t-2xl flex flex-col max-h-[90vh] animate-fade-in">
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-border shrink-0">
          <div className="flex-1 min-w-0">
            <h2 className="font-display text-lg text-foreground truncate">{checklist.title}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {checklist.questionsCount} questions{checklist.schedule ? ` · ${checklist.schedule}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={onEdit}
              className="flex items-center gap-1.5 text-xs font-medium text-sage px-3 py-1.5 rounded-full border border-sage/40 hover:bg-sage-light transition-colors">
              <Pencil size={12} /> Edit
            </button>
            <button onClick={onClose} className="p-1.5 rounded-full hover:bg-muted transition-colors">
              <X size={18} className="text-muted-foreground" />
            </button>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 pb-20">
          {sections.map((section, si) => (
            <div key={section.id}>
              {section.name && (
                <p className="px-5 pt-4 pb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{section.name}</p>
              )}
              {section.questions.map((q, qi) => {
                const rtDef = RESPONSE_TYPES.find(r => r.key === q.responseType);
                const RtIcon = rtDef?.icon || CheckSquare;
                return (
                  <div key={q.id} className="px-5 py-3.5 flex items-start gap-3 border-b border-border last:border-0">
                    <div className="w-6 h-6 rounded-lg bg-muted flex items-center justify-center shrink-0 mt-0.5">
                      <span className="text-[10px] font-semibold text-muted-foreground">{qi + 1}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground">{q.text || `Question ${qi + 1}`}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          <RtIcon size={10} /> {rtDef?.label || "Multiple choice"}
                        </span>
                        {q.required && <span className="text-[10px] text-status-error font-medium">Required</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
