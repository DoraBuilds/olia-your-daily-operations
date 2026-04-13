import { useState, useEffect, useRef, Fragment } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { X, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { useLocations } from "@/hooks/useLocations";
import { enqueueLog, drainQueue } from "@/lib/submission-queue";
import { getLinkableInfohubResource } from "@/lib/infohub-catalog";

// ─── Module-level persistence (survives in-app navigation) ───────────────────
let _kioskLocationId: string | null = null;
let _kioskLocationName: string | null = null;

// ─── Types ────────────────────────────────────────────────────────────────────
type TimeOfDay = "morning" | "afternoon" | "evening" | "anytime";
// "datetime" removed from builder — kept here only as a type so the switch-case
// below doesn't silently drop answers from legacy saved checklists.
// The SUPPORTED_QUESTION_TYPES list no longer includes "datetime", so any
// question stored with responseType "datetime" resolves to "text" in the runner.
type QuestionType = "checkbox" | "text" | "number" | "multiple_choice" | "datetime" | "instruction" | "media";

interface Question {
  id: string;
  text: string;
  type: QuestionType;
  required?: boolean;        // if true, must be answered before "Complete" is allowed
  options?: string[];
  optionColors?: string[];
  selectionMode?: "single" | "multiple";
  instructionText?: string;
  imageUrl?: string;         // for instruction-type image
  linkedResourceId?: string;
  linkedResourceTitle?: string;
  linkedResourceSection?: "library" | "training";
  sectionName?: string;      // section this question belongs to (for dividers in runner)
  defaultValue?: string;     // pre-fill value (used for person type defaultPerson)
  min?: number;              // number questions: acceptable range minimum
  max?: number;              // number questions: acceptable range maximum
  temperatureUnit?: "C" | "F";
}

interface KioskChecklist {
  id: string;
  title: string;
  location_id: string | null;
  time_of_day: TimeOfDay;
  due_time: string | null;   // HH:MM — kiosk visibility based on this
  visibility_from: string | null;
  visibility_until: string | null;
  questions: Question[];
}

type KioskScreen = "grid" | "runner" | "completion";

// ─── DB → Kiosk conversion ────────────────────────────────────────────────────

// "datetime" is intentionally excluded — removed from builder in P0 triage pass.
// Existing saved questions with responseType "datetime" fall back to "text".
// "signature" and "person" are also excluded (removed earlier) for the same reason.
const SUPPORTED_QUESTION_TYPES: QuestionType[] = [
  "checkbox", "text", "number", "multiple_choice", "instruction", "media",
];

/**
 * Flatten SectionDef[] (stored as JSONB in `checklists.sections`) into
 * the kiosk's flat Question[].
 */
function flattenSectionsToQuestions(sections: any[]): Question[] {
  return (sections ?? []).flatMap((section: any) =>
    (section.questions ?? []).map((q: any): Question => {
      // Legacy "person" type: render as multiple_choice using the baked-in choices.
      // Legacy "signature" type: falls through to "text" (the runner renders a plain text input).
      // Neither type is available in the builder any more.
      const isPerson = q.responseType === "person";
      const resolvedType = isPerson
        ? "multiple_choice"
        : (SUPPORTED_QUESTION_TYPES.includes(q.responseType) ? q.responseType : "text") as QuestionType;
      const resolvedOptions = isPerson
        ? (q.config?.personChoices ?? q.choices ?? [])
        : q.choices;
      return {
        id: q.id,
        text: q.text,
        type: resolvedType,
        required: q.required ?? false,
        options: resolvedOptions,
        optionColors: q.choiceColors,
        selectionMode: q.selectionMode ?? "single",
        instructionText: q.config?.instructionText,
        imageUrl: q.config?.instructionImageUrl,
        linkedResourceId: q.config?.instructionLinkId,
        linkedResourceTitle: q.config?.instructionLinkTitle,
        linkedResourceSection: q.config?.instructionLinkSection,
        sectionName: section.name || "",
        // For person type: carry the builder's default so the runner can pre-fill it
        defaultValue: isPerson ? (q.config?.defaultPerson ?? "") : "",
        // Number range: set in builder as config.numberMin / config.numberMax
        min: q.config?.numberMin != null ? Number(q.config.numberMin) : undefined,
        max: q.config?.numberMax != null ? Number(q.config.numberMax) : undefined,
        temperatureUnit: q.config?.temperatureUnit,
      };
    })
  );
}

const VALID_TIMES_OF_DAY: TimeOfDay[] = ["morning", "afternoon", "evening", "anytime"];

function dbToKioskChecklist(raw: any): KioskChecklist {
  const tod: TimeOfDay = VALID_TIMES_OF_DAY.includes(raw.time_of_day)
    ? raw.time_of_day
    : "anytime";
  return {
    id: raw.id,
    title: raw.title,
    location_id: raw.location_id ?? null,
    time_of_day: tod,
    due_time: raw.due_time ?? null,
    visibility_from: raw.visibility_from ?? null,
    visibility_until: raw.visibility_until ?? null,
    questions: flattenSectionsToQuestions(raw.sections ?? []),
  };
}

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

async function validateKioskAdminPin(pin: string, locationId: string) {
  return supabase.rpc("validate_admin_pin", {
    p_pin: pin,
    p_location_id: locationId,
  });
}
async function fetchKioskChecklists(locationId: string) {
  const { data, error } = await supabase.rpc("get_kiosk_checklists", { p_location_id: locationId });
  if (error) throw error;
  return (data ?? []).map(dbToKioskChecklist);
}

function parseTimeToMinutes(time: string | null | undefined): number | null {
  if (!time) return null;
  const [h, m] = time.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

/**
 * Legacy due_time helper kept for older checklists that still use the old
 * single-time visibility model.
 */
export function isKioskDue(due_time: string | null | undefined, now: Date): boolean {
  if (!due_time) return true;
  const [h, m] = due_time.split(":").map(Number);
  const dueMinutes = h * 60 + m;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  // Show from 1 hour before due (dueMinutes - 60) through end of day
  return nowMinutes >= dueMinutes - 60 && nowMinutes <= dueMinutes;
}

export function isKioskOverdue(due_time: string | null | undefined, now: Date): boolean {
  if (!due_time) return false;
  const [h, m] = due_time.split(":").map(Number);
  const dueMinutes = h * 60 + m;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  return nowMinutes > dueMinutes;
}

export function getKioskVisibilityState(
  checklist: Pick<KioskChecklist, "due_time" | "visibility_from" | "visibility_until">,
  now: Date
): "due" | "upcoming" | "overdue" {
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const fromMinutes = parseTimeToMinutes(checklist.visibility_from);
  const untilMinutes = parseTimeToMinutes(checklist.visibility_until);

  if (fromMinutes != null || untilMinutes != null) {
    const start = fromMinutes ?? 0;
    const end = untilMinutes ?? 24 * 60 - 1;
    if (start <= end) {
      if (nowMinutes < start) return "upcoming";
      if (nowMinutes > end) return "overdue";
      return "due";
    }
    // Overnight visibility window: visible from start through midnight, and
    // from midnight through end.
    if (nowMinutes >= start || nowMinutes <= end) return "due";
    return nowMinutes < start ? "upcoming" : "overdue";
  }

  if (checklist.due_time) {
    if (isKioskDue(checklist.due_time, now)) return "due";
    if (isKioskOverdue(checklist.due_time, now)) return "overdue";
    return "upcoming";
  }

  return "due";
}

/** @deprecated — kept for test compatibility; use isKioskDue instead */
export function isVisibleAtTime(tod: TimeOfDay, now: Date): boolean {
  if (tod === "anytime") return true;
  const h = now.getHours();
  if (tod === "morning")   return h >= 5  && h < 12;
  if (tod === "afternoon") return h >= 12 && h < 17;
  if (tod === "evening")   return h >= 17 && h < 22;
  return true;
}

// ─── useLiveClock ─────────────────────────────────────────────────────────────
function useLiveClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    if (import.meta.env.TEST) return;
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

// ─── useInactivityTimer ───────────────────────────────────────────────────────
function useInactivityTimer(active: boolean, onTimeout: () => void) {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const stateRef = useRef({
    inCountdown: false,
    mainTimer: null as ReturnType<typeof setTimeout> | null,
    countdownTimer: null as ReturnType<typeof setInterval> | null,
  });
  const onTimeoutRef = useRef(onTimeout);
  const cancelFnRef = useRef<() => void>(() => {});
  onTimeoutRef.current = onTimeout;

  useEffect(() => {
    if (!active || import.meta.env.TEST) return;
    const s = stateRef.current;

    const startCountdown = () => {
      s.inCountdown = true;
      setSecondsLeft(10);
      s.countdownTimer = setInterval(() => {
        setSecondsLeft(prev => {
          if (prev === null || prev <= 1) {
            clearInterval(s.countdownTimer!);
            s.countdownTimer = null;
            onTimeoutRef.current();
            return null;
          }
          return prev - 1;
        });
      }, 1000);
    };

    const reset = () => {
      if (s.inCountdown) return;
      if (s.mainTimer) clearTimeout(s.mainTimer);
      s.mainTimer = setTimeout(startCountdown, 80000);
    };

    cancelFnRef.current = () => {
      s.inCountdown = false;
      if (s.countdownTimer) clearInterval(s.countdownTimer);
      s.countdownTimer = null;
      setSecondsLeft(null);
      reset();
    };

    reset();
    const events = ["mousemove", "keydown", "touchstart", "click"] as const;
    events.forEach(e => window.addEventListener(e, reset));

    return () => {
      events.forEach(e => window.removeEventListener(e, reset));
      if (s.mainTimer) clearTimeout(s.mainTimer);
      if (s.countdownTimer) clearInterval(s.countdownTimer);
      s.inCountdown = false;
    };
  }, [active]);

  return { secondsLeft, cancelCountdown: () => cancelFnRef.current() };
}

function KioskSetupScreen({
  onSetup,
  presetLocations,
}: {
  onSetup: (locationId: string, locationName: string) => void;
  presetLocations?: { id: string; name: string }[];
}) {
  const [locations, setLocations] = useState<{ id: string; name: string }[]>(presetLocations ?? []);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(!presetLocations);

  useEffect(() => {
    if (!presetLocations) return;
    setLocations(presetLocations);
    setSelectedId((current) => current || presetLocations[0]?.id || "");
    setLoading(false);
  }, [presetLocations]);

  useEffect(() => {
    if (presetLocations) return;
    supabase
      .from("locations")
      .select("id, name")
      .order("name")
      .then(({ data }) => {
        setLocations(data ?? []);
        setSelectedId(data?.[0]?.id ?? "");
        setLoading(false);
      });
  }, [presetLocations]);

  const handleLaunch = () => {
    const loc = locations.find(l => l.id === selectedId);
    onSetup(selectedId, loc?.name ?? "");
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 sm:px-8 lg:px-10">
      <div className="w-full max-w-sm">
        <div className="text-center mb-10">
          <div className="w-16 h-16 rounded-full bg-sage flex items-center justify-center mx-auto mb-5">
            <span className="text-white text-2xl font-bold font-display">O</span>
          </div>
          <h1 className="font-display text-3xl italic text-foreground tracking-tight">Olia Kiosk</h1>
          <p className="section-label mt-2 tracking-widest">Select a location to launch</p>
        </div>
        <div className="bg-card border border-border rounded-2xl p-6 space-y-5">
          <div>
            {loading ? (
              <p className="text-sm text-muted-foreground py-3 text-center">Loading locations…</p>
            ) : locations.length === 0 ? (
              <p className="text-sm text-muted-foreground py-3 text-center">
                No locations available. Please ask an admin to add one before launching the kiosk.
              </p>
            ) : (
              <select
                id="location-select"
                value={selectedId}
                onChange={e => setSelectedId(e.target.value)}
                className="w-full border border-border rounded-xl px-4 py-3 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-sage/30"
              >
                {locations.map(loc => (
                  <option key={loc.id} value={loc.id}>{loc.name}</option>
                ))}
              </select>
            )}
          </div>
          <button
            id="launch-kiosk-btn"
            onClick={handleLaunch}
            disabled={!selectedId || loading || locations.length === 0}
            className={cn(
              "w-full py-4 rounded-2xl text-sm font-bold tracking-widest transition-colors uppercase",
              selectedId && !loading && locations.length > 0
                ? "bg-sage text-white hover:bg-sage-deep"
                : "bg-muted text-muted-foreground cursor-not-allowed",
            )}
          >
            Launch Kiosk
          </button>
        </div>
        <p className="text-center text-xs text-muted-foreground mt-6">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-status-ok inline-block" />
            System Online
          </span>
        </p>
      </div>
    </div>
  );
}

// ─── AdminLoginModal (centered) ───────────────────────────────────────────────
function AdminLoginModal({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const { teamMember } = useAuth();
  const { allLocations = [], isFetched: locationsFetched } = useLocations();
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const locationId = _kioskLocationId ?? localStorage.getItem("kiosk_location_id");
    if (!locationId) {
      setLoading(false);
      setError("Select a kiosk location before opening admin.");
      return;
    }

    if (teamMember?.organization_id && locationsFetched) {
      const locationStillAccessible = allLocations.some((location) => location.id === locationId);
      if (!locationStillAccessible) {
        clearKioskLocationSelection();
        setLoading(false);
        setError("This kiosk location is no longer linked to your account. Select a location again.");
        return;
      }
    }

    const { data, error: rpcError } = await validateKioskAdminPin(pin, locationId);

    setLoading(false);

    if (rpcError) {
      setError("Could not verify the admin PIN. Please try again.");
      return;
    }

    if (!data || data.length === 0) {
      setError("Invalid PIN.");
      return;
    }

    navigate(`/admin?from=kiosk&userId=${data[0].id}`);
  };

  const handlePinRecovery = async () => {
    onClose();
    if (teamMember) {
      navigate("/admin/account?from=kiosk&focus=pin");
      return;
    }

    await supabase.auth.signOut();
    navigate("/login?reason=reset-pin");
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-foreground/20 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      >
      <div className="bg-card w-full max-w-sm mx-4 rounded-2xl p-6 space-y-4 animate-fade-in">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg text-foreground">Admin PIN</h2>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-muted transition-colors">
            <X size={18} className="text-muted-foreground" />
          </button>
        </div>
        <form onSubmit={handleLogin} className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">PIN</label>
            <input
              id="admin-pin-input"
              autoFocus
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={pin}
              onChange={e => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
              placeholder="4-digit PIN"
              className="w-full border border-border rounded-xl px-4 py-3 text-sm bg-muted focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Use the admin PIN from your team-member profile to unlock the admin area.
          </p>
          {error && <p className="text-xs text-status-error">{error}</p>}
          <button
            id="admin-pin-signin-btn"
            type="submit"
            disabled={pin.length !== 4 || loading}
            className={cn(
              "w-full py-3 rounded-xl text-sm font-semibold transition-colors",
              pin.length === 4 && !loading
                ? "bg-sage text-primary-foreground hover:bg-sage-deep"
                : "bg-muted text-muted-foreground cursor-not-allowed",
            )}
          >
            {loading ? "Checking…" : "Continue"}
          </button>
        </form>
        <p className="text-center text-xs text-muted-foreground pt-1">
          Forgot your PIN?{" "}
          <button
            onClick={() => { void handlePinRecovery(); }}
            className="text-sage font-medium hover:underline"
          >
            {teamMember ? "Reset it in Admin" : "Log out and sign in again"}
          </button>
        </p>
      </div>
    </div>
  );
}

// ─── PinDots ──────────────────────────────────────────────────────────────────
function PinDots({ count }: { count: number }) {
  return (
    <div className="flex gap-5 justify-center py-3">
      {[0, 1, 2, 3].map(i => (
        <div key={i} className={cn(
          "w-4 h-4 rounded-full border-2 transition-all duration-200",
          i < count ? "bg-sage border-sage scale-110" : "border-muted-foreground/30",
        )} />
      ))}
    </div>
  );
}

// ─── NumberPad ────────────────────────────────────────────────────────────────
function NumberPad({
  onDigit, onBackspace,
}: { onDigit: (d: string) => void; onBackspace: () => void }) {
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"];
  return (
    <div className="grid grid-cols-3 gap-3 px-2">
      {keys.map((key, i) => {
        if (key === "") return <div key={i} />;
        if (key === "⌫") return (
          <button
            key={i} type="button" onClick={onBackspace}
            className="h-16 w-16 mx-auto rounded-full bg-muted text-muted-foreground text-base flex items-center justify-center transition-all active:scale-95 active:bg-muted/60"
          >
            ⌫
          </button>
        );
        return (
          <button
            key={i} type="button" onClick={() => onDigit(key)}
            className="h-16 w-16 mx-auto rounded-full bg-white border border-border text-2xl font-light text-foreground transition-all active:scale-95 active:bg-muted shadow-sm"
          >
            {key}
          </button>
        );
      })}
    </div>
  );
}

// ─── PinEntryModal (Screen 2) ─────────────────────────────────────────────────
function PinEntryModal({
  checklist, locationId, onSuccess, onCancel,
}: {
  checklist: KioskChecklist;
  locationId: string;
  onSuccess: (staffId: string | null, staffName: string, orgId: string) => void;
  onCancel: () => void;
}) {
  const [pin, setPin] = useState("");
  const [attempts, setAttempts] = useState(0);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [lockSecondsLeft, setLockSecondsLeft] = useState(0);
  const [error, setError] = useState("");
  const [validating, setValidating] = useState(false);

  const { secondsLeft, cancelCountdown } = useInactivityTimer(true, onCancel);
  const { teamMember } = useAuth();
  const { allLocations = [] } = useLocations();

  // Lock countdown
  useEffect(() => {
    if (!lockedUntil) return;
    if (import.meta.env.TEST) {
      setLockSecondsLeft(Math.max(0, Math.ceil((lockedUntil - Date.now()) / 1000)));
      return;
    }
    const id = setInterval(() => {
      const remaining = Math.ceil((lockedUntil - Date.now()) / 1000);
      if (remaining <= 0) {
        clearInterval(id);
        setLockedUntil(null);
        setAttempts(0);
        setLockSecondsLeft(0);
        setError("Please try again.");
      } else {
        setLockSecondsLeft(remaining);
      }
    }, 500);
    return () => clearInterval(id);
  }, [lockedUntil]);

  const validate = async (enteredPin: string) => {
    setValidating(true);
    const { data: adminData, error: adminRpcError } = await validateKioskAdminPin(enteredPin, locationId);
    setValidating(false);

    if (!adminRpcError && adminData && adminData.length > 0) {
      const admin = adminData[0];
      onSuccess(null, admin.name, admin.organization_id ?? "");
      return;
    }

    const canUseAuthenticatedAdminShortcut = Boolean(
      teamMember?.organization_id
      && allLocations.some((location) => location.id === locationId),
    );

    if (!adminRpcError && canUseAuthenticatedAdminShortcut && teamMember) {
      onSuccess(null, teamMember.name, teamMember.organization_id);
      return;
    }

    if (adminRpcError) {
      setPin("");
      setError("Connection error. Check your network and try again.");
      return;
    }

    const newAttempts = attempts + 1;
    setAttempts(newAttempts);
    setPin("");
    if (newAttempts >= 3) {
      const until = Date.now() + 30000;
      setLockedUntil(until);
      setLockSecondsLeft(30);
      setError("Please ask your manager for help.");
    } else {
      setError("PIN not recognised. Please try again.");
    }
  };

  const handleDigit = (d: string) => {
    if (lockedUntil || validating) return;
    const next = pin + d;
    setPin(next);
    setError("");
    if (next.length === 4) {
      setTimeout(() => validate(next), 150);
    }
  };

  const handleBackspace = () => {
    if (lockedUntil || validating) return;
    setPin(p => p.slice(0, -1));
  };

  const canStart = pin.length >= 4 && !validating && !lockedUntil;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-foreground/30 backdrop-blur-md">
      <div className="bg-white w-full max-w-[320px] mx-4 rounded-3xl p-6 space-y-4 animate-fade-in shadow-xl relative">
        {/* Close button */}
        <button
          onClick={onCancel}
          className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-muted hover:bg-muted/80 transition-colors text-muted-foreground"
          aria-label="Close"
        >
          <X size={16} />
        </button>

        {/* Title */}
        <div className="text-center pt-1 space-y-1">
          <h2 className="font-display text-3xl italic text-foreground">Insert PIN</h2>
          <p className="text-xs text-muted-foreground">You're doing great — let's get started.</p>
        </div>

        <PinDots count={pin.length} />

        {error && !validating && (
          <p className="text-xs text-center text-status-error font-medium">{error}</p>
        )}
        {validating && (
          <p className="text-xs text-center text-muted-foreground">Checking PIN…</p>
        )}

        {lockedUntil ? (
          <div className="text-center py-4">
            <p className="text-sm text-muted-foreground">
              Try again in <span className="font-bold text-foreground">{lockSecondsLeft}s</span>
            </p>
          </div>
        ) : (
          <NumberPad onDigit={handleDigit} onBackspace={handleBackspace} />
        )}

        <button
          id="pin-start-btn"
          onClick={() => canStart && validate(pin)}
          disabled={!canStart}
          className={cn(
            "w-full py-3.5 rounded-2xl font-bold tracking-widest text-sm transition-colors active:scale-[0.98]",
            canStart
              ? "bg-sage text-white hover:bg-sage-deep"
              : "bg-muted text-muted-foreground cursor-not-allowed",
          )}
        >
          START
        </button>
      </div>

      {secondsLeft !== null && (
        <div className="fixed bottom-0 left-0 right-0 bg-foreground/90 text-background px-5 py-3 flex items-center justify-between z-[70]">
          <p className="text-sm">Returning to home in {secondsLeft}s…</p>
          <button onClick={cancelCountdown} className="text-sm font-semibold underline">
            Stay
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Question Input Components ─────────────────────────────────────────────────

function CheckboxInput({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={cn(
        "w-full min-h-[44px] rounded-2xl border-2 px-5 py-4 text-left text-sm font-medium transition-colors flex items-center gap-3",
        value
          ? "bg-sage-light border-sage text-sage-deep"
          : "bg-card border-border text-foreground hover:border-sage/40",
      )}
    >
      <div className={cn(
        "w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors",
        value ? "bg-sage border-sage" : "border-muted-foreground/40",
      )}>
        {value && <Check size={12} className="text-primary-foreground" />}
      </div>
      {value ? "Yes, completed" : "Tap to confirm"}
    </button>
  );
}

function NumberInput({
  value, onChange, min, max, unit,
}: {
  value: number | "";
  onChange: (v: number | "") => void;
  min?: number;
  max?: number;
  unit?: "C" | "F";
}) {
  const num = value === "" ? 0 : Number(value);
  const hasRange = min != null || max != null;
  const outOfRange = hasRange && value !== "" && (
    (min != null && num < min) || (max != null && num > max)
  );
  return (
    <div className="space-y-1.5">
      <div className="flex items-center">
        <button
          onClick={() => onChange(num - 1)}
          className="w-14 min-h-[44px] bg-muted rounded-l-2xl border border-border text-xl font-semibold text-foreground hover:bg-muted/60 transition-colors flex items-center justify-center"
        >
          −
        </button>
        <input
          type="number"
          value={value}
          onChange={e => onChange(e.target.value === "" ? "" : Number(e.target.value))}
          className={cn(
            "flex-1 min-h-[44px] border-y border-border text-center text-xl font-semibold bg-card focus:outline-none",
            outOfRange && "text-status-error",
          )}
        />
        <button
          onClick={() => onChange(num + 1)}
          className="w-14 min-h-[44px] bg-muted rounded-r-2xl border border-border text-xl font-semibold text-foreground hover:bg-muted/60 transition-colors flex items-center justify-center"
        >
          +
        </button>
      </div>
      {hasRange && (
        <p className={cn(
          "text-[11px] text-center",
          outOfRange ? "text-status-error font-semibold" : "text-muted-foreground",
        )}>
          {outOfRange ? "⚠ Out of acceptable range · " : ""}
          Acceptable: {min != null ? min : "—"} – {max != null ? max : "—"}{unit ? ` ${unit}` : ""}
        </p>
      )}
    </div>
  );
}

function TextInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <textarea
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder="Type your answer here…"
      className="w-full min-h-[130px] border border-border rounded-xl px-4 py-3 text-sm bg-muted focus:outline-none focus:ring-1 focus:ring-ring resize-none"
    />
  );
}

function MultipleChoiceInput({
  options, optionColors, selectionMode = "single", value, onChange,
}: {
  options: string[];
  optionColors?: string[];
  selectionMode?: "single" | "multiple";
  value: string | string[];
  onChange: (v: string | string[]) => void;
}) {
  const selected = Array.isArray(value) ? value : value ? [value] : [];

  const toggleOption = (option: string) => {
    if (selectionMode === "multiple") {
      onChange(selected.includes(option)
        ? selected.filter(item => item !== option)
        : [...selected, option]);
      return;
    }

    onChange(option);
  };

  return (
    <div className="space-y-2">
      {options.map((opt, idx) => (
        <button
          key={opt}
          type="button"
          onClick={() => toggleOption(opt)}
          className={cn(
            "w-full min-h-[56px] rounded-xl border-2 px-4 py-3 text-sm text-left font-medium transition-colors",
            selected.includes(opt)
              ? "border-sage text-sage-deep"
              : "bg-card border-border text-foreground hover:border-sage/40",
            selected.includes(opt) && optionColors?.[idx],
            selected.includes(opt) && !optionColors?.[idx] && "bg-sage-light",
          )}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

function DateTimeInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  // Store date and time separately for clear mobile UX; combine on change
  const datePart = value ? value.slice(0, 10) : "";
  const timePart = value ? value.slice(11, 16) : "";
  const emit = (d: string, t: string) => onChange(d && t ? `${d}T${t}` : d ? `${d}T00:00` : "");
  return (
    <div className="space-y-2">
      <div>
        <label className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1 block">Date</label>
        <input
          type="date"
          value={datePart}
          onChange={e => emit(e.target.value, timePart)}
          className="w-full min-h-[44px] border border-border rounded-xl px-4 py-3 text-sm bg-muted focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>
      <div>
        <label className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1 block">Time</label>
        <input
          type="time"
          value={timePart}
          onChange={e => emit(datePart, e.target.value)}
          className="w-full min-h-[44px] border border-border rounded-xl px-4 py-3 text-sm bg-muted focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>
    </div>
  );
}

function InstructionBlock({
  text, imageUrl, linkedResourceTitle, linkedResourceSection, onImageClick, onLinkedResourceOpen,
}: {
  text: string;
  imageUrl?: string;
  linkedResourceTitle?: string;
  linkedResourceSection?: "library" | "training";
  onImageClick?: (url: string) => void;
  onLinkedResourceOpen?: () => void;
}) {
  return (
    <div className="min-h-[44px] bg-lavender-light rounded-xl px-5 py-4 space-y-3">
      {text && <p className="text-sm text-lavender-deep leading-relaxed">{text}</p>}
      {imageUrl && (
        <button
          type="button"
          onClick={() => onImageClick?.(imageUrl)}
          className="w-full relative group overflow-hidden rounded-lg focus:outline-none"
          aria-label="Tap to enlarge image"
        >
          <img
            src={imageUrl}
            alt="Instruction"
            className="w-full max-h-48 object-cover rounded-lg group-hover:opacity-90 transition-opacity"
          />
          <div className="absolute inset-0 flex items-end justify-end p-2 pointer-events-none">
            <span className="bg-foreground/60 text-background text-[10px] px-2 py-0.5 rounded-full font-medium">
              Tap to enlarge
            </span>
          </div>
        </button>
      )}
      {linkedResourceTitle && (
        <button
          type="button"
          onClick={onLinkedResourceOpen}
          className="w-full rounded-lg border border-lavender-deep/20 bg-background/70 px-4 py-3 text-left transition-colors hover:bg-background"
        >
          <p className="text-xs uppercase tracking-wide text-lavender-deep/70">
            Open linked {linkedResourceSection === "training" ? "training" : "document"}
          </p>
          <p className="text-sm font-medium text-lavender-deep mt-1">{linkedResourceTitle}</p>
        </button>
      )}
    </div>
  );
}

// ─── MediaInput ───────────────────────────────────────────────────────────────
// Live camera capture only. No file picker or library access is exposed.
function MediaInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [captured, setCaptured] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopStream = () => {
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    setStream(null);
  };

  useEffect(() => {
    if (!isOpen) {
      stopStream();
      setCaptured(null);
      setError("");
      return;
    }

    const mediaDevices = navigator.mediaDevices;
    if (!mediaDevices?.getUserMedia) {
      setError("Camera access is not available on this device.");
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false })
      .then(nextStream => {
        if (cancelled) {
          nextStream.getTracks().forEach(track => track.stop());
          return;
        }
        streamRef.current = nextStream;
        setStream(nextStream);
        setError("");
      })
      .catch(() => {
        if (!cancelled) setError("Camera access could not be started.");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!stream || !videoRef.current) return;
    videoRef.current.srcObject = stream;
    void videoRef.current.play().catch(() => {});
  }, [stream]);

  useEffect(() => () => stopStream(), []);

  const openCamera = () => {
    setCaptured(null);
    setError("");
    setIsOpen(true);
  };

  const closeCamera = () => {
    stopStream();
    setCaptured(null);
    setIsOpen(false);
  };

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    setCaptured(canvas.toDataURL("image/png"));
  };

  const useCapturedPhoto = () => {
    if (!captured) return;
    onChange(captured);
    closeCamera();
  };

  return (
    <div className="space-y-3">
      {value ? (
        <div className="space-y-2">
          <div className="relative rounded-xl overflow-hidden border border-border">
            <img src={value} alt="Captured" className="w-full max-h-52 object-cover" />
            <button
              type="button"
              onClick={() => onChange("")}
              className="absolute top-2 right-2 w-7 h-7 rounded-full bg-foreground/60 flex items-center justify-center"
              aria-label="Remove photo"
            >
              <X size={14} className="text-background" />
            </button>
          </div>
          <div className="flex items-center gap-2 text-xs font-medium text-sage">
            <Check size={14} />
            Photo attached
          </div>
          <button
            type="button"
            onClick={openCamera}
            className="text-xs font-medium text-sage hover:underline"
          >
            Retake photo
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={openCamera}
          className="w-full min-h-[80px] border-2 border-dashed border-border rounded-xl flex flex-col items-center justify-center gap-2 text-muted-foreground hover:border-sage hover:text-sage transition-colors"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/>
            <circle cx="12" cy="13" r="3"/>
          </svg>
          <span className="text-sm font-medium">Take photo</span>
          <span className="text-xs">Use the camera to capture this now</span>
        </button>
      )}

      {isOpen && (
        <div className="fixed inset-0 z-[80] bg-background/95 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-card shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div>
                <p className="text-sm font-semibold text-foreground">Capture photo</p>
                <p className="text-xs text-muted-foreground">Take a new photo now, then confirm it.</p>
              </div>
              <button
                type="button"
                onClick={closeCamera}
                className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted"
                aria-label="Close camera"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-4 space-y-4">
              {error ? (
                <div className="rounded-xl border border-status-error/30 bg-status-error/10 px-4 py-3 text-sm text-status-error">
                  {error}
                </div>
              ) : captured ? (
                <div className="space-y-3">
                  <img src={captured} alt="Captured preview" className="w-full rounded-xl border border-border max-h-[60vh] object-cover" />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setCaptured(null)}
                      className="flex-1 px-4 py-3 rounded-xl border border-border text-sm font-medium text-foreground hover:bg-muted"
                    >
                      Retake
                    </button>
                    <button
                      type="button"
                      onClick={useCapturedPhoto}
                      className="flex-1 px-4 py-3 rounded-xl bg-sage text-primary-foreground text-sm font-medium hover:bg-sage/90"
                    >
                      Use photo
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="rounded-xl overflow-hidden border border-border bg-black">
                    <video ref={videoRef} autoPlay playsInline muted className="w-full max-h-[60vh] object-cover" />
                  </div>
                  <canvas ref={canvasRef} className="hidden" />
                  {isLoading && (
                    <p className="text-xs text-muted-foreground">Starting camera…</p>
                  )}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={closeCamera}
                      className="flex-1 px-4 py-3 rounded-xl border border-border text-sm font-medium text-foreground hover:bg-muted"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={capturePhoto}
                      disabled={isLoading || !stream}
                      className="flex-1 px-4 py-3 rounded-xl bg-sage text-primary-foreground text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-sage/90"
                    >
                      Capture photo
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function QuestionInput({
  question, value, onChange, onImageClick, onLinkedResourceOpen,
}: {
  question: Question;
  value: any;
  onChange: (v: any) => void;
  onImageClick?: (url: string) => void;
  onLinkedResourceOpen?: () => void;
}) {
  switch (question.type) {
    case "checkbox":
      return <CheckboxInput value={!!value} onChange={onChange} />;
    case "media":
      return <MediaInput value={value ?? ""} onChange={onChange} />;
    case "number":
      return <NumberInput value={value ?? ""} onChange={onChange} min={question.min} max={question.max} unit={question.temperatureUnit} />;
    case "text":
      return <TextInput value={value ?? ""} onChange={onChange} />;
    case "multiple_choice":
      return (
        <MultipleChoiceInput
          options={question.options ?? []}
          optionColors={question.optionColors}
          selectionMode={question.selectionMode}
          value={value ?? (question.selectionMode === "multiple" ? [] : "")}
          onChange={onChange}
        />
      );
    case "datetime":
      return <DateTimeInput value={value ?? ""} onChange={onChange} />;
    case "instruction":
      return (
        <InstructionBlock
          text={question.instructionText ?? ""}
          imageUrl={question.imageUrl}
          linkedResourceTitle={question.linkedResourceTitle}
          linkedResourceSection={question.linkedResourceSection}
          onImageClick={onImageClick}
          onLinkedResourceOpen={onLinkedResourceOpen}
        />
      );
    default:
      return null;
  }
}

// ─── ChecklistRunner (Screen 3) ───────────────────────────────────────────────
// Shows ALL questions in a single scrollable view, grouped by sections.
// Answers are persisted to localStorage so progress survives interruptions.
function ChecklistRunner({
  checklist, staffName, onComplete, onCancel, onQuestionAnswerChange,
}: {
  checklist: KioskChecklist;
  staffName: string;
  onComplete: (answers: Record<string, any>, startedAt: Date) => void;
  onCancel: () => void;
  onQuestionAnswerChange?: (question: Question, value: any) => void;
}) {
  const DRAFT_KEY = `kiosk_draft_${checklist.id}`;

  // Initialise answers: start from defaultValues then overlay any saved draft
  const [answers, setAnswers] = useState<Record<string, any>>(() => {
    const defaults: Record<string, any> = {};
    for (const q of checklist.questions) {
      if (q.defaultValue) defaults[q.id] = q.defaultValue;
    }
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) return { ...defaults, ...JSON.parse(raw) };
    } catch { /* ignore */ }
    return defaults;
  });

  const hasSavedDraft = (() => {
    try { return !!localStorage.getItem(DRAFT_KEY); } catch { return false; }
  })();

  const [showDraftBanner, setShowDraftBanner] = useState(hasSavedDraft);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [completionError, setCompletionError] = useState<string | null>(null);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [linkedResourceId, setLinkedResourceId] = useState<string | null>(null);

  // Accordion: track which question is currently open/active
  const [currentQIdx, setCurrentQIdx] = useState<number>(() => {
    // Compute initial answers (same logic as the answers useState above)
    const defaults: Record<string, any> = {};
    for (const q of checklist.questions) {
      if (q.defaultValue) defaults[q.id] = q.defaultValue;
    }
    let ans = defaults;
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) ans = { ...defaults, ...JSON.parse(raw) };
    } catch { /* ignore */ }
    // Start at first unanswered non-instruction question
    for (let i = 0; i < checklist.questions.length; i++) {
      const q = checklist.questions[i];
      if (q.type === "instruction") continue;
      const v = ans[q.id];
      if (Array.isArray(v) ? v.length === 0 : (v === undefined || v === "" || v === null || v === false)) return i;
    }
    return Math.max(0, checklist.questions.length - 1);
  });

  // Track when the runner was opened (for PDF metadata)
  const startedAtRef = useRef(new Date());

  const { secondsLeft, cancelCountdown } = useInactivityTimer(true, onCancel);
  const now = useLiveClock();
  const timeStr = now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

  const questions = checklist.questions;
  const scorable = questions.filter(q => q.type !== "instruction");
  const answeredCount = scorable.filter(q => {
    const v = answers[q.id];
    return Array.isArray(v)
      ? v.length > 0
      : v !== undefined && v !== "" && v !== null && v !== false;
  }).length;
  const progress = scorable.length > 0 ? Math.round((answeredCount / scorable.length) * 100) : 100;

  // Persist answer immediately to localStorage
  const setAnswer = (id: string, v: any) => {
    setAnswers(prev => {
      const next = { ...prev, [id]: v };
      try { localStorage.setItem(DRAFT_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };

  // Move to the next question in the accordion
  const advanceQuestion = () => {
    setCurrentQIdx(prev => {
      const next = Math.min(prev + 1, questions.length - 1);
      // Scroll new current question into view after render
      setTimeout(() => {
        const nextQuestion = document.getElementById(`question-${questions[next]?.id}`);
        if (typeof nextQuestion?.scrollIntoView === "function") {
          nextQuestion.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }, 60);
      return next;
    });
  };

  // ESC key closes lightbox
  useEffect(() => {
    if (!lightboxImage) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setLightboxImage(null); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [lightboxImage]);

  const handleComplete = () => {
    const missing = questions.filter(q =>
      q.required && q.type !== "instruction" &&
      (Array.isArray(answers[q.id])
        ? answers[q.id].length === 0
        : answers[q.id] === undefined || answers[q.id] === "" ||
          answers[q.id] === null || answers[q.id] === false)
    );
    if (missing.length > 0) {
      setCompletionError(
        `${missing.length} required question${missing.length !== 1 ? "s" : ""} still need an answer.`
      );
      // Scroll to first missing question
      const firstMissingQuestion = document.getElementById(`question-${missing[0].id}`);
      firstMissingQuestion?.scrollIntoView?.({ behavior: "smooth", block: "center" });
      return;
    }
    // All required questions answered — clear draft and submit
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
    onComplete(answers, startedAtRef.current);
  };

  return (
    <div className="h-screen bg-background w-full min-[900px]:max-w-none mx-auto flex flex-col overflow-x-hidden">

      {/* ── Sticky header ── */}
      <div className="shrink-0 bg-background border-b border-border px-5 pt-5 pb-3">
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1 min-w-0 pr-4">
            <h2 className="font-display text-xl text-foreground leading-tight">{checklist.title}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{staffName} · {timeStr}</p>
          </div>
          <button
            onClick={() => setShowCancelConfirm(true)}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors shrink-0 mt-1"
          >
            Cancel
          </button>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-sage rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground shrink-0 w-20 text-right">
            {answeredCount}/{scorable.length} answered
          </p>
        </div>
      </div>

      {/* ── Draft-restored banner ── */}
      {showDraftBanner && (
        <div className="shrink-0 mx-5 mt-3">
          <div className="bg-sage/10 border border-sage/20 rounded-xl px-4 py-2.5 flex items-center justify-between">
            <p className="text-xs text-sage font-medium">Continuing from where you left off</p>
            <button
              onClick={() => setShowDraftBanner(false)}
              className="text-sage/60 hover:text-sage ml-2 p-0.5"
            >
              <X size={12} />
            </button>
          </div>
        </div>
      )}

      {/* ── Accordion questions ── */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2">
        {questions.map((q, qi) => {
          const isInstruction = q.type === "instruction";
          const isCurrent = qi === currentQIdx;
          const isPast = qi < currentQIdx;

          const isAnswered = isInstruction
            ? true
            : (Array.isArray(answers[q.id])
              ? answers[q.id].length > 0
              : answers[q.id] !== undefined && answers[q.id] !== "" &&
                 answers[q.id] !== null && answers[q.id] !== false);
          const isMissing = !!(completionError && q.required && !isAnswered && !isInstruction);

          // Inject a centered section divider when section changes
          const prevQ = qi > 0 ? questions[qi - 1] : null;
          const sectionChanged = !prevQ || prevQ.sectionName !== q.sectionName;
          const showSectionHeader = sectionChanged && !!(q.sectionName);

          // For next/acknowledge button: show on current question for types that don't auto-advance
          // "datetime" is legacy — if it resolves to "text" it's included via q.type === "text"
          const isLastQ = qi >= questions.length - 1;
          const needsNextBtn = isCurrent && !isLastQ && (
            isInstruction ||
            q.type === "text" ||
            q.type === "number" ||
            q.type === "datetime" ||
            q.type === "media" ||
            (!q.required && (q.type === "checkbox" || q.type === "multiple_choice"))
          );

          return (
            <Fragment key={q.id}>
              {/* ── Centered section header ── */}
              {showSectionHeader && (
                <div className={cn("flex items-center gap-3", qi === 0 ? "mb-1" : "mt-5 mb-1")}>
                  <div className="flex-1 h-px bg-border" />
                  <span className="section-label text-foreground/70 shrink-0">{q.sectionName}</span>
                  <div className="flex-1 h-px bg-border" />
                </div>
              )}

              {isCurrent ? (
                // ── Expanded (active) question ──
                <div
                  id={`question-${q.id}`}
                  className={cn(
                    "bg-card border rounded-2xl p-4 transition-colors shadow-sm",
                    isMissing
                      ? "border-status-error/50 bg-status-error/5 ring-1 ring-status-error/20"
                      : "border-sage/40 ring-1 ring-sage/15",
                  )}
                >
                  {!isInstruction && (
                    <div className="flex items-start gap-2.5 mb-3">
                      <div className={cn(
                        "w-5 h-5 rounded-full border-2 shrink-0 mt-0.5",
                        q.required ? "border-sage/50" : "border-muted-foreground/30",
                      )} />
                      <p className="text-sm font-semibold text-foreground leading-snug flex-1">
                        {q.text}
                        {q.required && <span className="text-status-error ml-1 font-bold">*</span>}
                      </p>
                      <span className="text-[10px] text-sage/70 font-medium shrink-0 mt-0.5">
                        {qi + 1}/{questions.length}
                      </span>
                    </div>
                  )}

                  <div className={cn(!isInstruction && "ml-7")}>
                    <QuestionInput
                      question={q}
                      value={answers[q.id]}
                      onChange={v => {
                        setAnswer(q.id, v);
                        onQuestionAnswerChange?.(q, v);
                        // Auto-advance for single-tap inputs
                        if (q.type === "checkbox" && v === true) advanceQuestion();
                        if (q.type === "multiple_choice" && q.selectionMode !== "multiple" && v) advanceQuestion();
                      }}
                      onImageClick={url => setLightboxImage(url)}
                      onLinkedResourceOpen={() => setLinkedResourceId(q.linkedResourceId ?? null)}
                    />
                  </div>

                  {needsNextBtn && (
                    <div className={cn("mt-3 flex justify-end", !isInstruction && "ml-7")}>
                      <button
                        onClick={advanceQuestion}
                        className="px-5 py-2 text-xs font-bold tracking-wide rounded-xl bg-sage text-white hover:bg-sage-deep transition-colors active:scale-[0.97]"
                      >
                        {isInstruction ? "Acknowledge" : "Next →"}
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                // ── Collapsed question (past = clickable, future = dimmed) ──
                <button
                  id={`question-${q.id}`}
                  type="button"
                  onClick={() => { if (isPast) setCurrentQIdx(qi); }}
                  disabled={!isPast}
                  className={cn(
                    "w-full bg-card border rounded-2xl px-4 py-3 text-left flex items-center gap-3 transition-colors",
                    isPast
                      ? "border-border hover:border-sage/30 cursor-pointer"
                      : "border-border opacity-40 cursor-default",
                    isMissing && "border-status-error/40 bg-status-error/5",
                  )}
                >
                  {isPast && isAnswered ? (
                    <div className="w-5 h-5 rounded-full bg-sage flex items-center justify-center shrink-0">
                      <Check size={11} className="text-white" />
                    </div>
                  ) : (
                    <div className={cn(
                      "w-5 h-5 rounded-full border-2 shrink-0",
                      isMissing ? "border-status-error/50" : "border-muted-foreground/25",
                    )} />
                  )}
                  <p className={cn(
                    "text-sm font-medium truncate flex-1",
                    isPast ? "text-foreground" : "text-muted-foreground",
                  )}>
                    {isInstruction ? (q.instructionText ?? q.text ?? "Note") : q.text}
                    {q.required && !isInstruction && <span className="text-status-error ml-1">*</span>}
                  </p>
                  {isPast && isAnswered && (
                    <span className="text-[10px] text-sage font-semibold shrink-0">✓ Done</span>
                  )}
                  {isPast && !isAnswered && !isInstruction && (
                    <span className="text-[10px] text-muted-foreground/60 shrink-0">Edit</span>
                  )}
                  {!isPast && (
                    <span className="text-[10px] text-muted-foreground/50 shrink-0">Pending</span>
                  )}
                </button>
              )}
            </Fragment>
          );
        })}

        {/* Bottom padding so the last card clears the sticky footer */}
        <div className="h-4" />
      </div>

      {/* ── Sticky footer ── */}
      <div className="shrink-0 bg-background border-t border-border px-5 py-4 space-y-2.5">
        {completionError && (
          <div className="bg-status-error/10 border border-status-error/20 rounded-xl px-4 py-2.5 text-xs text-status-error font-medium text-center">
            {completionError}
          </div>
        )}
        <button
          id="runner-complete-btn"
          onClick={handleComplete}
          className="w-full py-4 rounded-2xl text-sm font-bold tracking-wide bg-sage text-white hover:bg-sage-deep transition-colors flex items-center justify-center gap-2 active:scale-[0.98]"
        >
          <Check size={16} />
          Complete Checklist
        </button>
      </div>

      {/* ── Image lightbox ── */}
      {lightboxImage && (
        <div
          className="fixed inset-0 z-[90] bg-foreground/95 flex items-center justify-center p-4"
          onClick={() => setLightboxImage(null)}
        >
          <button
            onClick={() => setLightboxImage(null)}
            className="absolute top-5 right-5 w-10 h-10 rounded-full bg-background/20 hover:bg-background/30 flex items-center justify-center transition-colors"
            aria-label="Close"
          >
            <X size={20} className="text-background" />
          </button>
          <img
            src={lightboxImage}
            alt="Full view"
            className="max-w-full max-h-full object-contain rounded-xl"
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}

      {linkedResourceId && (() => {
        const resource = getLinkableInfohubResource(linkedResourceId);
        if (!resource) return null;

        return (
          <div
            className="fixed inset-0 z-[80] flex items-end justify-center bg-foreground/30 backdrop-blur-sm"
            onClick={() => setLinkedResourceId(null)}
          >
            <div
              className="bg-card w-full max-w-2xl rounded-t-2xl max-h-[80vh] overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-border">
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{resource.section}</p>
                  <h3 className="text-base font-semibold text-foreground mt-1">{resource.title}</h3>
                  <p className="text-xs text-muted-foreground mt-1">{resource.subtitle}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setLinkedResourceId(null)}
                  className="p-2 rounded-full hover:bg-muted transition-colors"
                  aria-label="Close linked resource"
                >
                  <X size={16} className="text-muted-foreground" />
                </button>
              </div>
              <div className="px-5 py-4 overflow-y-auto max-h-[60vh]">
                <div className="whitespace-pre-line text-sm text-foreground leading-relaxed">
                  {resource.body}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Cancel confirm ── */}
      {showCancelConfirm && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-foreground/30 backdrop-blur-sm">
          <div className="bg-card rounded-2xl p-6 mx-4 max-w-sm w-full space-y-4">
            <h3 className="font-display text-lg text-foreground">Cancel checklist?</h3>
            <p className="text-sm text-muted-foreground">
              Your answers are saved as a draft. You can pick up where you left off next time.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowCancelConfirm(false)}
                className="flex-1 py-3 rounded-xl text-sm font-medium border border-border text-foreground hover:bg-muted transition-colors"
              >
                Keep going
              </button>
              <button
                onClick={onCancel}
                className="flex-1 py-3 rounded-xl text-sm font-medium bg-status-error text-primary-foreground hover:opacity-90 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Inactivity countdown ── */}
      {secondsLeft !== null && (
        <div className="fixed bottom-0 left-0 right-0 bg-foreground/90 text-background px-5 py-3 flex items-center justify-between z-[80]">
          <p className="text-sm">Returning to home in {secondsLeft}s…</p>
          <button onClick={cancelCountdown} className="text-sm font-semibold underline">Stay</button>
        </div>
      )}
    </div>
  );
}

// ─── CompletionScreen (Screen 4) ──────────────────────────────────────────────
function CompletionScreen({
  checklist, staffName, completedAt, onDone,
}: {
  checklist: KioskChecklist;
  staffName: string;
  completedAt: Date;
  onDone: () => void;
}) {
  const [countdown, setCountdown] = useState(10);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    if (import.meta.env.TEST) return;
    const id = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) { clearInterval(id); onDoneRef.current(); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const timeStr = completedAt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const dateStr = completedAt.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

  return (
    <div className="min-h-screen bg-background w-full min-[900px]:max-w-none mx-auto flex flex-col items-center justify-center px-6 text-center">
      <div className="w-20 h-20 rounded-full bg-sage-light flex items-center justify-center mb-6">
        <Check size={36} className="text-sage" />
      </div>
      <h2 className="font-display text-4xl italic text-foreground mb-1">Well done!</h2>
      <p className="text-sm italic text-muted-foreground mb-5">Every completed checklist keeps the team running smoothly.</p>
      <p className="text-base font-medium text-foreground mb-1">{checklist.title}</p>
      <p className="text-sm text-muted-foreground mb-1">{staffName}</p>
      <p className="text-xs text-muted-foreground/70 mb-8">{dateStr} · {timeStr}</p>
      <button
        onClick={onDone}
        className="w-full max-w-xs py-3 rounded-xl text-sm font-semibold bg-sage text-primary-foreground hover:bg-sage-deep transition-colors"
      >
        Done
      </button>
      <p className="text-xs text-muted-foreground/60 mt-4">Returning to home in {countdown}s</p>
    </div>
  );
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
  const navigate = useNavigate();
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

  const canUseAuthenticatedAdminShortcut = Boolean(
    teamMember?.organization_id
    && locationId
    && allLocations.some((location) => location.id === locationId),
  );

  const handleChecklistSelect = (checklist: KioskChecklist) => {
    setSelectedChecklist(checklist);
    if (canUseAuthenticatedAdminShortcut && teamMember) {
      handleStart(null, teamMember.name, teamMember.organization_id);
    }
  };

  const handleAdminButtonClick = () => {
    if (canUseAuthenticatedAdminShortcut) {
      navigate("/admin?from=kiosk");
      return;
    }
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
        onQuestionAnswerChange={(question, value) => {
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
      {showAdminLogin && <AdminLoginModal onClose={() => setShowAdminLogin(false)} />}
    </div>
  );
}
