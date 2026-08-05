import { useState, useEffect, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { useLocations } from "@/hooks/useLocations";
import { grantKioskAdminSession } from "@/lib/kiosk-admin-session";
import type { KioskChecklist } from "./types";
import { useInactivityTimer } from "./hooks";

// ─── Supabase helpers ─────────────────────────────────────────────────────────

export async function validateKioskAdminPin(pin: string, locationId: string) {
  return supabase.rpc("validate_admin_pin", {
    p_pin: pin,
    p_location_id: locationId,
  });
}

export async function validateKioskStaffPin(pin: string, locationId: string) {
  return supabase.rpc("validate_staff_pin", {
    p_pin: pin,
    p_location_id: locationId,
  });
}

// Validates any team member in the same org as the kiosk location.
// Unlike validate_admin_pin this has no location_ids restriction —
// physical presence at the kiosk is sufficient for checklist access.
export async function validateKioskMemberPin(pin: string, locationId: string) {
  return supabase.rpc("validate_kiosk_member_pin", {
    p_pin: pin,
    p_location_id: locationId,
  });
}

// ─── clearKioskLocationSelection (needed by AdminLoginModal) ──────────────────

export function clearKioskLocationSelectionForModal() {
  localStorage.removeItem("kiosk_location_id");
  localStorage.removeItem("kiosk_location_name");
  localStorage.removeItem("kiosk_token");
}

// ─── ensureKioskToken ─────────────────────────────────────────────────────────
// Returns the kiosk_token for the given location.  If localStorage already has
// one we return it immediately.  If it is missing (e.g. the kiosk was set up
// before the token feature was deployed, or the token was cleared), we fetch it
// directly from the locations table.  Anonymous users have SELECT access to
// locations (anon_read_locations policy), so this works without authentication.
export async function ensureKioskToken(locationId: string): Promise<string | null> {
  const stored = localStorage.getItem("kiosk_token");
  if (stored) return stored;
  try {
    const { data } = await supabase
      .from("locations")
      .select("kiosk_token")
      .eq("id", locationId)
      .single();
    if (data?.kiosk_token) {
      localStorage.setItem("kiosk_token", data.kiosk_token);
      return data.kiosk_token;
    }
  } catch { /* non-fatal */ }
  return null;
}

// ─── verifyKioskToken ─────────────────────────────────────────────────────────
// Returns true if the stored kiosk_token matches the server record for the
// given locationId. Returns false if the token is missing or mismatched.
// A mismatch indicates the kiosk_location_id may have been tampered with.
export async function verifyKioskToken(locationId: string, kioskToken: string | null): Promise<boolean> {
  if (!kioskToken) return false;
  const { data } = await supabase.rpc("verify_kiosk_token", {
    p_location_id: locationId,
    p_kiosk_token: kioskToken,
  });
  return Boolean(data);
}

// ─── KioskPinShell ────────────────────────────────────────────────────────────
// Shared visual wrapper used by all three PIN dialogs. Matches Admin PIN style.
interface KioskPinShellProps {
  title: string;
  onClose: () => void;
  pin: string;
  error?: string;
  validating?: boolean;
  lockedUntil?: number | null;
  lockSecondsLeft?: number;
  onDigit: (d: string) => void;
  onBackspace: () => void;
  ctaLabel?: string;
  ctaId?: string;
  ctaTestId?: string;
  ctaDisabled?: boolean;
  onCta?: () => void;
  secondsLeft?: number | null;
  onCancelCountdown?: () => void;
  footer?: ReactNode;
}

export function KioskPinShell({
  title, onClose, pin, error, validating, lockedUntil, lockSecondsLeft = 0,
  onDigit, onBackspace, ctaLabel, ctaId, ctaTestId, ctaDisabled, onCta,
  secondsLeft, onCancelCountdown, footer,
}: KioskPinShellProps) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-foreground/20 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-card w-full max-w-sm mx-4 rounded-2xl p-6 space-y-5 animate-fade-in">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg text-foreground">{title}</h2>
          <button onClick={onClose} className="btn-icon" aria-label="Close">
            <X size={18} className="text-muted-foreground" />
          </button>
        </div>

        <PinDots count={pin.length} />

        {error && !validating && (
          <p className="text-center text-xs text-status-error">{error}</p>
        )}
        {validating && (
          <p className="text-center text-xs text-muted-foreground">Checking PIN…</p>
        )}

        {lockedUntil ? (
          <div className="text-center py-4">
            <p className="text-sm text-muted-foreground">
              Try again in <span className="font-bold text-foreground">{lockSecondsLeft}s</span>
            </p>
          </div>
        ) : (
          <NumberPad onDigit={onDigit} onBackspace={onBackspace} />
        )}

        {ctaLabel && (
          <button
            id={ctaId}
            data-testid={ctaTestId}
            onClick={onCta}
            disabled={ctaDisabled}
            className={cn(
              "w-full py-3.5 rounded-2xl font-bold tracking-widest text-sm transition-colors active:scale-[0.98]",
              !ctaDisabled
                ? "bg-sage text-white hover:bg-sage-deep"
                : "bg-muted text-muted-foreground cursor-not-allowed",
            )}
          >
            {ctaLabel}
          </button>
        )}

        {footer}
      </div>

      {secondsLeft !== null && secondsLeft !== undefined && (
        <div className="fixed bottom-0 left-0 right-0 bg-foreground/90 text-background px-5 py-3 flex items-center justify-between z-[70]">
          <p className="text-sm">Returning to home in {secondsLeft}s…</p>
          <button onClick={onCancelCountdown} className="text-sm font-semibold underline">Stay</button>
        </div>
      )}
    </div>
  );
}

