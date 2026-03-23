import { useState, useEffect, useRef, Fragment } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { X, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { enqueueLog, drainQueue } from "@/lib/submission-queue";
import { useAuth } from "@/contexts/AuthContext";

// ─── Module-level persistence (survives in-app navigation) ───────────────────
let _kioskLocationId: string | null = null;
let _kioskLocationName: string | null = null;

// ─── Types ────────────────────────────────────────────────────────────────────
type TimeOfDay = "morning" | "afternoon" | "evening" | "anytime";
type QuestionType = "checkbox" | "text" | "number" | "multiple_choice" | "datetime" | "instruction";

interface Question {
  id: string;
  text: string;
  type: QuestionType;
  required?: boolean;        // if true, must be answered before "Complete" is allowed
  options?: string[];
  instructionText?: string;
  imageUrl?: string;         // for instruction-type image
  sectionName?: string;      // section this question belongs to (for dividers in runner)
  defaultValue?: string;     // pre-fill value (used for person type defaultPerson)
  min?: number;              // number questions: acceptable range minimum
  max?: number;              // number questions: acceptable range maximum
}

interface KioskChecklist {
  id: string;
  title: string;
  location_id: string | null;
  time_of_day: TimeOfDay;
  due_time: string | null;   // HH:MM — kiosk visibility based on this
  questions: Question[];
}

type KioskScreen = "grid" | "runner" | "completion";

// ─── DB → Kiosk conversion ────────────────────────────────────────────────────

const SUPPORTED_QUESTION_TYPES: QuestionType[] = [
  "checkbox", "text", "number", "multiple_choice", "datetime", "instruction",
];

/**
 * Flatten SectionDef[] (stored as JSONB in `checklists.sections`) into
 * the kiosk's flat Question[].
 */
function flattenSectionsToQuestions(sections: any[]): Question[] {
  return (sections ?? []).flatMap((section: any) =>
    (section.questions ?? []).map((q: any): Question => {
      // "person" type: stored choices were baked in at builder time — render as multiple_choice
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
        instructionText: q.config?.instructionText,
        imageUrl: q.config?.instructionImageUrl,
        sectionName: section.name || "",
        // For person type: carry the builder's default so the runner can pre-fill it
        defaultValue: isPerson ? (q.config?.defaultPerson ?? "") : "",
        // Number range: set in builder as config.numberMin / config.numberMax
        min: q.config?.numberMin != null ? Number(q.config.numberMin) : undefined,
        max: q.config?.numberMax != null ? Number(q.config.numberMax) : undefined,
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
    questions: flattenSectionsToQuestions(raw.sections ?? []),
  };
}

/**
 * Returns true if a checklist is DUE (should show prominently in the kiosk).
 * DUE = no due_time (always on) OR due_time is within the next 2 hours OR already past due today.
 */
export function isKioskDue(due_time: string | null | undefined, now: Date): boolean {
  if (!due_time) return true;
  const [h, m] = due_time.split(":").map(Number);
  const dueMinutes = h * 60 + m;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  // Show from 1 hour before due (dueMinutes - 60) through end of day
  return nowMinutes >= dueMinutes - 60;
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
    if (!active) return;
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

// ─── KioskSetupScreen ─────────────────────────────────────────────────────────
// Fallback locations used when Supabase returns no data (offline / dev environment)
const MOCK_LOCATIONS = [
  { id: "00000000-0000-0000-0000-000000000011", name: "Location 1" },
  { id: "00000000-0000-0000-0000-000000000010", name: "Location 2" },
];

function KioskSetupScreen({ onSetup }: { onSetup: (locationId: string, locationName: string) => void }) {
  const [locations, setLocations] = useState<{ id: string; name: string }[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("locations")
      .select("id, name")
      .order("name")
      .then(({ data }) => {
        if (data && data.length > 0) {
          setLocations(data);
          setSelectedId(data[0].id);
        } else {
          // Fallback to mock locations (offline / test environment)
          setLocations(MOCK_LOCATIONS);
          setSelectedId(MOCK_LOCATIONS[0].id);
        }
        setLoading(false);
      });
  }, []);

  const handleLaunch = () => {
    const loc = locations.find(l => l.id === selectedId);
    onSetup(selectedId, loc?.name ?? "");
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6">
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
              <p className="text-sm text-muted-foreground py-3 text-center">No locations found. Please log in as an admin first.</p>
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
  const { user } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  // Set to true after a successful signInWithPassword call.
  // The useEffect below watches for the auth context to update (user becomes
  // non-null) BEFORE navigating — this prevents ProtectedRoute from
  // redirecting back to /kiosk because auth state hadn't updated yet.
  const [loginSuccess, setLoginSuccess] = useState(false);

  useEffect(() => {
    if (loginSuccess && user) {
      navigate("/admin");
    }
  }, [loginSuccess, user, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    setLoading(false);

    if (authError) {
      setError("Invalid email or password.");
      return;
    }

    // Don't navigate immediately — wait for onAuthStateChange to fire and
    // update the auth context, then the useEffect above handles navigation.
    setLoginSuccess(true);
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-foreground/20 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-card w-full max-w-sm mx-4 rounded-2xl p-6 space-y-4 animate-fade-in">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg text-foreground">Admin login</h2>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-muted transition-colors">
            <X size={18} className="text-muted-foreground" />
          </button>
        </div>
        <form onSubmit={handleLogin} className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Email</label>
            <input
              id="admin-email-input"
              autoFocus type="email" value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="your@email.com"
              className="w-full border border-border rounded-xl px-4 py-3 text-sm bg-muted focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Password</label>
            <input
              id="admin-password-input"
              type="password" value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full border border-border rounded-xl px-4 py-3 text-sm bg-muted focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          {error && <p className="text-xs text-status-error">{error}</p>}
          <button
            id="admin-signin-btn"
            type="submit"
            disabled={!email.trim() || !password || loading}
            className={cn(
              "w-full py-3 rounded-xl text-sm font-semibold transition-colors",
              email.trim() && password && !loading
                ? "bg-sage text-primary-foreground hover:bg-sage-deep"
                : "bg-muted text-muted-foreground cursor-not-allowed",
            )}
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <p className="text-center text-xs text-muted-foreground pt-1">
          New to Olia?{" "}
          <button
            onClick={() => { onClose(); navigate("/signup"); }}
            className="text-sage font-medium hover:underline"
          >
            Create an account
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
  onSuccess: (staffId: string, staffName: string, orgId: string) => void;
  onCancel: () => void;
}) {
  const [pin, setPin] = useState("");
  const [attempts, setAttempts] = useState(0);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [lockSecondsLeft, setLockSecondsLeft] = useState(0);
  const [error, setError] = useState("");
  const [validating, setValidating] = useState(false);

  const { secondsLeft, cancelCountdown } = useInactivityTimer(true, onCancel);

  // Lock countdown
  useEffect(() => {
    if (!lockedUntil) return;
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
    const { data, error: rpcError } = await supabase.rpc("validate_staff_pin", {
      p_pin: enteredPin,
      p_location_id: locationId,
    });
    setValidating(false);

    if (!rpcError && data && data.length > 0) {
      const staff = data[0];
      onSuccess(staff.id, `${staff.first_name} ${staff.last_name}`, staff.organization_id ?? "");
      return;
    }

    // Distinguish network / server errors from a simple wrong PIN so we don't
    // burn the user's attempt allowance on connectivity issues.
    if (rpcError) {
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
  value, onChange, min, max,
}: { value: number | ""; onChange: (v: number | "") => void; min?: number; max?: number }) {
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
          Acceptable: {min != null ? min : "—"} – {max != null ? max : "—"}
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
  options, value, onChange,
}: { options: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-2">
      {options.map(opt => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          className={cn(
            "w-full min-h-[56px] rounded-xl border-2 px-4 py-3 text-sm text-left font-medium transition-colors",
            value === opt
              ? "bg-sage-light border-sage text-sage-deep"
              : "bg-card border-border text-foreground hover:border-sage/40",
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
  text, imageUrl, onImageClick,
}: { text: string; imageUrl?: string; onImageClick?: (url: string) => void }) {
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
    </div>
  );
}

function QuestionInput({
  question, value, onChange, onImageClick,
}: {
  question: Question;
  value: any;
  onChange: (v: any) => void;
  onImageClick?: (url: string) => void;
}) {
  switch (question.type) {
    case "checkbox":
      return <CheckboxInput value={!!value} onChange={onChange} />;
    case "number":
      return <NumberInput value={value ?? ""} onChange={onChange} min={question.min} max={question.max} />;
    case "text":
      return <TextInput value={value ?? ""} onChange={onChange} />;
    case "multiple_choice":
      return <MultipleChoiceInput options={question.options ?? []} value={value ?? ""} onChange={onChange} />;
    case "datetime":
      return <DateTimeInput value={value ?? ""} onChange={onChange} />;
    case "instruction":
      return (
        <InstructionBlock
          text={question.instructionText ?? ""}
          imageUrl={question.imageUrl}
          onImageClick={onImageClick}
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
  checklist, staffName, onComplete, onCancel,
}: {
  checklist: KioskChecklist;
  staffName: string;
  onComplete: (answers: Record<string, any>, startedAt: Date) => void;
  onCancel: () => void;
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
      if (v === undefined || v === "" || v === null || v === false) return i;
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
    return v !== undefined && v !== "" && v !== null && v !== false;
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
        document.getElementById(`question-${questions[next]?.id}`)
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
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
      (answers[q.id] === undefined || answers[q.id] === "" ||
       answers[q.id] === null || answers[q.id] === false)
    );
    if (missing.length > 0) {
      setCompletionError(
        `${missing.length} required question${missing.length !== 1 ? "s" : ""} still need an answer.`
      );
      // Scroll to first missing question
      document.getElementById(`question-${missing[0].id}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    // All required questions answered — clear draft and submit
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
    onComplete(answers, startedAtRef.current);
  };

  return (
    <div className="h-screen bg-background max-w-lg mx-auto flex flex-col overflow-x-hidden">

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
            : (answers[q.id] !== undefined && answers[q.id] !== "" &&
               answers[q.id] !== null && answers[q.id] !== false);
          const isMissing = !!(completionError && q.required && !isAnswered && !isInstruction);

          // Inject a centered section divider when section changes
          const prevQ = qi > 0 ? questions[qi - 1] : null;
          const sectionChanged = !prevQ || prevQ.sectionName !== q.sectionName;
          const showSectionHeader = sectionChanged && !!(q.sectionName);

          // For next/acknowledge button: show on current question for types that don't auto-advance
          const needsNextBtn = isCurrent && (
            isInstruction || q.type === "text" || q.type === "number" || q.type === "datetime"
          );
          const isLastQ = qi >= questions.length - 1;

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
                        // Auto-advance for single-tap inputs
                        if (q.type === "checkbox" && v === true) advanceQuestion();
                        if (q.type === "multiple_choice" && v) advanceQuestion();
                      }}
                      onImageClick={url => setLightboxImage(url)}
                    />
                  </div>

                  {needsNextBtn && !isLastQ && (
                    <div className={cn("mt-3", !isInstruction && "ml-7")}>
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
    <div className="min-h-screen bg-background max-w-lg mx-auto flex flex-col items-center justify-center px-6 text-center">
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
        {cl.due_time && (
          <p className="text-[10px] text-muted-foreground/70 mt-0.5">
            Due {formatDueTime(cl.due_time)}
          </p>
        )}
      </div>
    </button>
  );
}

// ─── Kiosk Page ───────────────────────────────────────────────────────────────
export default function Kiosk() {
  const [searchParams] = useSearchParams();

  const [locationId, setLocationId] = useState<string | null>(() => {
    const url = searchParams.get("locationId");
    if (url) { _kioskLocationId = url; return url; }
    const stored = localStorage.getItem("kiosk_location_id");
    if (stored) { _kioskLocationId = stored; return stored; }
    return _kioskLocationId;
  });
  const [locationName, setLocationName] = useState<string>(() => {
    return localStorage.getItem("kiosk_location_name") ?? _kioskLocationName ?? "";
  });
  const [screen, setScreen] = useState<KioskScreen>("grid");
  const [selectedChecklist, setSelectedChecklist] = useState<KioskChecklist | null>(null);
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);
  const [selectedStaffName, setSelectedStaffName] = useState<string>("");
  const [selectedOrgId, setSelectedOrgId] = useState<string>("");
  const [completedAt, setCompletedAt] = useState<Date | null>(null);
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [insertError, setInsertError] = useState<string | null>(null);
  // Issue 4: Default tab is "due"; switch to "done" to see completed
  const [kioskTab, setKioskTab] = useState<"due" | "done">("due");

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

  // ── Real checklists from Supabase ──────────────────────────────────────────
  const [kioskChecklists, setKioskChecklists] = useState<KioskChecklist[]>([]);
  const [checklistsLoading, setChecklistsLoading] = useState(false);
  const [checklistsError, setChecklistsError] = useState<string | null>(null);

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
  }, [locationId]);

  // Fetch checklists for the selected location whenever it changes
  useEffect(() => {
    if (!locationId) return;
    setChecklistsLoading(true);
    setChecklistsError(null);
    supabase
      .rpc("get_kiosk_checklists", { p_location_id: locationId })
      .then(({ data, error }) => {
        if (error) {
          console.error("get_kiosk_checklists failed:", error.message);
          setChecklistsError("Could not load checklists. Check your connection and try again.");
        } else {
          setKioskChecklists((data ?? []).map(dbToKioskChecklist));
        }
        setChecklistsLoading(false);
      });
  }, [locationId]);

  const handleSetup = (id: string, name: string) => {
    _kioskLocationId = id;
    _kioskLocationName = name;
    localStorage.setItem("kiosk_location_id", id);
    localStorage.setItem("kiosk_location_name", name);
    setLocationId(id);
    setLocationName(name);
  };

  const handleStart = (staffId: string, staffName: string, orgId: string) => {
    setSelectedStaffId(staffId);
    setSelectedStaffName(staffName);
    setSelectedOrgId(orgId);
    setScreen("runner");
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

      const logPayload = {
        organization_id: selectedOrgId,
        checklist_id: selectedChecklist.id,
        checklist_title: selectedChecklist.title,
        completed_by: selectedStaffName,
        staff_profile_id: selectedStaffId ?? null,
        location_id: locationId ?? null,   // column added by migration 20260312000001
        score,
        answers: answerPayload,
      };

      const { error: dbInsertError } = await supabase.from("checklist_logs").insert(logPayload);
      if (dbInsertError) {
        // Queue for retry — the submission will be retried on next kiosk load
        const msg = dbInsertError.message ?? "Unknown error";
        console.error("Checklist log insert failed, queuing for retry:", msg);
        setInsertError(`Submission queued (offline/error): ${msg}`);
        enqueueLog(logPayload);
      }

      // Issue 7: Fire alert for any number answers outside their acceptable range
      const outOfRangeAnswers = selectedChecklist.questions.filter(q => {
        if (q.type !== "number" || (q.min == null && q.max == null)) return false;
        const v = Number(answers[q.id]);
        if (isNaN(v)) return false;
        return (q.min != null && v < q.min) || (q.max != null && v > q.max);
      });
      if (outOfRangeAnswers.length > 0) {
        const timeLabel = now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
        for (const q of outOfRangeAnswers) {
          const val = answers[q.id];
          const rangeStr = [q.min != null ? `min ${q.min}` : null, q.max != null ? `max ${q.max}` : null]
            .filter(Boolean).join(", ");
          // Insert alert — requires anon_kiosk_insert_alerts policy (migration 20260323000002)
          await supabase.from("alerts").insert({
            organization_id: selectedOrgId,
            type: "warn",
            message: `Out-of-range value recorded: "${q.text}" = ${val} (${rangeStr})`,
            area: selectedChecklist.title,
            time: timeLabel,
            source: "kiosk",
          });
        }
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
  if (!locationId) return <KioskSetupScreen onSetup={handleSetup} />;

  // Split checklists by state — completed items leave Due/Upcoming immediately
  const dueChecklists = kioskChecklists.filter(c => isKioskDue(c.due_time, now) && !completedIds.has(c.id));
  const upcomingChecklists = kioskChecklists.filter(c => !isKioskDue(c.due_time, now) && !completedIds.has(c.id));
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
    <div className="min-h-screen bg-background max-w-lg mx-auto flex flex-col">
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
          onClick={() => setShowAdminLogin(true)}
          className="text-xs font-semibold text-muted-foreground border border-border rounded-full px-3 py-1.5 hover:bg-muted transition-colors ml-2 shrink-0"
        >
          Admin
        </button>
      </div>

      {/* Agenda heading */}
      <div className="px-5 pt-6 pb-2">
        <h1 className="font-display text-3xl italic text-foreground leading-tight">
          What's on the agenda<br />for today?
        </h1>

        {/* Stat strip — DUE / UPCOMING / DONE (Done is a tab toggle) */}
        <div className="grid grid-cols-3 gap-2 mt-5">
          <button
            onClick={() => setKioskTab("due")}
            className={cn(
              "bg-card border rounded-2xl px-3 py-3 text-center transition-colors",
              kioskTab === "due" ? "border-status-error/50 ring-1 ring-status-error/20" : "border-border",
            )}
          >
            <p className="section-label mb-1">Due now</p>
            <p className="text-2xl font-bold text-status-error">{dueChecklists.length}</p>
          </button>
          <div className="bg-card border border-border rounded-2xl px-3 py-3 text-center">
            <p className="section-label mb-1">Upcoming</p>
            <p className="text-2xl font-bold text-status-warn">{upcomingChecklists.length}</p>
          </div>
          <button
            onClick={() => setKioskTab(t => t === "done" ? "due" : "done")}
            className={cn(
              "bg-card border rounded-2xl px-3 py-3 text-center transition-colors",
              kioskTab === "done" ? "border-status-ok/50 ring-1 ring-status-ok/20" : "border-border",
            )}
          >
            <p className="section-label mb-1">Done</p>
            <p className="text-2xl font-bold text-status-ok">{doneChecklists.length}</p>
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
      <div className="px-5 flex-1 pb-6 mt-2">
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
                supabase
                  .rpc("get_kiosk_checklists", { p_location_id: locationId! })
                  .then(({ data, error }) => {
                    if (error) setChecklistsError("Retry failed. Check your connection.");
                    else setKioskChecklists((data ?? []).map(dbToKioskChecklist));
                    setChecklistsLoading(false);
                  });
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
                {/* DUE NOW section */}
                {dueChecklists.length > 0 && (
                  <div>
                    <p className="section-label mb-2 text-status-error">Due now</p>
                    <div className="grid grid-cols-2 gap-3">
                      {dueChecklists.map((cl, idx) => (
                        <ChecklistCard key={cl.id} cl={cl} idx={idx} onSelect={setSelectedChecklist} />
                      ))}
                    </div>
                  </div>
                )}
                {/* UPCOMING section */}
                {upcomingChecklists.length > 0 && (
                  <div>
                    <p className="section-label mb-2">Upcoming today</p>
                    <div className="grid grid-cols-2 gap-3">
                      {upcomingChecklists.map((cl, idx) => (
                        <ChecklistCard key={cl.id} cl={cl} idx={idx + dueChecklists.length} onSelect={setSelectedChecklist} dim />
                      ))}
                    </div>
                  </div>
                )}
                {dueChecklists.length === 0 && upcomingChecklists.length === 0 && (
                  <div className="text-center py-10">
                    <p className="text-sm text-status-ok font-semibold">All done for now ✓</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Tap the Done counter above to review completed checklists.
                    </p>
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
                  <div className="grid grid-cols-2 gap-3">
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
