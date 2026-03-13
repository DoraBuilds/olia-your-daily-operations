import { Check } from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// KioskMock — Hero visual placeholder representing the Olia kiosk screen.
//
// TODO: Replace this component with a real product screenshot.
// To capture the real screen:
//   1. Run `bun run dev`
//   2. Navigate to /kiosk in a browser window set to ~390px wide (iPhone size)
//   3. Set up a location and open a checklist
//   4. Screenshot the checklist view
//   5. Place the image at: src/assets/kiosk-hero.png
//   6. Replace this component with:
//      <img src="/src/assets/kiosk-hero.png" alt="Olia kiosk checklist" className="..." />
//      inside a device frame div
// ─────────────────────────────────────────────────────────────────────────────

const TASKS = [
  { label: "Coffee machine cleaned & ready",       done: true  },
  { label: "Fridge temp logged (target: 2–4 °C)", done: true  },
  { label: "Bar area set up",                      done: true  },
  { label: "Opening float counted",                done: true  },
  { label: "Floor mopped and dry",                 done: false },
  { label: "Menu boards updated",                  done: false },
];

export function KioskMock() {
  const done  = TASKS.filter((t) => t.done).length;
  const total = TASKS.length;
  const pct   = Math.round((done / total) * 100);

  return (
    <div className="relative w-full max-w-[340px] mx-auto select-none">
      {/* Subtle ambient glow behind the device */}
      <div
        className="absolute -inset-4 -z-10 rounded-[3rem] opacity-20 blur-3xl"
        style={{ background: "hsl(var(--sage))" }}
      />

      {/* Tablet device outer shell */}
      <div
        className="rounded-[2.25rem] p-[10px] shadow-2xl"
        style={{ background: "hsl(var(--sage))" }}
      >
        {/* Screen bezel */}
        <div className="rounded-[1.75rem] overflow-hidden bg-background">

          {/* ── App header ── */}
          <div className="px-5 pt-6 pb-5" style={{ background: "hsl(var(--sage))" }}>
            <p className="text-white/50 text-[10px] font-semibold tracking-widest uppercase mb-1">
              The Anchor · Morning
            </p>
            <h3 className="font-display text-white text-[22px] italic leading-tight">
              Opening Checklist
            </h3>
          </div>

          {/* ── Progress ── */}
          <div className="px-5 pt-4 pb-3 bg-background">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground font-medium">
                {done} of {total} complete
              </span>
              <span className="text-xs font-semibold" style={{ color: "hsl(var(--sage))" }}>
                {pct}%
              </span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden bg-border">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${pct}%`, background: "hsl(var(--sage))" }}
              />
            </div>
          </div>

          {/* ── Task list ── */}
          <div className="px-3 pb-3 space-y-1">
            {TASKS.map((task, i) => (
              <div
                key={i}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl ${
                  task.done ? "bg-card" : "bg-background"
                }`}
              >
                {/* Checkbox */}
                <div
                  className={`shrink-0 w-[22px] h-[22px] rounded-full flex items-center justify-center ${
                    task.done
                      ? "border-0"
                      : "border-2 border-border"
                  }`}
                  style={
                    task.done
                      ? { background: "hsl(var(--status-ok))" }
                      : {}
                  }
                >
                  {task.done && (
                    <Check size={11} strokeWidth={3} className="text-white" />
                  )}
                </div>
                {/* Label */}
                <span
                  className={`text-[13px] leading-snug ${
                    task.done
                      ? "text-muted-foreground line-through"
                      : "text-foreground"
                  }`}
                >
                  {task.label}
                </span>
              </div>
            ))}
          </div>

          {/* ── Footer ── */}
          <div className="px-5 py-3 border-t border-border bg-card/60">
            <p className="text-[9px] text-muted-foreground text-center tracking-widest uppercase font-semibold">
              SYSTEM ONLINE · The Anchor
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