// ─── AdminLoginModal ───────────────────────────────────────────────────────────
export function AdminLoginModal({ onClose, kioskLocationId }: { onClose: () => void; kioskLocationId?: string | null }) {
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

    const locationId = kioskLocationId ?? localStorage.getItem("kiosk_location_id");
    if (!locationId) {
      setLoading(false);
      setError("Select a kiosk location before opening admin.");
      return;
    }

    if (teamMember?.organization_id && locationsFetched) {
      const locationStillAccessible = allLocations.some((location) => location.id === locationId);
      if (!locationStillAccessible) {
        clearKioskLocationSelectionForModal();
        setLoading(false);
        setError("This kiosk location is no longer linked to your account. Select a location again.");
        return;
      }
    }

    // Verify the kiosk_token if available (SEQ-009).
    // When ensureKioskToken returns null the token infrastructure is not yet
    // set up in the database — skip the check rather than blocking all PINs.
    const storedToken = await ensureKioskToken(locationId);
    if (storedToken) {
      const tokenValid = await verifyKioskToken(locationId, storedToken);
      if (!tokenValid) {
        clearKioskLocationSelectionForModal();
        setLoading(false);
        setError("Kiosk setup required. Please contact your administrator.");
        return;
      }
    }

    const { data, error: rpcError } = await validateKioskAdminPin(pin, locationId);

    setLoading(false);

    if (rpcError) {
      if (rpcError.message?.includes("Too many PIN attempts")) {
        setError("Too many failed attempts. Please wait 5 minutes before trying again.");
      } else {
        setError("Could not verify the admin PIN. Please try again.");
      }
      return;
    }

    if (!data || data.length === 0) {
      setError("Invalid PIN.");
      return;
    }

    grantKioskAdminSession(data[0].id, locationId);
    navigate("/admin?from=kiosk");
  };

  const handlePinRecovery = async () => {
    onClose();
    // Always sign out before redirecting to login — even if an admin session is
    // active on this device. Allowing direct navigation to /admin via the kiosk
    // recovery link would let any kiosk user bypass the PIN gate entirely.
    await supabase.auth.signOut();
    navigate("/login?reason=reset-pin");
  };

  const handleDigit = (d: string) => {
    if (pin.length >= 4 || loading) return;
    const next = pin + d;
    setPin(next);
    if (next.length === 4) {
      // Auto-submit once all 4 digits entered
      void (async () => {
        setError("");
        setLoading(true);
        const locationId = kioskLocationId ?? localStorage.getItem("kiosk_location_id");
        if (!locationId) { setLoading(false); setError("Select a kiosk location first."); setPin(""); return; }
        if (teamMember?.organization_id && locationsFetched) {
          if (!allLocations.some(l => l.id === locationId)) {
            clearKioskLocationSelectionForModal();
            setLoading(false);
            setError("Location no longer accessible. Select again.");
            setPin("");
            return;
          }
        }
        // Verify the kiosk_token if available (SEQ-009).
        const storedToken = await ensureKioskToken(locationId);
        if (storedToken) {
          const tokenValid = await verifyKioskToken(locationId, storedToken);
          if (!tokenValid) {
            clearKioskLocationSelectionForModal();
            setLoading(false);
            setError("Kiosk setup required. Please contact your administrator.");
            setPin("");
            return;
          }
        }
        const { data, error: rpcError } = await validateKioskAdminPin(next, locationId);
        setLoading(false);
        if (rpcError) { setError(rpcError.message?.includes("Too many PIN attempts") ? "Too many failed attempts. Please wait 5 minutes before trying again." : "Could not verify PIN. Please try again."); setPin(""); return; }
        if (!data || data.length === 0) { setError("Invalid PIN."); setPin(""); return; }
        grantKioskAdminSession(data[0].id, locationId);
        navigate("/admin?from=kiosk");
      })();
    }
  };

  const handleBackspace = () => {
    if (loading) return;
    setPin(p => p.slice(0, -1));
    setError("");
  };

  return (
    <KioskPinShell
      title="Admin PIN"
      onClose={onClose}
      pin={pin}
      error={error}
      validating={loading}
      onDigit={handleDigit}
      onBackspace={handleBackspace}
      footer={
        <p className="text-center text-xs text-muted-foreground pt-1">
          Forgot your PIN?{" "}
          <button
            onClick={() => { void handlePinRecovery(); }}
            className="text-sage font-medium hover:underline"
          >
            Log out and sign in again
          </button>
        </p>
      }
    />
  );
}

