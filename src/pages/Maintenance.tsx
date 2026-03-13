import { useState } from "react";
import { Layout } from "@/components/Layout";
import { Plus, X, List, CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  addDays, addWeeks, addMonths, subWeeks, subMonths,
  isSameMonth, isSameDay, parseISO
} from "date-fns";

// ─── Types ───────────────────────────────────────────────────────────────────

type Recurrence = "daily" | "weekly" | "monthly" | "quarterly" | "annual";
type Status = "scheduled" | "overdue" | "completed";

interface MaintenanceTask {
  id: string;
  title: string;
  equipment: string;
  recurrence: Recurrence;
  nextDue: string; // ISO date string "YYYY-MM-DD"
  assignedTo: string;
  status: Status;
}

// ─── Mock Data ────────────────────────────────────────────────────────────────

const TODAY = new Date();
const fmt = (d: Date) => format(d, "yyyy-MM-dd");

const tasks: MaintenanceTask[] = [
  { id: "m1",  title: "Coffee machine back-flush",    equipment: "Espresso machine",  recurrence: "daily",     nextDue: fmt(TODAY),                      assignedTo: "Staff",   status: "scheduled" },
  { id: "m2",  title: "Grease trap inspection",       equipment: "Kitchen drainage",   recurrence: "weekly",    nextDue: fmt(addDays(TODAY, 1)),           assignedTo: "Manager", status: "scheduled" },
  { id: "m3",  title: "Extractor fan filter clean",   equipment: "Extraction system",  recurrence: "weekly",    nextDue: fmt(addDays(TODAY, 2)),           assignedTo: "Staff",   status: "scheduled" },
  { id: "m4",  title: "Coffee machine deep clean",    equipment: "Espresso machine",   recurrence: "weekly",    nextDue: fmt(addDays(TODAY, 4)),           assignedTo: "Staff",   status: "scheduled" },
  { id: "m5",  title: "Dishwasher descale",           equipment: "Dishwasher",         recurrence: "weekly",    nextDue: fmt(addDays(TODAY, -1)),          assignedTo: "Staff",   status: "overdue" },
  { id: "m6",  title: "Refrigeration coil check",    equipment: "Walk-in fridge",     recurrence: "monthly",   nextDue: fmt(addDays(startOfMonth(addMonths(TODAY, 1)), 0)), assignedTo: "Manager", status: "scheduled" },
  { id: "m7",  title: "Oven calibration check",      equipment: "Combi oven",         recurrence: "monthly",   nextDue: fmt(addDays(TODAY, -3)),          assignedTo: "Manager", status: "overdue" },
  { id: "m8",  title: "Fire extinguisher inspection", equipment: "Safety equipment",   recurrence: "quarterly", nextDue: fmt(addDays(TODAY, 40)),          assignedTo: "Owner",   status: "scheduled" },
  { id: "m9",  title: "Boiler service",               equipment: "Heating system",     recurrence: "annual",    nextDue: fmt(addDays(TODAY, 120)),         assignedTo: "Owner",   status: "scheduled" },
];

const DAYS_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const statusStyle: Record<Status, string> = {
  scheduled: "status-ok",
  overdue:   "status-error",
  completed: "bg-muted text-muted-foreground",
};
const statusLabel: Record<Status, string> = {
  scheduled: "Scheduled",
  overdue:   "Overdue",
  completed: "Done",
};
const recurrenceLabel: Record<Recurrence, string> = {
  daily: "Daily", weekly: "Weekly", monthly: "Monthly", quarterly: "Quarterly", annual: "Annual",
};

// ─── New Task Modal ───────────────────────────────────────────────────────────

