import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CustomRecurrence } from "./types";

export function CustomRecurrencePicker({ value, onChange, onClose }: {
  value: CustomRecurrence;
  onChange: (v: CustomRecurrence) => void;
  onClose: () => void;
}) {
  const DAYS = ["M", "T", "W", "T", "F", "S", "S"];
  const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
  const UNITS: CustomRecurrence["unit"][] = ["day", "week", "month", "year"];

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center pb-16 bg-foreground/20 backdrop-blur-sm animate-fade-in">
      <div className="bg-card w-full max-w-lg rounded-t-2xl p-5 pb-20 space-y-5 animate-fade-in max-h-[85vh] overflow-y-auto">
        <h2 className="font-display text-xl text-foreground">Custom recurrence</h2>

        {/* Repeat every */}
        <div className="flex items-center gap-3">
          <span className="text-sm text-foreground">Repeat every</span>
          <input type="number" min={1} value={value.interval}
            onChange={e => onChange({ ...value, interval: Math.max(1, parseInt(e.target.value) || 1) })}
            className="w-16 text-sm border border-border rounded-lg px-3 py-2 bg-muted text-center focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <div className="relative">
            <select value={value.unit}
              onChange={e => onChange({ ...value, unit: e.target.value as CustomRecurrence["unit"] })}
              className="text-sm border border-border rounded-lg px-3 py-2 bg-muted pr-8 focus:outline-none focus:ring-1 focus:ring-ring appearance-none">
              {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
            <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          </div>
        </div>

        {/* Repeat on (only for week) */}
        {value.unit === "week" && (
          <div>
            <p className="text-sm text-foreground mb-2">Repeat on</p>
            <div className="flex gap-2">
              {DAYS.map((d, i) => (
                <button key={i} onClick={() => {
                  const k = DAY_KEYS[i];
                  const next = value.weekDays.includes(k) ? value.weekDays.filter(x => x !== k) : [...value.weekDays, k];
                  onChange({ ...value, weekDays: next });
                }}
                  className={cn("w-9 h-9 rounded-full text-sm font-medium transition-colors",
                    value.weekDays.includes(DAY_KEYS[i])
                      ? "bg-sage text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  )}>
                  {d}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Ends */}
        <div>
          <p className="text-sm text-foreground mb-3">Ends</p>
          <div className="space-y-3">
            <label className="flex items-center gap-3 cursor-pointer">
              <div className={cn("w-5 h-5 rounded-full border-2 flex items-center justify-center",
                value.ends === "never" ? "border-sage" : "border-border")}>
                {value.ends === "never" && <div className="w-2.5 h-2.5 rounded-full bg-sage" />}
              </div>
              <button onClick={() => onChange({ ...value, ends: "never" })} className="text-sm text-foreground">Never</button>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <div className={cn("w-5 h-5 rounded-full border-2 flex items-center justify-center",
                value.ends === "on" ? "border-sage" : "border-border")}>
                {value.ends === "on" && <div className="w-2.5 h-2.5 rounded-full bg-sage" />}
              </div>
              <button onClick={() => onChange({ ...value, ends: "on" })} className="text-sm text-foreground">On</button>
              <input type="date" value={value.endDate || ""} onChange={e => onChange({ ...value, ends: "on", endDate: e.target.value })}
                className="text-sm border border-border rounded-lg px-3 py-1.5 bg-muted focus:outline-none focus:ring-1 focus:ring-ring" />
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <div className={cn("w-5 h-5 rounded-full border-2 flex items-center justify-center",
                value.ends === "after" ? "border-sage" : "border-border")}>
                {value.ends === "after" && <div className="w-2.5 h-2.5 rounded-full bg-sage" />}
              </div>
              <button onClick={() => onChange({ ...value, ends: "after" })} className="text-sm text-foreground">After</button>
              <input type="number" min={1} value={value.occurrences || 13}
                onChange={e => onChange({ ...value, ends: "after", occurrences: parseInt(e.target.value) || 1 })}
                className="w-16 text-sm border border-border rounded-lg px-3 py-1.5 bg-muted text-center focus:outline-none focus:ring-1 focus:ring-ring" />
              <span className="text-sm text-muted-foreground">occurrences</span>
            </label>
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl text-sm font-medium border border-border text-foreground hover:bg-muted transition-colors">
            Cancel
          </button>
          <button onClick={onClose} className="flex-1 py-3 rounded-xl text-sm font-medium bg-sage text-primary-foreground hover:bg-sage-deep transition-colors">
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
