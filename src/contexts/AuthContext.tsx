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
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  session: null,
  teamMember: null,
  loading: true,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [teamMember, setTeamMember] = useState<TeamMemberProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchTeamMember = async (userId: string) => {
    const { data } = await supabase
      .from("team_members")
      .select("*")
      .eq("id", userId)
      .single();

    if (!data) {
      // New user: check if there's pending onboarding data from the Signup page
      const pendingRaw = localStorage.getItem("olia_pending_onboarding");
      if (pendingRaw) {
        try {
          const pending = JSON.parse(pendingRaw);
          await supabase.rpc("setup_new_organization", {
            p_business_name: pending.businessName,
            p_location_name: pending.locationName,
            p_owner_name: pending.ownerName ?? null,
          });
          localStorage.removeItem("olia_pending_onboarding");
          // Re-fetch now that the team_member row exists
          const { data: newData } = await supabase
            .from("team_members")
            .select("*")
            .eq("id", userId)
            .single();
          setTeamMember(newData ?? null);
          setLoading(false);
          return;
        } catch (err) {
          console.error("[AuthContext] setup_new_organization failed:", err);
          localStorage.removeItem("olia_pending_onboarding");
        }
      }
    }

    setTeamMember(data ?? null);
    setLoading(false);
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchTeamMember(session.user.id);
      } else {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchTeamMember(session.user.id);
      } else {
        setTeamMember(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, session, teamMember, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
