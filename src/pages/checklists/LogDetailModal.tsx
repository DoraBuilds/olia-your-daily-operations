import { X, Camera, Check, MessageSquare, FileText, Hash, Type, Calendar, GitBranch, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { exportLogDetailPdf } from "@/lib/export-utils";
import type { LogEntry } from "./types";

/** Normalise the question type stored in the DB to a consistent rendering key.
 *  The kiosk writes the builder's ResponseType values ("number", "text", etc.).
 *  Older mock data used "checkbox", "numeric", "photo".
 *  We handle both families here so real kiosk completions render correctly.
 */
function normaliseType(raw: string | undefined): string {
  if (!raw) return "text";
  if (raw === "numeric") return "number"; // legacy mock alias
  return raw;
}

/** An instruction-type question is display-only — the respondent never "answers" it.
 *  Never mark it as unanswered / show it with a red background. */
function isAnswered(type: string, ans: any): boolean {
  if (type === "instruction") return true; // always passes — display-only
  if (type === "checkbox") return ans.answer === "yes" || ans.answer === "true";
  if (type === "number") return !!ans.answer && ans.answer !== "0" && ans.answer !== "";
  if (type === "photo") return !!ans.hasPhoto;
  // text / multiple_choice / datetime / person / signature
  return !!ans.answer && ans.answer !== "" && ans.answer !== "undefined";
}

export function LogDetailModal({ log, onClose }: { log: LogEntry; onClose: () => void }) {
  const scoreColor =
    log.score == null ? "text-muted-foreground" :
    log.score >= 85 ? "text-status-ok" :
    log.score >= 65 ? "text-status-warn" :
    "text-status-error";

  const handleExportPdf = async () => {
    // Format ISO timestamps to HH:MM for display in the PDF header.
    const toTime = (iso: string | undefined) =>
      iso ? new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : undefined;

    await exportLogDetailPdf({
      checklist:   log.checklist,
      completedBy: log.completedBy,
      date:        log.date,
      score:       log.score,
      startedAt:   toTime(log.startedAt),    // present for logs after migration 20260326000001
      finishedAt:  toTime(log.finishedAt) ?? log.date, // always show at minimum
      answers:     log.answers,
    });
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-foreground/20 backdrop-blur-sm animate-fade-in sm:items-center sm:px-4 sm:py-8" onClick={onClose}>
      <div className="bg-card w-full rounded-t-2xl flex flex-col max-h-[85vh] animate-fade-in sm:max-w-2xl sm:rounded-2xl sm:max-h-[90vh]" onClick={e => e.stopPropagation()}>
        <div className="flex flex-col gap-3 px-5 pt-5 pb-4 border-b border-border shrink-0 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h2 className="font-display text-lg text-foreground">{log.checklist}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{log.completedBy} · {log.date}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            <span className={cn("text-lg font-semibold", scoreColor)}>{log.score == null ? "—" : `${log.score}%`}</span>
            <button onClick={handleExportPdf}
              className="flex items-center gap-1.5 text-xs font-medium text-sage px-3 py-1.5 rounded-full border border-sage/40 hover:bg-sage-light transition-colors">
              <FileText size={12} /> Export PDF
            </button>
            <button onClick={onClose} className="p-1.5 rounded-full hover:bg-muted transition-colors">
              <X size={18} className="text-muted-foreground" />
            </button>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 divide-y divide-border">
          {(log.answers ?? []).map((ans, i) => {
            const type = normaliseType(ans.type);
            const answered = isAnswered(type, ans);

            return (
              <div key={i} className={cn("px-5 py-4", !answered && "bg-status-error/5")}>
                <div className="flex items-start gap-3">
                  {/* ─── Type icon ─── */}
                  {type === "checkbox" && (
                    <div className={cn("mt-0.5 w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0",
                      answered ? "bg-sage border-sage" : "border-status-error bg-status-error/10")}>
                      {answered
                        ? <Check size={11} className="text-primary-foreground" strokeWidth={3} />
                        : <X size={10} className="text-status-error" strokeWidth={3} />}
                    </div>
                  )}
                  {type === "number" && (
                    <div className={cn("mt-0.5 w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 text-[10px] font-semibold",
                      answered ? "bg-sage border-sage text-primary-foreground" : "border-status-error")}>
                      <Hash size={9} strokeWidth={2.5} />
                    </div>
                  )}
                  {type === "photo" && (
                    <div className={cn("mt-0.5 w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0",
                      answered ? "bg-sage border-sage" : "border-status-error bg-status-error/10")}>
                      <Camera size={10} className={answered ? "text-primary-foreground" : "text-status-error"} />
                    </div>
                  )}
                  {(type === "text" || type === "multiple_choice") && (
                    <div className={cn("mt-0.5 w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0",
                      answered ? "bg-sage border-sage" : "border-status-error bg-status-error/10")}>
                      <Type size={9} className={answered ? "text-primary-foreground" : "text-status-error"} />
                    </div>
                  )}
                  {type === "datetime" && (
                    <div className={cn("mt-0.5 w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0",
                      answered ? "bg-sage border-sage" : "border-status-error bg-status-error/10")}>
                      <Calendar size={9} className={answered ? "text-primary-foreground" : "text-status-error"} />
                    </div>
                  )}
                  {type === "instruction" && (
                    <div className="mt-0.5 w-5 h-5 rounded-md border-2 border-sage/30 bg-sage-light flex items-center justify-center shrink-0">
                      <Info size={9} className="text-sage" />
                    </div>
                  )}
                  {/* Fallback for unknown types */}
                  {!["checkbox", "number", "photo", "text", "multiple_choice", "datetime", "instruction"].includes(type) && (
                    <div className={cn("mt-0.5 w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0",
                      answered ? "bg-sage border-sage" : "border-status-error bg-status-error/10")}>
                      <GitBranch size={9} className={answered ? "text-primary-foreground" : "text-status-error"} />
                    </div>
                  )}

                  {/* ─── Content ─── */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm text-foreground leading-snug">{ans.label}</p>
                      {ans.required && <span className="text-xs text-muted-foreground/60">Required</span>}
                      {type === "instruction" && (
                        <span className="text-[10px] text-sage/70 font-medium uppercase tracking-wide">Instruction</span>
                      )}
                    </div>

                    {/* Answer value */}
                    {type === "checkbox" && (
                      <p className={cn("mt-1 text-xs font-medium", answered ? "text-status-ok" : "text-status-error")}>
                        {answered ? "Completed" : "Not completed"}
                      </p>
                    )}
                    {type === "number" && ans.answer && (
                      <p className="mt-1 text-sm font-medium text-foreground">{ans.answer}</p>
                    )}
                    {type === "number" && !ans.answer && (
                      <p className="mt-1 text-xs text-status-error font-medium">No value entered</p>
                    )}
                    {type === "photo" && (answered ? (
                      <div className="mt-2 w-24 h-16 rounded-lg bg-muted flex items-center justify-center border border-border">
                        <Camera size={18} className="text-muted-foreground" />
                        <span className="text-xs text-muted-foreground ml-1">Photo</span>
                      </div>
                    ) : <p className="mt-1 text-xs text-status-error font-medium">No photo attached</p>)}
                    {(type === "text" || type === "multiple_choice" || type === "datetime") && (
                      ans.answer
                        ? <p className="mt-1 text-sm text-foreground">{ans.answer}</p>
                        : <p className="mt-1 text-xs text-status-error font-medium">No answer entered</p>
                    )}
                    {type === "instruction" && ans.answer && ans.answer !== "" && ans.answer !== "undefined" && (
                      <p className="mt-1 text-xs text-muted-foreground">{ans.answer}</p>
                    )}

                    {ans.comment && (
                      <div className="mt-2 flex items-start gap-1.5 bg-muted rounded-lg px-3 py-2">
                        <MessageSquare size={12} className="text-muted-foreground mt-0.5 shrink-0" />
                        <p className="text-xs text-muted-foreground">{ans.comment}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {!(log.answers ?? []).length && (
            <div className="px-5 py-8 text-center">
              <p className="text-sm text-muted-foreground">No answer detail recorded for this submission.</p>
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-border shrink-0">
          <p className="text-xs text-muted-foreground text-center">
            This is a read-only report. Submitted responses cannot be edited.
          </p>
        </div>
      </div>
    </div>
  );
}
