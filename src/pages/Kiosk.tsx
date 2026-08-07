import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { X, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { useLocations } from "@/hooks/useLocations";
import { enqueueLog, drainQueue } from "@/lib/submission-queue";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import i18n, { resolveSupportedLanguage, type SupportedLanguage } from "@/lib/i18n";

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
import { AdminLoginModal, PinEntryModal, LibraryPinModal, ensureKioskToken } from "./kiosk/PinEntryModal";
import { KioskLibrary } from "./kiosk/KioskLibrary";
import { ChecklistRunner } from "./kiosk/ChecklistRunner";
import { CompletionScreen } from "./kiosk/CompletionScreen";
import { useLiveClock } from "./kiosk/hooks";
import { collectNotifyAlerts } from "./kiosk/logic-rules";

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
  localStorage.removeItem("kiosk_token");
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
  const icons = [
    "/icons/checklist/hot_beverage.svg",
    "/icons/checklist/herb.svg",
    "/icons/checklist/clipboard.svg",
    "/icons/checklist/key.svg",
    "/icons/checklist/sparkles.svg",
    "/icons/checklist/package.svg",
  ];

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
        <img src={icons[idx % 6]} alt="" className="w-11 h-11" />
      </div>
      <div>
        <p className="text-sm font-semibold text-foreground leading-snug">{cl.title}</p>
        <p className="text-xs text-muted-foreground mt-1">
          {cl.questions.length} item{cl.questions.length !== 1 ? "s" : ""}
        </p>
        {(cl.visibility_from || cl.visibility_until) ? (
          <p className="text-xs text-muted-foreground/70 mt-0.5">
            {formatWindow(cl.visibility_from, cl.visibility_until)}
          </p>
        ) : cl.due_time ? (
          <p className="text-xs text-muted-foreground/70 mt-0.5">
            Due {formatDueTime(cl.due_time)}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground/70 mt-0.5">
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
  const { allLocations = [], isFetched: locationsFetched, isError: locationsErrored } = useLocations();

  // Hydrate straight from localStorage on mount so a properly-configured
  // kiosk keeps working even when there is no live auth session yet (or
  // ever again) — see the ownership-tracking effect below for why the
  // session's presence must not gate this.
  const [locationId, setLocationId] = useState<string | null>(
    () => localStorage.getItem("kiosk_location_id"),
  );
  const [locationName, setLocationName] = useState<string>(
    () => localStorage.getItem("kiosk_location_name") ?? "",
  );
  const [screen, setScreen] = useState<KioskScreen>("grid");
  const [selectedChecklist, setSelectedChecklist] = useState<KioskChecklist | null>(null);
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);
  const [selectedStaffName, setSelectedStaffName] = useState<string>("");
  const [selectedOrgId, setSelectedOrgId] = useState<string>("");
  const [completedAt, setCompletedAt] = useState<Date | null>(null);
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  // Maps checklist id → { answers, contributors, logId, editToken } so re-edits pre-fill, attribute all staff, and update in place
  const [completedSubmissions, setCompletedSubmissions] = useState<Map<string, { answers: Record<string, any>; contributors: string[]; logId: string | null; editToken: string | null }>>(new Map());
  const [insertError, setInsertError] = useState<string | null>(null);
  // Four-tab kiosk view: due | overdue | upcoming | done
  const [kioskTab, setKioskTab] = useState<"due" | "overdue" | "upcoming" | "done">("due");
  const [showLibraryPin, setShowLibraryPin] = useState(false);
  const [libraryMemberId, setLibraryMemberId] = useState<string | null>(null);
  const [libraryMemberName, setLibraryMemberName] = useState("");

  // Device-scoped, not tied to any account: a kiosk isn't logged in, and per
  // #594 the last language a guest picked on this device should stick for
  // the next guest rather than resetting on idle/session end.
  const [kioskLanguage, setKioskLanguage] = useState<SupportedLanguage>(
    () => resolveSupportedLanguage(localStorage.getItem("kiosk_language")),
  );

  useEffect(() => {
    i18n.changeLanguage(kioskLanguage);
  }, [kioskLanguage]);

  const handleKioskLanguageChange = (language: SupportedLanguage) => {
    setKioskLanguage(language);
    localStorage.setItem("kiosk_language", language);
  };

  useEffect(() => {
    if (loading) return;

    // No live auth session on this device. That's the normal state for a
    // kiosk most of the time (it runs on the anon key), and it's also what
    // a silently expired/failed-to-refresh JWT looks like (Safari ITP
    // evicting localStorage after ~7 days with no top-level interaction, a
    // long offline stretch, etc). The kiosk's location binding lives in
    // kiosk_location_id/kiosk_token, independent of the auth session, so
    // leave it alone here — only a genuinely re-authenticated owner whose
    // account doesn't match the stored one (below) should ever reset it.
    if (!user?.id) return;

    const ownerKey = "kiosk_owner_user_id";
    const ownerOrgKey = "kiosk_owner_org_id";
    const storedOwnerId = localStorage.getItem(ownerKey);
    const storedOwnerOrgId = localStorage.getItem(ownerOrgKey);
    const currentOrgId = teamMember?.organization_id ?? null;

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
        // A failed fetch also leaves allLocations empty (isFetched is true on
        // error too), which looks identical to "this location was deleted."
        // Treat an errored fetch as "don't know yet" and retry later instead
        // of wiping a device's kiosk config over a transient network blip.
        if (locationsErrored) return;
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

      // Fetch and store the server-issued kiosk_token for the URL-param setup path (SEQ-009).
      void supabase
        .from("locations")
        .select("kiosk_token")
        .eq("id", matchedUrlLocation.id)
        .single()
        .then(({ data: urlLocationData }) => {
          if (urlLocationData?.kiosk_token) {
            localStorage.setItem("kiosk_token", urlLocationData.kiosk_token);
          }
        })
        .catch(() => {
          // Non-fatal: PIN validation will fail gracefully if token is missing.
        });

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
      // Same reasoning as the urlLocationId branch above: don't tear down a
      // working kiosk's configuration just because this one fetch errored.
      if (locationsErrored) return;
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
    locationsErrored,
    locationsFetched,
    teamMember?.organization_id,
    urlLocationId,
    user?.id,
  ]);

  useEffect(() => {
    if (!locationId || !teamMember?.organization_id || !locationsFetched || locationsErrored) return;

    const locationStillAccessible = allLocations.some((location) => location.id === locationId);
    if (!locationStillAccessible) {
      clearKioskLocationSelection();
      clearKioskOwnership();
      setLocationId(null);
      setLocationName("");
      setScreen("grid");
      setKioskChecklists([]);
    }
  }, [allLocations, locationId, locationsErrored, locationsFetched, teamMember?.organization_id]);

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
    if (!selectedChecklist || !locationId) return;
    const numericValue = Number(rawValue);
    if (Number.isNaN(numericValue)) return;
    const rangeStr = [question.min != null ? `min ${question.min}` : null, question.max != null ? `max ${question.max}` : null]
      .filter(Boolean).join(", ");
    const { error: alertErr } = await supabase.rpc("insert_kiosk_alert", {
      p_location_id: locationId,
      p_type: "warn",
      p_message: `${question.text}: recorded ${numericValue} — outside the allowed range (${rangeStr})`,
      p_area: selectedChecklist.title.slice(0, 100),
    });
    if (alertErr) {
      setInsertError(`⚠ Out-of-range alert NOT saved to DB: "${question.text}" (${alertErr.message}). Apply migration 20260429000002_secure_anon_alert_insert.sql in Supabase SQL Editor.`);
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

  /**
   * After a checklist is completed, evaluate all logic rules and fire an
   * `alerts` row for each matching "notify" trigger. The DB trigger
   * (`trg_send_alert_email`) picks up each insert and sends the email via
   * the Resend edge function.
   *
   * Uses a defensive try-with-recipient / retry-without pattern identical to
   * the location_id guard above: if the `recipient_email` column isn't yet in
   * the PostgREST schema cache (migration not applied), the second attempt
   * still creates the alert row so it appears on the dashboard.
   */
  const fireNotifyAlerts = async (
    questions: KioskChecklist["questions"],
    answers: Record<string, any>,
    locationIdParam: string,
    checklistTitle: string,
  ) => {
    const notifyAlerts = collectNotifyAlerts(questions, answers);
    if (notifyAlerts.length === 0) return;

    for (const alert of notifyAlerts) {
      const { error: alertErr } = await supabase.rpc("insert_kiosk_alert", {
        p_location_id: locationIdParam,
        p_type: "info",
        p_message: alert.message.slice(0, 500),
        p_area: checklistTitle.slice(0, 100),
        p_recipient_email: alert.recipientEmail || null,
      });

      if (alertErr) {
        console.error("fireNotifyAlerts: alert insert failed:", alertErr.message);
      }
    }
  };

  // ── Real checklists from Supabase ──────────────────────────────────────────
  const [kioskChecklists, setKioskChecklists] = useState<KioskChecklist[]>([]);
  const [checklistsLoading, setChecklistsLoading] = useState(false);
  const [checklistsError, setChecklistsError] = useState<string | null>(null);

  useEffect(() => {
    if (loading || !user?.id || !locationId || !locationsFetched || locationsErrored) return;
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
  }, [allLocations, loading, locationId, locationName, locationsErrored, locationsFetched, user?.id]);

  useEffect(() => {
    if (loading || user?.id || !locationId) return;
    let cancelled = false;

    supabase
      .from("locations")
      .select("id, name")
      .eq("id", locationId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (data?.id) {
          if (data.name && data.name !== locationName) {
            _kioskLocationName = data.name;
            localStorage.setItem("kiosk_location_name", data.name);
            setLocationName(data.name);
          }
          return;
        }
        // A failed request (network blip, transient Supabase error) surfaces
        // here as data:null too — indistinguishable from "this location was
        // really deleted" unless we check `error`. This is the anonymous
        // kiosk's own periodic re-check (no live session, so it can't rely
        // on useLocations' org-scoped list), so a wrong guess here silently
        // logs a real, working kiosk device out to the marketing homepage.
        if (error) return;
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
      // Payloads tagged with _log_id are re-edit updates; all others are fresh inserts.
      if (payload._log_id) {
        const { _log_id, ...rest } = payload;
        const { error } = await supabase.rpc("update_kiosk_log", rest as any);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabase.rpc("submit_kiosk_log", payload as any);
        if (error) throw new Error(error.message);
      }
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

  // Proactively refresh kiosk_token whenever the locationId is resolved.
  // Covers the case where the kiosk was set up before the token feature was
  // deployed (token never stored) or the token was cleared by a hard refresh.
  useEffect(() => {
    if (!locationId) return;
    void ensureKioskToken(locationId);
  }, [locationId]);

  const handleSetup = async (id: string, name: string) => {
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

    // Fetch and store the server-issued kiosk_token so PIN validation can
    // verify the location hasn't been tampered with in localStorage (SEQ-009).
    try {
      const { data: locationData } = await supabase
        .from("locations")
        .select("kiosk_token")
        .eq("id", id)
        .single();
      if (locationData?.kiosk_token) {
        localStorage.setItem("kiosk_token", locationData.kiosk_token);
      }
    } catch {
      // Non-fatal: PIN validation will fail gracefully if token is missing.
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

  const handleLibraryPinSuccess = (memberId: string | null, memberName: string, _orgId: string) => {
    setShowLibraryPin(false);
    setLibraryMemberId(memberId);
    setLibraryMemberName(memberName);
    setScreen("library");
  };

  const handleComplete = async (answers: Record<string, any>, startedAt?: Date) => {
    const now = new Date();
    setInsertError(null);
    setCompletedAt(now);
    setScreen("completion");

    // Mark checklist as done so it leaves the Due/Upcoming lists immediately.
    // Build contributors list: accumulate all distinct staff who have worked on this checklist.
    let contributors: string[] = [selectedStaffName];
    let existingLogId: string | null = null;
    if (selectedChecklist) {
      const id = selectedChecklist.id;
      const prev = completedSubmissions.get(id);
      if (prev) {
        contributors = [...prev.contributors.filter(n => n !== selectedStaffName), selectedStaffName];
        existingLogId = prev.logId;
      }
      setCompletedIds(prevIds => {
        const next = new Set([...prevIds, id]);
        if (locationId) {
          const key = `kiosk_done_${now.toISOString().slice(0, 10)}_${locationId}`;
          try { localStorage.setItem(key, JSON.stringify([...next])); } catch { /* ignore */ }
        }
        return next;
      });
    }

    // Save checklist log to Supabase (kiosk uses anon key — no auth session required).
    // If this is a re-edit of an existing submission, update the row in place instead of
    // inserting a new one — prevents duplicate entries in Reporting.
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
        type: q.type,
        answer: String(answers[q.id] ?? ""),
        hasPhoto: q.type === "media" ? Boolean(answers[q.id]) : undefined,
        comment: q.id.startsWith("__trigger_note:") ? String(answers[q.id] ?? "") : undefined,
      }));
      const completedBy = contributors.join(", ");

      let returnedLogId: string | null = existingLogId;
      let returnedEditToken: string | null = completedSubmissions.get(selectedChecklist.id)?.editToken ?? null;
      let dbError: any = null;

      if (existingLogId && returnedEditToken) {
        // Re-edit: update the existing log row — edit_token proves possession (SEQ-edit)
        const updatePayload = {
          p_log_id:       existingLogId,
          p_edit_token:   returnedEditToken,
          p_score:        score,
          p_answers:      answerPayload,
          p_completed_by: completedBy,
          p_started_at:   startedAt ? startedAt.toISOString() : null,
        };
        const { error } = await supabase.rpc("update_kiosk_log", updatePayload);
        if (error) {
          dbError = error;
          // Tag with _log_id so the drain knows to call update_kiosk_log, not submit_kiosk_log
          enqueueLog({ ...updatePayload, _log_id: existingLogId });
        }
      } else {
        // First submission: insert via SECURITY DEFINER RPC — org resolved server-side (SEQ-003)
        const insertPayload = {
          p_location_id:      locationId ?? null,
          p_checklist_id:     selectedChecklist.id,
          p_staff_profile_id: selectedStaffId ?? null,
          p_score:            score,
          p_answers:          answerPayload,
          p_checklist_title:  selectedChecklist.title,
          p_completed_by:     completedBy,
          p_started_at:       startedAt ? startedAt.toISOString() : null,
        };
        const { data, error } = await supabase.rpc("submit_kiosk_log", insertPayload);
        if (error) {
          dbError = error;
          enqueueLog(insertPayload);
        } else {
          const result = data as { log_id: string; edit_token: string } | null;
          returnedLogId = result?.log_id ?? null;
          returnedEditToken = result?.edit_token ?? null;
        }
      }

      if (dbError) {
        const msg = dbError.message ?? "Unknown error";
        console.error("Checklist log save failed, queuing for retry:", msg);
        setInsertError(`Submission queued (offline/error): ${msg}`);
      }

      // Store final submission state for potential future re-edits
      if (selectedChecklist) {
        const id = selectedChecklist.id;
        setCompletedSubmissions(prevMap => new Map([...prevMap, [id, { answers, contributors, logId: returnedLogId, editToken: returnedEditToken }]]));
      }

      // Evaluate checklist logic rules and send notify-trigger emails.
      // Runs even if the log insert failed so alerts are never silently dropped.
      if (locationId) {
        await fireNotifyAlerts(
          selectedChecklist.questions,
          answers,
          locationId,
          selectedChecklist.title,
        );
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
        initialAnswers={completedSubmissions.get(selectedChecklist.id)?.answers}
        organizationId={selectedOrgId || teamMember?.organization_id}
        locationId={locationId ?? undefined}
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

  // ── Library screen ───────────────────────────────────────────────────────────
  if (screen === "library" && locationId) {
    return (
      <KioskLibrary
        memberId={libraryMemberId}
        memberName={libraryMemberName}
        locationId={locationId}
        onBack={() => {
          setScreen("grid");
          setLibraryMemberId(null);
          setLibraryMemberName("");
        }}
      />
    );
  }

  // ── Grid screen (Screen 1) ────────────────────────────────────────────────
  const timeStr = now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const dateStr = now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="min-h-screen bg-background w-full min-[900px]:max-w-none mx-auto flex flex-col">
      {/* Top bar */}
      <div className="px-5 pt-6 pb-4 grid grid-cols-3 items-center border-b border-border">
        {/* Left: current status */}
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-widest">Current Status</p>
          <p className="text-sm font-semibold text-foreground">{dateStr} · {timeStr}</p>
        </div>

        {/* Center: brand mark + name */}
        <div className="flex items-center justify-center gap-2.5">
          <img src="/brand/logo/olia-mark-dark.svg" alt="Olia" className="w-10 h-10 shrink-0" />
          <div>
            <p className="text-xs font-bold text-foreground uppercase tracking-widest leading-none">Olia</p>
            <p className="text-xs text-sage uppercase tracking-wide leading-none mt-0.5 font-semibold">
              {locationName || "Kiosk"}
            </p>
          </div>
        </div>

        {/* Right: language + library + admin */}
        <div className="flex justify-end items-center gap-2">
          <LanguageSwitcher variant="pill" value={kioskLanguage} onChange={handleKioskLanguageChange} />
          <button
            id="library-btn"
            onClick={() => setShowLibraryPin(true)}
            className="text-xs font-semibold text-muted-foreground border border-border rounded-full px-3 py-1.5 hover:bg-muted transition-colors shrink-0"
          >
            Library
          </button>
          <button
            id="admin-btn"
            onClick={handleAdminButtonClick}
            className="text-xs font-semibold text-muted-foreground border border-border rounded-full px-3 py-1.5 hover:bg-muted transition-colors shrink-0"
          >
            Admin
          </button>
        </div>
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
            <p className="text-xl font-semibold text-status-error">{dueChecklists.length}</p>
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
            <p className="text-xl font-semibold text-status-error">{overdueChecklists.length}</p>
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
            <p className="text-xl font-semibold text-status-warn">{upcomingChecklists.length}</p>
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
            <p className="text-xl font-semibold text-status-ok">{doneChecklists.length}</p>
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
                      <button
                        key={cl.id}
                        onClick={() => handleChecklistSelect(cl)}
                        className="bg-card border border-status-ok/30 rounded-2xl p-4 text-left hover:bg-status-ok/5 transition-colors active:scale-[0.98]"
                      >
                        <div className="w-full h-20 rounded-xl flex items-center justify-center bg-status-ok/10 mb-3">
                          <Check size={28} className="text-status-ok" />
                        </div>
                        <p className="text-sm font-semibold text-foreground leading-snug">{cl.title}</p>
                        <p className="text-xs text-status-ok mt-1 font-medium">
                          {completedSubmissions.get(cl.id)?.contributors.join(", ") ?? "Completed"}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">Tap to edit</p>
                      </button>
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
          <p className="text-xs text-muted-foreground uppercase tracking-widest font-medium">System Online</p>
        </div>
        <p className="text-xs text-muted-foreground/50 uppercase tracking-widest">Olia Operations</p>
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

      {/* LibraryPinModal */}
      {showLibraryPin && locationId && (
        <LibraryPinModal
          locationId={locationId}
          onSuccess={handleLibraryPinSuccess}
          onCancel={() => setShowLibraryPin(false)}
        />
      )}
    </div>
  );
}
