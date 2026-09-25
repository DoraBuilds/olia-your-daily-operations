import { useState, useEffect, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation, Trans } from "react-i18next";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { kioskAdminLogin } from "@/lib/kiosk-pairing";
import { captureEvent } from "@/lib/posthog";
import { useInactivityTimer } from "./hooks";

// Re-exported so Kiosk.tsx's existing import site doesn't need to change —
// the implementation itself lives in kiosk-guard.ts (pure logic, no UI) so
// ConceptsTab.tsx (part of the Admin bundle) can use it too without pulling
// in this file's PIN-modal components.
export { touchKioskDevice } from "@/lib/kiosk-guard";

// ─── Supabase helpers ─────────────────────────────────────────────────────────

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
  const { t } = useTranslation("kiosk");
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-foreground/20 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-card w-full max-w-sm mx-4 rounded-2xl p-6 space-y-5 animate-fade-in shadow-lg">
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
          <p className="text-center text-xs text-muted-foreground">{t("pin.checking")}</p>
        )}

        {lockedUntil ? (
          <div className="text-center py-4">
            <p className="text-sm text-muted-foreground">
              <Trans
                i18nKey="kiosk:pin.tryAgainIn"
                values={{ seconds: lockSecondsLeft }}
                components={{ bold: <span className="font-bold text-foreground" /> }}
              />
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
              "w-full py-3.5 rounded-2xl font-bold text-sm transition-all active:scale-[0.98]",
              !ctaDisabled
                ? "bg-sage text-white hover:bg-sage-deep shadow-card active:shadow-inset"
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
          <p className="text-sm">{t("completion.returningIn", { count: secondsLeft })}</p>
          <button onClick={onCancelCountdown} className="text-sm font-semibold underline">{t("stayButton")}</button>
        </div>
      )}
    </div>
  );
}

// ─── AdminLoginModal ───────────────────────────────────────────────────────────
// A paired kiosk has no account signed in (#861). An owner's Admin PIN is
// exchanged, together with this device's token, for a session for that
// owner (kioskAdminLogin -> kiosk-admin-login edge function), which lasts
// until "Back to Kiosk" / the idle timeout (Layout.tsx, Kiosk.tsx).
export function AdminLoginModal({ onClose, kioskLocationId }: { onClose: () => void; kioskLocationId?: string | null }) {
  const { t } = useTranslation("kiosk");
  const navigate = useNavigate();
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submitPin = async (value: string) => {
    setError("");
    setLoading(true);
    const locationId = kioskLocationId ?? localStorage.getItem("kiosk_location_id");
    if (!locationId) {
      setLoading(false);
      setError(t("pin.selectLocationFirst"));
      setPin("");
      return;
    }
    const result = await kioskAdminLogin(value, locationId);
    setLoading(false);
    if (result.ok) {
      navigate("/admin?from=kiosk");
      return;
    }
    setPin("");
    if (result.reason === "invalid_pin") setError(t("pin.invalidPin"));
    else if (result.reason === "rate_limited") setError(t("pin.tooManyAttempts"));
    else if (result.reason === "device_inactive" || result.reason === "not_paired") setError(t("pin.kioskSetupRequired"));
    else setError(t("pin.couldNotVerifyPin"));
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
    // Auto-submit once all 4 digits entered
    if (next.length === 4) void submitPin(next);
  };

  const handleBackspace = () => {
    if (loading) return;
    setPin(p => p.slice(0, -1));
    setError("");
  };

  return (
    <KioskPinShell
      title={t("pin.adminTitle")}
      onClose={onClose}
      pin={pin}
      error={error}
      validating={loading}
      onDigit={handleDigit}
      onBackspace={handleBackspace}
      footer={
        <p className="text-center text-xs text-muted-foreground pt-1">
          {t("pin.forgotPin")}{" "}
          <button
            onClick={() => { void handlePinRecovery(); }}
            className="text-sage font-medium hover:underline"
          >
            {t("pin.logoutAndSignIn")}
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
            className="h-16 w-16 mx-auto rounded-full bg-muted text-muted-foreground text-base flex items-center justify-center transition-all shadow-card active:scale-95 active:shadow-inset active:bg-muted/60"
          >
            ⌫
          </button>
        );
        return (
          <button
            key={i} type="button" onClick={() => onDigit(key)}
            className="h-16 w-16 mx-auto rounded-full bg-white border border-border text-2xl font-light text-foreground transition-all shadow-card active:scale-95 active:shadow-inset active:bg-muted"
          >
            {key}
          </button>
        );
      })}
    </div>
  );
}

