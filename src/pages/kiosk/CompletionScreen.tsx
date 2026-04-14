import { useState, useEffect, useRef } from "react";
import { Check } from "lucide-react";
import type { KioskChecklist } from "./types";

// ─── CompletionScreen (Screen 4) ──────────────────────────────────────────────
export function CompletionScreen({
  checklist, staffName, completedAt, onDone,
}: {
  checklist: KioskChecklist;
  staffName: string;
  completedAt: Date;
  onDone: () => void;
}) {
  const [countdown, setCountdown] = useState(10);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    if (import.meta.env.TEST) return;
    const id = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) { clearInterval(id); onDoneRef.current(); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const timeStr = completedAt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const dateStr = completedAt.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

  return (
    <div className="min-h-screen bg-background w-full min-[900px]:max-w-none mx-auto flex flex-col items-center justify-center px-6 text-center">
      <div className="w-20 h-20 rounded-full bg-sage-light flex items-center justify-center mb-6">
        <Check size={36} className="text-sage" />
      </div>
      <h2 className="font-display text-4xl italic text-foreground mb-1">Well done!</h2>
      <p className="text-sm italic text-muted-foreground mb-5">Every completed checklist keeps the team running smoothly.</p>
      <p className="text-base font-medium text-foreground mb-1">{checklist.title}</p>
      <p className="text-sm text-muted-foreground mb-1">{staffName}</p>
      <p className="text-xs text-muted-foreground/70 mb-8">{dateStr} · {timeStr}</p>
      <button
        onClick={onDone}
        className="w-full max-w-xs py-3 rounded-xl text-sm font-semibold bg-sage text-primary-foreground hover:bg-sage-deep transition-colors"
      >
        Done
      </button>
      <p className="text-xs text-muted-foreground/60 mt-4">Returning to home in {countdown}s</p>
    </div>
  );
}
