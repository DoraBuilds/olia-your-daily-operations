import { createContext, useContext, useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

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
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchTeamMember(
          session.user.id,
          session.user.user_metadata as Record<string, string>,
        );
      } else {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchTeamMember(
          session.user.id,
          session.user.user_metadata as Record<string, string>,
        );
      } else {
        setTeamMember(null);
        setSetupError(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  // fetchTeamMember is intentionally defined outside deps — it uses only
  // supabase (module-level) and state setters (stable refs). ESLint disable is safe.
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