// ─── Shared kiosk PIN identity check ───────────────────────────────────────────
// Tries a team member PIN (org-wide, any device physically at the location),
// then falls back to a legacy staff_profiles PIN. Used by IdentifyModal (the
// kiosk sign-in — see kiosk-staff-session.ts), which hands this the location
// and gets back the hand this the location and get back
// the same lockout/attempts/error state machine.
export interface KioskIdentity {
  staffId: string | null;
  // team_members.id for a team-member PIN (null for a legacy staff PIN) —
  // lets the grid open the Library for this person without a second PIN.
  memberId?: string | null;
  staffName: string;
  /** Greeting name ("Hi, Dora"). */
  firstName: string;
  organizationId: string;
  departmentIds: string[];
}

function useKioskPinValidator(locationId: string, onSuccess: (identity: KioskIdentity) => void) {
  const { t } = useTranslation("kiosk");
  const [pin, setPin] = useState("");
  const [attempts, setAttempts] = useState(0);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [lockSecondsLeft, setLockSecondsLeft] = useState(0);
  const [error, setError] = useState("");
  const [validating, setValidating] = useState(false);

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
        setError(t("pin.pleaseTryAgain"));
      } else {
        setLockSecondsLeft(remaining);
      }
    }, 500);
    return () => clearInterval(id);
  }, [lockedUntil, t]);

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
        setError(t("pin.kioskSetupRequired"));
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
      captureEvent("kiosk_pin_unlocked", { location_id: locationId, is_library_pin: false });
      onSuccess({
        staffId: null,
        memberId: member.id,
        staffName: member.name,
        firstName: member.first_name || member.name.split(" ")[0],
        organizationId: member.organization_id ?? "",
        departmentIds: member.department_ids ?? [],
      });
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
        setError(t("pin.tooManyAttempts"));
      } else {
        setError(t("pin.connectionError"));
      }
      return;
    }

    // No team member match — try staff profile PIN (SHA-256, location-scoped)
    const { data: staffData, error: staffRpcError } = await validateKioskStaffPin(enteredPin, locationId);
    setValidating(false);

    if (!staffRpcError && staffData && staffData.length > 0) {
      const staff = staffData[0];
      captureEvent("kiosk_pin_unlocked", { location_id: locationId, is_library_pin: false, staff_profile_id: staff.id });
      onSuccess({
        staffId: staff.id,
        memberId: null,
        staffName: `${staff.first_name} ${staff.last_name}`.trim(),
        firstName: staff.first_name,
        organizationId: staff.organization_id ?? "",
        // Legacy staff_profiles has no department concept — unrestricted.
        departmentIds: [],
      });
      return;
    }

    if (staffRpcError) {
      setPin("");
      setError(t("pin.connectionError"));
      return;
    }

    const newAttempts = attempts + 1;
    setAttempts(newAttempts);
    setPin("");
    if (newAttempts >= 3) {
      const until = Date.now() + 30000;
      setLockedUntil(until);
      setLockSecondsLeft(30);
      setError(t("pin.askManagerForHelp"));
    } else {
      setError(t("pin.pinNotRecognised"));
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

  return { pin, error, validating, lockedUntil, lockSecondsLeft, handleDigit, handleBackspace, canStart, validate };
}

