import { useState, useMemo } from "react";
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from "date-fns";
import type { DateRange } from "react-day-picker";
import { CalendarIcon, ChevronRight, FileText, Download, TrendingUp, TrendingDown, Minus, ChevronDown } from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";
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

const TOOLTIP_STYLE = {
  fontSize: 12,
  borderRadius: 12,
  border: "1px solid hsl(var(--border))",
  background: "hsl(var(--card))",
  color: "hsl(var(--foreground))",
  boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
};

type Period = "today" | "week" | "month" | "custom";

function scoreBadge(score: number) {
  if (score >= 85) return { label: "PASS", cls: "status-ok" };
  if (score >= 65) return { label: "REVIEW", cls: "status-warn" };
  return { label: "ACTION REQ.", cls: "status-error" };
}

export function ReportingTab() {
  const { can } = usePlan();
  const [period, setPeriod] = useState<Period>("today");
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [calOpen, setCalOpen] = useState(false);
  const [selectedLog, setSelectedLog] = useState<LogEntry | null>(null);
  const [showCsvUpgrade, setShowCsvUpgrade] = useState(false);
  // Location filter — "all" means no filter; any UUID string = filter to that location
  const [locationFilter, setLocationFilter] = useState<string>("all");

  const { data: locations = [] } = useLocations();

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

  const openActionsCount = useMemo(() => actions.filter(a => a.status === "open").length, [actions]);

  const avgScore = useMemo(() => {
    const scored = logs.filter(l => l.score !== null);
    if (!scored.length) return 0;
    return Math.round(scored.reduce((sum, l) => sum + (l.score ?? 0), 0) / scored.length);
  }, [logs]);

  // Score trend: group by date, avg per day
  const trendData = useMemo(() => {
    const byDate: Record<string, number[]> = {};
    [...logs].reverse().forEach(log => {
      const d = format(new Date(log.created_at), "d MMM");
      if (!byDate[d]) byDate[d] = [];
      if (log.score !== null) byDate[d].push(log.score);
    });
    return Object.entries(byDate).map(([date, scores]) => ({
      date,
      avg: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
    }));
  }, [logs]);

  // By checklist: sorted desc
  const completionData = useMemo(() => {
    const counts: Record<string, number> = {};
    logs.forEach(l => { counts[l.checklist_title] = (counts[l.checklist_title] || 0) + 1; });
    const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const max = entries[0]?.[1] ?? 1;
    return entries.map(([checklist, count]) => ({ checklist, count, pct: Math.round((count / max) * 100) }));
  }, [logs]);

  // Log entries
  const logEntries: LogEntry[] = useMemo(
    () => logs.map(l => ({
      id: l.id,
      checklist: l.checklist_title,
      completedBy: l.completed_by,
      date: format(new Date(l.created_at), "d MMM, HH:mm"),
      score: l.score ?? 0,
      type: (l.type as LogEntry["type"]) ?? "opening",
      answers: l.answers ?? [],
      startedAt:  l.started_at  ?? undefined,   // null → undefined so PDF omits it
      finishedAt: l.created_at,                 // always available
    })),
    [logs]
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

  const handleExportPdf = async () => {
    await exportReportingPdf(
      logEntries.map(l => ({ checklist: l.checklist, completedBy: l.completedBy, date: l.date, score: l.score })),
      periodLabel,
      { completed: logs.length, avg: avgScore, open: openActionsCount }
    );
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
          onClick={() => can("exportCsv") ? handleExportCsv() : setShowCsvUpgrade(true)}
          disabled={!logEntries.length}
          className="shrink-0 flex items-center gap-1 text-xs font-semibold text-muted-foreground px-3 py-2 rounded-full border border-border hover:border-sage/40 transition-colors disabled:opacity-40"
        >
          <Download size={12} /> CSV
        </button>
        <button
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
          <p className="section-label mb-1">Completed</p>
          <p className="text-2xl font-bold text-foreground">{isLoading ? "—" : logs.length}</p>
          {!isLoading && logs.length === 0 && (
            <div className="flex items-center justify-center gap-0.5 mt-1">
              <Minus size={10} className="text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground font-medium">none</span>
            </div>
          )}
        </div>
        <div className="bg-card border border-border rounded-2xl p-4 text-center">
          <p className="section-label mb-1">Avg Score</p>
          <p className={cn("text-2xl font-bold",
            !logs.length ? "text-muted-foreground" :
            avgScore >= 85 ? "text-status-ok" :
            avgScore >= 65 ? "text-status-warn" :
            "text-status-error"
          )}>
            {isLoading ? "—" : logs.length ? `${avgScore}%` : "—"}
          </p>
          {!isLoading && logs.length > 0 && (
            <div className="flex items-center justify-center gap-0.5 mt-1">
              {avgScore >= 85
                ? <><TrendingUp size={10} className="text-status-ok" /><span className="text-[10px] text-status-ok font-medium">Good</span></>
                : avgScore >= 65
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

      {/* Score Trend — Line chart (no fill) */}
      {trendData.length > 0 && (
        <div className="bg-card border border-border rounded-2xl p-4">
          <p className="section-label mb-4">Score Trend</p>
          <ResponsiveContainer width="100%" height={140}>
            <LineChart data={trendData} margin={{ top: 4, right: 8, bottom: 0, left: -24 }}>
              <CartesianGrid strokeDasharray="4 4" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="date"
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                axisLine={false} tickLine={false}
              />
              <YAxis domain={[0, 100]}
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                axisLine={false} tickLine={false}
              />
              <ReferenceLine y={85} stroke="hsl(var(--status-ok))" strokeDasharray="4 2" strokeOpacity={0.5} />
              <ReferenceLine y={65} stroke="hsl(var(--status-warn))" strokeDasharray="4 2" strokeOpacity={0.5} />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: any) => [`${v}%`, "Avg. score"]} />
              <Line
                type="monotone" dataKey="avg"
                stroke="hsl(var(--sage))" strokeWidth={2.5}
                dot={{ r: 3.5, fill: "hsl(var(--sage))", strokeWidth: 0 }}
                activeDot={{ r: 5, strokeWidth: 2, stroke: "hsl(var(--card))" }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* By Checklist — CSS horizontal bars (no recharts) */}
      {completionData.length > 0 && (
        <div className="bg-card border border-border rounded-2xl p-4">
          <p className="section-label mb-4">By Checklist</p>
          <div className="space-y-3">
            {completionData.map(({ checklist, count, pct }) => (
              <div key={checklist}>
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-xs font-medium text-foreground truncate max-w-[70%]">{checklist}</p>
                  <span className="text-xs text-muted-foreground font-medium shrink-0 ml-2">{count}</span>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-sage rounded-full transition-all duration-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
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
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground w-20 text-right">Score</p>
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
            <p className="text-sm text-muted-foreground">No logs recorded for this period.</p>
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
