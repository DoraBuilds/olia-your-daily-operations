import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Handles the redirect after Supabase email confirmation.
 *
 * Flow:
 *   1. User clicks the confirmation link in their email.
 *   2. Supabase redirects to /auth/callback with auth tokens in the URL hash.
 *   3. The Supabase JS client (initialised in supabase.ts) automatically
 *      detects the hash fragment and fires onAuthStateChange.
 *   4. AuthContext processes the session and sets user + teamMember.
 *   5. This page detects loading=false and redirects to /admin.
 */
export default function AuthCallback() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading) return; // still processing the session — wait
    navigate(user ? "/admin" : "/", { replace: true });
  }, [user, loading, navigate]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-3 bg-background">
      <div className="w-6 h-6 border-2 border-sage border-t-transparent rounded-full animate-spin" />
      <p className="text-sm text-muted-foreground">Signing you in…</p>
    </div>
  );
}