// ─── IdentifyModal (Screen 0) ───────────────────────────────────────────────────
// Shown before the grid on every kiosk boot (#780). Signs in who's about to
// use the kiosk: the grid filters to their department(s) and checklists they
// open are attributed to them without another PIN (#869). No idle
// timer: unlike PinEntryModal there's no other screen to fall back to.
export function IdentifyModal({
  locationId, onSuccess, onAdminClick, onLibraryClick,
}: {
  locationId: string;
  onSuccess: (identity: KioskIdentity) => void;
  onAdminClick: () => void;
  onLibraryClick: () => void;
}) {
  const { t } = useTranslation("kiosk");
  const {
    pin, error, validating, lockedUntil, lockSecondsLeft, handleDigit, handleBackspace, canStart, validate,
  } = useKioskPinValidator(locationId, onSuccess);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="px-5 pt-6 pb-4 flex items-center justify-end gap-2">
        <button
          id="library-btn"
          onClick={onLibraryClick}
          className="text-xs font-semibold text-muted-foreground border border-border rounded-full px-3 py-1.5 hover:bg-muted transition-colors shrink-0"
        >
          {t("grid.library")}
        </button>
        <button
          id="admin-btn"
          onClick={onAdminClick}
          className="text-xs font-semibold text-muted-foreground border border-border rounded-full px-3 py-1.5 hover:bg-muted transition-colors shrink-0"
        >
          {t("grid.admin")}
        </button>
      </div>
      <div className="flex-1 flex items-center justify-center px-4 pb-10">
        <div className="w-full max-w-sm space-y-5">
          <div className="text-center">
            <h1 className="font-display text-2xl text-foreground">{t("pin.identifyTitle")}</h1>
          </div>

          <PinDots count={pin.length} />

          {error && !validating && (
            <p className="text-center text-xs text-status-error">{error}</p>
          )}
          {validating && (
            <p className="text-center text-xs text-muted-foreground">{t("pin.checking")}</p>
          )}

          {lockedUntil ? (
            <div className="text-center py-4">
              <p className="text-sm text-muted-foreground">
                <Trans
                  i18nKey="kiosk:pin.tryAgainIn"
                  values={{ seconds: lockSecondsLeft }}
                  components={{ bold: <span className="font-bold text-foreground" /> }}
                />
              </p>
            </div>
          ) : (
            <NumberPad onDigit={handleDigit} onBackspace={handleBackspace} />
          )}

          <button
            id="identify-start-btn"
            data-testid="identify-start-btn"
            onClick={() => canStart && validate(pin)}
            disabled={!canStart}
            className={cn(
              "w-full py-3.5 rounded-2xl font-bold text-sm transition-all active:scale-[0.98]",
              canStart
                ? "bg-sage text-white hover:bg-sage-deep shadow-card active:shadow-inset"
                : "bg-muted text-muted-foreground cursor-not-allowed",
            )}
          >
            {t("pin.startButton")}
          </button>
        </div>
      </div>
    </div>
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
  const { t } = useTranslation("kiosk");
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
        setError(t("pin.pleaseTryAgain"));
      } else {
        setLockSecondsLeft(remaining);
      }
    }, 500);
    return () => clearInterval(id);
  }, [lockedUntil, t]);

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
        setError(t("pin.kioskSetupRequired"));
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
        setError(t("pin.tooManyAttempts"));
      } else {
        setError(t("pin.connectionError"));
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
      setError(t("pin.connectionError"));
      return;
    }

    const newAttempts = attempts + 1;
    setAttempts(newAttempts);
    setPin("");
    if (newAttempts >= 3) {
      const until = Date.now() + 30000;
      setLockedUntil(until);
      setLockSecondsLeft(30);
      setError(t("pin.askManagerForHelp"));
    } else {
      setError(t("pin.pinNotRecognised"));
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
      title={t("pin.staffLibraryTitle")}
      onClose={onCancel}
      pin={pin}
      error={error}
      validating={validating}
      lockedUntil={lockedUntil}
      lockSecondsLeft={lockSecondsLeft}
      onDigit={handleDigit}
      onBackspace={handleBackspace}
      ctaLabel={t("pin.accessButton")}
      ctaTestId="library-pin-access-btn"
      ctaDisabled={!canSubmit}
      onCta={() => canSubmit && validate(pin)}
      secondsLeft={secondsLeft}
      onCancelCountdown={cancelCountdown}
    />
  );
}
