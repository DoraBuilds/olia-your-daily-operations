// ─── TimingReportTab ──────────────────────────────────────────────────────────
// Reporting → Timing: did checklists get done on time, late, or not at all?
// On time / late come from the stamp the kiosk puts on each completion; Missed
// from the server-recorded misses (checklist_misses). Narrowed by the same
// Concept / Location / Department filters as the rest of Reporting.

import { useMemo, useState, type ReactNode } from "react";
import { endOfDay, format, startOfDay, startOfWeek, subDays } from "date-fns";
import { useTranslation } from "react-i18next";
import { Building2, Layers, MapPin, Timer, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/sonner";
import { type MultiSelectOption } from "@/components/MultiSelectFilter";
import { FiltersPopover, FilterField, FilterMultiSelect, ActiveFilterChip, ActiveFilterChips } from "@/components/FiltersPopover";
import { useConcepts } from "@/hooks/useConcepts";
import { useLocations } from "@/hooks/useLocations";
import { useCompanyDepartments } from "@/hooks/useDepartments";
import { useChecklists } from "@/hooks/useChecklists";
import { useTimingReportData, useSetMissedNote } from "@/hooks/useTimingReport";
import {
  buildTimingReport, pctOf, totalCount, MISS_REASONS,
  type MissReason, type TimingCounts, type TimingReport,
} from "./timing-report";

interface ScopeFilters { conceptIds: string[]; locationIds: string[]; departmentIds: string[] }
const NO_FILTERS: ScopeFilters = { conceptIds: [], locationIds: [], departmentIds: [] };

type RangeKey = "week" | "last7" | "last30";

function rangeFor(key: RangeKey, now: Date) {
  const to = endOfDay(now);
  const from = key === "week" ? startOfWeek(now, { weekStartsOn: 1 }) : startOfDay(subDays(now, key === "last7" ? 6 : 29));
  return {
    fromIso: from.toISOString(),
    toIso: to.toISOString(),
    fromDate: format(from, "yyyy-MM-dd"),
    toDate: format(to, "yyyy-MM-dd"),
  };
}

const SEGMENTS = [
  { key: "onTime", bar: "bg-status-ok", text: "text-status-ok" },
  { key: "late", bar: "bg-status-warn", text: "text-status-warn" },
  { key: "missed", bar: "bg-status-error", text: "text-status-error" },
] as const;

export function TimingReportTab({ viewSwitcher }: { viewSwitcher?: ReactNode }) {
  const { t } = useTranslation("checklists");
  const [rangeKey, setRangeKey] = useState<RangeKey>("week");
  const [filters, setFilters] = useState<ScopeFilters>(NO_FILTERS);
  const [draft, setDraft] = useState<ScopeFilters>(NO_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [noting, setNoting] = useState<TimingReport["misses"][number] | null>(null);

  const { data: concepts = [] } = useConcepts();
  const { data: locations = [] } = useLocations();
  const { data: departments = [] } = useCompanyDepartments();
  const { data: checklists = [] } = useChecklists();

  const range = useMemo(() => rangeFor(rangeKey, new Date()), [rangeKey]);
  const { data, isLoading } = useTimingReportData(range);

  const scopedLocations = (conceptIds: string[]) =>
    conceptIds.length === 0 ? locations : locations.filter(l => l.concept_id && conceptIds.includes(l.concept_id));

  const effectiveLocationIds = useMemo<string[] | null>(() => {
    if (filters.conceptIds.length === 0 && filters.locationIds.length === 0) return null;
    if (filters.locationIds.length > 0) return filters.locationIds;
    return locations.filter(l => l.concept_id && filters.conceptIds.includes(l.concept_id)).map(l => l.id);
  }, [filters, locations]);

  const report = useMemo(
    () => buildTimingReport({
      logs: data?.logs ?? [],
      misses: data?.misses ?? [],
      checklists: checklists.map(c => ({ id: c.id, department_ids: c.department_ids ?? null })),
      locations,
      scope: { locationIds: effectiveLocationIds, departmentIds: filters.departmentIds.length > 0 ? filters.departmentIds : null },
    }),
    [data, checklists, locations, effectiveLocationIds, filters.departmentIds],
  );

  const activeCount = [filters.conceptIds, filters.locationIds, filters.departmentIds].filter(ids => ids.length > 0).length;
  const chips: ActiveFilterChip[] = [
    ...filters.conceptIds.map(id => ({ key: `c-${id}`, label: concepts.find(c => c.id === id)?.name ?? id, onRemove: () => setFilters(f => ({ ...f, conceptIds: f.conceptIds.filter(x => x !== id) })) })),
    ...filters.locationIds.map(id => ({ key: `l-${id}`, label: locations.find(l => l.id === id)?.name ?? id, onRemove: () => setFilters(f => ({ ...f, locationIds: f.locationIds.filter(x => x !== id) })) })),
    ...filters.departmentIds.map(id => ({ key: `d-${id}`, label: departments.find(d => d.id === id)?.name ?? id, onRemove: () => setFilters(f => ({ ...f, departmentIds: f.departmentIds.filter(x => x !== id) })) })),
  ];

  const deptName = (id: string | null) => (id ? departments.find(d => d.id === id)?.name ?? "" : t("reporting.timing.allDepartments"));
  const totalAll = totalCount(report.totals);

  return (
    <>
      <div className="space-y-2">
        <FiltersPopover
          testIdPrefix="timing-report"
          open={filtersOpen}
          onOpenChange={o => { if (o) setDraft(filters); setFiltersOpen(o); }}
          activeCount={activeCount}
          onClear={() => setDraft(NO_FILTERS)}
          onApply={() => { setFilters(draft); setFiltersOpen(false); }}
          search={<p className="py-2.5 pl-1 text-sm font-semibold text-foreground">{t("reporting.timing.title")}</p>}
        >
          <FilterField label={t("reporting.filters.concept")}>
            <FilterMultiSelect
              testId="timing-report-concept-filter"
              icon={<Building2 size={14} className="text-muted-foreground shrink-0" />}
              options={concepts.map((c): MultiSelectOption => ({ id: c.id, label: c.name }))}
              selected={draft.conceptIds}
              onChange={ids => setDraft(d => ({ ...d, conceptIds: ids, locationIds: d.locationIds.filter(id => scopedLocations(ids).some(l => l.id === id)) }))}
              allLabel={t("reporting.filters.allConcepts")}
            />
          </FilterField>
          <FilterField label={t("reporting.filters.location")}>
            <FilterMultiSelect
              testId="timing-report-location-filter"
              icon={<MapPin size={14} className="text-muted-foreground shrink-0" />}
              options={scopedLocations(draft.conceptIds).map((l): MultiSelectOption => ({ id: l.id, label: l.name }))}
              selected={draft.locationIds}
              onChange={ids => setDraft(d => ({ ...d, locationIds: ids }))}
              allLabel={t("reporting.filters.allLocations")}
            />
          </FilterField>
          <FilterField label={t("reporting.filters.department")}>
            <FilterMultiSelect
              testId="timing-report-department-filter"
              icon={<Layers size={14} className="text-muted-foreground shrink-0" />}
              options={departments.map((d): MultiSelectOption => ({ id: d.id, label: d.name }))}
              selected={draft.departmentIds}
              onChange={ids => setDraft(d => ({ ...d, departmentIds: ids }))}
              allLabel={t("reporting.filters.allDepartments")}
              noOptionsLabel={t("reporting.filters.noDepartments")}
            />
          </FilterField>
        </FiltersPopover>
        {viewSwitcher}
        <ActiveFilterChips testIdPrefix="timing-report" chips={chips} onClearAll={() => setFilters(NO_FILTERS)} />

        <div role="tablist" className="flex gap-1 bg-muted rounded-xl p-1">
          {(["week", "last7", "last30"] as const).map(k => (
            <button
              key={k}
              role="tab"
              aria-selected={rangeKey === k}
              data-testid={`timing-range-${k}`}
              onClick={() => setRangeKey(k)}
              className={cn(
                "flex-1 py-2 text-xs font-medium rounded-lg transition-colors",
                rangeKey === k ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t(`reporting.timing.range.${k}`)}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground text-center py-12">{t("reporting.timing.loading")}</p>
      ) : totalAll === 0 ? (
        <div className="card-surface p-8 text-center space-y-2 mt-3">
          <Timer size={28} className="text-muted-foreground mx-auto" />
          <p className="text-sm text-muted-foreground">{t("reporting.timing.empty")}</p>
        </div>
      ) : (
        <div className="space-y-4 mt-3">
          <div data-testid="timing-totals" className="grid grid-cols-3 gap-2">
            {SEGMENTS.map(s => (
              <div key={s.key} className="bg-card border border-border rounded-2xl px-2 py-3 text-center">
                <p className="section-label mb-1">{t(`reporting.timing.${s.key}`)}</p>
                <p className={cn("text-xl font-semibold", s.text)}>{report.totals[s.key]}</p>
                <p className="text-xs text-muted-foreground">{pctOf(report.totals[s.key], report.totals)}%</p>
              </div>
            ))}
          </div>

          <BreakdownCard
            title={t("reporting.timing.byLocation")}
            rows={report.byLocation.map(r => ({ id: r.locationId, label: r.name, counts: r.counts }))}
          />
          <BreakdownCard
            title={t("reporting.timing.byDepartment")}
            rows={report.byDepartment.map(r => ({ id: r.departmentId ?? "all", label: deptName(r.departmentId), counts: r.counts }))}
          />

          {report.reasons.length > 0 && (
            <section className="card-surface p-4 space-y-2">
              <p className="section-label">{t("reporting.timing.reasonsTitle")}</p>
              {report.reasons.map(r => (
                <div key={r.reason ?? "none"} className="flex items-center gap-3 text-sm" data-testid={`timing-reason-${r.reason ?? "none"}`}>
                  <span className="w-36 shrink-0 text-foreground">
                    {r.reason ? t(`reporting.timing.reasons.${r.reason}`) : t("reporting.timing.noReason")}
                  </span>
                  <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                    <div className="h-full bg-status-error rounded-full" style={{ width: `${Math.round((r.count / report.totals.missed) * 100)}%` }} />
                  </div>
                  <span className="w-16 text-right text-xs text-muted-foreground">
                    {r.count} · {Math.round((r.count / report.totals.missed) * 100)}%
                  </span>
                </div>
              ))}
            </section>
          )}

          {report.misses.length > 0 && (
            <section className="card-surface divide-y divide-border">
              <p className="section-label px-4 pt-4 pb-2">{t("reporting.timing.missedTitle", { count: report.misses.length })}</p>
              {report.misses.map(m => (
                <div key={m.id} data-testid={`timing-miss-${m.id}`} className="px-4 py-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground leading-snug">{m.checklist_title}</p>
                    <p className="text-xs text-muted-foreground">
                      {m.locationName} · {format(new Date(`${m.operating_date}T00:00:00`), "d MMM")} · {t(`reporting.timing.route.${m.route}`)}
                    </p>
                    {(m.reason || m.note) && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {m.reason && <span className="font-semibold">{t(`reporting.timing.reasons.${m.reason}`)}</span>}
                        {m.reason && m.note ? ": " : ""}
                        {m.note}
                        {m.note_by ? ` (${m.note_by})` : ""}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    data-testid={`timing-note-btn-${m.id}`}
                    onClick={() => setNoting(m)}
                    className="shrink-0 text-xs font-semibold text-muted-foreground border border-border rounded-full px-3 py-1.5 hover:bg-muted transition-colors"
                  >
                    {m.reason || m.note ? t("reporting.timing.editNote") : t("reporting.timing.addNote")}
                  </button>
                </div>
              ))}
            </section>
          )}
        </div>
      )}

      {noting && <MissNoteDialog miss={noting} onClose={() => setNoting(null)} />}
    </>
  );
}

function BreakdownCard({ title, rows }: { title: string; rows: { id: string; label: string; counts: TimingCounts }[] }) {
  const { t } = useTranslation("checklists");
  if (rows.length === 0) return null;
  return (
    <section className="card-surface p-4 space-y-3">
      <p className="section-label">{title}</p>
      {rows.map(r => {
        const total = totalCount(r.counts);
        return (
          <div key={r.id} data-testid={`timing-row-${r.id}`} className="space-y-1">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="min-w-0 truncate text-foreground">{r.label}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {t("reporting.timing.rowCounts", { onTime: r.counts.onTime, late: r.counts.late, missed: r.counts.missed })}
              </span>
            </div>
            <div className="flex h-1.5 rounded-full bg-muted overflow-hidden">
              {SEGMENTS.map(s => (
                <div key={s.key} className={s.bar} style={{ width: `${total === 0 ? 0 : (r.counts[s.key] / total) * 100}%` }} />
              ))}
            </div>
          </div>
        );
      })}
      <div className="flex gap-3 pt-1 text-[11px] text-muted-foreground">
        {SEGMENTS.map(s => (
          <span key={s.key} className="flex items-center gap-1">
            <span className={cn("w-2 h-2 rounded-full", s.bar)} /> {t(`reporting.timing.${s.key}`)}
          </span>
        ))}
      </div>
    </section>
  );
}

function MissNoteDialog({ miss, onClose }: { miss: TimingReport["misses"][number]; onClose: () => void }) {
  const { t } = useTranslation("checklists");
  const setNote = useSetMissedNote();
  const [reason, setReason] = useState<MissReason | null>(miss.reason);
  const [text, setText] = useState(miss.note ?? "");
  const disabled = setNote.isPending || (!reason && !text.trim());

  const save = () =>
    setNote.mutate(
      { missId: miss.id, reason, note: text },
      {
        onSuccess: () => { toast.success(t("reporting.timing.noteSaved")); onClose(); },
        onError: (err: Error) => toast.error(t("reporting.timing.noteFailed", { error: err.message })),
      },
    );

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-foreground/20 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-card w-full max-w-sm mx-4 rounded-2xl p-6 space-y-4 shadow-lg" role="dialog" aria-label={t("reporting.timing.noteTitle")}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-lg text-foreground">{t("reporting.timing.noteTitle")}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{miss.checklist_title} · {miss.locationName}</p>
          </div>
          <button onClick={onClose} className="btn-icon" aria-label={t("reporting.timing.close")}>
            <X size={18} className="text-muted-foreground" />
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {MISS_REASONS.map(r => (
            <button
              key={r}
              type="button"
              data-testid={`timing-reason-chip-${r}`}
              aria-pressed={reason === r}
              onClick={() => setReason(reason === r ? null : r)}
              className={cn(
                "px-3 py-2 rounded-full border text-xs font-semibold transition-colors",
                reason === r ? "bg-sage text-white border-sage" : "border-border text-muted-foreground hover:bg-muted",
              )}
            >
              {t(`reporting.timing.reasons.${r}`)}
            </button>
          ))}
        </div>
        <textarea
          value={text}
          onChange={e => setText(e.target.value.slice(0, 500))}
          placeholder={t("reporting.timing.notePlaceholder")}
          rows={3}
          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <button
          type="button"
          data-testid="timing-note-save"
          disabled={disabled}
          onClick={save}
          className={cn(
            "w-full py-3.5 rounded-2xl font-bold text-sm transition-all active:scale-[0.98]",
            disabled ? "bg-muted text-muted-foreground cursor-not-allowed" : "bg-sage text-white hover:bg-sage-deep shadow-card",
          )}
        >
          {t("reporting.timing.saveNote")}
        </button>
      </div>
    </div>
  );
}
