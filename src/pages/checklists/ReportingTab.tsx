import { useState, useMemo, useEffect, useRef } from "react";
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from "date-fns";
import type { DateRange } from "react-day-picker";
import { CalendarIcon, ChevronRight, FileText, Download, TrendingUp, TrendingDown, Minus, Search, User, X, Plus, ChevronDown, CheckCircle2, Clock, Circle, AlertTriangle, Building2, MapPin, Layers } from "lucide-react";
import { useTranslation } from "react-i18next";
import i18n from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { type MultiSelectOption } from "@/components/MultiSelectFilter";
import { FiltersPopover, FilterField, FilterMultiSelect, ActiveFilterChips, type ActiveFilterChip } from "@/components/FiltersPopover";
import { useChecklistLogs } from "@/hooks/useChecklistLogs";
import { useChecklists } from "@/hooks/useChecklists";
import { useActions } from "@/hooks/useActions";
import { useLocations } from "@/hooks/useLocations";
import { useConcepts } from "@/hooks/useConcepts";
import { useDepartmentsForLocations } from "@/hooks/useDepartments";
import { useTeamMembers } from "@/hooks/useTeamMembers";
import { usePlan } from "@/hooks/usePlan";
import { UpgradePrompt } from "@/components/UpgradePrompt";
import { exportReportingPdf, exportReportingCsv } from "@/lib/export-utils";
import type { LogEntry } from "./types";
import { LogDetailModal } from "./LogDetailModal";

type Period = "today" | "week" | "month" | "custom";

function scoreBadge(score: number | null) {
  const t = (key: string) => i18n.t(`reporting.log.${key}`, { ns: "checklists" });
  if (score == null) return { label: t("badgeUnfinished"), cls: "status-warn" };
  if (score >= 85) return { label: t("badgePass"), cls: "status-ok" };
  if (score >= 65) return { label: t("badgeReview"), cls: "status-warn" };
  return { label: t("badgeActionRequired"), cls: "status-error" };
}

function dotColor(score: number) {
  if (score >= 85) return "hsl(var(--status-ok))";
  if (score >= 65) return "hsl(var(--status-warn))";
  return "hsl(var(--status-error))";
}

