// ─── TrainingReportTab ────────────────────────────────────────────────────────
// Reporting → Training (#915): per training doc, how many of the people it's
// shared with have completed it, with a per-doc breakdown. Company-wide like
// the checklist report, narrowed by Concept / Location / Department filters.

import { useMemo, useState } from "react";
import { format } from "date-fns";
import { useTranslation } from "react-i18next";
import { Building2, ChevronDown, Download, GraduationCap, Layers, MapPin, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { type MultiSelectOption } from "@/components/MultiSelectFilter";
import { FiltersPopover, FilterField, FilterMultiSelect, ActiveFilterChips, type ActiveFilterChip } from "@/components/FiltersPopover";
import { UpgradePrompt } from "@/components/UpgradePrompt";
import { useConcepts } from "@/hooks/useConcepts";
import { useLocations } from "@/hooks/useLocations";
import { useCompanyDepartments } from "@/hooks/useDepartments";
import { useTeamMembers } from "@/hooks/useTeamMembers";
import { useInfohubContent } from "@/hooks/useInfohubContent";
import { useTeamTrainingProgress } from "@/hooks/useTrainingProgress";
import { usePlan } from "@/hooks/usePlan";
import { exportTrainingCsv } from "@/lib/export-utils";
import { buildTrainingReport, type TrainingReportRow } from "./training-report";

interface ScopeFilters { conceptIds: string[]; locationIds: string[]; departmentIds: string[] }
const NO_FILTERS: ScopeFilters = { conceptIds: [], locationIds: [], departmentIds: [] };

export function TrainingReportTab() {
  const { t } = useTranslation("checklists");
  const { can } = usePlan();
  const [filters, setFilters] = useState<ScopeFilters>(NO_FILTERS);
  const [draft, setDraft] = useState<ScopeFilters>(NO_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showCsvUpgrade, setShowCsvUpgrade] = useState(false);

  const { data: concepts = [] } = useConcepts();
  const { data: locations = [] } = useLocations();
  const { data: departments = [] } = useCompanyDepartments();
  const { data: teamMembers = [], isLoading: membersLoading } = useTeamMembers();
  const { data: content, isPlaceholderData, isLoading: contentLoading } = useInfohubContent();
  const { data: progress = [], isLoading: progressLoading } = useTeamTrainingProgress();
  const loading = membersLoading || contentLoading || isPlaceholderData || progressLoading;

  const scopedLocations = (conceptIds: string[]) =>
    conceptIds.length === 0 ? locations : locations.filter(l => l.concept_id && conceptIds.includes(l.concept_id));

  // null = no restriction; otherwise the picked locations, or every location in the picked concept(s).
  const effectiveLocationIds = useMemo<string[] | null>(() => {
    if (filters.conceptIds.length === 0 && filters.locationIds.length === 0) return null;
    if (filters.locationIds.length > 0) return filters.locationIds;
    return locations.filter(l => l.concept_id && filters.conceptIds.includes(l.concept_id)).map(l => l.id);
  }, [filters, locations]);

  const rows = useMemo(
    () => buildTrainingReport(
      content.trainingDocs.map(d => ({ id: d.id, title: d.title, folderId: d.folderId, access: d.access })),
      content.trainingFolders.map(f => ({ id: f.id, name: f.name, parentId: f.parentId, access: f.access })),
      teamMembers,
      progress,
      { locationIds: effectiveLocationIds, departmentIds: filters.departmentIds.length > 0 ? filters.departmentIds : null, search },
    ),
    [content, teamMembers, progress, effectiveLocationIds, filters.departmentIds, search],
  );

  const activeCount = [filters.conceptIds, filters.locationIds, filters.departmentIds].filter(ids => ids.length > 0).length;
  const chips: ActiveFilterChip[] = [
    ...filters.conceptIds.map(id => ({ key: `c-${id}`, label: concepts.find(c => c.id === id)?.name ?? id, onRemove: () => setFilters(f => ({ ...f, conceptIds: f.conceptIds.filter(x => x !== id) })) })),
    ...filters.locationIds.map(id => ({ key: `l-${id}`, label: locations.find(l => l.id === id)?.name ?? id, onRemove: () => setFilters(f => ({ ...f, locationIds: f.locationIds.filter(x => x !== id) })) })),
    ...filters.departmentIds.map(id => ({ key: `d-${id}`, label: departments.find(d => d.id === id)?.name ?? id, onRemove: () => setFilters(f => ({ ...f, departmentIds: f.departmentIds.filter(x => x !== id) })) })),
  ];

  const locationNames = (ids: string[]) =>
    ids.length === 0 ? t("reporting.training.everyLocation") : ids.map(id => locations.find(l => l.id === id)?.name ?? "").filter(Boolean).join(", ");
  const formatDate = (iso: string | null) => (iso ? format(new Date(iso), "d MMM yyyy") : "—");

  const handleExportCsv = () => {
    exportTrainingCsv(rows.flatMap(r => [
      ...r.completed.map(c => ({ training: r.doc.title, folder: r.folderName, person: c.member.name, locations: locationNames(c.member.location_ids), completed: true, date: formatDate(c.completedAt) })),
      ...r.notCompleted.map(m => ({ training: r.doc.title, folder: r.folderName, person: m.name, locations: locationNames(m.location_ids), completed: false, date: "" })),
    ]));
  };

  return (
    <>
      <div className="space-y-2">
        <FiltersPopover
          testIdPrefix="training-report"
          open={filtersOpen}
          onOpenChange={o => { if (o) setDraft(filters); setFiltersOpen(o); }}
          activeCount={activeCount}
          onClear={() => setDraft(NO_FILTERS)}
          onApply={() => { setFilters(draft); setFiltersOpen(false); }}
          search={<>
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              data-testid="training-report-search"
              type="search"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={t("reporting.training.searchPlaceholder")}
              aria-label={t("reporting.training.searchPlaceholder")}
              className="w-full rounded-full border border-border bg-card py-2.5 pl-9 pr-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </>}
        >
          <FilterField label={t("reporting.filters.concept")}>
            <FilterMultiSelect
              testId="training-report-concept-filter"
              icon={<Building2 size={14} className="text-muted-foreground shrink-0" />}
              options={concepts.map((c): MultiSelectOption => ({ id: c.id, label: c.name }))}
              selected={draft.conceptIds}
              onChange={ids => setDraft(d => ({
                ...d,
                conceptIds: ids,
                // Drop picked locations that fall outside the new concept(s).
                locationIds: d.locationIds.filter(id => scopedLocations(ids).some(l => l.id === id)),
              }))}
              allLabel={t("reporting.filters.allConcepts")}
            />
          </FilterField>
          <FilterField label={t("reporting.filters.location")}>
            <FilterMultiSelect
              testId="training-report-location-filter"
              icon={<MapPin size={14} className="text-muted-foreground shrink-0" />}
              options={scopedLocations(draft.conceptIds).map((l): MultiSelectOption => ({ id: l.id, label: l.name }))}
              selected={draft.locationIds}
              onChange={ids => setDraft(d => ({ ...d, locationIds: ids }))}
              allLabel={t("reporting.filters.allLocations")}
            />
          </FilterField>
          <FilterField label={t("reporting.filters.department")}>
            <FilterMultiSelect
              testId="training-report-department-filter"
              icon={<Layers size={14} className="text-muted-foreground shrink-0" />}
              options={departments.map((d): MultiSelectOption => ({ id: d.id, label: d.name }))}
              selected={draft.departmentIds}
              onChange={ids => setDraft(d => ({ ...d, departmentIds: ids }))}
              allLabel={t("reporting.filters.allDepartments")}
              noOptionsLabel={t("reporting.filters.noDepartments")}
            />
          </FilterField>
        </FiltersPopover>
        <ActiveFilterChips testIdPrefix="training-report" chips={chips} onClearAll={() => setFilters(NO_FILTERS)} />

        <div className="flex items-center justify-between gap-2">
          <p data-testid="training-report-summary" className="min-w-0 truncate text-xs text-muted-foreground">
            {t("reporting.training.summary", { count: rows.length })}
          </p>
          <button
            data-testid="training-export-csv"
            onClick={() => (can("exportCsv") ? handleExportCsv() : setShowCsvUpgrade(true))}
            disabled={rows.length === 0}
            className="shrink-0 flex items-center gap-1 text-xs font-semibold text-muted-foreground px-3 py-2 rounded-full border border-border hover:border-sage/40 transition-colors disabled:opacity-40"
          >
            <Download size={12} /> {t("reporting.csv")}
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground text-center py-12">{t("reporting.training.loading")}</p>
      ) : rows.length === 0 ? (
        <div className="card-surface p-8 text-center space-y-2">
          <GraduationCap size={28} className="text-muted-foreground mx-auto" />
          <p className="text-sm text-muted-foreground">{t(search.trim() ? "reporting.training.noMatch" : "reporting.training.empty")}</p>
        </div>
      ) : (
        <div className="card-surface divide-y divide-border mt-3">
          {rows.map(row => (
            <TrainingRow
              key={row.doc.id}
              row={row}
              expanded={expandedId === row.doc.id}
              onToggle={() => setExpandedId(id => (id === row.doc.id ? null : row.doc.id))}
              locationNames={locationNames}
              formatDate={formatDate}
            />
          ))}
        </div>
      )}

      {showCsvUpgrade && <UpgradePrompt feature="CSV export" onClose={() => setShowCsvUpgrade(false)} />}
    </>
  );
}