// ─── PinDots ──────────────────────────────────────────────────────────────────
export function PinDots({ count }: { count: number }) {
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
export function NumberPad({
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
export function PinEntryModal({
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

    // Verify the kiosk_token if available (SEQ-009).
    // Skip when null — token infrastructure not yet set up in the database.
    const storedToken = await ensureKioskToken(locationId);
    if (storedToken) {
      const tokenValid = await verifyKioskToken(locationId, storedToken);
      if (!tokenValid) {
        setValidating(false);
        setPin("");
        localStorage.removeItem("kiosk_location_id");
        localStorage.removeItem("kiosk_location_name");
        localStorage.removeItem("kiosk_token");
        setError("Kiosk setup required. Please contact your administrator.");
        return;
      }
    }
    // Check team members org-wide (any team member of the location's org).
    // Uses a dedicated RPC with no location_ids restriction — physical presence
    // at the kiosk is the access control, not the location assignment.
    const { data: memberData, error: memberRpcError } = await validateKioskMemberPin(enteredPin, locationId);

    if (!memberRpcError && memberData && memberData.length > 0) {
      setValidating(false);
      const member = memberData[0];
      onSuccess(null, member.name, member.organization_id ?? "");
      return;
    }

    if (memberRpcError) {
      setValidating(false);
      setPin("");
      if (memberRpcError.message?.includes("Too many PIN attempts")) {
        // Server-side rate limit hit — enforce a 5-minute lockout in the UI
        const until = Date.now() + 5 * 60 * 1000;
        setLockedUntil(until);
        setLockSecondsLeft(5 * 60);
        setError("Too many failed attempts. Please wait 5 minutes before trying again.");
      } else {
        setError("Connection error. Check your network and try again.");
      }
      return;
    }

    // No team member match — try staff profile PIN (SHA-256, location-scoped)
    const { data: staffData, error: staffRpcError } = await validateKioskStaffPin(enteredPin, locationId);
    setValidating(false);

    if (!staffRpcError && staffData && staffData.length > 0) {
      const staff = staffData[0];
      onSuccess(staff.id, `${staff.first_name} ${staff.last_name}`.trim(), staff.organization_id ?? "");
      return;
    }

    if (staffRpcError) {
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
    <KioskPinShell
      title="Insert PIN"
      onClose={onCancel}
      pin={pin}
      error={error}
      validating={validating}
      lockedUntil={lockedUntil}
      lockSecondsLeft={lockSecondsLeft}
      onDigit={handleDigit}
      onBackspace={handleBackspace}
      ctaLabel="START"
      ctaId="pin-start-btn"
      ctaDisabled={!canStart}
      onCta={() => canStart && validate(pin)}
      secondsLeft={secondsLeft}
      onCancelCountdown={cancelCountdown}
    />
  );
}

// ─── LibraryPinModal ──────────────────────────────────────────────────────────
export function LibraryPinModal({
  locationId,
  onSuccess,
  onCancel,
}: {
  locationId: string;
  onSuccess: (memberId: string | null, memberName: string, orgId: string) => void;
  onCancel: () => void;
}) {
  const [pin, setPin] = useState("");
  const [attempts, setAttempts] = useState(0);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [lockSecondsLeft, setLockSecondsLeft] = useState(0);
  const [error, setError] = useState("");
  const [validating, setValidating] = useState(false);

  const { secondsLeft, cancelCountdown } = useInactivityTimer(true, onCancel);

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

    const storedToken = await ensureKioskToken(locationId);
    if (storedToken) {
      const tokenValid = await verifyKioskToken(locationId, storedToken);
      if (!tokenValid) {
        setValidating(false);
        setPin("");
        localStorage.removeItem("kiosk_location_id");
        localStorage.removeItem("kiosk_location_name");
        localStorage.removeItem("kiosk_token");
        setError("Kiosk setup required. Please contact your administrator.");
        return;
      }
    }

    const { data: memberData, error: memberRpcError } = await validateKioskMemberPin(enteredPin, locationId);

    if (!memberRpcError && memberData && memberData.length > 0) {
      setValidating(false);
      const member = memberData[0];
      onSuccess(member.id, member.name, member.organization_id ?? "");
      return;
    }

    if (memberRpcError) {
      setValidating(false);
      setPin("");
      if (memberRpcError.message?.includes("Too many PIN attempts")) {
        const until = Date.now() + 5 * 60 * 1000;
        setLockedUntil(until);
        setLockSecondsLeft(5 * 60);
        setError("Too many failed attempts. Please wait 5 minutes before trying again.");
      } else {
        setError("Connection error. Check your network and try again.");
      }
      return;
    }

    // No team member match — try staff profile PIN (gets org-wide items only)
    const { data: staffData, error: staffRpcError } = await validateKioskStaffPin(enteredPin, locationId);
    setValidating(false);

    if (!staffRpcError && staffData && staffData.length > 0) {
      const staff = staffData[0];
      onSuccess(null, `${staff.first_name} ${staff.last_name}`.trim(), staff.organization_id ?? "");
      return;
    }

    if (staffRpcError) {
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

  const canSubmit = pin.length >= 4 && !validating && !lockedUntil;

  return (
    <KioskPinShell
      title="Staff Library"
      onClose={onCancel}
      pin={pin}
      error={error}
      validating={validating}
      lockedUntil={lockedUntil}
      lockSecondsLeft={lockSecondsLeft}
      onDigit={handleDigit}
      onBackspace={handleBackspace}
      ctaLabel="ACCESS"
      ctaTestId="library-pin-access-btn"
      ctaDisabled={!canSubmit}
      onCta={() => canSubmit && validate(pin)}
      secondsLeft={secondsLeft}
      onCancelCountdown={cancelCountdown}
    />
  );
}
