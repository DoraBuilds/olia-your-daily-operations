import type { ReactNode } from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { Plus, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { MultiSelectFilter, type MultiSelectOption } from "@/components/MultiSelectFilter";

interface FiltersPopoverProps {
  /** Prefix for data-testids: `${testIdPrefix}-filters-toggle`, `-filters-panel`, `-filters-count`, `-clear-filters`, `-apply-filters`. */
  testIdPrefix: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeCount: number;
  /** Left side of the toolbar — usually the search input. */
  search: ReactNode;
  /** Right of the Filters toggle — e.g. a create button. */
  trailing?: ReactNode;
  /** The panel's filter fields. */
  children: ReactNode;
  onClear: () => void;
  onApply: () => void;
}

/**
 * Search row + "+ Filters" toggle whose panel floats over the page (anchored
 * to the whole row). Callers stage edits in a draft and commit them in onApply.
 */
export function FiltersPopover({
  testIdPrefix, open, onOpenChange, activeCount, search, trailing, children, onClear, onApply,
}: FiltersPopoverProps) {
  const { t } = useTranslation("common");
  return (
    <PopoverPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <PopoverPrimitive.Anchor asChild>
        <div className="flex items-center gap-2">
          <div className="relative flex-1 min-w-0">{search}</div>
          <PopoverPrimitive.Trigger asChild>
            <button
              type="button"
              data-testid={`${testIdPrefix}-filters-toggle`}
              className={cn(
                "shrink-0 flex items-center gap-1.5 rounded-full border px-4 py-2.5 text-sm font-semibold transition-colors",
                open || activeCount > 0
                  ? "bg-sage text-white border-sage"
                  : "border-border text-foreground hover:border-sage/40"
              )}
            >
              <Plus size={14} className={cn("transition-transform", open && "rotate-45")} />
              {t("filters.button")}
              {activeCount > 0 && (
                <span data-testid={`${testIdPrefix}-filters-count`} className="ml-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-white/25 px-1.5 text-xs">
                  {activeCount}
                </span>
              )}
            </button>
          </PopoverPrimitive.Trigger>
          {trailing}
        </div>
      </PopoverPrimitive.Anchor>

      {/* Floats over the page instead of pushing it down; nested pickers portal above it at z-[60]. */}
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          data-testid={`${testIdPrefix}-filters-panel`}
          align="end"
          sideOffset={8}
          collisionPadding={16}
          onOpenAutoFocus={e => e.preventDefault()}
          className="z-50 w-[var(--radix-popover-trigger-width)] max-h-[var(--radix-popover-content-available-height)] overflow-y-auto bg-card border border-border rounded-[20px] p-4 space-y-3 shadow-xl outline-none"
        >
          <div className="grid gap-2 md:grid-cols-2">{children}</div>
          <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
            <button
              data-testid={`${testIdPrefix}-clear-filters`}
              type="button"
              onClick={onClear}
              className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
            >
              <X size={12} />
              {t("filters.clear")}
            </button>
            <button
              data-testid={`${testIdPrefix}-apply-filters`}
              type="button"
              onClick={onApply}
              className="rounded-full bg-sage px-5 py-2 text-sm font-semibold text-white hover:bg-sage/90 transition-colors"
            >
              {t("filters.apply")}
            </button>
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

/** Labelled field inside the Filters panel. */
export function FilterField({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <div className={cn("space-y-1", className)}>
      <span className="text-xs uppercase tracking-widest text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

/** MultiSelectFilter preconfigured with the shared summary/search/no-match copy. */
export function FilterMultiSelect({
  testId, icon, options, selected, onChange, allLabel, noOptionsLabel,
}: {
  testId: string;
  icon: ReactNode;
  options: MultiSelectOption[];
  selected: string[];
  onChange: (ids: string[]) => void;
  allLabel: string;
  noOptionsLabel?: string;
}) {
  const { t } = useTranslation("common");
  return (
    <MultiSelectFilter
      testId={testId}
      icon={icon}
      options={options}
      selected={selected}
      onChange={onChange}
      allLabel={allLabel}
      renderSelectedSummary={opts => opts.length === 1 ? opts[0].label : t("filters.selectedCount", { count: opts.length })}
      searchPlaceholder={t("filters.searchPlaceholder")}
      noMatchLabel={t("filters.noMatch")}
      noOptionsLabel={noOptionsLabel ?? allLabel}
    />
  );
}

export interface ActiveFilterChip {
  key: string;
  label: string;
  onRemove: () => void;
}

/**
 * The applied filters as removable chips, so it stays obvious why items are
 * missing — including after navigating into a folder.
 */
export function ActiveFilterChips({ testIdPrefix, chips, onClearAll }: { testIdPrefix: string; chips: ActiveFilterChip[]; onClearAll: () => void }) {
  const { t } = useTranslation("common");
  if (chips.length === 0) return null;
  return (
    <div data-testid={`${testIdPrefix}-active-filters`} className="flex flex-wrap items-center gap-1.5">
      {chips.map(chip => (
        <span key={chip.key} className="inline-flex max-w-full items-center gap-1 rounded-full bg-sage-light py-1 pl-3 pr-1 text-xs font-medium text-sage-deep">
          <span className="truncate">{chip.label}</span>
          <button
            type="button"
            onClick={chip.onRemove}
            aria-label={t("filters.remove", { label: chip.label })}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full hover:bg-sage/15 transition-colors"
          >
            <X size={11} />
          </button>
        </span>
      ))}
      <button
        type="button"
        data-testid={`${testIdPrefix}-clear-all-filters`}
        onClick={onClearAll}
        className="px-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        {t("filters.clearAll")}
      </button>
    </div>
  );
}
