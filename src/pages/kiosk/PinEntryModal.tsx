import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { useLocations } from "@/hooks/useLocations";
import type { KioskChecklist } from "./types";
import { useInactivityTimer } from "./hooks";

// ─── Supabase helpers ─────────────────────────────────────────────────────────

export async function validateKioskAdminPin(pin: string, locationId: string) {
  return supabase.rpc("validate_admin_pin", {
    p_pin: pin,
    p_location_id: locationId,
  });
}

// ─── clearKioskLocationSelection (needed by AdminLoginModal) ──────────────────

export function clearKioskLocationSelectionForModal() {
  localStorage.removeItem("kiosk_location_id");
  localStorage.removeItem("kiosk_location_name");
}

// ─── AdminLoginModal (centered) ───────────────────────────────────────────────
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
        const { data, error: rpcError } = await validateKioskAdminPin(next, locationId);
        setLoading(false);
        if (rpcError) { setError("Could not verify PIN. Please try again."); setPin(""); return; }
        if (!data || data.length === 0) { setError("Invalid PIN."); setPin(""); return; }
        navigate(`/admin?from=kiosk&userId=${data[0].id}`);
      })();
    }
  };

  const handleBackspace = () => {
    if (loading) return;
    setPin(p => p.slice(0, -1));
    setError("");
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-foreground/20 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-card w-full max-w-sm mx-4 rounded-2xl p-6 space-y-5 animate-fade-in">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg text-foreground">Admin PIN</h2>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-muted transition-colors">
            <X size={18} className="text-muted-foreground" />
          </button>
        </div>

        <PinDots count={pin.length} />

        {error && <p className="text-center text-xs text-status-error">{error}</p>}
        {loading && <p className="text-center text-xs text-muted-foreground">Checking…</p>}

        <NumberPad onDigit={handleDigit} onBackspace={handleBackspace} />

        <p className="text-center text-xs text-muted-foreground pt-1">
          Forgot your PIN?{" "}
          <button
            onClick={() => { void handlePinRecovery(); }}
            className="text-sage font-medium hover:underline"
          >
            Log out and sign in again
          </button>
        </p>
      </div>
    </div>
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
    const { data: adminData, error: adminRpcError } = await validateKioskAdminPin(enteredPin, locationId);
    setValidating(false);

    if (!adminRpcError && adminData && adminData.length > 0) {
      const admin = adminData[0];
      onSuccess(null, admin.name, admin.organization_id ?? "");
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
