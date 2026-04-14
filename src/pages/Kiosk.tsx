import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { X, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { useLocations } from "@/hooks/useLocations";
import { enqueueLog, drainQueue } from "@/lib/submission-queue";

// ─── Sub-modules ──────────────────────────────────────────────────────────────
import type { KioskChecklist, KioskScreen } from "./kiosk/types";
import {
  getKioskVisibilityState,
  isKioskDue,
  isKioskOverdue,
  isVisibleAtTime,
  dbToKioskChecklist,
} from "./kiosk/utils";
import { KioskSetupScreen } from "./kiosk/KioskSetupScreen";
import { AdminLoginModal, PinEntryModal } from "./kiosk/PinEntryModal";
import { ChecklistRunner } from "./kiosk/ChecklistRunner";
import { CompletionScreen } from "./kiosk/CompletionScreen";
import { useLiveClock } from "./kiosk/hooks";

// Re-export ChecklistRunner for backward compatibility (tests import from @/pages/Kiosk)
export { ChecklistRunner };

// Re-export utility functions used by tests
export { getKioskVisibilityState, isKioskDue, isKioskOverdue, isVisibleAtTime };

// ─── Module-level persistence (survives in-app navigation) ───────────────────
let _kioskLocationId: string | null = null;
let _kioskLocationName: string | null = null;

function clearKioskLocationSelection() {
  _kioskLocationId = null;
  _kioskLocationName = null;
  localStorage.removeItem("kiosk_location_id");
  localStorage.removeItem("kiosk_location_name");
}

function clearKioskOwnership() {
  localStorage.removeItem("kiosk_owner_user_id");
  localStorage.removeItem("kiosk_owner_org_id");
}

async function fetchKioskChecklists(locationId: string) {
  const { data, error } = await supabase.rpc("get_kiosk_checklists", { p_location_id: locationId });
  if (error) throw error;
  return (data ?? []).map(dbToKioskChecklist);
}

// ─── ChecklistCard ────────────────────────────────────────────────────────────
function ChecklistCard({ cl, idx, onSelect, dim = false }: {
  cl: KioskChecklist;
  idx: number;
  onSelect: (cl: KioskChecklist) => void;
  dim?: boolean;
}) {
  const gradients = [
    "linear-gradient(135deg, hsl(var(--sage-light)), hsl(var(--powder-blue-light)))",
    "linear-gradient(135deg, hsl(var(--lavender-light)), hsl(var(--sage-light)))",
    "linear-gradient(135deg, hsl(var(--powder-blue-light)), hsl(var(--lavender-light)))",
    "linear-gradient(135deg, hsl(var(--muted)), hsl(var(--sage-light)))",
  ];
  const icons = ["☕", "🌿", "📋", "🔑", "✨", "📦"];

  const formatDueTime = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    const ampm = h >= 12 ? "pm" : "am";
    const h12 = h % 12 || 12;
    return m === 0 ? `${h12}${ampm}` : `${h12}:${m.toString().padStart(2, "0")}${ampm}`;
  };
  const formatWindow = (from: string | null, until: string | null) => {
    if (!from && !until) return "Visible all day";
    if (from && until) return `Visible ${formatDueTime(from)} - ${formatDueTime(until)}`;
    if (from) return `Visible from ${formatDueTime(from)}`;
    return `Visible until ${formatDueTime(until!)}`;
  };

  return (
    <button
      id={`checklist-card-${cl.id}`}
      onClick={() => onSelect(cl)}
      className={cn(
        "bg-card border border-border rounded-2xl p-4 text-left transition-all active:scale-[0.98] hover:shadow-md space-y-3",
        dim ? "opacity-60 hover:opacity-80 hover:border-border" : "hover:border-sage/40",
      )}
    >
      <div
        className="w-full h-20 rounded-xl flex items-center justify-center"
        style={{ background: gradients[idx % 4] }}
      >
        <span className="text-2xl opacity-50">{icons[idx % 6]}</span>
      </div>
      <div>
        <p className="text-sm font-semibold text-foreground leading-snug">{cl.title}</p>
        <p className="text-xs text-muted-foreground mt-1">
          {cl.questions.length} item{cl.questions.length !== 1 ? "s" : ""}
        </p>
        {(cl.visibility_from || cl.visibility_until) ? (
          <p className="text-[10px] text-muted-foreground/70 mt-0.5">
            {formatWindow(cl.visibility_from, cl.visibility_until)}
          </p>
        ) : cl.due_time ? (
          <p className="text-[10px] text-muted-foreground/70 mt-0.5">
            Due {formatDueTime(cl.due_time)}
          </p>
        ) : (
          <p className="text-[10px] text-muted-foreground/70 mt-0.5">
            Visible all day
          </p>
        )}
      </div>
    </button>
  );
}