function ScoreTrendChart({ data }: { data: { date: string; avg: number }[] }) {
  const { t } = useTranslation("checklists");
  // viewBox is 640 wide; on mobile (~430px rendered) the scale is ~0.67
  // All fontSize values are SVG units — multiply by ~0.67 to get rendered px
  const W = 640, H = 210;
  const PL = 36, PR = 74, PT = 38, PB = 34;
  const chartW = W - PL - PR;
  const chartH = H - PT - PB;
  const bottom = PT + chartH;

  const getX = (i: number) => PL + (data.length > 1 ? (i * chartW) / (data.length - 1) : chartW / 2);
  const getY = (v: number) => PT + ((100 - v) / 100) * chartH;

  const linePoints = data.map((p, i) => `${getX(i)},${getY(p.avg)}`);
  const fillPath = data.length > 1
    ? `M ${linePoints.join(" L ")} L ${getX(data.length - 1)},${bottom} L ${getX(0)},${bottom} Z`
    : "";

  const maxLabels = 7;
  const labelStep = data.length > maxLabels ? Math.ceil(data.length / maxLabels) : 1;
  const showDateLabel = (i: number) => data.length === 1 || i % labelStep === 0 || i === data.length - 1;

  const mut = "hsl(var(--muted-foreground))";

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-[210px] w-full min-w-[320px]" role="img" aria-label={t("reporting.scoreTrend.chartAriaLabel")}>
        <defs>
          <linearGradient id="score-area-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(var(--sage))" stopOpacity="0.14" />
            <stop offset="100%" stopColor="hsl(var(--sage))" stopOpacity="0.01" />
          </linearGradient>
        </defs>

        {/* Zone bands */}
        <rect x={PL} y={PT} width={chartW} height={getY(85) - PT}
          fill="hsl(var(--status-ok))" fillOpacity="0.06" />
        <rect x={PL} y={getY(85)} width={chartW} height={getY(65) - getY(85)}
          fill="hsl(var(--status-warn))" fillOpacity="0.06" />
        <rect x={PL} y={getY(65)} width={chartW} height={bottom - getY(65)}
          fill="hsl(var(--status-error))" fillOpacity="0.06" />

        {/* Y-axis labels — fontSize 15 → ~10px rendered */}
        {[0, 50, 100].map((v) => (
          <text key={v} x={PL - 6} y={getY(v) + 5} textAnchor="end" fill={mut} fontSize="15">{v}</text>
        ))}

        {/* Threshold lines + right-side labels — fontSize 14 → ~9px rendered */}
        {[
          { v: 85, varName: "--status-ok", label: t("reporting.scoreTrend.passThreshold") },
          { v: 65, varName: "--status-warn", label: t("reporting.stats.review") },
        ].map(({ v, varName, label }) => (
          <g key={v}>
            <line x1={PL} x2={PL + chartW} y1={getY(v)} y2={getY(v)}
              stroke={`hsl(var(${varName}))`} strokeDasharray="4 4" strokeOpacity="0.5" />
            <text x={PL + chartW + 6} y={getY(v) + 5}
              fill={`hsl(var(${varName}))`} fontSize="14" fontWeight="600" opacity="0.85">
              {label}
            </text>
          </g>
        ))}

        {/* Gradient fill + line */}
        {data.length > 1 && (
          <>
            <path d={fillPath} fill="url(#score-area-fill)" />
            <polyline fill="none" stroke="hsl(var(--sage))" strokeWidth="2.5"
              strokeLinejoin="round" strokeLinecap="round" points={linePoints.join(" ")} />
          </>
        )}

        {/* Data points: glow ring + colored dot + score label + date label */}
        {data.map((point, i) => {
          const cx = getX(i);
          const cy = getY(point.avg);
          const col = dotColor(point.avg);
          return (
            <g key={`${point.date}-${i}`}>
              <circle cx={cx} cy={cy} r="8" fill={col} opacity="0.12" />
              <circle cx={cx} cy={cy} r="4.5" fill={col} stroke="white" strokeWidth="1.5" />
              {/* Score label — fontSize 16 → ~11px rendered */}
              <text x={cx} y={cy - 14} textAnchor="middle" fill={col} fontSize="16" fontWeight="700">
                {point.avg}%
              </text>
              {/* Date label — fontSize 14 → ~9px rendered */}
              {showDateLabel(i) && (
                <text x={cx} y={H - 6} textAnchor="middle" fill={mut} fontSize="14">
                  {point.date}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/**
 * Checklists aren't assigned to individual people — they're scoped to
 * locations/concept and departments. A checklist counts as "assigned" to a
 * team member when its scope overlaps theirs; a member with no locations or
 * no departments set covers all of them.
 */
function isChecklistAssignedTo(
  c: { location_id: string | null; location_ids?: string[] | null; concept_id?: string | null; department_ids?: string[] | null },
  m: { location_ids?: string[] | null; department_ids?: string[] | null },
  conceptByLocationId: Map<string, string | null>,
): boolean {
  const memberLocs = m.location_ids ?? [];
  if (memberLocs.length > 0) {
    const locIds = c.location_ids ?? (c.location_id ? [c.location_id] : []);
    if (locIds.length > 0) {
      if (!locIds.some(id => memberLocs.includes(id))) return false;
    } else if (c.concept_id) {
      if (!memberLocs.some(id => conceptByLocationId.get(id) === c.concept_id)) return false;
    }
  }
  const memberDepts = m.department_ids ?? [];
  const checklistDepts = c.department_ids ?? [];
  if (memberDepts.length > 0 && checklistDepts.length > 0 && !checklistDepts.some(id => memberDepts.includes(id))) return false;
  return true;
}

type StatusFilter = "all" | "completed" | "unfinished" | "unstarted";

/** Everything the Filters popover edits — staged as a draft and only committed on Apply. */
interface PanelFilters {
  period: Period;
  dateRange: DateRange | undefined;
  conceptIds: string[];
  locationIds: string[];
  departmentIds: string[];
  userIds: string[];
  status: StatusFilter;
}

const DEFAULT_PANEL_FILTERS: PanelFilters = {
  period: "week", dateRange: undefined, conceptIds: [], locationIds: [], departmentIds: [], userIds: [], status: "all",
};

/** Kiosk logs store every staff member who worked on a checklist as a
 *  comma-separated `completed_by` ("Maria López, Jordi Puig"). */
function splitContributors(completedBy: string): string[] {
  return completedBy.split(",").map(n => n.trim()).filter(Boolean);
}

function initials(name: string) {
  const parts = name.split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

function contributorsSummary(names: string[]) {
  if (names.length === 0) return "—";
  return names.length === 1 ? names[0] : `${names[0]} +${names.length - 1}`;
}

/** Completion Log cell: stacked initials + "First Name +N", full list on hover. */
function ContributorsCell({ completedBy }: { completedBy: string }) {
  const names = splitContributors(completedBy);
  if (names.length === 0) return <span className="text-sm text-muted-foreground">—</span>;
  const content = (
    <span className="flex items-center gap-2 min-w-0">
      <span className="flex -space-x-1.5 shrink-0">
        {names.slice(0, 3).map(n => (
          <span key={n} className="w-6 h-6 rounded-full bg-card ring-2 ring-card">
            <span className="w-full h-full rounded-full bg-foreground/10 text-foreground text-[10px] font-semibold flex items-center justify-center">
              {initials(n)}
            </span>
          </span>
        ))}
      </span>
      <span className="text-sm text-foreground truncate">{contributorsSummary(names)}</span>
    </span>
  );
  if (names.length === 1) return content;
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>{content}</TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          {names.map(n => <p key={n}>{n}</p>)}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function ReportingTab({ initialLocationId, initialStatus }: { initialLocationId?: string; initialStatus?: "all" | "completed" | "unfinished" | "unstarted" }) {
  const { t } = useTranslation("checklists");
  const { can } = usePlan();
  const [period, setPeriod] = useState<Period>("week");
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [calOpen, setCalOpen] = useState(false);
  const [selectedLog, setSelectedLog] = useState<LogEntry | null>(null);
  const [showCsvUpgrade, setShowCsvUpgrade] = useState(false);
  const [showReportingUpgrade, setShowReportingUpgrade] = useState(false);
  // Scope filters — empty array means "all"
  const [conceptIds, setConceptIds] = useState<string[]>([]);
  const [locationIds, setLocationIds] = useState<string[]>(initialLocationId ? [initialLocationId] : []);
  const [departmentIds, setDepartmentIds] = useState<string[]>([]);
  const [userIds, setUserIds] = useState<string[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [checklistSearch, setChecklistSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(initialStatus ?? "all");
  // Staged edits inside the Filters popover — copied from the applied filters
  // on open, committed on Apply, discarded if the popover is dismissed.
  const [draft, setDraft] = useState<PanelFilters>(DEFAULT_PANEL_FILTERS);
  const updateDraft = (patch: Partial<PanelFilters>) => setDraft(prev => ({ ...prev, ...patch }));

  useEffect(() => {
    const next = initialLocationId ? [initialLocationId] : [];
    setLocationIds(prev => (prev.length === next.length && prev.every((id, i) => id === next[i]) ? prev : next));
  }, [initialLocationId]);

  useEffect(() => {
    if (initialStatus) setStatusFilter(initialStatus);
  }, [initialStatus]);

  const { data: concepts = [] } = useConcepts();
  const { data: allLocations = [], isSuccess: locationsLoaded } = useLocations();
  const locationNameById = useMemo(
    () => new Map(allLocations.map(location => [location.id, location.name])),
    [allLocations]
  );

  // A deep link to one location (e.g. from the dashboard's daily compliance)
  // also preselects that location's concept. Runs once per link, after
  // locations load, so a background refetch can't override a concept the
  // user has since changed.
  const conceptPresetForLocation = useRef<string | null>(null);
  useEffect(() => {
    if (!initialLocationId || !locationsLoaded) return;
    if (conceptPresetForLocation.current === initialLocationId) return;
    conceptPresetForLocation.current = initialLocationId;
    const conceptId = allLocations.find(l => l.id === initialLocationId)?.concept_id;
    setConceptIds(conceptId ? [conceptId] : []);
  }, [initialLocationId, locationsLoaded, allLocations]);

  // Narrow the location picker's options to the selected concept(s).
  const conceptScopedLocations = useMemo(
    () => conceptIds.length === 0 ? allLocations : allLocations.filter(l => l.concept_id && conceptIds.includes(l.concept_id)),
    [allLocations, conceptIds],
  );

  // The popover's pickers work off the draft: the location list narrows to the
  // draft concept(s), and departments are the union across the draft's
  // locations in scope (the specific ones picked, or every concept-scoped one).
  const draftConceptScopedLocations = useMemo(
    () => draft.conceptIds.length === 0 ? allLocations : allLocations.filter(l => l.concept_id && draft.conceptIds.includes(l.concept_id)),
    [allLocations, draft.conceptIds],
  );
  const departmentLocationIds = useMemo(
    () => (draft.locationIds.length > 0 ? draft.locationIds : draftConceptScopedLocations.map(l => l.id)),
    [draft.locationIds, draftConceptScopedLocations],
  );
  const { data: availableDepartments = [], isFetching: departmentsFetching } = useDepartmentsForLocations(departmentLocationIds);

  // If a draft concept change removes a picked location, drop it rather than
  // silently showing an empty report. Waits for locations to load, and keeps
  // the same object when nothing changed to avoid a re-render loop.
  useEffect(() => {
    if (!locationsLoaded) return;
    setDraft(prev => {
      const next = prev.locationIds.filter(id => draftConceptScopedLocations.some(l => l.id === id));
      return next.length === prev.locationIds.length ? prev : { ...prev, locationIds: next };
    });
  }, [locationsLoaded, draftConceptScopedLocations]);

  // Same pruning for departments — skipped while the list is refetching for a
  // new location set, so existing picks aren't wiped mid-load.
  useEffect(() => {
    if (departmentsFetching) return;
    setDraft(prev => {
      const next = prev.departmentIds.filter(id => availableDepartments.some(d => d.id === id));
      return next.length === prev.departmentIds.length ? prev : { ...prev, departmentIds: next };
    });
  }, [departmentsFetching, availableDepartments]);

  const openFiltersPanel = () => {
    setDraft({ period, dateRange, conceptIds, locationIds, departmentIds, userIds, status: statusFilter });
    setFiltersOpen(true);
  };
  const applyFilters = () => {
    setPeriod(draft.period);
    setDateRange(draft.dateRange);
    setConceptIds(draft.conceptIds);
    setLocationIds(draft.locationIds);
    setDepartmentIds(draft.departmentIds);
    setUserIds(draft.userIds);
    setStatusFilter(draft.status);
    setFiltersOpen(false);
  };

  // null = no restriction (every location / department); a narrower array
  // once a concept and/or specific locations/departments are picked.
  const effectiveLocationIds = useMemo<string[] | null>(() => {
    if (conceptIds.length === 0 && locationIds.length === 0) return null;
    return locationIds.length > 0 ? locationIds : conceptScopedLocations.map(l => l.id);
  }, [conceptIds, locationIds, conceptScopedLocations]);
  const effectiveDepartmentIds = departmentIds.length > 0 ? departmentIds : null;

  // Build date filters — location/department/concept scoping happens client-side below.
  const filters = useMemo(() => {
    const today = new Date();
    if (period === "today") {
      return { from: format(startOfDay(today), "yyyy-MM-dd'T'HH:mm:ss"), to: format(endOfDay(today), "yyyy-MM-dd'T'HH:mm:ss") };
    }
    if (period === "week") {
      return { from: format(startOfWeek(today, { weekStartsOn: 1 }), "yyyy-MM-dd'T'HH:mm:ss"), to: format(endOfWeek(today, { weekStartsOn: 1 }), "yyyy-MM-dd'T'HH:mm:ss") };
    }
    if (period === "month") {
      return { from: format(startOfMonth(today), "yyyy-MM-dd'T'HH:mm:ss"), to: format(endOfMonth(today), "yyyy-MM-dd'T'HH:mm:ss") };
    }
    if (dateRange?.from) {
      return {
        from: format(startOfDay(dateRange.from), "yyyy-MM-dd'T'HH:mm:ss"),
        to: dateRange.to ? format(endOfDay(dateRange.to), "yyyy-MM-dd'T'HH:mm:ss") : undefined,
      };
    }
    return {};
  }, [period, dateRange]);

  const { data: rawLogs = [], isLoading } = useChecklistLogs(filters);
  const { data: allDbChecklists = [] } = useChecklists();
  const { data: teamMembers = [] } = useTeamMembers();
  const selectedMembers = useMemo(
    () => (userIds.length === 0 ? null : teamMembers.filter(m => userIds.includes(m.id))),
    [teamMembers, userIds],
  );
  const conceptByLocationId = useMemo(
    () => new Map(allLocations.map(l => [l.id, l.concept_id ?? null])),
    [allLocations],
  );
  const checklistById = useMemo(() => new Map(allDbChecklists.map(c => [c.id, c])), [allDbChecklists]);

  const allChecklists = useMemo(
    () => allDbChecklists.filter(c => {
      if (effectiveLocationIds) {
        const locIds = c.location_ids ?? (c.location_id ? [c.location_id] : null);
        if (locIds && locIds.length > 0 && !locIds.some(id => effectiveLocationIds.includes(id))) return false;
      }
      if (effectiveDepartmentIds) {
        const deptIds = c.department_ids ?? [];
        if (deptIds.length > 0 && !deptIds.some(id => effectiveDepartmentIds.includes(id))) return false;
      }
      if (selectedMembers && !selectedMembers.some(m => isChecklistAssignedTo(c, m, conceptByLocationId))) return false;
      return true;
    }),
    [allDbChecklists, effectiveLocationIds, effectiveDepartmentIds, selectedMembers, conceptByLocationId],
  );

  const logs = useMemo(
    () => rawLogs.filter(l => {
      if (effectiveLocationIds && l.location_id !== null && !effectiveLocationIds.includes(l.location_id)) return false;
      if (effectiveDepartmentIds && l.checklist_id !== null) {
        const deptIds = checklistById.get(l.checklist_id)?.department_ids ?? [];
        if (deptIds.length > 0 && !deptIds.some(id => effectiveDepartmentIds.includes(id))) return false;
      }
      return true;
    }),
    [rawLogs, effectiveLocationIds, effectiveDepartmentIds, checklistById],
  );

  const { data: rawActions = [] } = useActions();
  const scopedChecklistIds = useMemo(() => new Set(allChecklists.map(c => c.id)), [allChecklists]);
  const actions = useMemo(
    () => (effectiveLocationIds === null && effectiveDepartmentIds === null && selectedMembers === null)
      ? rawActions
      : rawActions.filter(a => a.checklist_id === null || scopedChecklistIds.has(a.checklist_id)),
    [rawActions, effectiveLocationIds, effectiveDepartmentIds, selectedMembers, scopedChecklistIds],
  );
  const logById = useMemo(() => new Map(logs.map(log => [log.id, log])), [logs]);
  const checklistOptions = useMemo(
    () => Array.from(new Set(logs.map(log => log.checklist_title).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [logs]
  );

  // Unstarted: active checklists that have no log entry in the selected period
  const unstartedChecklists = useMemo(() => {
    if (isLoading) return [];
    const periodEnd = filters.to ? new Date(filters.to) : new Date();
    const loggedIds = new Set(logs.map(l => l.checklist_id).filter(Boolean));
    const checklistQuery = checklistSearch.trim().toLowerCase();
    return allChecklists.filter(c => {
      if (loggedIds.has(c.id)) return false;
      if (c.start_date && new Date(c.start_date) > periodEnd) return false;
      if (checklistQuery && !c.title.toLowerCase().startsWith(checklistQuery)) return false;
      return true;
    });
  }, [allChecklists, logs, filters, isLoading, checklistSearch]);

  const filteredChecklistLogs = useMemo(() => {
    if (statusFilter === "unstarted") return [];
    const checklistQuery = checklistSearch.trim().toLowerCase();
    return logs.filter(log => {
      if (selectedMembers && !selectedMembers.some(m =>
        log.staff_profile_id === m.id
        || log.completed_by === m.name
        || (log.checklist_id !== null && checklistById.has(log.checklist_id)
            && isChecklistAssignedTo(checklistById.get(log.checklist_id), m, conceptByLocationId))
      )) return false;
      if (statusFilter === "completed" && log.score == null) return false;
      if (statusFilter === "unfinished" && log.score != null) return false;
      if (checklistQuery && !log.checklist_title.toLowerCase().startsWith(checklistQuery)) return false;
      return true;
    });
  }, [logs, selectedMembers, checklistById, conceptByLocationId, checklistSearch, statusFilter]);

  const openActionsCount = useMemo(() => actions.filter(a => a.status === "open").length, [actions]);

  const avgScore = useMemo(() => {
    const scored = filteredChecklistLogs.filter(l => l.score !== null);
    if (!scored.length) return null;
    return Math.round(scored.reduce((sum, l) => sum + (l.score ?? 0), 0) / scored.length);
  }, [filteredChecklistLogs]);
  const hasAvgScore = avgScore != null;
  const avgScoreValue = avgScore ?? 0;

  // Score trend: group by date, avg per day
  const trendData = useMemo(() => {
    const byDate: Record<string, number[]> = {};
    [...filteredChecklistLogs].reverse().forEach(log => {
      const d = format(new Date(log.created_at), "d MMM");
      if (log.score !== null) {
        if (!byDate[d]) byDate[d] = [];
        byDate[d].push(log.score);
      }
    });
    return Object.entries(byDate).filter(([, scores]) => scores.length > 0).map(([date, scores]) => ({
      date,
      avg: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
    }));
  }, [filteredChecklistLogs]);

  // Panel filters only — the search box and the date are shown in the toolbar
  // itself, so they don't count toward the "Filters" badge.
  const activeFilterCount = [conceptIds.length > 0, locationIds.length > 0, departmentIds.length > 0, userIds.length > 0, statusFilter !== "all"]
    .filter(Boolean).length;
  const hasActiveFilters = activeFilterCount > 0 || checklistSearch.trim().length > 0;

  // Applied panel filters as removable chips (the date shows on the export row instead).
  const departmentNames = useRef(new Map<string, string>());
  availableDepartments.forEach(d => departmentNames.current.set(d.id, d.name));
  const statusLabel: Record<StatusFilter, string> = {
    all: "", completed: t("reporting.stats.completed"), unfinished: t("reporting.stats.unfinished"), unstarted: t("reporting.stats.unstarted"),
  };
  const filterChips: ActiveFilterChip[] = [
    ...conceptIds.map(id => ({ key: `c-${id}`, label: concepts.find(c => c.id === id)?.name ?? id, onRemove: () => setConceptIds(prev => prev.filter(x => x !== id)) })),
    ...locationIds.map(id => ({ key: `l-${id}`, label: locationNameById.get(id) ?? id, onRemove: () => setLocationIds(prev => prev.filter(x => x !== id)) })),
    ...departmentIds.map(id => ({ key: `d-${id}`, label: departmentNames.current.get(id) ?? id, onRemove: () => setDepartmentIds(prev => prev.filter(x => x !== id)) })),
    ...userIds.map(id => ({ key: `u-${id}`, label: teamMembers.find(m => m.id === id)?.name ?? id, onRemove: () => setUserIds(prev => prev.filter(x => x !== id)) })),
    ...(statusFilter === "all" ? [] : [{ key: "status", label: statusLabel[statusFilter], onRemove: () => setStatusFilter("all") }]),
  ];

  const completedCount = useMemo(() => filteredChecklistLogs.filter(l => l.score !== null).length, [filteredChecklistLogs]);
  const unfinishedCount = useMemo(() => filteredChecklistLogs.filter(l => l.score === null).length, [filteredChecklistLogs]);
  const unstartedCount = unstartedChecklists.length;

  // Log entries
  const logEntries: LogEntry[] = useMemo(
    () => filteredChecklistLogs.map(l => ({
      id: l.id,
      checklist: l.checklist_title,
      completedBy: l.completed_by,
      date: format(new Date(l.created_at), "d MMM, HH:mm"),
      score: l.score,
      type: (l.type as LogEntry["type"]) ?? "opening",
      answers: l.answers ?? [],
      startedAt:  l.started_at  ?? undefined,   // null → undefined so PDF omits it
      finishedAt: l.created_at,                 // always available
    })),
    [filteredChecklistLogs]
  );

  const periodLabel =
    period === "today" ? t("reporting.period.today") :
    period === "week" ? t("reporting.period.week") :
    period === "month" ? t("reporting.period.month") :
    dateRange?.from && dateRange?.to
      ? `${format(dateRange.from, "d MMM")} – ${format(dateRange.to, "d MMM yyyy")}`
      : dateRange?.from ? t("reporting.period.fromDate", { date: format(dateRange.from, "d MMM yyyy") })
      : t("reporting.period.customRange");

  const pickerLabel =
    draft.dateRange?.from && draft.dateRange?.to
      ? `${format(draft.dateRange.from, "d MMM")} – ${format(draft.dateRange.to, "d MMM")}`
      : draft.dateRange?.from ? format(draft.dateRange.from, "d MMM yyyy")
      : t("reporting.period.custom");

  const reportRows = useMemo(
    () => logEntries.map(l => {
      const log = logById.get(l.id);
      return {
        checklist: l.checklist,
        location: log?.location_id ? (locationNameById.get(log.location_id) ?? "—") : "—",
        completedBy: l.completedBy,
        startedAt: log?.started_at ? format(new Date(log.started_at), "d MMM yyyy, HH:mm") : "—",
        finishedAt: log?.created_at ? format(new Date(log.created_at), "d MMM yyyy, HH:mm") : "—",
        score: l.score,
      };
    }),
    [logEntries, logById, locationNameById]
  );

  const handleExportPdf = async () => {
    await exportReportingPdf(reportRows, periodLabel, { completed: logEntries.length, avg: avgScore ?? 0, open: openActionsCount });
  };

  const handleExportCsv = () => {
    exportReportingCsv(
      logEntries.map(l => ({ checklist: l.checklist, completedBy: l.completedBy, date: l.date, score: l.score })),
      periodLabel
    );
  };

  return (
    <>
      {/* ── Toolbar: checklist search + Filters toggle ── */}
      <div className="space-y-2">
      <FiltersPopover
        testIdPrefix="reporting"
        open={filtersOpen}
        onOpenChange={o => (o ? openFiltersPanel() : setFiltersOpen(false))}
        activeCount={activeFilterCount}
        onClear={() => setDraft(DEFAULT_PANEL_FILTERS)}
        onApply={applyFilters}
        search={<>
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            data-testid="reporting-checklist-search"
            type="search"
            value={checklistSearch}
            onChange={e => setChecklistSearch(e.target.value)}
            placeholder={t("reporting.filters.checklistNamePlaceholder")}
            aria-label={t("reporting.filters.checklistName")}
            className="w-full rounded-full border border-border bg-card py-2.5 pl-9 pr-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            list="reporting-checklist-options"
          />
          <datalist id="reporting-checklist-options">
            {checklistOptions.map(name => <option key={name} value={name} />)}
          </datalist>
        </>}
      >
        <FilterField label={t("reporting.filters.date")} className="md:col-span-2">
          <div className="flex flex-wrap gap-1.5">
            {([
              { key: "today" as Period, label: t("reporting.period.today") },
              { key: "week" as Period, label: t("reporting.period.week") },
              { key: "month" as Period, label: t("reporting.period.month") },
            ]).map(({ key, label }) => (
              <button key={key}
                onClick={() => { updateDraft({ period: key, dateRange: undefined }); setCalOpen(false); }}
                className={cn(
                  "shrink-0 text-xs px-4 py-2 rounded-full border font-semibold transition-colors",
                  draft.period === key
                    ? "bg-sage text-white border-sage"
                    : "border-border text-muted-foreground hover:border-sage/40"
                )}
              >
                {label}
              </button>
            ))}
            <Popover open={calOpen} onOpenChange={setCalOpen}>
              <PopoverTrigger asChild>
                <button
                  className={cn(
                    "shrink-0 flex items-center gap-1.5 text-xs px-4 py-2 rounded-full border font-semibold transition-colors",
                    draft.period === "custom" && draft.dateRange?.from
                      ? "bg-sage text-white border-sage"
                      : "border-border text-muted-foreground hover:border-sage/40"
                  )}
                  onClick={() => updateDraft({ period: "custom" })}
                >
                  <CalendarIcon size={12} />
                  {draft.period === "custom" && draft.dateRange?.from ? pickerLabel : t("reporting.period.custom")}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 z-[60]" align="start">
                <CalendarPicker
                  mode="range"
                  selected={draft.dateRange}
                  onSelect={r => {
                    updateDraft(r?.from ? { dateRange: r, period: "custom" } : { dateRange: r });
                    if (r?.from && r?.to) setCalOpen(false);
                  }}
                  numberOfMonths={1}
                  disabled={{ after: new Date() }}
                  initialFocus
                  className="p-3 pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          </div>
        </FilterField>
        <FilterField label={t("reporting.filters.concept")}>
          <FilterMultiSelect
            testId="reporting-concept-filter"
            icon={<Building2 size={14} className="text-muted-foreground shrink-0" />}
            options={concepts.map((c): MultiSelectOption => ({ id: c.id, label: c.name }))}
            selected={draft.conceptIds}
            onChange={ids => updateDraft({ conceptIds: ids })}
            allLabel={t("reporting.filters.allConcepts")}
          />
        </FilterField>
        <FilterField label={t("reporting.filters.location")}>
          <FilterMultiSelect
            testId="reporting-location-filter"
            icon={<MapPin size={14} className="text-muted-foreground shrink-0" />}
            options={draftConceptScopedLocations.map((l): MultiSelectOption => ({ id: l.id, label: l.name }))}
            selected={draft.locationIds}
            onChange={ids => updateDraft({ locationIds: ids })}
            allLabel={t("reporting.filters.allLocations")}
          />
        </FilterField>
        <FilterField label={t("reporting.filters.department")}>
          <FilterMultiSelect
            testId="reporting-department-filter"
            icon={<Layers size={14} className="text-muted-foreground shrink-0" />}
            options={availableDepartments.map((d): MultiSelectOption => ({ id: d.id, label: d.name }))}
            selected={draft.departmentIds}
            onChange={ids => updateDraft({ departmentIds: ids })}
            allLabel={t("reporting.filters.allDepartments")}
            noOptionsLabel={t("reporting.filters.noDepartments")}
          />
        </FilterField>
        <FilterField label={t("reporting.filters.user")}>
          <FilterMultiSelect
            testId="reporting-user-filter"
            icon={<User size={14} className="text-muted-foreground shrink-0" />}
            options={[...teamMembers]
              .sort((x, y) => x.name.localeCompare(y.name))
              .map((m): MultiSelectOption => ({ id: m.id, label: m.name }))}
            selected={draft.userIds}
            onChange={ids => updateDraft({ userIds: ids })}
            allLabel={t("reporting.filters.allUsers")}
          />
        </FilterField>
        <FilterField label={t("reporting.filters.status")}>
          <div className="relative">
            <CheckCircle2 size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <select
              data-testid="reporting-status-filter"
              value={draft.status}
              onChange={e => updateDraft({ status: e.target.value as StatusFilter })}
              className="w-full appearance-none rounded-xl border border-border bg-background py-2.5 pl-9 pr-8 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="all">{t("reporting.filters.allStatuses")}</option>
              <option value="completed">{t("reporting.stats.completed")}</option>
              <option value="unfinished">{t("reporting.stats.unfinished")}</option>
              <option value="unstarted">{t("reporting.stats.unstarted")}</option>
            </select>
            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          </div>
        </FilterField>
      </FiltersPopover>
      <ActiveFilterChips
        testIdPrefix="reporting"
        chips={filterChips}
        onClearAll={() => { setConceptIds([]); setLocationIds([]); setDepartmentIds([]); setUserIds([]); setStatusFilter("all"); }}
      />

      {/* Period + result count, with export */}
      <div className="flex items-center justify-between gap-2">
        <p data-testid="reporting-result-summary" className="min-w-0 truncate text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{periodLabel}</span>{" · "}
          {statusFilter === "unstarted"
            ? t("reporting.filters.showingUnstarted", { count: unstartedCount })
            : t("reporting.filters.showingLogs", { count: logs.length, shown: logEntries.length, total: logs.length })
          }
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <button
            data-testid="export-csv"
            onClick={() => can("exportCsv") ? handleExportCsv() : setShowCsvUpgrade(true)}
            disabled={!logEntries.length}
            className="shrink-0 flex items-center gap-1 text-xs font-semibold text-muted-foreground px-3 py-2 rounded-full border border-border hover:border-sage/40 transition-colors disabled:opacity-40"
          >
            <Download size={12} /> {t("reporting.csv")}
          </button>
          <button
            data-testid="export-pdf"
            onClick={handleExportPdf}
            disabled={!logEntries.length}
            className="shrink-0 flex items-center gap-1 text-xs font-semibold text-sage px-3 py-2 rounded-full border border-sage/40 hover:bg-sage-light transition-colors disabled:opacity-40"
          >
            <FileText size={12} /> {t("reporting.pdf")}
          </button>
        </div>
      </div>
      </div>{/* end toolbar */}

      {/* Stat cards — row 1: completion breakdown */}
      <div className="grid grid-cols-3 gap-2">
        <div data-testid="stat-completed" className="bg-card border border-border rounded-[18px] p-4 text-center">
          <div className="w-7 h-7 rounded-[9px] bg-[hsl(var(--status-ok-bg))] flex items-center justify-center mx-auto mb-1.5">
            <CheckCircle2 size={14} className="text-status-ok" />
          </div>
          <p className="section-label mb-1">{t("reporting.stats.completed")}</p>
          <p className="text-2xl font-semibold text-status-ok">{isLoading ? "—" : completedCount}</p>
          {!isLoading && completedCount === 0 && (
            <div className="flex items-center justify-center gap-0.5 mt-1">
              <Minus size={10} className="text-muted-foreground" />
              <span className="text-xs text-muted-foreground font-medium">{t("reporting.stats.none")}</span>
            </div>
          )}
        </div>
        <div data-testid="stat-unfinished" className="bg-card border border-border rounded-[18px] p-4 text-center">
          <div className={cn("w-7 h-7 rounded-[9px] flex items-center justify-center mx-auto mb-1.5",
            unfinishedCount > 0 ? "bg-[hsl(var(--status-warn-bg))]" : "bg-muted"
          )}>
            <Clock size={14} className={unfinishedCount > 0 ? "text-status-warn" : "text-muted-foreground"} />
          </div>
          <p className="section-label mb-1">{t("reporting.stats.unfinished")}</p>
          <p className={cn("text-2xl font-semibold", unfinishedCount > 0 ? "text-status-warn" : "text-muted-foreground")}>
            {isLoading ? "—" : unfinishedCount}
          </p>
          {!isLoading && unfinishedCount === 0 && (
            <div className="flex items-center justify-center gap-0.5 mt-1">
              <Minus size={10} className="text-muted-foreground" />
              <span className="text-xs text-muted-foreground font-medium">{t("reporting.stats.none")}</span>
            </div>
          )}
        </div>
        <div data-testid="stat-unstarted" className="bg-card border border-border rounded-[18px] p-4 text-center">
          <div className={cn("w-7 h-7 rounded-[9px] flex items-center justify-center mx-auto mb-1.5",
            unstartedCount > 0 ? "bg-[hsl(var(--status-error-bg))]" : "bg-muted"
          )}>
            <Circle size={14} className={unstartedCount > 0 ? "text-status-error" : "text-muted-foreground"} />
          </div>
          <p className="section-label mb-1">{t("reporting.stats.unstarted")}</p>
          <p className={cn("text-2xl font-semibold", unstartedCount > 0 ? "text-status-error" : "text-muted-foreground")}>
            {isLoading ? "—" : unstartedCount}
          </p>
          {!isLoading && unstartedCount === 0 && (
            <div className="flex items-center justify-center gap-0.5 mt-1">
              <Minus size={10} className="text-muted-foreground" />
              <span className="text-xs text-muted-foreground font-medium">{t("reporting.stats.none")}</span>
            </div>
          )}
        </div>
      </div>

      {/* Stat cards — row 2: score + actions */}
      <div className="grid grid-cols-2 gap-2">
        <div data-testid="stat-avg-score" className="bg-card border border-border rounded-[18px] p-4 text-center">
          <div className={cn("w-7 h-7 rounded-[9px] flex items-center justify-center mx-auto mb-1.5",
            avgScore == null ? "bg-muted" :
            avgScoreValue >= 85 ? "bg-[hsl(var(--status-ok-bg))]" :
            avgScoreValue >= 65 ? "bg-[hsl(var(--status-warn-bg))]" :
            "bg-[hsl(var(--status-error-bg))]"
          )}>
            {avgScore == null || avgScoreValue >= 85
              ? <TrendingUp size={14} className={avgScore == null ? "text-muted-foreground" : "text-status-ok"} />
              : avgScoreValue >= 65
              ? <Minus size={14} className="text-status-warn" />
              : <TrendingDown size={14} className="text-status-error" />
            }
          </div>
          <p className="section-label mb-1">{t("reporting.stats.avgScore")}</p>
          <p className={cn("text-2xl font-semibold",
            avgScore == null ? "text-muted-foreground" :
            avgScoreValue >= 85 ? "text-status-ok" :
            avgScoreValue >= 65 ? "text-status-warn" :
            "text-status-error"
          )}>
            {isLoading ? "—" : avgScore == null ? "—" : `${avgScoreValue}%`}
          </p>
          {!isLoading && hasAvgScore && (
            <div className="flex items-center justify-center gap-0.5 mt-1">
              {avgScoreValue >= 85
                ? <><TrendingUp size={10} className="text-status-ok" /><span className="text-xs text-status-ok font-medium">{t("reporting.stats.good")}</span></>
                : avgScoreValue >= 65
                ? <><Minus size={10} className="text-status-warn" /><span className="text-xs text-status-warn font-medium">{t("reporting.stats.review")}</span></>
                : <><TrendingDown size={10} className="text-status-error" /><span className="text-xs text-status-error font-medium">{t("reporting.stats.actionNeeded")}</span></>
              }
            </div>
          )}
        </div>
        <div data-testid="stat-open-actions" className="bg-card border border-border rounded-[18px] p-4 text-center">
          <div className={cn("w-7 h-7 rounded-[9px] flex items-center justify-center mx-auto mb-1.5",
            openActionsCount > 0 ? "bg-[hsl(var(--status-error-bg))]" : "bg-[hsl(var(--status-ok-bg))]"
          )}>
            <AlertTriangle size={14} className={openActionsCount > 0 ? "text-status-error" : "text-status-ok"} />
          </div>
          <p className="section-label mb-1">{t("reporting.stats.openActions")}</p>
          <p className={cn("text-2xl font-semibold", openActionsCount > 0 ? "text-status-error" : "text-status-ok")}>
            {openActionsCount}
          </p>
          {openActionsCount === 0 && (
            <div className="flex items-center justify-center gap-0.5 mt-1">
              <Minus size={10} className="text-muted-foreground" />
              <span className="text-xs text-muted-foreground font-medium">{t("reporting.stats.none")}</span>
            </div>
          )}
        </div>
      </div>

      {/* Score Trend — Advanced reporting, gated to Growth+ */}
      {trendData.length > 0 && (
        can("advancedReporting") ? (
          <div className="bg-card border border-border rounded-[20px] p-4">
            <div className="flex items-center justify-between mb-4">
              <p className="section-label">{t("reporting.scoreTrend.heading")}</p>
              {trendData.length >= 2 && (() => {
                const delta = trendData[trendData.length - 1].avg - trendData[0].avg;
                if (delta > 0) return <span className="flex items-center gap-1 text-xs font-semibold text-status-ok"><TrendingUp size={12} />+{delta}%</span>;
                if (delta < 0) return <span className="flex items-center gap-1 text-xs font-semibold text-status-error"><TrendingDown size={12} />{delta}%</span>;
                return <span className="flex items-center gap-1 text-xs font-semibold text-muted-foreground"><Minus size={12} />{t("reporting.stats.noChange")}</span>;
              })()}
            </div>
            <ScoreTrendChart data={trendData} />
          </div>
        ) : (
          <button
            onClick={() => setShowReportingUpgrade(true)}
            className="w-full text-left bg-card border border-border rounded-[20px] p-4 hover:bg-muted/30 transition-colors"
          >
            <p className="section-label mb-1">{t("reporting.scoreTrend.heading")}</p>
            <p className="text-xs text-muted-foreground">{t("reporting.scoreTrend.upgradeLocked")}</p>
          </button>
        )
      )}

      {/* Completion Log — table-style with PASS/REVIEW/ACTION REQ. */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="section-label">
            {t("reporting.log.heading")}
            <span className="text-muted-foreground font-normal ml-1">— {periodLabel}</span>
          </p>
        </div>

        {isLoading ? (
          <div className="bg-card border border-border rounded-[20px] p-6 text-center">
            <p className="text-sm text-muted-foreground">{t("reporting.log.loading")}</p>
          </div>
        ) : statusFilter === "unstarted" ? (
          unstartedChecklists.length > 0 ? (
            <div className="bg-card border border-border rounded-[20px] divide-y divide-border overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-2 bg-muted/40">
                <p className="text-xs font-bold text-muted-foreground flex-1">{t("reporting.log.checklistColumn")}</p>
                <p className="text-xs font-bold text-muted-foreground w-24 text-right">{t("reporting.log.statusColumn")}</p>
              </div>
              {unstartedChecklists.map(c => (
                <div key={c.id} className="flex items-center gap-3 px-4 py-3.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{c.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{t("reporting.log.noActivity")}</p>
                  </div>
                  <span className="text-xs px-2 py-0.5 rounded-full font-bold status-error">{t("reporting.log.badgeUnstarted")}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-card border border-border rounded-[20px] p-8 text-center">
              <p className="text-sm text-muted-foreground">{t("reporting.log.allStarted")}</p>
            </div>
          )
        ) : logEntries.length > 0 || (statusFilter === "all" && unstartedChecklists.length > 0) ? (
          <div className="bg-card border border-border rounded-[20px] divide-y divide-border overflow-hidden">
            {/* Table header */}
            <div className="flex items-center gap-3 px-4 py-2 bg-muted/40">
              <p className="text-xs font-bold text-muted-foreground flex-1">{t("reporting.log.checklistColumn")}</p>
              <p className="text-xs font-bold text-muted-foreground hidden sm:block w-44">{t("reporting.log.completedByColumn")}</p>
              <p className="text-xs font-bold text-muted-foreground hidden sm:block w-32">{t("reporting.log.completedAtColumn")}</p>
              <p className="text-xs font-bold text-muted-foreground w-28 text-right">{t("reporting.log.statusColumn")}</p>
              <div className="w-[13px]" />
            </div>
            {logEntries.map(log => {
              const badge = scoreBadge(log.score);
              return (
                <button key={log.id} onClick={() => setSelectedLog(log)}
                  className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-muted/30 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{log.checklist}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 sm:hidden">{contributorsSummary(splitContributors(log.completedBy))} · {log.date}</p>
                  </div>
                  <div className="hidden sm:block w-44 min-w-0"><ContributorsCell completedBy={log.completedBy} /></div>
                  <p className="hidden sm:block w-32 text-sm text-muted-foreground tabular-nums">{log.date}</p>
                  <div className="w-28 flex justify-end shrink-0">
                    <span className={cn("text-xs px-2 py-0.5 rounded-full font-bold", badge.cls)}>
                      {badge.label}
                    </span>
                  </div>
                  <ChevronRight size={13} className="text-muted-foreground shrink-0" />
                </button>
              );
            })}
            {/* Unstarted rows appended when "all" filter is active */}
            {statusFilter === "all" && unstartedChecklists.map(c => (
              <div key={c.id} className="flex items-center gap-3 px-4 py-3.5">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{c.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 sm:hidden">{t("reporting.log.noActivity")}</p>
                </div>
                <p className="hidden sm:block w-44 text-sm text-muted-foreground">—</p>
                <p className="hidden sm:block w-32 text-sm text-muted-foreground">—</p>
                <div className="w-28 flex justify-end shrink-0">
                  <span className="text-xs px-2 py-0.5 rounded-full font-bold status-error">{t("reporting.log.badgeUnstarted")}</span>
                </div>
                <div className="w-[13px] shrink-0" />
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-card border border-border rounded-[20px] p-8 text-center">
            <p className="text-sm text-muted-foreground">
              {hasActiveFilters ? t("reporting.log.noMatchFilters") : t("reporting.log.noneRecorded")}
            </p>
          </div>
        )}
      </div>

      {selectedLog && <LogDetailModal log={selectedLog} onClose={() => setSelectedLog(null)} />}
      {showCsvUpgrade && (
        <UpgradePrompt feature="CSV export" onClose={() => setShowCsvUpgrade(false)} />
      )}
      {showReportingUpgrade && (
        <UpgradePrompt feature="Advanced reporting" onClose={() => setShowReportingUpgrade(false)} />
      )}
    </>
  );
}
