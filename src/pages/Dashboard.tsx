import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { endOfMonth, endOfWeek, endOfDay, isWithinInterval, startOfDay, startOfMonth, startOfWeek } from "date-fns";
import { Layout } from "@/components/Layout";
import { AlertCircle, TrendingUp, Plus, X, ChevronRight, ChevronLeft, Bell } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useAlerts } from "@/hooks/useAlerts";
import { useChecklistLogs } from "@/hooks/useChecklistLogs";
import { useActions, useSaveAction } from "@/hooks/useActions";
import { useChecklists } from "@/hooks/useChecklists";
import { useLocations } from "@/hooks/useLocations";
import { computeMissedChecklists, computeOverdueActions } from "@/lib/overdue-utils";

// ─── Types ───────────────────────────────────────────────────────────────────

interface LocationCompliance {
  locationId: string | null;
  name: string;
  avgScore: number;
  count: number;
  completedCount: number;
}

type ComplianceTab = "today" | "week" | "month";

function checklistAppliesToLocation(
  checklist: { location_id: string | null; location_ids?: string[] | null },
  locationId: string,
) {
  const assignedIds = checklist.location_ids?.length
    ? checklist.location_ids
    : (checklist.location_id ? [checklist.location_id] : null);

  if (!assignedIds || assignedIds.length === 0) return true;
  return assignedIds.includes(locationId);
}


// ─── Sub-components ───────────────────────────────────────────────────────────

function ScoreRing({ score, size = 64 }: { score: number; size?: number }) {
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  const color =
    score >= 85 ? "hsl(var(--status-ok))" :
    score >= 65 ? "hsl(var(--status-warn))" :
    "hsl(var(--status-error))";
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="hsl(var(--border))" strokeWidth={4} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={4}
        strokeDasharray={`${dash} ${circ - dash}`} strokeLinecap="round"
        style={{ transition: "stroke-dasharray 0.5s ease" }}
      />
    </svg>
  );
}

// ─── Pagination Dots ─────────────────────────────────────────────────────────

function PaginationDots({ page, totalPages, setPage }: { page: number; totalPages: number; setPage: (p: number | ((p: number) => number)) => void }) {
  return (
    <div className="flex items-center justify-center gap-2 mt-3">
      <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
        className="p-1 rounded-full hover:bg-muted disabled:opacity-30 transition-colors">
        <ChevronLeft size={14} className="text-muted-foreground" />
      </button>
      {Array.from({ length: totalPages }).map((_, i) => (
        <button key={i} onClick={() => setPage(i)}
          className={cn("h-1.5 rounded-full transition-all",
            i === page ? "bg-sage w-4" : "bg-border w-1.5 hover:bg-muted-foreground"
          )}
        />
      ))}
      <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page === totalPages - 1}
        className="p-1 rounded-full hover:bg-muted disabled:opacity-30 transition-colors">
        <ChevronRight size={14} className="text-muted-foreground" />
      </button>
    </div>
  );
}

// ─── Quick Task Modal ─────────────────────────────────────────────────────────

