import { createContext, useContext, useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { queryClient } from "@/lib/query-client";
import i18n, { type SupportedLanguage } from "@/lib/i18n";

interface TeamMemberProfile {
  id: string;
  organization_id: string;
  name: string;
  email: string;
  role: string;
  location_ids: string[];
  permissions: Record<string, boolean>;
  pin_reset_required?: boolean;
  language: SupportedLanguage;
}

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  teamMember: TeamMemberProfile | null;
  loading: boolean;
  setupError: string | null;   // set when setup_new_organization fails
  retrySetup: () => void;      // lets the UI offer a "Try again" button
  signOut: () => Promise<void>;
  updateLanguage: (language: SupportedLanguage) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  session: null,
  teamMember: null,
  loading: true,
  setupError: null,
  retrySetup: () => {},
  signOut: async () => {},
  updateLanguage: async () => {},
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
  const fetchTeamMember = async (userId: string, userMeta?: Record<string, string>) => {
    setLoading(true);
    setSetupError(null);

    // Step 1: Check by id (existing owners — id is set to auth.uid() by setup_new_organization)
    const { data } = await supabase
      .from("team_members")
      .select("*")
      .eq("id", userId)
      .single();

    if (data) {
      setTeamMember(data as TeamMemberProfile);
      setLoading(false);
      // Fire-and-forget: stamp last_seen_at for returning users.
      supabase.from("team_members").update({ last_seen_at: new Date().toISOString() }).eq("id", userId);
      return;
    }

    // Step 2: Check by auth_user_id (returning invited managers who already accepted their invite)
    const { data: byAuthId } = await supabase
      .from("team_members")
      .select("*")
      .eq("auth_user_id", userId)
      .single();

    if (byAuthId) {
      setTeamMember(byAuthId as TeamMemberProfile);
      setLoading(false);
      supabase.from("team_members").update({ last_seen_at: new Date().toISOString() }).eq("auth_user_id", userId);
      return;
    }

    // Step 3: Invite acceptance.
    // Prefer the token AcceptInvite.tsx stashes in localStorage right before the
    // OTP round trip, but that token only survives if the same browser/tab/app
    // completes the whole flow — it's lost across devices, across an in-app
    // browser hop (WhatsApp, etc.), or if the invitee signs in via /login or
    // /signup instead of /accept-invite. So always fall back to resolving any
    // open invite by the caller's own email (accept_invite with no token) —
    // this makes acceptance work no matter how the invitee got here.
    const pendingInviteToken = localStorage.getItem("olia_pending_invite_token");
    if (pendingInviteToken) localStorage.removeItem("olia_pending_invite_token");

    let acceptResult: { success?: boolean } | null = null;
    try {
      if (pendingInviteToken) {
        const { data } = await supabase.rpc("accept_invite", { p_token: pendingInviteToken });
        acceptResult = data;
      }
      if (!acceptResult?.success) {
        const { data } = await supabase.rpc("accept_invite");
        acceptResult = data;
      }
    } catch (err) {
      // A network/RPC failure here should not crash the whole lookup — treat
      // it as "no invite found" and fall through to the branches below.
      console.error("[AuthContext] accept_invite RPC threw:", err);
      acceptResult = null;
    }

    if (acceptResult?.success) {
      const { data: linked } = await supabase
        .from("team_members")
        .select("*")
        .eq("auth_user_id", userId)
        .single();
      if (linked) {
        setTeamMember(linked as TeamMemberProfile);
        setLoading(false);
        supabase.from("team_members").update({ last_seen_at: new Date().toISOString() }).eq("auth_user_id", userId);
        return;
      }
    }

    if (pendingInviteToken) {
      // A token was present but neither it nor an email-based match worked.
      setSetupError(
        "Your invitation link is invalid or has already been used. Please ask your admin to send a new invitation.",
      );
      setTeamMember(null);
      setLoading(false);
      return;
    }
    // No token and no open invite for this email — fall through to Step 4
    // (treat as a brand-new owner signup).

    // Step 4: Row does not exist — resolve setup data for new owner signup
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

    // If we still do not have a business name, fail closed instead of
    // inventing a new org from fallback data. That is safer than silently
    // attaching this account to an implicit organization.
    if (!businessName?.trim()) {
      setSetupError(
        "Account setup could not be completed safely. Please sign up again " +
        "or contact support so we can verify your organization details.",
      );
      setTeamMember(null);
      setLoading(false);
      return;
    }

    const safeOwnerName = ownerName?.trim();
    if (!safeOwnerName) {
      setSetupError(
        "Account setup could not be completed safely. Please sign up again " +
        "or contact support so we can verify your profile details.",
      );
      setTeamMember(null);
      setLoading(false);
      return;
    }

    // Step 3: Create org + team_member.
    // The RPC is SECURITY DEFINER so it can read/write without RLS constraints.
    // It returns the full team_member row directly — no second SELECT needed,
    // which avoids the RLS re-fetch failure caused by search_path issues in
    // current_org_id() on some Supabase connection pools.
    try {
      const { data: rpcData, error: rpcError } = await supabase.rpc("setup_new_organization", {
        p_business_name: businessName.trim(),
        p_owner_name: safeOwnerName,
      });

      localStorage.removeItem("olia_pending_onboarding");

      if (rpcError) {
        console.error("[AuthContext] setup_new_organization failed:", rpcError);
        setSetupError("Your account setup is not complete. Please refresh the page and try again.");
        setTeamMember(null);
        setLoading(false);
        return;
      }

      const newData = rpcData?.team_member as TeamMemberProfile | null;
      if (!newData) {
        console.error("[AuthContext] setup_new_organization returned no team_member:", rpcData);
        setSetupError("Your account setup is not complete. Please refresh the page and try again.");
        setTeamMember(null);
        setLoading(false);
        return;
      }

      setTeamMember(newData);
      setLoading(false);
    } catch (err) {
      console.error("[AuthContext] setup_new_organization threw:", err);
      localStorage.removeItem("olia_pending_onboarding");
      setSetupError("Your account setup is not complete. Please refresh the page and try again.");
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
  }, []);

  // Keeps the app's active i18n language in sync with the signed-in user's
  // saved preference — covers both the initial load and updateLanguage()
  // below (which writes teamMember.language optimistically, then this
  // effect picks up the change rather than calling i18n directly, so
  // rollback-on-failure only needs to touch teamMember state).
  useEffect(() => {
    if (teamMember?.language) {
      i18n.changeLanguage(teamMember.language);
    }
  }, [teamMember?.language]);

  const updateLanguage = async (language: SupportedLanguage) => {
    if (!teamMember) throw new Error("Not signed in");
    const previous = teamMember.language;
    setTeamMember((current) => (current ? { ...current, language } : current));

    const { error } = await supabase.from("team_members").update({ language }).eq("id", teamMember.id);
    if (error) {
      setTeamMember((current) => (current ? { ...current, language: previous } : current));
      throw error;
    }
  };

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
    <AuthContext.Provider value={{ user, session, teamMember, loading, setupError, retrySetup, signOut, updateLanguage }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