function TrainingRow({
  row, expanded, onToggle, locationNames, formatDate,
}: {
  row: TrainingReportRow;
  expanded: boolean;
  onToggle: () => void;
  locationNames: (ids: string[]) => string;
  formatDate: (iso: string | null) => string;
}) {
  const { t } = useTranslation("checklists");
  return (
    <div data-testid={`training-report-row-${row.doc.id}`}>
      <button
        onClick={onToggle}
        aria-expanded={expanded}
        className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-muted/30 transition-colors"
      >
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{row.doc.title}</p>
          {row.folderName && <p className="text-xs text-muted-foreground truncate">{row.folderName}</p>}
        </div>
        {row.total === 0 ? (
          <p className="text-xs text-muted-foreground shrink-0">{t("reporting.training.nobody")}</p>
        ) : (
          <div className="shrink-0 flex items-center gap-3">
            <p className="text-xs text-muted-foreground whitespace-nowrap">
              {t("reporting.training.completedOf", { done: row.completed.length, total: row.total })}
            </p>
            <div className="hidden sm:block w-24 h-1.5 rounded-full bg-muted overflow-hidden">
              <div className="h-full bg-sage rounded-full" style={{ width: `${row.pct}%` }} />
            </div>
            <p className="w-10 text-right text-xs font-semibold text-foreground">{row.pct}%</p>
          </div>
        )}
        <ChevronDown size={14} className={cn("text-muted-foreground shrink-0 transition-transform", expanded && "rotate-180")} />
      </button>

      {expanded && row.total > 0 && (
        <div className="px-4 pb-4 grid gap-4 sm:grid-cols-2">
          <PeopleList
            title={t("reporting.training.completedTitle", { count: row.completed.length })}
            people={row.completed.map(c => ({ id: c.member.id, name: c.member.name, detail: locationNames(c.member.location_ids), trailing: formatDate(c.completedAt) }))}
          />
          <PeopleList
            title={t("reporting.training.notCompletedTitle", { count: row.notCompleted.length })}
            people={row.notCompleted.map(m => ({ id: m.id, name: m.name, detail: locationNames(m.location_ids) }))}
          />
        </div>
      )}
    </div>
  );
}

function PeopleList({ title, people }: { title: string; people: { id: string; name: string; detail: string; trailing?: string }[] }) {
  const { t } = useTranslation("checklists");
  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground mb-1.5">{title}</p>
      {people.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t("reporting.training.none")}</p>
      ) : (
        <ul className="space-y-1.5">
          {people.map(p => (
            <li key={p.id} className="flex items-center justify-between gap-3 text-sm">
              <span className="min-w-0">
                <span className="text-foreground">{p.name}</span>
                <span className="text-xs text-muted-foreground"> · {p.detail}</span>
              </span>
              {p.trailing && <span className="text-xs text-muted-foreground shrink-0">{p.trailing}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
