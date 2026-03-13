import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { AlertCircle, TrendingUp, Plus, X, ChevronRight, ChevronLeft, AlertTriangle, Bell } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useAlerts } from "@/hooks/useAlerts";
import { useChecklistLogs } from "@/hooks/useChecklistLogs";
import { useActions, useSaveAction } from "@/hooks/useActions";

// ─── Types ───────────────────────────────────────────────────────────────────

interface ChecklistCompliance {
  id: string;
  name: string;
  location: string;
  completion: number;
  totalTasks: number;
  completedTasks: number;
  unanswered: string[];
  completedAt?: string;
}

type ComplianceTab = "today" | "yesterday" | "overdue";


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

const ITEMS_PER_PAGE = 4;

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

// ─── Checklist Detail Modal ───────────────────────────────────────────────────

function ChecklistDetailModal({ item, onClose }: { item: ChecklistCompliance; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-foreground/20 backdrop-blur-sm">
      <div className="bg-card w-full max-w-lg rounded-t-2xl p-5 pb-10 space-y-4 animate-fade-in max-h-[80vh] overflow-auto">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display text-xl text-foreground">{item.name}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{item.location}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-muted transition-colors">
            <X size={18} className="text-muted-foreground" />
          </button>
        </div>

        <div className="flex items-center gap-4 p-4 bg-background rounded-xl border border-border">
          <div className="relative" style={{ width: 56, height: 56 }}>
            <ScoreRing score={item.completion} size={56} />
            <span className={cn("absolute inset-0 flex items-center justify-center text-xs font-bold",
              item.completion >= 85 ? "text-status-ok" : item.completion >= 65 ? "text-status-warn" : "text-status-error"
            )}>
              {item.completion}%
            </span>
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">{item.completedTasks} of {item.totalTasks} tasks</p>
            <p className="text-xs text-muted-foreground mt-0.5">{item.unanswered.length} unanswered</p>
          </div>
        </div>

        {item.unanswered.length > 0 ? (
          <div>
            <p className="section-label mb-2">Unanswered questions</p>
            <div className="card-surface divide-y divide-border overflow-hidden">
              {item.unanswered.map((q, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-status-error shrink-0" />
                  <p className="text-sm text-foreground">{q}</p>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="py-4 text-center text-sm text-status-ok font-semibold">✓ All tasks completed</div>
        )}
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
  const [selectedChecklist, setSelectedChecklist]  = useState<ChecklistCompliance | null>(null);

  const today    = new Date();
  const dateLabel = today.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
  const greeting  = today.getHours() < 12 ? "Good morning" : today.getHours() < 17 ? "Good afternoon" : "Good evening";

  // ── Auth ──
  const { teamMember } = useAuth();
  const currentUser = teamMember?.name ?? "";

  // ── Data hooks ──
  const { data: allAlerts = [] } = useAlerts();
  const { data: logs      = [] } = useChecklistLogs();
  const { data: actions   = [] } = useActions();

  // ── Date strings for filtering ──
  const todayStr     = today.toISOString().slice(0, 10);
  const yesterdayStr = new Date(today.getTime() - 86_400_000).toISOString().slice(0, 10);

  // ── Derive compliance items from logs ──
  const tabLogs = complianceTab !== "overdue"
    ? logs.filter(l => l.created_at.slice(0, 10) === (complianceTab === "today" ? todayStr : yesterdayStr))
    : [];

  const complianceItems: ChecklistCompliance[] = tabLogs.map(log => {
    const ans     = Array.isArray(log.answers) ? log.answers : [];
    const answered = ans.filter(a => a.value !== null && a.value !== "" && a.value !== undefined && a.value !== false);
    return {
      id:           log.id,
      name:         log.checklist_title,
      location:     log.completed_by,
      completion:   log.score ?? 0,
      totalTasks:   ans.length,
      completedTasks: answered.length,
      unanswered:   ans.filter(a => !a.value).map(a => String(a.question ?? a.questionId ?? "")),
      completedAt:  new Date(log.created_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),
    };
  }).sort((a, b) => a.completion - b.completion);

  // ── Overdue open actions ──
  const todayStart = new Date(today); todayStart.setHours(0, 0, 0, 0);
  const overdueActions = actions.filter(a =>
    a.status !== "resolved" && a.due && new Date(a.due).getTime() < todayStart.getTime()
  );
  const overdueCount = overdueActions.length;

  // ── Alerts ──
  const visibleAlerts = allAlerts.slice(0, 3);
  const hasMore = allAlerts.length > 3;

  // ── Pagination for compliance cards ──
  const totalPages = Math.ceil(complianceItems.length / ITEMS_PER_PAGE);
  const pagedItems = complianceItems.slice(page * ITEMS_PER_PAGE, (page + 1) * ITEMS_PER_PAGE);

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
        {allAlerts.length > 0 && (
          <section>
            <p className="section-label mb-3">Operational alerts</p>
            <div className="space-y-2">
              {visibleAlerts.map(alert => (
                <div key={alert.id}
                  className={cn(
                    "bg-card border border-border rounded-2xl px-4 py-3 flex items-start gap-3 border-l-4",
                    alert.type === "error" ? "border-l-status-error" : "border-l-status-warn"
                  )}
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
                </div>
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
          </section>
        )}

        {/* ── B. Daily Compliance ── */}
        <section>
          <div className="flex items-center justify-between mb-3 gap-2">
            <p className="section-label">Daily compliance</p>
            <div className="flex items-center bg-muted rounded-full p-0.5 text-xs shrink-0">
              {(["yesterday", "today", "overdue"] as ComplianceTab[]).map(tab => (
                <button key={tab}
                  onClick={() => { setComplianceTab(tab); setPage(0); }}
                  className={cn(
                    "relative px-2.5 py-1 rounded-full transition-colors capitalize whitespace-nowrap",
                    complianceTab === tab ? "bg-card text-foreground shadow-sm font-semibold" : "text-muted-foreground"
                  )}
                >
                  {tab}
                  {tab === "overdue" && overdueCount > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[16px] h-4 flex items-center justify-center rounded-full bg-status-error text-[10px] font-bold text-white px-1">
                      {overdueCount}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {complianceTab !== "overdue" ? (
            complianceItems.length === 0 ? (
              <div className="bg-card border border-border rounded-2xl p-8 flex flex-col items-center gap-3 text-center">
                <div className="w-12 h-12 rounded-full bg-sage-light flex items-center justify-center">
                  <TrendingUp size={20} className="text-sage" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">No submissions yet</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {complianceTab === "today" ? "No checklists completed today." : "No checklists completed yesterday."}
                  </p>
                </div>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  {pagedItems.map(item => (
                    <button key={item.id} onClick={() => setSelectedChecklist(item)}
                      className="bg-card border border-border rounded-2xl p-4 flex flex-col items-center gap-3 hover:bg-muted/30 transition-colors text-center active:scale-[0.98]"
                    >
                      <div className="relative" style={{ width: 72, height: 72 }}>
                        <ScoreRing score={item.completion} size={72} />
                        <span className={cn(
                          "absolute inset-0 flex items-center justify-center text-sm font-bold",
                          item.completion >= 85 ? "text-status-ok" : item.completion >= 65 ? "text-status-warn" : "text-status-error"
                        )}>
                          {item.completion}%
                        </span>
                      </div>
                      <div className="w-full">
                        <p className="text-xs font-semibold text-foreground leading-tight line-clamp-2">{item.name}</p>
                        <p className="text-[10px] text-muted-foreground mt-1">{item.location}</p>
                        <p className="text-[10px] text-muted-foreground">{item.completedTasks}/{item.totalTasks} tasks</p>
                        {item.completedAt && (
                          <p className="text-[10px] text-status-ok mt-0.5 font-medium">Done {item.completedAt}</p>
                        )}
                      </div>
                    </button>
                  ))}
                </div>

                {totalPages > 1 && (
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
                )}
              </>
            )
          ) : (
            overdueActions.length === 0 ? (
              <div className="bg-card border border-border rounded-2xl p-8 flex flex-col items-center gap-3 text-center">
                <div className="w-12 h-12 rounded-full bg-sage-light flex items-center justify-center">
                  <TrendingUp size={20} className="text-sage" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">All caught up</p>
                  <p className="text-xs text-muted-foreground mt-1">No overdue tasks right now.</p>
                </div>
              </div>
            ) : (
              <div className="bg-card border border-border rounded-2xl divide-y divide-border overflow-hidden">
                {overdueActions.map(task => (
                  <button key={task.id} onClick={() => navigate("/checklists")}
                    className="w-full flex items-start gap-3 px-4 py-4 text-left hover:bg-muted/30 transition-colors">
                    <div className="w-9 h-9 rounded-xl bg-status-error/10 flex items-center justify-center shrink-0 mt-0.5">
                      <AlertTriangle size={16} className="text-status-error" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground">{task.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {task.checklist_title ?? "—"}{task.assigned_to ? ` · ${task.assigned_to}` : ""}
                      </p>
                      {task.due && (
                        <p className="text-xs text-status-error mt-1 font-medium">Due {task.due}</p>
                      )}
                    </div>
                    <ChevronRight size={16} className="text-muted-foreground shrink-0 mt-2" />
                  </button>
                ))}
              </div>
            )
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
      {selectedChecklist && <ChecklistDetailModal item={selectedChecklist} onClose={() => setSelectedChecklist(null)} />}
    </>
  );
}
