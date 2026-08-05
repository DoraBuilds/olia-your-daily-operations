import { useEffect } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { hasActiveKioskAdminSession } from "@/lib/kiosk-admin-session";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, setupError, signOut } = useAuth();
  const navigate = useNavigate();

  // Navigate first, then sign out. Calling signOut first fires SIGNED_OUT
  // synchronously, which sets user=null and causes ProtectedRoute to render
  // <Navigate to="/login"> before this redirect can happen.
  useEffect(() => {
    if (setupError) {
      // Carry the specific reason through so Signup.tsx can show accurate
      // copy instead of a generic message that tells every failure mode
      // (including a broken invite) to "create a new account".
      const detail = encodeURIComponent(setupError);
      navigate(`/signup?reason=account-reset&detail=${detail}`, { replace: true });
      void signOut();
    }
  }, [setupError, navigate, signOut]);

  // A wall-mounted kiosk device intentionally keeps the setup admin's
  // Supabase session alive (see kiosk-guard.ts) so its own PIN-gated hop
  // (AdminLoginModal -> grantKioskAdminSession) can reach protected routes
  // at all. Without this check, that same lingering session would let
  // anyone at the kiosk reach /dashboard, /admin, etc. directly — no PIN,
  // no credentials — just by navigating to the URL. Once the PIN has been
  // entered, the grant unlocks every protected route (not just /admin) so
  // that person can move freely around the app until they head back to
  // /kiosk (Layout.tsx's "Back to Kiosk" button / 90s inactivity timer) or
  // the grant's outer expiry lapses — never just because a device with no
  // PIN grant at all is a configured kiosk.
  const isKioskDevice = Boolean(localStorage.getItem("kiosk_location_id"));
  if (isKioskDevice && !hasActiveKioskAdminSession()) {
    return <Navigate to="/kiosk" replace />;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (setupError) {
    return null;
  }

  return <>{children}</>;
}
