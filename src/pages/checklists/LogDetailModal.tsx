import { X, Camera, Check, MessageSquare, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { exportLogDetailPdf } from "@/lib/export-utils";
import type { LogEntry } from "./types";

export function LogDetailModal({ log, onClose }: { log: LogEntry; onClose: () => void }) {
  const scoreColor = log.score >= 85 ? "text-status-ok" : log.score >= 65 ? "text-status-warn" : "text-status-error";

  const handleExportPdf = async () => {
    await exportLogDetailPdf({
      checklist: log.checklist,
      completedBy: log.completedBy,
      date: log.date,
      score: log.score,
      answers: log.answers,
    });
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-foreground/20 backdrop-blur-sm animate-fade-in">
      <div className="bg-card w-full max-w-lg rounded-t-2xl flex flex-col max-h-[90vh] animate-fade-in">
        <div className="flex items-start justify-between px-5 pt-5 pb-4 border-b border-border shrink-0">
          <div>
            <h2 className="font-display text-lg text-foreground">{log.checklist}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{log.completedBy} · {log.date}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className={cn("text-lg font-semibold", scoreColor)}>{log.score}%</span>
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
            const answered = ans.answer === "yes" || (ans.type === "numeric" && !!ans.answer) || ans.hasPhoto;
            return (
              <div key={i} className={cn("px-5 py-4", !answered && "bg-status-error/5")}>
                <div className="flex items-start gap-3">
                  {ans.type === "checkbox" && (
                    <div className={cn("mt-0.5 w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0",
                      ans.answer === "yes" ? "bg-sage border-sage" : "border-status-error bg-status-error/10")}>
                      {ans.answer === "yes" ? <Check size={11} className="text-primary-foreground" strokeWidth={3} /> : <X size={10} className="text-status-error" strokeWidth={3} />}
                    </div>
                  )}
                  {ans.type === "numeric" && (
                    <div className={cn("mt-0.5 w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 text-[10px] font-semibold",
                      ans.answer ? "bg-sage border-sage text-primary-foreground" : "border-status-error")}>
                      {ans.answer ? "#" : "–"}
                    </div>
                  )}
                  {ans.type === "photo" && (
                    <div className={cn("mt-0.5 w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0",
                      ans.hasPhoto ? "bg-sage border-sage" : "border-status-error bg-status-error/10")}>
                      <Camera size={10} className={ans.hasPhoto ? "text-primary-foreground" : "text-status-error"} />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm text-foreground leading-snug">{ans.label}</p>
                      {ans.required && <span className="text-xs text-muted-foreground/60">Required</span>}
                    </div>
                    {ans.type === "numeric" && ans.answer && <p className="mt-1 text-sm font-medium text-foreground">{ans.answer} °C</p>}
                    {ans.type === "checkbox" && (
                      <p className={cn("mt-1 text-xs font-medium", ans.answer === "yes" ? "text-status-ok" : "text-status-error")}>
                        {ans.answer === "yes" ? "Completed" : "Not completed"}
                      </p>
                    )}
                    {ans.type === "photo" && (ans.hasPhoto ? (
                      <div className="mt-2 w-24 h-16 rounded-lg bg-muted flex items-center justify-center border border-border">
                        <Camera size={18} className="text-muted-foreground" /><span className="text-xs text-muted-foreground ml-1">Photo</span>
                      </div>
                    ) : <p className="mt-1 text-xs text-status-error">No photo attached</p>)}
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
        </div>
        <div className="px-5 py-4 border-t border-border shrink-0">
          <p className="text-xs text-muted-foreground text-center">This is a read-only report. Submitted responses cannot be edited.</p>
        </div>
      </div>
    </div>
  );
}