function QuickTaskModal({ onClose }: { onClose: () => void }) {
  const [title, setTitle] = useState("");
  const [area, setArea]   = useState("");
  const [note, setNote]   = useState("");
  const saveAction = useSaveAction();

  function handleAdd() {
    if (!title.trim()) return;
    saveAction.mutate(
      { title: title.trim(), checklist_title: area.trim() || null, status: "open" },
      { onSuccess: onClose },
    );
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-foreground/20 backdrop-blur-sm">
      <div className="bg-card w-full max-w-lg rounded-t-2xl p-5 pb-10 space-y-4 animate-fade-in">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl text-foreground">Add quick task</h2>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-muted transition-colors">
            <X size={18} className="text-muted-foreground" />
          </button>
        </div>
        <input autoFocus type="text" placeholder="Task description" value={title}
          onChange={e => setTitle(e.target.value)}
          className="w-full border border-border rounded-xl px-4 py-3 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-sage/30"
        />
        <input type="text" placeholder="Area (e.g. Kitchen, Bar)" value={area}
          onChange={e => setArea(e.target.value)}
          className="w-full border border-border rounded-xl px-4 py-3 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-sage/30"
        />
        <textarea placeholder="Optional note" value={note} onChange={e => setNote(e.target.value)}
          rows={2} className="w-full border border-border rounded-xl px-4 py-3 text-sm bg-background resize-none focus:outline-none focus:ring-2 focus:ring-sage/30"
        />
        <button
          disabled={!title.trim() || saveAction.isPending}
          onClick={handleAdd}
          className={cn("w-full py-3 rounded-xl text-sm font-semibold tracking-wide transition-colors",
            title.trim() && !saveAction.isPending
              ? "bg-sage text-white hover:bg-sage-deep"
              : "bg-muted text-muted-foreground cursor-not-allowed"
          )}
        >
          {saveAction.isPending ? "SAVING…" : "ADD TASK"}
        </button>
      </div>
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const navigate = useNavigate();
  const [showQuickTask, setShowQuickTask]          = useState(false);
  const [complianceTab, setComplianceTab]          = useState<ComplianceTab>("today");
  const [page, setPage]                            = useState(0);

  const today    = new Date();
  const dateLabel = today.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
  const greeting  = today.getHours() < 12 ? "Good morning" : today.getHours() < 17 ? "Good afternoon" : "Good evening";

  // ── Auth ──
  const { teamMember } = useAuth();
  const currentUser = teamMember?.name ?? "";

  // ── Data hooks ──
  const { data: allAlerts = [] }    = useAlerts();
  const { data: logs      = [] }    = useChecklistLogs();
  const { data: actions   = [] }    = useActions();
  const { data: checklists = [] }   = useChecklists();
  const { data: locations = [] }    = useLocations();

  // ── Date helpers ──
  const pad = (n: number) => String(n).padStart(2, "0");
  const localDateStr = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const todayStr     = localDateStr(today);

  const periodRange = useMemo(() => {
    if (complianceTab === "today") {
      return { start: startOfDay(today), end: endOfDay(today) };
    }
    if (complianceTab === "week") {
      return {
        start: startOfWeek(today, { weekStartsOn: 1 }),
        end: endOfWeek(today, { weekStartsOn: 1 }),
      };
    }
    return {
      start: startOfMonth(today),
      end: endOfMonth(today),
    };
  }, [complianceTab, today]);

  const periodLogs = useMemo(() => logs.filter(log => {
    const createdAt = new Date(log.created_at);
    return isWithinInterval(createdAt, periodRange);
  }), [logs, periodRange]);

  const complianceItems = useMemo(() => {
    return locations.map((location): LocationCompliance => {
      const locationLogs = periodLogs
        .filter(log => log.location_id === location.id)
        .sort((a, b) => (a.created_at > b.created_at ? -1 : 1));

      const latestLogByChecklist = new Map<string, typeof locationLogs[0]>();
      for (const log of locationLogs) {
        const key = log.checklist_id ?? log.checklist_title;
        if (!latestLogByChecklist.has(key)) latestLogByChecklist.set(key, log);
      }

      const assignedChecklists = checklists.filter(checklist =>
        checklistAppliesToLocation(
          { location_id: checklist.location_id, location_ids: checklist.location_ids },
          location.id,
        )
      );

      const checklistScores = assignedChecklists.map(checklist => latestLogByChecklist.get(checklist.id)?.score ?? 0);
      const completedCount = assignedChecklists.filter(checklist => latestLogByChecklist.has(checklist.id)).length;
      const avgScore = assignedChecklists.length > 0
        ? Math.round(checklistScores.reduce((sum, score) => sum + score, 0) / assignedChecklists.length)
        : 0;

      return {
        locationId: location.id,
        name: location.name,
        avgScore,
        count: assignedChecklists.length,
        completedCount,
      };
    }).sort((a, b) => a.avgScore - b.avgScore || a.name.localeCompare(b.name));
  }, [locations, periodLogs, checklists]);

  // ── Pagination applies to location cards ──
  const ITEMS_PER_PAGE = 4;

  // ── Overdue open actions ──
  const todayStart = new Date(today); todayStart.setHours(0, 0, 0, 0);
  const overdueActions = computeOverdueActions(actions, todayStart.getTime());
  const nowMinutes = today.getHours() * 60 + today.getMinutes();
  const todayCompletedIds = new Set(
    logs.filter((log) => log.created_at.startsWith(todayStr)).map((log) => log.checklist_id).filter(Boolean)
  );
  const missedChecklists = computeMissedChecklists(checklists, todayCompletedIds, nowMinutes);
  const overdueCount = overdueActions.length + missedChecklists.length;

  // ── Alerts ──
  const visibleAlerts = allAlerts.slice(0, 3);
  const hasMore = allAlerts.length > 3;

  // ── Pagination: applies to location cards ──
  const paginationSource = complianceItems;
  const totalPages = Math.ceil(paginationSource.length / ITEMS_PER_PAGE);
  const pagedLocationItems = complianceItems.slice(page * ITEMS_PER_PAGE, (page + 1) * ITEMS_PER_PAGE) as LocationCompliance[];

  return (
    <>
      <Layout
        headerRight={
          <button
            id="notifications-btn"
            onClick={() => navigate("/notifications")}
            className="relative p-2 rounded-full hover:bg-muted transition-colors"
            aria-label="Notifications"
          >
            <Bell size={20} className="text-muted-foreground" />
            {allAlerts.length > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-status-error" />
            )}
          </button>
        }
      >
        {/* ── Greeting Hero ── */}
        <section className="pt-1 pb-2">
          <p className="text-xs text-muted-foreground uppercase tracking-widest font-medium">{dateLabel}</p>
          <h1 id="dashboard-greeting" className="font-display text-3xl text-foreground mt-1 leading-tight">
            {greeting}{currentUser ? `, ${currentUser}` : ""}
          </h1>

          {/* Quick stats strip */}
          <div className="grid grid-cols-3 gap-2 mt-4">
            <div className="bg-card border border-border rounded-2xl p-3 text-center">
              <p className="text-xl font-bold text-foreground">
                {logs.filter(l => l.created_at.slice(0, 10) === todayStr).length}
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5 uppercase tracking-wide">Checklists</p>
            </div>
            <div className="bg-card border border-border rounded-2xl p-3 text-center">
              <p className={cn("text-xl font-bold",
                allAlerts.length === 0 ? "text-status-ok" : "text-status-error"
              )}>
                {allAlerts.length}
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5 uppercase tracking-wide">Alerts</p>
            </div>
            <div className="bg-card border border-border rounded-2xl p-3 text-center">
              <p className={cn("text-xl font-bold", overdueCount > 0 ? "text-status-warn" : "text-foreground")}>
                {overdueCount}
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5 uppercase tracking-wide">Overdue</p>
            </div>
          </div>
        </section>

        {/* ── A. Operational Alerts ── */}
        <section>
          <p className="section-label mb-3">Operational alerts</p>
          {allAlerts.length === 0 ? (
            <div className="bg-card border border-border rounded-2xl p-6 text-center">
              <Bell size={20} className="mx-auto text-sage" aria-hidden="true" />
              <p className="text-sm font-medium text-foreground">All clear</p>
              <p className="text-xs text-muted-foreground mt-1">It looks like everything is calm now.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {visibleAlerts.map(alert => (
                <button
                  key={alert.id}
                  type="button"
                  onClick={() => navigate("/notifications")}
                  className={cn(
                    "w-full bg-card border border-border rounded-2xl px-4 py-3 flex items-start gap-3 border-l-4 text-left transition-colors hover:bg-muted/40 focus:outline-none focus:ring-1 focus:ring-ring",
                    alert.type === "error" ? "border-l-status-error" : "border-l-status-warn"
                  )}
                  aria-label={`Open alerts and review ${alert.message}`}
                >
                  <AlertCircle size={15}
                    className={cn("mt-0.5 shrink-0", alert.type === "error" ? "text-status-error" : "text-status-warn")}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground leading-snug">{alert.message}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-muted-foreground">{alert.area}</span>
                      {alert.time && (
                        <><span className="text-muted-foreground/40">·</span>
                        <span className="text-xs text-muted-foreground">{alert.time}</span></>
                      )}
                    </div>
                  </div>
                </button>
              ))}

              {hasMore && (
                <button
                  onClick={() => navigate("/notifications")}
                  className="w-full flex items-center justify-center gap-1.5 py-2.5 text-xs text-sage font-semibold rounded-2xl border border-border bg-card hover:bg-muted transition-colors"
                >
                  See all {allAlerts.length} alerts
                  <ChevronRight size={12} />
                </button>
              )}
            </div>
          )}
        </section>

        {/* ── B. Daily Compliance ── */}
        <section>
          <div className="flex items-center justify-between mb-3 gap-2">
            <p className="section-label">Daily compliance</p>
            <div className="flex items-center bg-muted rounded-full p-0.5 text-xs shrink-0">
              {(["today", "week", "month"] as ComplianceTab[]).map(tab => (
                <button key={tab}
                  data-testid={`compliance-tab-${tab}`}
                  onClick={() => { setComplianceTab(tab); setPage(0); }}
                  className={cn(
                    "relative px-2.5 py-1 rounded-full transition-colors capitalize whitespace-nowrap",
                    complianceTab === tab ? "bg-card text-foreground shadow-sm font-semibold" : "text-muted-foreground"
                  )}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>

          {locations.length === 0 ? (
            <div className="bg-card border border-border rounded-2xl p-8 flex flex-col items-center gap-3 text-center">
              <div className="w-12 h-12 rounded-full bg-sage-light flex items-center justify-center">
                <TrendingUp size={20} className="text-sage" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">No locations yet</p>
                <p className="text-xs text-muted-foreground mt-1">Add a location to see health scores here.</p>
              </div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                {pagedLocationItems.map(loc => {
                  const healthClass =
                    loc.avgScore >= 85 ? "text-status-ok" :
                    loc.avgScore >= 65 ? "text-status-warn" :
                    "text-status-error";

                  return (
                    <button
                      key={loc.locationId ?? loc.name}
                      data-testid="location-card"
                      onClick={() => navigate(`/checklists?tab=reporting&location=${encodeURIComponent(loc.locationId ?? "")}`)}
                      className="bg-card border border-border rounded-2xl p-4 flex flex-col items-center gap-3 hover:bg-muted/30 transition-colors text-center active:scale-[0.98]"
                    >
                      <div className="relative" style={{ width: 72, height: 72 }}>
                        <ScoreRing score={loc.avgScore} size={72} />
                        <span className={cn("absolute inset-0 flex items-center justify-center text-sm font-bold", healthClass)}>
                          {loc.avgScore}%
                        </span>
                      </div>
                      <div className="w-full">
                        <p className="text-xs font-semibold text-foreground leading-tight line-clamp-2">{loc.name}</p>
                        <p className="text-[10px] text-muted-foreground mt-1">
                          {loc.count > 0
                            ? `${loc.completedCount}/${loc.count} checklists completed`
                            : "No checklists assigned"}
                        </p>
                        <p className="text-[10px] text-sage mt-0.5 font-medium">Tap to review reporting →</p>
                      </div>
                    </button>
                  );
                })}
              </div>
              {totalPages > 1 && <PaginationDots page={page} totalPages={totalPages} setPage={setPage} />}
            </>
          )}
        </section>

        {/* Bottom spacer */}
        <div className="h-4" />
      </Layout>

      {/* FAB — add quick task */}
      <button onClick={() => setShowQuickTask(true)}
        className="fixed bottom-20 right-4 z-40 w-14 h-14 rounded-full bg-sage text-white shadow-lg flex items-center justify-center hover:bg-sage-deep transition-colors active:scale-95"
        aria-label="Add quick task"
      >
        <Plus size={24} />
      </button>

      {showQuickTask  && <QuickTaskModal onClose={() => setShowQuickTask(false)} />}
    </>
  );
}