// ─── Kiosk Page ───────────────────────────────────────────────────────────────
export default function Kiosk() {
  const [searchParams] = useSearchParams();
  const urlLocationId = searchParams.get("locationId");
  const { user, teamMember, loading } = useAuth();
  const { allLocations = [], isFetched: locationsFetched } = useLocations();

  const [locationId, setLocationId] = useState<string | null>(null);
  const [locationName, setLocationName] = useState<string>("");
  const [screen, setScreen] = useState<KioskScreen>("grid");
  const [selectedChecklist, setSelectedChecklist] = useState<KioskChecklist | null>(null);
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);
  const [selectedStaffName, setSelectedStaffName] = useState<string>("");
  const [selectedOrgId, setSelectedOrgId] = useState<string>("");
  const [completedAt, setCompletedAt] = useState<Date | null>(null);
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [insertError, setInsertError] = useState<string | null>(null);
  // Four-tab kiosk view: due | overdue | upcoming | done
  const [kioskTab, setKioskTab] = useState<"due" | "overdue" | "upcoming" | "done">("due");

  useEffect(() => {
    const ownerKey = "kiosk_owner_user_id";
    const ownerOrgKey = "kiosk_owner_org_id";
    const storedOwnerId = localStorage.getItem(ownerKey);
    const storedOwnerOrgId = localStorage.getItem(ownerOrgKey);
    const hasStoredLocation = Boolean(_kioskLocationId ?? localStorage.getItem("kiosk_location_id"));
    const currentOrgId = teamMember?.organization_id ?? null;

    if (loading) return;

    if (!user?.id) {
      if (storedOwnerId || hasStoredLocation) {
        clearKioskLocationSelection();
        clearKioskOwnership();
        setLocationId(null);
        setLocationName("");
        setScreen("grid");
        setKioskChecklists([]);
      }
      return;
    }

    if (
      !storedOwnerId
      || storedOwnerId !== user.id
      || (storedOwnerOrgId && currentOrgId && storedOwnerOrgId !== currentOrgId)
    ) {
      clearKioskLocationSelection();
      clearKioskOwnership();
      setLocationId(null);
      setLocationName("");
      setScreen("grid");
      setKioskChecklists([]);
    }

    localStorage.setItem(ownerKey, user.id);
    if (currentOrgId) {
      localStorage.setItem(ownerOrgKey, currentOrgId);
    }
  }, [loading, teamMember?.organization_id, user?.id]);

  useEffect(() => {
    if (loading || !user?.id || !teamMember?.organization_id || !locationsFetched) return;

    if (urlLocationId) {
      const matchedUrlLocation = allLocations.find((location) => location.id === urlLocationId);
      if (!matchedUrlLocation) {
        clearKioskLocationSelection();
        clearKioskOwnership();
        setLocationId(null);
        setLocationName("");
        setKioskChecklists([]);
        return;
      }

      _kioskLocationId = matchedUrlLocation.id;
      _kioskLocationName = matchedUrlLocation.name;
      localStorage.setItem("kiosk_location_id", matchedUrlLocation.id);
      localStorage.setItem("kiosk_location_name", matchedUrlLocation.name);
      localStorage.setItem("kiosk_owner_user_id", user.id);
      localStorage.setItem("kiosk_owner_org_id", teamMember.organization_id);
      setLocationId(matchedUrlLocation.id);
      setLocationName(matchedUrlLocation.name);
      return;
    }

    const storedOwnerId = localStorage.getItem("kiosk_owner_user_id");
    const storedOwnerOrgId = localStorage.getItem("kiosk_owner_org_id");
    const storedLocationId = localStorage.getItem("kiosk_location_id");

    if (
      !storedLocationId ||
      storedOwnerId !== user.id ||
      storedOwnerOrgId !== teamMember.organization_id
    ) {
      if (locationId !== null || locationName !== "") {
        setLocationId(null);
        setLocationName("");
      }
      return;
    }

    const matchedStoredLocation = allLocations.find((location) => location.id === storedLocationId);
    if (!matchedStoredLocation) {
      clearKioskLocationSelection();
      clearKioskOwnership();
      setLocationId(null);
      setLocationName("");
      setKioskChecklists([]);
      return;
    }

    if (locationId !== matchedStoredLocation.id || locationName !== matchedStoredLocation.name) {
      _kioskLocationId = matchedStoredLocation.id;
      _kioskLocationName = matchedStoredLocation.name;
      setLocationId(matchedStoredLocation.id);
      setLocationName(matchedStoredLocation.name);
    }
  }, [
    allLocations,
    loading,
    locationsFetched,
    teamMember?.organization_id,
    urlLocationId,
    user?.id,
  ]);

  useEffect(() => {
    if (!locationId || !teamMember?.organization_id || !locationsFetched) return;

    const locationStillAccessible = allLocations.some((location) => location.id === locationId);
    if (!locationStillAccessible) {
      clearKioskLocationSelection();
      clearKioskOwnership();
      setLocationId(null);
      setLocationName("");
      setScreen("grid");
      setKioskChecklists([]);
    }
  }, [allLocations, locationId, locationsFetched, teamMember?.organization_id]);

  // Load persisted completions for today whenever locationId is resolved
  useEffect(() => {
    if (!locationId) return;
    const key = `kiosk_done_${new Date().toISOString().slice(0, 10)}_${locationId}`;
    try {
      const raw = localStorage.getItem(key);
      if (raw) setCompletedIds(new Set(JSON.parse(raw)));
    } catch { /* ignore */ }
  }, [locationId]);
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const now = useLiveClock();
  const outOfRangeTimerRefs = useRef<Record<string, ReturnType<typeof setTimeout> | undefined>>({});
  const outOfRangeValueRefs = useRef<Record<string, string | undefined>>({});
  const outOfRangeFiredRefs = useRef<Record<string, string | undefined>>({});

  const clearOutOfRangeTimer = (key: string) => {
    const timer = outOfRangeTimerRefs.current[key];
    if (timer) clearTimeout(timer);
    delete outOfRangeTimerRefs.current[key];
    delete outOfRangeValueRefs.current[key];
  };

  const isOutOfRangeNumber = (question: KioskChecklist["questions"][number], rawValue: any) => {
    if (question.type !== "number" || (question.min == null && question.max == null)) return false;
    const numericValue = Number(rawValue);
    if (Number.isNaN(numericValue)) return false;
    return (question.min != null && numericValue < question.min) || (question.max != null && numericValue > question.max);
  };

  const sendOutOfRangeAlert = async (question: KioskChecklist["questions"][number], rawValue: any) => {
    if (!selectedChecklist || !selectedOrgId) return;
    const numericValue = Number(rawValue);
    if (Number.isNaN(numericValue)) return;
    const rangeStr = [question.min != null ? `min ${question.min}` : null, question.max != null ? `max ${question.max}` : null]
      .filter(Boolean).join(", ");
    const timeLabel = new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    const { error: alertErr } = await supabase.from("alerts").insert({
      organization_id: selectedOrgId,
      type: "warn",
      message: `${question.text}: recorded ${numericValue} — outside the allowed range (${rangeStr})`,
      area: selectedChecklist.title,
      time: timeLabel,
      source: "kiosk",
    });
    if (alertErr) {
      const hint = alertErr.code === "42501"
        ? " (RLS policy missing — apply migration 20260323000002)"
        : ` (${alertErr.message})`;
      setInsertError(`⚠ Out-of-range alert NOT saved to DB: "${question.text}"${hint}. Apply migration 20260323000002_kiosk_anon_insert_alerts.sql in Supabase SQL Editor.`);
      console.error("Alert insert failed for question:", question.text, alertErr);
    }
  };

  const scheduleOutOfRangeAlert = (question: KioskChecklist["questions"][number], rawValue: any) => {
    const timerKey = `${selectedChecklist?.id ?? "unknown"}:${question.id}`;
    const currentValue = rawValue == null ? "" : String(rawValue);
    if (!isOutOfRangeNumber(question, rawValue)) {
      clearOutOfRangeTimer(timerKey);
      delete outOfRangeFiredRefs.current[timerKey];
      return;
    }
    if (outOfRangeFiredRefs.current[timerKey] === currentValue) return;
    clearOutOfRangeTimer(timerKey);
    outOfRangeValueRefs.current[timerKey] = currentValue;
    outOfRangeTimerRefs.current[timerKey] = setTimeout(async () => {
      if (outOfRangeValueRefs.current[timerKey] !== currentValue) return;
      await sendOutOfRangeAlert(question, rawValue);
      outOfRangeFiredRefs.current[timerKey] = currentValue;
      clearOutOfRangeTimer(timerKey);
    }, 90000);
  };

  // ── Real checklists from Supabase ──────────────────────────────────────────
  const [kioskChecklists, setKioskChecklists] = useState<KioskChecklist[]>([]);
  const [checklistsLoading, setChecklistsLoading] = useState(false);
  const [checklistsError, setChecklistsError] = useState<string | null>(null);

  useEffect(() => {
    if (loading || !user?.id || !locationId) return;
    const matchedLocation = allLocations.find((location) => location.id === locationId);
    if (matchedLocation) {
      if (matchedLocation.name !== locationName) {
        _kioskLocationName = matchedLocation.name;
        localStorage.setItem("kiosk_location_name", matchedLocation.name);
        setLocationName(matchedLocation.name);
      }
      return;
    }

    clearKioskLocationSelection();
    clearKioskOwnership();
    setLocationId(null);
    setLocationName("");
    setKioskChecklists([]);
  }, [allLocations, loading, locationId, locationName, user?.id]);

  useEffect(() => {
    if (loading || user?.id || !locationId) return;
    let cancelled = false;

    supabase
      .from("locations")
      .select("id, name")
      .eq("id", locationId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        if (data?.id) {
          if (data.name && data.name !== locationName) {
            _kioskLocationName = data.name;
            localStorage.setItem("kiosk_location_name", data.name);
            setLocationName(data.name);
          }
          return;
        }
        clearKioskLocationSelection();
        setLocationId(null);
        setLocationName("");
        setKioskChecklists([]);
      });

    return () => {
      cancelled = true;
    };
  }, [loading, locationId, locationName, user?.id]);

  // Drain any queued submissions from previous offline sessions.
  // Legacy queue entries may contain location_id values that reference mock/test
  // location UUIDs which fail the FK constraint — strip it so those entries can
  // be submitted without the potentially-invalid reference.
  useEffect(() => {
    if (!locationId) return;
    drainQueue(async (payload) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { location_id: _stripped, ...safePayload } = payload as any;
      const { error } = await supabase.from("checklist_logs").insert(safePayload);
      if (error) throw new Error(error.message);
    }).then(n => {
      if (n > 0) console.log(`Retried ${n} queued checklist log(s) successfully.`);
    });
  }, [loading, locationId, user?.id]);

  // Fetch checklists for the selected location whenever it changes and keep the
  // grid fresh when the kiosk regains focus after checklist/admin edits.
  useEffect(() => {
    if (!locationId) return;
    if (user?.id && teamMember?.organization_id && locationsFetched) {
      const locationStillAccessible = allLocations.some((location) => location.id === locationId);
      if (!locationStillAccessible) return;
    }
    let cancelled = false;

    const load = async (showSpinner = false) => {
      if (showSpinner) setChecklistsLoading(true);
      setChecklistsError(null);
      try {
        const next = await fetchKioskChecklists(locationId);
        if (!cancelled) {
          setKioskChecklists(next);
        }
      } catch (error: any) {
        if (!cancelled) {
          console.error("get_kiosk_checklists failed:", error?.message ?? error);
          setChecklistsError("Could not load checklists. Check your connection and try again.");
        }
      } finally {
        if (!cancelled && showSpinner) setChecklistsLoading(false);
      }
    };

    const handleFocusRefresh = () => {
      void load(false);
    };
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        void load(false);
      }
    };

    void load(true);
    const intervalId = window.setInterval(() => void load(false), 30000);
    window.addEventListener("focus", handleFocusRefresh);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleFocusRefresh);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [allLocations, locationId, locationsFetched, teamMember?.organization_id, user?.id]);

  const handleSetup = (id: string, name: string) => {
    _kioskLocationId = id;
    _kioskLocationName = name;
    localStorage.setItem("kiosk_location_id", id);
    localStorage.setItem("kiosk_location_name", name);
    if (user?.id) {
      localStorage.setItem("kiosk_owner_user_id", user.id);
    }
    if (teamMember?.organization_id) {
      localStorage.setItem("kiosk_owner_org_id", teamMember.organization_id);
    }
    setLocationId(id);
    setLocationName(name);
  };

  const handleStart = (staffId: string | null, staffName: string, orgId: string) => {
    setSelectedStaffId(staffId);
    setSelectedStaffName(staffName);
    setSelectedOrgId(orgId);
    setScreen("runner");
  };

  const handleChecklistSelect = (checklist: KioskChecklist) => {
    setSelectedChecklist(checklist);
  };

  const handleAdminButtonClick = () => {
    setShowAdminLogin(true);
  };

  const handleComplete = async (answers: Record<string, any>, startedAt?: Date) => {
    const now = new Date();
    setInsertError(null);
    setCompletedAt(now);
    setScreen("completion");

    // Mark checklist as done so it leaves the Due/Upcoming lists immediately
    if (selectedChecklist) {
      const id = selectedChecklist.id;
      setCompletedIds(prev => {
        const next = new Set([...prev, id]);
        if (locationId) {
          const key = `kiosk_done_${now.toISOString().slice(0, 10)}_${locationId}`;
          try { localStorage.setItem(key, JSON.stringify([...next])); } catch { /* ignore */ }
        }
        return next;
      });
    }

    // Save checklist log to Supabase (kiosk uses anon key — no auth session required)
    if (selectedChecklist && selectedOrgId) {
      const questions = selectedChecklist.questions ?? [];
      // Instruction-type questions are display-only and must not count toward the score
      const scorable = questions.filter(q => q.type !== "instruction");
      const answered = scorable.filter(q => {
        const v = answers[q.id];
        return v !== undefined && v !== "" && v !== null && v !== false;
      }).length;
      const score = scorable.length > 0 ? Math.round((answered / scorable.length) * 100) : 100;
      const answerPayload = questions.map(q => ({
        label: q.text,
        type: q.type,          // q.responseType does not exist on the local Question type
        answer: String(answers[q.id] ?? ""),
        hasPhoto: q.type === "media" ? Boolean(answers[q.id]) : undefined,
        comment: q.id.startsWith("__trigger_note:") ? String(answers[q.id] ?? "") : undefined,
      }));

      // Base payload — columns that exist in the initial schema (20260304000001).
      // location_id is added separately below only when the column is confirmed to
      // exist (migration 20260312000001 / 20260323000001 applied + schema cache refreshed).
      // Without this guard every insert fails with "column not found in schema cache".
      const basePayload = {
        organization_id: selectedOrgId,
        checklist_id: selectedChecklist.id,
        checklist_title: selectedChecklist.title,
        completed_by: selectedStaffName,
        staff_profile_id: selectedStaffId ?? null,
        score,
        answers: answerPayload,
      };

      // Attempt with location_id first (works once migration is applied + schema reloaded).
      // If it fails with a schema-cache error, retry without it so the submission is never lost.
      const logPayload = {
        ...basePayload,
        location_id: locationId ?? null,
        started_at: startedAt ? startedAt.toISOString() : null,  // persisted for PDF export
      };
      let { error: dbInsertError } = await supabase.from("checklist_logs").insert(logPayload);

      if (dbInsertError && (dbInsertError.message?.includes("location_id") || dbInsertError.message?.includes("started_at"))) {
        // One or more added columns not yet in the PostgREST schema cache.
        // Retry with only the original columns so the completion is never lost.
        console.warn(
          "Column(s) not found in schema cache — retrying with base payload. " +
          "Apply migrations 20260312000001 + 20260326000001 and run: NOTIFY pgrst, 'reload schema';"
        );
        ({ error: dbInsertError } = await supabase.from("checklist_logs").insert(basePayload));
      }
      if (dbInsertError) {
        // Queue for retry — the submission will be retried on next kiosk load
        const msg = dbInsertError.message ?? "Unknown error";
        console.error("Checklist log insert failed, queuing for retry:", msg);
        setInsertError(`Submission queued (offline/error): ${msg}`);
        enqueueLog(logPayload);
      }

    }
  };

  const handleDone = () => {
    setSelectedChecklist(null);
    setSelectedStaffId(null);
    setSelectedStaffName("");
    setSelectedOrgId("");
    setCompletedAt(null);
    setScreen("grid");
  };

  // ── Setup screen ──────────────────────────────────────────────────────────
  if (!locationId) {
    const setupLocations = user?.id
      ? allLocations.map((location) => ({ id: location.id, name: location.name }))
      : undefined;
    return <KioskSetupScreen onSetup={handleSetup} presetLocations={setupLocations} />;
  }

  // Split checklists by state — completed items leave Due/Upcoming immediately
  const dueChecklists = kioskChecklists.filter(c => getKioskVisibilityState(c, now) === "due" && !completedIds.has(c.id));
  const overdueChecklists = kioskChecklists.filter(c => getKioskVisibilityState(c, now) === "overdue" && !completedIds.has(c.id));
  const upcomingChecklists = kioskChecklists.filter(c => getKioskVisibilityState(c, now) === "upcoming" && !completedIds.has(c.id));
  const doneChecklists = kioskChecklists.filter(c => completedIds.has(c.id));
  const visibleChecklists = kioskChecklists; // total — used for "no checklists" empty state

  // ── Runner screen ─────────────────────────────────────────────────────────
  if (screen === "runner" && selectedChecklist) {
    return (
      <ChecklistRunner
        checklist={selectedChecklist}
        staffName={selectedStaffName}
        onComplete={handleComplete}
        onCancel={handleDone}
        onQuestionAnswerChange={(question: KioskChecklist["questions"][number], value: any) => {
          if (question.type !== "number") return;
          scheduleOutOfRangeAlert(question, value);
        }}
      />
    );
  }

  // ── Completion screen ─────────────────────────────────────────────────────
  if (screen === "completion" && selectedChecklist && completedAt) {
    return (
      <CompletionScreen
        checklist={selectedChecklist}
        staffName={selectedStaffName}
        completedAt={completedAt}
        onDone={handleDone}
      />
    );
  }

  // ── Grid screen (Screen 1) ────────────────────────────────────────────────
  const timeStr = now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const dateStr = now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="min-h-screen bg-background w-full min-[900px]:max-w-none mx-auto flex flex-col">
      {/* Top bar */}
      <div className="px-5 pt-7 pb-4 flex items-center justify-between border-b border-border">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-sage flex items-center justify-center shrink-0">
            <span className="text-white text-[10px] font-bold">O</span>
          </div>
          <div>
            <p className="text-xs font-bold text-foreground uppercase tracking-widest leading-none">Olia</p>
            {/* Issue 9: Show location name prominently */}
            <p className="text-[10px] text-sage uppercase tracking-wide leading-none mt-0.5 font-semibold">
              {locationName || "Kiosk"}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground uppercase tracking-widest">Current Status</p>
          <p className="text-sm font-semibold text-foreground">{dateStr} · {timeStr}</p>
        </div>
        <button
          id="admin-btn"
          onClick={handleAdminButtonClick}
          className="text-xs font-semibold text-muted-foreground border border-border rounded-full px-3 py-1.5 hover:bg-muted transition-colors ml-2 shrink-0"
        >
          Admin
        </button>
      </div>

      {/* Agenda heading */}
      <div className="px-5 pt-6 pb-2">
        <h1 className="font-display text-3xl italic text-foreground leading-tight text-center">
          What's on the agenda<br />for today?
        </h1>

        {/* Stat strip — DUE / OVERDUE / UPCOMING / DONE */}
        <div className="grid grid-cols-4 gap-2 mt-5">
          <button
            data-testid="kiosk-tab-due"
            onClick={() => setKioskTab("due")}
            className={cn(
              "bg-card border rounded-2xl px-2 py-3 text-center transition-colors",
              kioskTab === "due" ? "border-status-error/50 ring-1 ring-status-error/20" : "border-border",
            )}
          >
            <p className="section-label mb-1">Due now</p>
            <p className="text-xl font-bold text-status-error">{dueChecklists.length}</p>
          </button>
          <button
            data-testid="kiosk-tab-overdue"
            onClick={() => setKioskTab("overdue")}
            className={cn(
              "bg-card border rounded-2xl px-2 py-3 text-center transition-colors",
              kioskTab === "overdue" ? "border-status-error/50 ring-1 ring-status-error/20" : "border-border",
            )}
          >
            <p className="section-label mb-1">Overdue</p>
            <p className="text-xl font-bold text-status-error">{overdueChecklists.length}</p>
          </button>
          <button
            data-testid="kiosk-tab-upcoming"
            onClick={() => setKioskTab("upcoming")}
            className={cn(
              "bg-card border rounded-2xl px-2 py-3 text-center transition-colors",
              kioskTab === "upcoming" ? "border-status-warn/50 ring-1 ring-status-warn/20" : "border-border",
            )}
          >
            <p className="section-label mb-1">Upcoming</p>
            <p className="text-xl font-bold text-status-warn">{upcomingChecklists.length}</p>
          </button>
          <button
            data-testid="kiosk-tab-done"
            onClick={() => setKioskTab("done")}
            className={cn(
              "bg-card border rounded-2xl px-2 py-3 text-center transition-colors",
              kioskTab === "done" ? "border-status-ok/50 ring-1 ring-status-ok/20" : "border-border",
            )}
          >
            <p className="section-label mb-1">Done</p>
            <p className="text-xl font-bold text-status-ok">{doneChecklists.length}</p>
          </button>
        </div>
      </div>

      {/* Insert-error banner (surfaces DB write failures) */}
      {insertError && (
        <div className="mx-5 mt-2">
          <div className="bg-status-error/10 border border-status-error/30 rounded-xl px-4 py-2.5 flex items-start justify-between gap-3">
            <p className="text-xs text-status-error font-medium leading-snug">{insertError}</p>
            <button onClick={() => setInsertError(null)} className="text-status-error/60 hover:text-status-error shrink-0">
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Checklist grid */}
      <div className="px-5 sm:px-6 lg:px-8 flex-1 pb-6 mt-2">
        {checklistsLoading ? (
          <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
            <Loader2 size={16} className="animate-spin" />
            <p className="text-sm">Loading checklists…</p>
          </div>
        ) : checklistsError ? (
          <div className="text-center py-12 px-4 space-y-3">
            <p className="text-sm text-status-error font-medium">{checklistsError}</p>
            <button
              onClick={() => {
                setChecklistsError(null);
                setChecklistsLoading(true);
                fetchKioskChecklists(locationId!)
                  .then((data) => {
                    setKioskChecklists(data);
                  })
                  .catch(() => setChecklistsError("Retry failed. Check your connection."))
                  .finally(() => setChecklistsLoading(false));
              }}
              className="px-4 py-2 text-xs font-semibold rounded-xl border border-border hover:bg-muted transition-colors"
            >
              Retry
            </button>
          </div>
        ) : visibleChecklists.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-sm text-muted-foreground">No checklists found for this location.</p>
            <p className="text-xs text-muted-foreground/60 mt-1">An admin needs to create checklists and assign them here.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {kioskTab === "due" ? (
              <>
                {dueChecklists.length > 0 ? (
                  <div>
                    <p className="section-label mb-2 text-status-error">Due now</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {dueChecklists.map((cl, idx) => (
                        <ChecklistCard key={cl.id} cl={cl} idx={idx} onSelect={handleChecklistSelect} />
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-10">
                    <p className="text-sm text-status-ok font-semibold">Nothing due right now ✓</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {overdueChecklists.length > 0
                        ? `${overdueChecklists.length} checklist${overdueChecklists.length > 1 ? "s are" : " is"} overdue — tap Overdue to review them.`
                        : upcomingChecklists.length > 0
                        ? `${upcomingChecklists.length} checklist${upcomingChecklists.length > 1 ? "s" : ""} coming up — tap Upcoming to see them.`
                        : "Tap Done above to review completed checklists."}
                    </p>
                  </div>
                )}
              </>
            ) : kioskTab === "overdue" ? (
              <>
                {overdueChecklists.length > 0 ? (
                  <div>
                    <p className="section-label mb-2 text-status-error">Overdue</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {overdueChecklists.map((cl, idx) => (
                        <ChecklistCard key={cl.id} cl={cl} idx={idx} onSelect={handleChecklistSelect} />
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-10">
                    <p className="text-sm text-muted-foreground">No overdue checklists.</p>
                  </div>
                )}
              </>
            ) : kioskTab === "upcoming" ? (
              <>
                {upcomingChecklists.length > 0 ? (
                  <div>
                    <p className="section-label mb-2">Upcoming today</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {upcomingChecklists.map((cl, idx) => (
                        <ChecklistCard key={cl.id} cl={cl} idx={idx} onSelect={handleChecklistSelect} dim />
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-10">
                    <p className="text-sm text-muted-foreground">No upcoming checklists.</p>
                  </div>
                )}
              </>
            ) : (
              /* DONE TODAY section */
              doneChecklists.length === 0 ? (
                <div className="text-center py-10">
                  <p className="text-sm text-muted-foreground">No completions yet today.</p>
                </div>
              ) : (
                <div>
                  <p className="section-label mb-2 text-status-ok">Completed today</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {doneChecklists.map((cl, idx) => (
                      <div
                        key={cl.id}
                        className="bg-card border border-status-ok/30 rounded-2xl p-4 opacity-70"
                      >
                        <div className="w-full h-20 rounded-xl flex items-center justify-center bg-status-ok/10 mb-3">
                          <Check size={28} className="text-status-ok" />
                        </div>
                        <p className="text-sm font-semibold text-foreground leading-snug">{cl.title}</p>
                        <p className="text-xs text-status-ok mt-1 font-medium">Completed</p>
                      </div>
                    ))}
                  </div>
                </div>
              )
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-5 py-3 border-t border-border flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-status-ok" />
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-medium">System Online</p>
        </div>
        <p className="text-[10px] text-muted-foreground/50 uppercase tracking-widest">Olia Operations</p>
      </div>

      {/* PinEntryModal (Screen 2) */}
      {selectedChecklist && screen === "grid" && (
        <PinEntryModal
          checklist={selectedChecklist}
          locationId={locationId}
          onSuccess={handleStart}
          onCancel={() => setSelectedChecklist(null)}
        />
      )}

      {/* AdminLoginModal */}
      {showAdminLogin && <AdminLoginModal onClose={() => setShowAdminLogin(false)} kioskLocationId={locationId} />}
    </div>
  );
}
