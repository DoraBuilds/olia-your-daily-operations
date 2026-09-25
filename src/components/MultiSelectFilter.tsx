import { useMemo, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export interface MultiSelectOption {
  id: string;
  label: string;
  sublabel?: string;
}

interface MultiSelectFilterProps {
  icon?: React.ReactNode;
  options: MultiSelectOption[];
  selected: string[];
  onChange: (ids: string[]) => void;
  allLabel: string;
  /** Renders the trigger summary once at least one option is selected — caller owns pluralization/i18n. */
  renderSelectedSummary: (selectedOptions: MultiSelectOption[]) => string;
  searchPlaceholder: string;
  noMatchLabel: string;
  noOptionsLabel: string;
  disabled?: boolean;
  testId: string;
  /** Extra classes for the dropdown panel, e.g. to match the trigger's width. */
  contentClassName?: string;
}

/** Compact popover-based multi-select (checkbox list + "All" option), replacing long native <select> dropdowns in filter toolbars. */
export function MultiSelectFilter({
  icon, options, selected, onChange, allLabel, renderSelectedSummary,
  searchPlaceholder, noMatchLabel, noOptionsLabel, disabled, testId, contentClassName,
}: MultiSelectFilterProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return options;
    return options.filter(o => o.label.toLowerCase().includes(q) || o.sublabel?.toLowerCase().includes(q));
  }, [options, search]);

  const selectedOptions = useMemo(
    () => options.filter(o => selected.includes(o.id)),
    [options, selected]
  );

  const summary = selectedOptions.length === 0 ? allLabel : renderSelectedSummary(selectedOptions);

  const toggle = (id: string) => {
    onChange(selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id]);
  };

  return (
    <Popover open={open} onOpenChange={o => { setOpen(o); if (!o) setSearch(""); }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid={`${testId}-trigger`}
          disabled={disabled}
          className={cn(
            "w-full flex items-center gap-2 rounded-xl border border-border bg-background py-2.5 px-3 text-sm text-left transition-colors",
            "focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50 disabled:cursor-not-allowed",
          )}
        >
          {icon}
          <span className={cn("flex-1 min-w-0 truncate", selectedOptions.length === 0 && "text-muted-foreground")}>
            {summary}
          </span>
          <ChevronDown size={14} className="shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent className={cn("w-72 p-0 z-[60]", contentClassName)} align="start">
        {options.length > 6 && (
          <div className="relative border-b border-border">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              autoFocus
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full py-2.5 pl-8 pr-3 text-sm bg-transparent focus:outline-none"
            />
          </div>
        )}
        <div className="max-h-64 overflow-y-auto p-1">
          <button
            type="button"
            data-testid={`${testId}-option-all`}
            onClick={() => onChange([])}
            className={cn(
              "w-full flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-left transition-colors",
              selected.length === 0 ? "bg-sage-light text-sage-deep font-medium" : "hover:bg-muted/60",
            )}
          >
            <span className={cn(
              "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
              selected.length === 0 ? "bg-sage border-sage text-white" : "border-border",
            )}>
              {selected.length === 0 && <Check size={11} />}
            </span>
            {allLabel}
          </button>
          {options.length === 0 ? (
            <p className="px-2.5 py-3 text-xs text-muted-foreground">{noOptionsLabel}</p>
          ) : filtered.length === 0 ? (
            <p className="px-2.5 py-3 text-xs text-muted-foreground">{noMatchLabel}</p>
          ) : filtered.map(opt => {
            const isSelected = selected.includes(opt.id);
            return (
              <button
                key={opt.id}
                type="button"
                data-testid={`${testId}-option-${opt.id}`}
                onClick={() => toggle(opt.id)}
                className={cn(
                  "w-full flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-left transition-colors",
                  isSelected ? "bg-sage-light text-sage-deep font-medium" : "hover:bg-muted/60",
                )}
              >
                <span className={cn(
                  "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                  isSelected ? "bg-sage border-sage text-white" : "border-border",
                )}>
                  {isSelected && <Check size={11} />}
                </span>
                <span className="min-w-0 flex-1 truncate">
                  {opt.label}
                  {opt.sublabel && <span className="text-muted-foreground"> — {opt.sublabel}</span>}
                </span>
              </button>
            );
          })}
        </div>
        {selected.length > 0 && (
          <div className="border-t border-border p-1.5">
            <button
              type="button"
              onClick={() => onChange([])}
              className="w-full flex items-center justify-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              <X size={11} /> {allLabel}
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
