import { createContext, useContext, useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { queryClient } from "@/lib/query-client";

interface TeamMemberProfile {
  id: string;
  organization_id: string;
  name: string;
  email: string;
  role: string;
  location_ids: string[];
  permissions: Record<string, boolean>;
}

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  teamMember: TeamMemberProfile | null;
  loading: boolean;
  setupError: string | null;   // set when setup_new_organization fails
  retrySetup: () => void;      // lets the UI offer a "Try again" button
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  session: null,
  teamMember: null,
  loading: true,
  setupError: null,
  retrySetup: () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [teamMember, setTeamMember] = useState<TeamMemberProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [setupError, setSetupError] = useState<string | null>(null);

  // ── Fetch / create team_member for the authenticated user ─────────────────────
  // Setup data is sourced in priority order:
  //   1. localStorage "olia_pending_onboarding" — written by Signup.tsx on this device
  //   2. auth user metadata "business_name" — written during signUp(), cross-device safe
  //   3. email prefix — last-resort fallback so setup always has a name to use
  const fetchTeamMember = async (userId: string, userMeta?: Record<string, string>) => {
    setSetupError(null);

    // Step 1: Check if team_member row already exists (returning user or idempotent re-run)
    const { data } = await supabase
      .from("team_members")
      .select("*")
      .eq("id", userId)
      .single();

    if (data) {
      setTeamMember(data as TeamMemberProfile);
      setLoading(false);
      return;
    }

    // Step 2: Row does not exist — resolve setup data
    let businessName: string | undefined;
    let ownerName: string | undefined;

    // Priority 1: localStorage (same device signup)
    const pendingRaw = localStorage.getItem("olia_pending_onboarding");
    if (pendingRaw) {
      try {
        const pending = JSON.parse(pendingRaw);
        businessName = pending.businessName;
        ownerName = pending.ownerName;
      } catch { /* malformed JSON */ }
    }

    // Priority 2: auth user metadata (survives cross-device email confirmation)
    if (!businessName && userMeta?.business_name) {
      businessName = userMeta.business_name;
    }
    if (!ownerName && userMeta?.full_name) {
      ownerName = userMeta.full_name;
    }

    // Priority 3: email prefix as absolute last resort
    if (!businessName) {
      businessName = userMeta?.email?.split("@")[0] ?? "My Business";
    }

    // Step 3: Create org + team_member
    try {
      await supabase.rpc("setup_new_organization", {
        p_business_name: businessName,
        p_owner_name: ownerName ?? null,
      });

      localStorage.removeItem("olia_pending_onboarding");

      // Re-fetch the newly created team_member row
      const { data: newData } = await supabase
        .from("team_members")
        .select("*")
        .eq("id", userId)
        .single();

      setTeamMember((newData ?? null) as TeamMemberProfile | null);
      setLoading(false);
    } catch (err) {
      console.error("[AuthContext] setup_new_organization failed:", err);
      localStorage.removeItem("olia_pending_onboarding");
      setSetupError(
        "Account setup is incomplete. Please run migration 20260316000001 " +
        "in your Supabase SQL Editor, then refresh this page.",
      );
      setTeamMember(null);
      setLoading(false);
    }
  };

  useEffect(() => {
    // Use ONLY onAuthStateChange. Supabase JS v2 fires INITIAL_SESSION
    // synchronously on mount with the current session (or null), making
    // getSession() redundant. Keeping both caused fetchTeamMember to run
    // twice simultaneously on every page load — and for a first-time user
    // both concurrent calls would invoke setup_new_organization, causing
    // a PK conflict on team_members and an error screen on first login.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      setUser(session?.user ?? null);

      if (session?.user) {
        if (event === "SIGNED_IN") {
          // Fresh login — clear any org-scoped cache from a previously signed-in account.
          queryClient.clear();
        }

        // TOKEN_REFRESHED is a silent hourly JWT rotation for the same user/org.
        // Re-fetching team_members on every refresh is wasteful and, if the row
        // was ever missing, would silently create a second organization.
        if (event !== "TOKEN_REFRESHED") {
          fetchTeamMember(
            session.user.id,
            session.user.user_metadata as Record<string, string>,
          );
        }
      } else {
        // User signed out — clear all org-scoped React Query cache so a
        // subsequent login never sees the previous account's data.
        queryClient.clear();
        setTeamMember(null);
        setSetupError(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  // fetchTeamMember uses only supabase (module-level) and stable state setters.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const retrySetup = () => {
    if (!user) return;
    setLoading(true);
    fetchTeamMember(
      user.id,
      user.user_metadata as Record<string, string>,
    );
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, session, teamMember, loading, setupError, retrySetup, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
