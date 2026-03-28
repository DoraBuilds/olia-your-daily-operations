import { useState, useMemo, useEffect } from "react";
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from "date-fns";
import type { DateRange } from "react-day-picker";
import { CalendarIcon, ChevronRight, FileText, Download, TrendingUp, TrendingDown, Minus, ChevronDown, Search, User, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useChecklistLogs } from "@/hooks/useChecklistLogs";
import { useActions } from "@/hooks/useActions";
import { useLocations } from "@/hooks/useLocations";
import { usePlan } from "@/hooks/usePlan";
import { UpgradePrompt } from "@/components/UpgradePrompt";
import { exportReportingPdf, exportReportingCsv } from "@/lib/export-utils";
import type { LogEntry } from "./types";
import { LogDetailModal } from "./LogDetailModal";

type Period = "today" | "week" | "month" | "custom";

function scoreBadge(score: number | null) {
  if (score == null) return { label: "UNFINISHED", cls: "status-warn" };
  if (score >= 85) return { label: "PASS", cls: "status-ok" };
  if (score >= 65) return { label: "REVIEW", cls: "status-warn" };
  return { label: "ACTION REQ.", cls: "status-error" };
}

function ScoreTrendChart({ data }: { data: { date: string; avg: number }[] }) {
  const width = 640;
  const height = 140;
  const paddingX = 28;
  const paddingTop = 14;
  const paddingBottom = 26;
  const chartHeight = height - paddingTop - paddingBottom;
  const stepX = data.length > 1 ? (width - paddingX * 2) / (data.length - 1) : 0;
  const getX = (index: number) => paddingX + index * stepX;
  const getY = (value: number) => paddingTop + ((100 - value) / 100) * chartHeight;
  const points = data.map((point, index) => `${getX(index)},${getY(point.avg)}`).join(" ");

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-[140px] w-full min-w-[320px]" role="img" aria-label="Score trend chart">
        {[65, 85].map((threshold) => (
          <line
            key={threshold}
            x1={paddingX}
            x2={width - paddingX}
            y1={getY(threshold)}
            y2={getY(threshold)}
            stroke={`hsl(var(${threshold === 85 ? "--status-ok" : "--status-warn"}))`}
            strokeDasharray="4 4"
            strokeOpacity="0.5"
          />
        ))}
        {[0, 50, 100].map((value) => (
          <text
            key={value}
            x={4}
            y={getY(value) + 4}
            className="fill-muted-foreground text-[10px]"
          >
            {value}
          </text>
        ))}
        <polyline
          fill="none"
          stroke="hsl(var(--sage))"
          strokeWidth="3"
          strokeLinejoin="round"
          strokeLinecap="round"
          points={points}
        />
        {data.map((point, index) => (
          <g key={`${point.date}-${index}`}>
            <circle cx={getX(index)} cy={getY(point.avg)} r="4" fill="hsl(var(--sage))" />
            <text x={getX(index)} y={height - 6} textAnchor="middle" className="fill-muted-foreground text-[10px]">
              {point.date}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

export function ReportingTab({ initialLocationId }: { initialLocationId?: string }) {
  const { can } = usePlan();
  const [period, setPeriod] = useState<Period>("today");
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [calOpen, setCalOpen] = useState(false);
  const [selectedLog, setSelectedLog] = useState<LogEntry | null>(null);
  const [showCsvUpgrade, setShowCsvUpgrade] = useState(false);
  // Location filter — "all" means no filter; any UUID string = filter to that location
  const [locationFilter, setLocationFilter] = useState<string>(initialLocationId ?? "all");
  const [personFilter, setPersonFilter] = useState<string>("all");
  const [checklistSearch, setChecklistSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "completed" | "unfinished">("all");

  useEffect(() => {
    setLocationFilter(initialLocationId ?? "all");
  }, [initialLocationId]);

  const { data: locations = [] } = useLocations();
  const locationNameById = useMemo(
    () => new Map(locations.map(location => [location.id, location.name])),
    [locations]
  );

  // Build date + location filters
  const filters = useMemo(() => {
    const today = new Date();
    const loc = locationFilter !== "all" ? { location_id: locationFilter } : {};
    if (period === "today") {
      return { from: format(startOfDay(today), "yyyy-MM-dd'T'HH:mm:ss"), to: format(endOfDay(today), "yyyy-MM-dd'T'HH:mm:ss"), ...loc };
    }
    if (period === "week") {
      return { from: format(startOfWeek(today, { weekStartsOn: 1 }), "yyyy-MM-dd'T'HH:mm:ss"), to: format(endOfWeek(today, { weekStartsOn: 1 }), "yyyy-MM-dd'T'HH:mm:ss"), ...loc };
    }
    if (period === "month") {
      return { from: format(startOfMonth(today), "yyyy-MM-dd'T'HH:mm:ss"), to: format(endOfMonth(today), "yyyy-MM-dd'T'HH:mm:ss"), ...loc };
    }
    if (dateRange?.from) {
      return {
        from: format(startOfDay(dateRange.from), "yyyy-MM-dd'T'HH:mm:ss"),
        to: dateRange.to ? format(endOfDay(dateRange.to), "yyyy-MM-dd'T'HH:mm:ss") : undefined,
        location_id: locationFilter !== "all" ? locationFilter : undefined,
      };
    }
    return { location_id: locationFilter !== "all" ? locationFilter : undefined };
  }, [period, dateRange, locationFilter]);

  const { data: logs = [], isLoading } = useChecklistLogs(filters);
  const { data: actions = [] } = useActions();
  const logById = useMemo(() => new Map(logs.map(log => [log.id, log])), [logs]);
  const peopleOptions = useMemo(
    () => Array.from(new Set(logs.map(log => log.completed_by).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [logs]
  );
  const checklistOptions = useMemo(
    () => Array.from(new Set(logs.map(log => log.checklist_title).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [logs]
  );

  const filteredChecklistLogs = useMemo(() => {
    const checklistQuery = checklistSearch.trim().toLowerCase();
    return logs.filter(log => {
      if (personFilter !== "all" && log.completed_by !== personFilter) return false;
      if (statusFilter === "completed" && log.score == null) return false;
      if (statusFilter === "unfinished" && log.score != null) return false;
      if (checklistQuery && !log.checklist_title.toLowerCase().startsWith(checklistQuery)) return false;
      return true;
    });
  }, [logs, personFilter, checklistSearch, statusFilter]);

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

  const hasActiveFilters = personFilter !== "all" || statusFilter !== "all" || checklistSearch.trim().length > 0;

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
    period === "today" ? "Today" :
    period === "week" ? "This Week" :
    period === "month" ? "This Month" :
    dateRange?.from && dateRange?.to
      ? `${format(dateRange.from, "d MMM")} – ${format(dateRange.to, "d MMM yyyy")}`
      : dateRange?.from ? `From ${format(dateRange.from, "d MMM yyyy")}`
      : "Custom range";

  const pickerLabel =
    dateRange?.from && dateRange?.to
      ? `${format(dateRange.from, "d MMM")} – ${format(dateRange.to, "d MMM")}`
      : dateRange?.from ? format(dateRange.from, "d MMM yyyy")
      : "Custom";

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
      {/* ── Top toolbar: period tabs + location filter + export ── */}
      <div className="space-y-2">
      {/* Period tabs */}
      <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-hide">
        {([
          { key: "today" as Period, label: "Today" },
          { key: "week" as Period, label: "This Week" },
          { key: "month" as Period, label: "This Month" },
        ]).map(({ key, label }) => (
          <button key={key}
            onClick={() => { setPeriod(key); setDateRange(undefined); setCalOpen(false); }}
            className={cn(
              "shrink-0 text-xs px-4 py-2 rounded-full border font-semibold transition-colors",
              period === key
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
                period === "custom" && dateRange?.from
                  ? "bg-sage text-white border-sage"
                  : "border-border text-muted-foreground hover:border-sage/40"
              )}
              onClick={() => setPeriod("custom")}
            >
              <CalendarIcon size={12} />
              {period === "custom" && dateRange?.from ? pickerLabel : "Custom"}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0 z-[60]" align="start">
            <CalendarPicker
              mode="range"
              selected={dateRange}
              onSelect={r => {
                setDateRange(r);
                if (r?.from) setPeriod("custom");
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

      {/* Location filter + export — same row */}
      <div className="flex items-center gap-2">
        {/* Location dropdown */}
        <div className="relative flex-1 min-w-0">
          <select
            data-testid="location-filter"
            value={locationFilter}
            onChange={e => setLocationFilter(e.target.value)}
            className="w-full text-xs bg-card border border-border rounded-full px-3 py-2 pr-7 text-foreground font-medium appearance-none cursor-pointer focus:outline-none focus:ring-1 focus:ring-sage/40"
          >
            <option value="all">All locations</option>
            {locations.map(l => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
          <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        </div>
        {/* Export buttons */}
        <button
          data-testid="export-csv"
          onClick={() => can("exportCsv") ? handleExportCsv() : setShowCsvUpgrade(true)}
          disabled={!logEntries.length}
          className="shrink-0 flex items-center gap-1 text-xs font-semibold text-muted-foreground px-3 py-2 rounded-full border border-border hover:border-sage/40 transition-colors disabled:opacity-40"
        >
          <Download size={12} /> CSV
        </button>
        <button
          data-testid="export-pdf"
          onClick={handleExportPdf}
          disabled={!logEntries.length}
          className="shrink-0 flex items-center gap-1 text-xs font-semibold text-sage px-3 py-2 rounded-full border border-sage/40 hover:bg-sage-light transition-colors disabled:opacity-40"
        >
          <FileText size={12} /> PDF
        </button>
      </div>
      </div>{/* end top toolbar */}

      {/* Stat cards */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-card border border-border rounded-2xl p-4 text-center">
          <p className="section-label mb-1">Entries</p>
          <p className="text-2xl font-bold text-foreground">{isLoading ? "—" : logEntries.length}</p>
          {!isLoading && logEntries.length === 0 && (
            <div className="flex items-center justify-center gap-0.5 mt-1">
              <Minus size={10} className="text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground font-medium">none</span>
            </div>
          )}
        </div>
        <div className="bg-card border border-border rounded-2xl p-4 text-center">
          <p className="section-label mb-1">Avg Score</p>
          <p className={cn("text-2xl font-bold",
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
                ? <><TrendingUp size={10} className="text-status-ok" /><span className="text-[10px] text-status-ok font-medium">Good</span></>
                : avgScoreValue >= 65
                ? <><Minus size={10} className="text-status-warn" /><span className="text-[10px] text-status-warn font-medium">Review</span></>
                : <><TrendingDown size={10} className="text-status-error" /><span className="text-[10px] text-status-error font-medium">Action needed</span></>
              }
            </div>
          )}
        </div>
        <div className="bg-card border border-border rounded-2xl p-4 text-center">
          <p className="section-label mb-1">Open Actions</p>
          <p className={cn("text-2xl font-bold", openActionsCount > 0 ? "text-status-error" : "text-status-ok")}>
            {openActionsCount}
          </p>
          {openActionsCount === 0 && (
            <div className="flex items-center justify-center gap-0.5 mt-1">
              <Minus size={10} className="text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground font-medium">none</span>
            </div>
          )}
        </div>
      </div>

      {/* Filter panel */}
      <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <p className="section-label">Filters</p>
          {hasActiveFilters && (
            <button
              data-testid="reporting-clear-filters"
              type="button"
              onClick={() => {
                setPersonFilter("all");
                setChecklistSearch("");
                setStatusFilter("all");
              }}
              className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
            >
              <X size={12} />
              Clear filters
            </button>
          )}
        </div>
        <div className="grid gap-2 md:grid-cols-3">
          <label className="space-y-1">
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Checklist name</span>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                data-testid="reporting-checklist-search"
                type="text"
                value={checklistSearch}
                onChange={e => setChecklistSearch(e.target.value)}
                placeholder="Type a checklist name"
                className="w-full rounded-xl border border-border bg-background py-2.5 pl-9 pr-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                list="reporting-checklist-options"
              />
            </div>
            <datalist id="reporting-checklist-options">
              {checklistOptions.map(name => <option key={name} value={name} />)}
            </datalist>
          </label>

          <label className="space-y-1">
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Person</span>
            <div className="relative">
              <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <select
                data-testid="reporting-person-filter"
                value={personFilter}
                onChange={e => setPersonFilter(e.target.value)}
                className="w-full appearance-none rounded-xl border border-border bg-background py-2.5 pl-9 pr-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="all">All people</option>
                {peopleOptions.map(name => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </div>
          </label>

          <label className="space-y-1">
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Status</span>
            <select
              data-testid="reporting-status-filter"
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as typeof statusFilter)}
              className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="all">All statuses</option>
              <option value="completed">Completed</option>
              <option value="unfinished">Unfinished</option>
            </select>
          </label>
        </div>
        <p className="text-xs text-muted-foreground">
          Showing {logEntries.length} of {logs.length} log{logs.length === 1 ? "" : "s"}.
        </p>
      </div>

      {/* Score Trend — Line chart (no fill) */}
      {trendData.length > 0 && (
        <div className="bg-card border border-border rounded-2xl p-4">
          <p className="section-label mb-4">Score Trend</p>
          <ScoreTrendChart data={trendData} />
        </div>
      )}

      {/* Completion Log — table-style with PASS/REVIEW/ACTION REQ. */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="section-label">
            Completion Log
            <span className="text-muted-foreground font-normal ml-1">— {periodLabel}</span>
          </p>
        </div>

        {isLoading ? (
          <div className="bg-card border border-border rounded-2xl p-6 text-center">
            <p className="text-sm text-muted-foreground">Loading…</p>
          </div>
        ) : logEntries.length > 0 ? (
          <div className="bg-card border border-border rounded-2xl divide-y divide-border overflow-hidden">
            {/* Table header */}
            <div className="flex items-center gap-3 px-4 py-2 bg-muted/40">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex-1">Checklist</p>
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground w-20 text-right">Status</p>
              <div className="w-4" />
            </div>
            {logEntries.map(log => {
              const badge = scoreBadge(log.score);
              return (
                <button key={log.id} onClick={() => setSelectedLog(log)}
                  className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-muted/30 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{log.checklist}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{log.completedBy} · {log.date}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-bold tracking-wide", badge.cls)}>
                      {badge.label}
                    </span>
                    <ChevronRight size={13} className="text-muted-foreground" />
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="bg-card border border-border rounded-2xl p-8 text-center">
            <p className="text-sm text-muted-foreground">
              {hasActiveFilters ? "No logs match your filters." : "No logs recorded for this period."}
            </p>
          </div>
        )}
      </div>

      {selectedLog && <LogDetailModal log={selectedLog} onClose={() => setSelectedLog(null)} />}
      {showCsvUpgrade && (
        <UpgradePrompt feature="CSV export" onClose={() => setShowCsvUpgrade(false)} />
      )}
    </>
  );
}
