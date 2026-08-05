import { useEffect } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { hasActiveKioskAdminSession } from "@/lib/kiosk-admin-session";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, setupError, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

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
  // into /admin (AdminLoginModal -> grantKioskAdminSession) can reach this
  // protected route at all. Without this check, that same lingering session
  // would let anyone at the kiosk reach /dashboard, /admin, etc. directly —
  // no PIN, no credentials — just by navigating to the URL. Only the
  // sanctioned PIN hop is allowed through; everything else on a configured
  // kiosk device bounces back to /kiosk.
  const isKioskDevice = Boolean(localStorage.getItem("kiosk_location_id"));
  const isSanctionedKioskAdminHop = location.pathname.startsWith("/admin") && hasActiveKioskAdminSession();
  if (isKioskDevice && !isSanctionedKioskAdminHop) {
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
