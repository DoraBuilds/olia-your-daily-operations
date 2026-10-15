import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { translateChoice } from "./data";

const FALLBACK_COLOR = "border-border bg-muted/50 text-muted-foreground";

/**
 * "is one of" value picker: the chosen options show as colored chips in the
 * sentence, and a popover lists every option as a checkbox row with a Done button.
 */
export function ChoiceMultiSelect({
  choices, choiceColors, selected, onToggle, translate = true,
}: {
  choices: string[];
  choiceColors?: string[];
  selected: string[];
  onToggle: (choice: string) => void;
  /** Built-in Yes/No/N/A labels are translated; question-specific choices are not */
  translate?: boolean;
}) {
  const { t } = useTranslation("checklists");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const label = (c: string) => (translate ? translateChoice(c) : c);
  const colorOf = (c: string) => choiceColors?.[choices.indexOf(c)] ?? FALLBACK_COLOR;

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1 flex-wrap text-xs border border-border rounded-lg px-2 py-1.5 bg-muted focus:outline-none focus:ring-1 focus:ring-ring"
      >
        {selected.length === 0 ? (
          <span className="text-muted-foreground">{t("logicRules.pickOptions")}</span>
        ) : (
          selected.map(c => (
            <span key={c} className={cn("px-2 py-0.5 rounded-full border", colorOf(c))}>{label(c)}</span>
          ))
        )}
        <ChevronDown size={11} className="text-muted-foreground" />
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-20 min-w-[200px] bg-card border border-border rounded-lg shadow-lg">
          <div className="py-1 max-h-60 overflow-y-auto" role="listbox" aria-multiselectable="true">
            {choices.map(c => {
              const checked = selected.includes(c);
              return (
                <button
                  key={c}
                  type="button"
                  role="option"
                  aria-selected={checked}
                  onClick={() => onToggle(c)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-muted/50 transition-colors"
                >
                  <span className={cn(
                    "w-4 h-4 rounded border-2 flex items-center justify-center shrink-0",
                    checked ? "bg-sage border-sage" : "border-muted-foreground/40",
                  )}>
                    {checked && <Check size={10} className="text-primary-foreground" />}
                  </span>
                  <span className={cn("text-xs px-2 py-0.5 rounded-full border", colorOf(c))}>{label(c)}</span>
                </button>
              );
            })}
          </div>
          <div className="border-t border-border p-2 flex justify-end">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-xs font-medium px-3 py-1.5 rounded-lg bg-sage text-primary-foreground hover:bg-sage-deep transition-colors"
            >
              {t("logicRules.done")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
