import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { endOfMonth, endOfWeek, endOfDay, isWithinInterval, startOfDay, startOfMonth, startOfWeek } from "date-fns";
import { Layout } from "@/components/Layout";
import { AlertCircle, TrendingUp, ChevronRight, ChevronLeft, Bell, ClipboardCheck, Clock, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useAlerts } from "@/hooks/useAlerts";
import { useChecklistLogs } from "@/hooks/useChecklistLogs";
import { useActions } from "@/hooks/useActions";
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

// ─── Shift Completion Gauge ───────────────────────────────────────────────────

function ShiftGauge({ completed, total, pct }: { completed: number; total: number; pct: number }) {
  const { t } = useTranslation("dashboard");
  const r = 50;
  const halfCirc = Math.PI * r;
  const dash = (pct / 100) * halfCirc;
  return (
    <div className="bg-card border border-border rounded-[24px] p-6 shadow-card">
      <p className="text-sm font-semibold text-foreground">{t("shiftCompletion.title")}</p>
      <div className="flex flex-col items-center mt-2">
        <svg viewBox="0 0 120 80" width={220} height={147}>
          <path d="M10,64 A50,50 0 0 1 110,64" fill="none" stroke="hsl(var(--muted))" strokeWidth={10} strokeLinecap="round" />
          <path
            d="M10,64 A50,50 0 0 1 110,64"
            fill="none"
            stroke="hsl(var(--powder-blue))"
            strokeWidth={10}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${halfCirc}`}
            style={{ transition: "stroke-dasharray 0.5s ease" }}
          />
          <text x="60" y="52" fontSize="20" fontWeight={800} fill="hsl(var(--foreground))" textAnchor="middle">{pct}%</text>
        </svg>
        <p className="text-sm text-muted-foreground mt-1">
          {t("shiftCompletion.subtitle", { completed, total })}
        </p>
        <div className="flex items-center gap-5 mt-3">
          <span className="flex items-center gap-1.5 text-xs text-foreground/80">
            <span className="w-2.5 h-2.5 rounded-full bg-[hsl(var(--status-ok))]" />
            {t("shiftCompletion.completed")} {completed}
          </span>
          <span className="flex items-center gap-1.5 text-xs text-foreground/80">
            <span className="w-2.5 h-2.5 rounded-full bg-[hsl(var(--muted-foreground))]" />
            {t("shiftCompletion.remaining")} {Math.max(total - completed, 0)}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Needs-Attention Banner ───────────────────────────────────────────────────

function AttentionBanner({ location, onReview }: { location: LocationCompliance; onReview: () => void }) {
  const { t } = useTranslation("dashboard");
  return (
    <button
      type="button"
      onClick={onReview}
      className="w-full text-left bg-gradient-to-br from-[hsl(var(--powder-blue-deep))] to-[hsl(173_55%_16%)] rounded-[20px] p-4 flex items-center gap-3 text-white transition-transform active:scale-[0.99]"
    >
      <div className="w-10 h-10 rounded-full bg-white/15 flex items-center justify-center shrink-0">
        <AlertCircle size={18} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold">{t("attention.title")}</p>
        <p className="text-xs opacity-85 mt-0.5 leading-snug">
          {t("attention.body", { name: location.name, score: location.avgScore, completed: location.completedCount, count: location.count })}
        </p>
        <span className="inline-flex items-center gap-1 text-xs font-semibold mt-2 bg-white text-[hsl(var(--powder-blue-deep))] rounded-full px-3 py-1">
          {t("attention.cta")} <ArrowRight size={12} />
        </span>
      </div>
    </button>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation("dashboard");
  const [complianceTab, setComplianceTab]          = useState<ComplianceTab>("today");
  const [page, setPage]                            = useState(0);

  const today    = new Date();
  const dateLabel = today.toLocaleDateString(i18n.language === "es" ? "es-ES" : "en-GB", { weekday: "long", day: "numeric", month: "long" });
  const greeting  = t("greeting");

  // ── Auth ──
  const { teamMember } = useAuth();
  const currentUser = teamMember?.name ?? "";

  // ── Data hooks ── the Dashboard is always the all-locations overview.
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

  // ── Shift completion (aggregate across today's compliance items) ──
  const totalAssignedToday = complianceItems.reduce((sum, loc) => sum + loc.count, 0);
  const totalCompletedToday = complianceItems.reduce((sum, loc) => sum + loc.completedCount, 0);
  const shiftCompletionPct = totalAssignedToday > 0 ? Math.round((totalCompletedToday / totalAssignedToday) * 100) : 0;

  // ── Needs-attention banner: the real worst-performing location today, if any ──
  const worstLocation = complianceItems.length > 0 ? complianceItems[0] : null;
  const showAttentionBanner = !!worstLocation && worstLocation.count > 0 && worstLocation.avgScore < 85;

  // ── Pagination applies to location cards ──
  const ITEMS_PER_PAGE = 4;

  // ── Overdue open actions ──
  const todayStart = new Date(today); todayStart.setHours(0, 0, 0, 0);
  const overdueActions = computeOverdueActions(actions, todayStart.getTime());
  const nowMinutes = today.getHours() * 60 + today.getMinutes();
  const todayCompletedIds = new Set(
    logs.filter((log) => log.created_at.startsWith(todayStr)).map((log) => log.checklist_id).filter(Boolean)
  );
  // Draft checklists aren't shown on kiosk, so they shouldn't count as "overdue" here either.
  const publishedChecklists = checklists.filter((checklist) => checklist.is_published);
  const missedChecklists = computeMissedChecklists(publishedChecklists, todayCompletedIds, nowMinutes);
  const overdueCount = overdueActions.length + missedChecklists.length;

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
            aria-label={t("notificationsAriaLabel")}
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
        <div className="rounded-[24px] bg-gradient-to-b from-[hsl(var(--powder-blue-light))] to-transparent p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-widest font-medium">{dateLabel}</p>
          <h1 id="dashboard-greeting" className="font-display text-3xl text-foreground mt-1 leading-tight">
            {greeting}
          </h1>

          {/* Quick stats strip */}
          <div className="grid grid-cols-3 gap-2 mt-4">
            <div
              role="button"
              tabIndex={0}
              onClick={() => navigate("/reporting")}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); navigate("/reporting"); } }}
              aria-label={t("stats.checklistsAriaLabel")}
              className="bg-card border border-border rounded-[18px] p-3 text-center shadow-card cursor-pointer hover:bg-muted/40 transition-colors active:scale-[0.98] focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <div className="w-7 h-7 rounded-[9px] bg-[hsl(var(--powder-blue-light))] flex items-center justify-center mx-auto mb-1.5">
                <ClipboardCheck size={14} className="text-[hsl(var(--powder-blue-deep))]" />
              </div>
              <p className="text-xl font-semibold text-[hsl(var(--powder-blue-deep))]">
                {logs.filter(l => l.created_at.slice(0, 10) === todayStr).length}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5 uppercase tracking-wide">{t("stats.checklists")}</p>
              <p className="text-[10px] text-muted-foreground/70 mt-0.5 leading-tight">{t("stats.checklistsCaption")}</p>
            </div>
            <div
              role="button"
              tabIndex={0}
              onClick={() => navigate("/notifications")}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); navigate("/notifications"); } }}
              aria-label={t("stats.alertsAriaLabel")}
              className="bg-card border border-border rounded-[18px] p-3 text-center shadow-card cursor-pointer hover:bg-muted/40 transition-colors active:scale-[0.98] focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <div className={cn("w-7 h-7 rounded-[9px] flex items-center justify-center mx-auto mb-1.5",
                allAlerts.length === 0 ? "bg-[hsl(var(--status-ok-bg))]" : "bg-[hsl(var(--status-error-bg))]"
              )}>
                <AlertCircle size={14} className={allAlerts.length === 0 ? "text-status-ok" : "text-status-error"} />
              </div>
              <p className={cn("text-xl font-semibold",
                allAlerts.length === 0 ? "text-status-ok" : "text-status-error"
              )}>
                {allAlerts.length}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5 uppercase tracking-wide">{t("stats.alerts")}</p>
              <p className="text-[10px] text-muted-foreground/70 mt-0.5 leading-tight">{t("stats.alertsCaption")}</p>
            </div>
            <div
              role="button"
              tabIndex={0}
              onClick={() => navigate("/reporting?status=unstarted")}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); navigate("/reporting?status=unstarted"); } }}
              aria-label={t("stats.overdueAriaLabel")}
              className="bg-card border border-border rounded-[18px] p-3 text-center shadow-card cursor-pointer hover:bg-muted/40 transition-colors active:scale-[0.98] focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <div className={cn("w-7 h-7 rounded-[9px] flex items-center justify-center mx-auto mb-1.5",
                overdueCount > 0 ? "bg-[hsl(var(--status-warn-bg))]" : "bg-muted"
              )}>
                <Clock size={14} className={overdueCount > 0 ? "text-status-warn" : "text-muted-foreground"} />
              </div>
              <p data-testid="stats-overdue" className={cn("text-xl font-semibold", overdueCount > 0 ? "text-status-warn" : "text-foreground")}>
                {overdueCount}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5 uppercase tracking-wide">{t("stats.overdue")}</p>
              <p className="text-[10px] text-muted-foreground/70 mt-0.5 leading-tight">{t("stats.overdueCaption")}</p>
            </div>
          </div>
        </div>
        </section>

        {/* ── Shift Completion ── */}
        {totalAssignedToday > 0 && (
          <section>
            <ShiftGauge completed={totalCompletedToday} total={totalAssignedToday} pct={shiftCompletionPct} />
          </section>
        )}

        {/* ── B. Daily Compliance ── */}
        <section>
          <div className="flex items-center justify-between mb-3 gap-2">
            <p className="section-label">{t("compliance.sectionLabel")}</p>
            <div className="flex items-center bg-muted rounded-full p-0.5 text-xs shrink-0">
              {(["today", "week", "month"] as ComplianceTab[]).map(tab => (
                <button key={tab}
                  data-testid={`compliance-tab-${tab}`}
                  onClick={() => { setComplianceTab(tab); setPage(0); }}
                  className={cn(
                    "relative px-2.5 py-1 rounded-full transition-colors capitalize whitespace-nowrap",
                    complianceTab === tab ? "bg-card text-foreground shadow-sm font-medium" : "text-muted-foreground"
                  )}
                >
                  {t(`compliance.tabs.${tab}`)}
                </button>
              ))}
            </div>
          </div>

          {locations.length === 0 ? (
            <div className="bg-card border border-border rounded-[20px] p-8 flex flex-col items-center gap-3 text-center">
              <div className="w-12 h-12 rounded-full bg-sage-light flex items-center justify-center">
                <TrendingUp size={20} className="text-sage" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">{t("compliance.noLocations.title")}</p>
                <p className="text-xs text-muted-foreground mt-1">{t("compliance.noLocations.body")}</p>
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
                      onClick={() => navigate(`/reporting?location=${encodeURIComponent(loc.locationId ?? "")}`)}
                      className="bg-card border border-border rounded-[20px] p-4 flex flex-col items-center gap-3 hover:bg-muted/30 transition-colors text-center active:scale-[0.98]"
                    >
                      <div className="relative" style={{ width: 72, height: 72 }}>
                        <ScoreRing score={loc.avgScore} size={72} />
                        <span className={cn("absolute inset-0 flex items-center justify-center text-sm font-semibold", healthClass)}>
                          {loc.avgScore}%
                        </span>
                      </div>
                      <div className="w-full">
                        <p className="text-xs font-semibold text-foreground leading-tight line-clamp-2">{loc.name}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {loc.count > 0
                            ? t("compliance.checklistsCompleted", { completed: loc.completedCount, count: loc.count })
                            : t("compliance.noChecklistsAssigned")}
                        </p>
                        <p className="text-xs text-sage mt-0.5 font-medium">{t("compliance.tapToReview")}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
              {totalPages > 1 && <PaginationDots page={page} totalPages={totalPages} setPage={setPage} />}
            </>
          )}
        </section>

        {/* ── C. Needs Attention ── */}
        {showAttentionBanner && worstLocation && (
          <section>
            <AttentionBanner
              location={worstLocation}
              onReview={() => navigate(`/reporting?location=${encodeURIComponent(worstLocation.locationId ?? "")}`)}
            />
          </section>
        )}

        {/* Bottom spacer */}
        <div className="h-4" />
      </Layout>
    </>
  );
}