function NewTaskModal({ onClose, onAdd }: {
  onClose: () => void;
  onAdd: (t: MaintenanceTask) => void;
}) {
  const [title, setTitle]     = useState("");
  const [equipment, setEquip] = useState("");
  const [recurrence, setRec]  = useState<Recurrence>("weekly");
  const [assignedTo, setRole] = useState("Staff");

  const handleCreate = () => {
    if (!title.trim()) return;
    onAdd({
      id: `m-${Date.now()}`,
      title: title.trim(),
      equipment: equipment.trim() || "General",
      recurrence,
      nextDue: fmt(addDays(TODAY, recurrence === "daily" ? 1 : recurrence === "weekly" ? 7 : 30)),
      assignedTo,
      status: "scheduled",
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/20 backdrop-blur-sm animate-fade-in">
      <div className="bg-card w-full max-w-lg rounded-t-2xl p-5 pb-8 space-y-4 animate-fade-in">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg text-foreground">New maintenance task</h2>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-muted transition-colors">
            <X size={18} className="text-muted-foreground" />
          </button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Task</label>
            <input autoFocus type="text" placeholder="e.g. Clean coffee machine" value={title} onChange={e => setTitle(e.target.value)}
              className="w-full border border-border rounded-xl px-4 py-3 text-sm bg-muted focus:outline-none focus:ring-1 focus:ring-ring" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Equipment</label>
            <input type="text" placeholder="e.g. Espresso machine" value={equipment} onChange={e => setEquip(e.target.value)}
              className="w-full border border-border rounded-xl px-4 py-3 text-sm bg-muted focus:outline-none focus:ring-1 focus:ring-ring" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Recurrence</label>
            <div className="grid grid-cols-3 gap-2">
              {(["daily", "weekly", "monthly", "quarterly", "annual"] as Recurrence[]).map(r => (
                <button key={r} onClick={() => setRec(r)}
                  className={cn("py-2 text-xs rounded-lg border capitalize transition-colors",
                    recurrence === r ? "bg-sage text-primary-foreground border-sage" : "border-border text-muted-foreground hover:border-sage/40")}>
                  {recurrenceLabel[r]}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Assigned to</label>
            <div className="flex gap-2">
              {["Staff", "Manager", "Owner"].map(role => (
                <button key={role} onClick={() => setRole(role)}
                  className={cn("flex-1 py-2 text-xs rounded-lg border transition-colors",
                    assignedTo === role ? "bg-sage text-primary-foreground border-sage" : "border-border text-muted-foreground hover:border-sage/40")}>
                  {role}
                </button>
              ))}
            </div>
          </div>
        </div>
        <button disabled={!title.trim()} onClick={handleCreate}
          className={cn("w-full py-3 rounded-xl text-sm font-medium transition-colors",
            title.trim() ? "bg-sage text-primary-foreground hover:bg-sage-deep" : "bg-muted text-muted-foreground cursor-not-allowed")}>
          Add task
        </button>
      </div>
    </div>
  );
}

// ─── Task Row (List view) ─────────────────────────────────────────────────────

function TaskItem({ task, onMarkDone }: { task: MaintenanceTask; onMarkDone: (id: string) => void }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-border last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground">{task.title}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{task.equipment} · {recurrenceLabel[task.recurrence]}</p>
        <p className="text-xs text-muted-foreground/70 mt-0.5">
          Due: {format(parseISO(task.nextDue), "d MMM yyyy")} · {task.assignedTo}
        </p>
      </div>
      <div className="flex flex-col items-end gap-1.5">
        <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", statusStyle[task.status])}>
          {statusLabel[task.status]}
        </span>
        {task.status !== "completed" && (
          <button onClick={() => onMarkDone(task.id)} className="text-xs text-sage font-medium hover:underline">
            Mark done
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Calendar Grid ────────────────────────────────────────────────────────────

function CalendarGrid({
  viewMode,
  currentDate,
  allTasks,
  onMarkDone,
}: {
  viewMode: "week" | "month";
  currentDate: Date;
  allTasks: MaintenanceTask[];
  onMarkDone: (id: string) => void;
}) {
  // Build cells
  const start = viewMode === "week"
    ? startOfWeek(currentDate, { weekStartsOn: 1 })
    : startOfWeek(startOfMonth(currentDate), { weekStartsOn: 1 });
  const end = viewMode === "week"
    ? endOfWeek(currentDate, { weekStartsOn: 1 })
    : endOfWeek(endOfMonth(currentDate), { weekStartsOn: 1 });

  const days: Date[] = [];
  let d = start;
  while (d <= end) { days.push(d); d = addDays(d, 1); }

  const getTasksForDay = (day: Date) =>
    allTasks.filter(t => isSameDay(parseISO(t.nextDue), day));

  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const selectedTasks = selectedDay ? getTasksForDay(selectedDay) : [];

  return (
    <div className="space-y-3">
      {/* Day headers */}
      <div className="grid grid-cols-7 gap-px">
        {DAYS_SHORT.map(d => (
          <div key={d} className="text-center text-xs text-muted-foreground font-medium py-1">{d}</div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 gap-1">
        {days.map(day => {
          const dayTasks = getTasksForDay(day);
          const isToday = isSameDay(day, TODAY);
          const isSelected = selectedDay && isSameDay(day, selectedDay);
          const isCurrentMonth = isSameMonth(day, currentDate);
          const hasOverdue = dayTasks.some(t => t.status === "overdue");
          const hasTasks = dayTasks.length > 0;

          return (
            <button
              key={day.toISOString()}
              onClick={() => setSelectedDay(isSelected ? null : day)}
              className={cn(
                "relative flex flex-col items-center rounded-xl py-2 px-1 min-h-[52px] border transition-colors",
                isSelected ? "bg-sage border-sage" :
                isToday ? "border-sage/50 bg-sage-light" :
                "border-transparent hover:border-border",
                !isCurrentMonth && viewMode === "month" && "opacity-40"
              )}
            >
              <span className={cn(
                "text-xs font-medium",
                isSelected ? "text-primary-foreground" :
                isToday ? "text-sage-deep" : "text-foreground"
              )}>
                {format(day, "d")}
              </span>
              {hasTasks && (
                <div className="flex flex-wrap justify-center gap-0.5 mt-1">
                  {dayTasks.slice(0, 3).map(t => (
                    <span
                      key={t.id}
                      className={cn(
                        "w-1.5 h-1.5 rounded-full",
                        isSelected ? "bg-white/60" :
                        t.status === "overdue" ? "bg-status-error" :
                        t.status === "completed" ? "bg-muted-foreground/40" : "bg-sage"
                      )}
                    />
                  ))}
                </div>
              )}
              {hasTasks && dayTasks.length > 3 && (
                <span className={cn("text-[9px]", isSelected ? "text-primary-foreground/70" : "text-muted-foreground")}>
                  +{dayTasks.length - 3}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Selected day tasks */}
      {selectedDay && (
        <div className="card-surface overflow-hidden">
          <div className="px-4 py-2.5 bg-muted/50 border-b border-border">
            <p className="text-xs font-semibold text-muted-foreground">
              {format(selectedDay, "EEEE, d MMMM")}
              {selectedTasks.length === 0 && " — no tasks"}
            </p>
          </div>
          {selectedTasks.length === 0 ? (
            <p className="px-4 py-4 text-sm text-muted-foreground">No maintenance tasks on this day.</p>
          ) : (
            selectedTasks.map(t => <TaskItem key={t.id} task={t} onMarkDone={onMarkDone} />)
          )}
        </div>
      )}
    </div>
  );
}

// ─── Maintenance Page ─────────────────────────────────────────────────────────

export default function Maintenance() {
  const [allTasks, setAllTasks] = useState(tasks);
  const [viewMode, setViewMode]   = useState<"week" | "month">("week");
  const [displayMode, setDisplayMode] = useState<"calendar" | "list">("calendar");
  const [currentDate, setCurrentDate] = useState(TODAY);
  const [showNew, setShowNew] = useState(false);

  const markDone = (id: string) =>
    setAllTasks(prev => prev.map(t => t.id === id ? { ...t, status: "completed" as Status } : t));

  const overdueCount = allTasks.filter(t => t.status === "overdue").length;

  const navigate = (dir: 1 | -1) => {
    if (viewMode === "week") setCurrentDate(prev => dir === 1 ? addWeeks(prev, 1) : subWeeks(prev, 1));
    else setCurrentDate(prev => dir === 1 ? addMonths(prev, 1) : subMonths(prev, 1));
  };

  const periodLabel = viewMode === "week"
    ? `${format(startOfWeek(currentDate, { weekStartsOn: 1 }), "d MMM")} – ${format(endOfWeek(currentDate, { weekStartsOn: 1 }), "d MMM yyyy")}`
    : format(currentDate, "MMMM yyyy");

  return (
    <>
      <Layout
        title="Maintenance"
        subtitle="Recurring equipment tasks"
        headerRight={
          <button
            onClick={() => setShowNew(true)}
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full bg-sage text-primary-foreground hover:bg-sage-deep transition-colors"
          >
            <Plus size={13} /> New
          </button>
        }
      >
        {/* Overdue banner */}
        {overdueCount > 0 && (
          <div className="card-surface p-4 border-l-2 border-l-status-error flex items-center gap-3">
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground">{overdueCount} task{overdueCount > 1 ? "s" : ""} overdue.</p>
              <p className="text-xs text-muted-foreground mt-0.5">Review and mark as complete or reschedule.</p>
            </div>
          </div>
        )}

        {/* Controls row */}
        <div className="flex items-center justify-between gap-2">
          {/* Week / Month toggle */}
          <div className="flex items-center bg-muted rounded-full p-0.5 text-xs">
            {(["week", "month"] as const).map(v => (
              <button
                key={v}
                onClick={() => setViewMode(v)}
                className={cn(
                  "px-3 py-1 rounded-full capitalize transition-colors",
                  viewMode === v ? "bg-card text-foreground shadow-sm font-medium" : "text-muted-foreground"
                )}
              >
                {v}
              </button>
            ))}
          </div>

          {/* Calendar / List toggle */}
          <div className="flex items-center bg-muted rounded-full p-0.5 text-xs">
            <button
              onClick={() => setDisplayMode("calendar")}
              className={cn("px-2.5 py-1 rounded-full transition-colors flex items-center gap-1",
                displayMode === "calendar" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground")}
            >
              <CalendarDays size={12} /> Calendar
            </button>
            <button
              onClick={() => setDisplayMode("list")}
              className={cn("px-2.5 py-1 rounded-full transition-colors flex items-center gap-1",
                displayMode === "list" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground")}
            >
              <List size={12} /> List
            </button>
          </div>
        </div>

        {/* Navigation header */}
        <div className="flex items-center justify-between px-1">
          <button onClick={() => navigate(-1)} className="p-2 rounded-lg hover:bg-muted transition-colors">
            <ChevronLeft size={18} className="text-muted-foreground" />
          </button>
          <p className="text-sm font-medium text-foreground">{periodLabel}</p>
          <button onClick={() => navigate(1)} className="p-2 rounded-lg hover:bg-muted transition-colors">
            <ChevronRight size={18} className="text-muted-foreground" />
          </button>
        </div>

        {/* Main content */}
        {displayMode === "calendar" ? (
          <CalendarGrid
            viewMode={viewMode}
            currentDate={currentDate}
            allTasks={allTasks}
            onMarkDone={markDone}
          />
        ) : (
          <div className="card-surface divide-y divide-border">
            {allTasks.length === 0 ? (
              <p className="px-4 py-6 text-sm text-muted-foreground text-center">No maintenance tasks yet.</p>
            ) : (
              allTasks.map(t => <TaskItem key={t.id} task={t} onMarkDone={markDone} />)
            )}
          </div>
        )}
      </Layout>

      {showNew && (
        <NewTaskModal
          onClose={() => setShowNew(false)}
          onAdd={t => setAllTasks(prev => [...prev, t])}
        />
      )}
    </>
  );
}
