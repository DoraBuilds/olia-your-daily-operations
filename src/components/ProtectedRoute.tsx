import { useEffect } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, setupError, signOut } = useAuth();
  const navigate = useNavigate();

  // Navigate first, then sign out. Calling signOut first fires SIGNED_OUT
  // synchronously, which sets user=null and causes ProtectedRoute to render
  // <Navigate to="/login"> before this redirect can happen.
  useEffect(() => {
    if (setupError) {
      navigate("/signup?reason=account-reset", { replace: true });
      void signOut();
    }
  }, [setupError, navigate, signOut]);

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
