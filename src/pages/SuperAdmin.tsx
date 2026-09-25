import { useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, LogIn, LogOut, Search, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

// Internal support console for platform admins (Olia staff). Lists every
// organization and lets the admin enter one in "support mode" with full
// owner rights — see 20260925000010_platform_admin_support_mode.sql.
// Deliberately English-only: customers never see this page.

export interface PlatformOrg {
  id: string;
  name: string;
  plan: string;
  plan_status: string;
  created_at: string;
  deletion_requested_at: string | null;
  owner_name: string | null;
  owner_email: string | null;
  member_count: number;
  location_count: number;
}

interface AccessLogRow {
  id: number;
  admin_email: string;
  organization_id: string | null;
  organization_name: string | null;
  action: "enter" | "exit" | "reveal_pin";
  created_at: string;
}

const ACTION_LABEL: Record<AccessLogRow["action"], string> = {
  enter: "Entered",
  exit: "Exited",
  reveal_pin: "Revealed a PIN in",
};

export function filterOrgs(orgs: PlatformOrg[], query: string): PlatformOrg[] {
  const q = query.trim().toLowerCase();
  if (!q) return orgs;
  return orgs.filter((org) =>
    [org.name, org.owner_name, org.owner_email, org.id]
      .some((value) => value?.toLowerCase().includes(q)),
  );
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString(undefined, {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

export default function SuperAdmin() {
  const navigate = useNavigate();
  const { user, loading, teamMember, platformAdmin, enterOrg, exitOrg, signOut } = useAuth();
  const [query, setQuery] = useState("");
  const [pendingOrgId, setPendingOrgId] = useState<string | null>(null);

  const orgsQuery = useQuery({
    queryKey: ["platform_admin_orgs"],
    enabled: platformAdmin.isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("platform_admin_list_orgs");
      if (error) throw error;
      return (data ?? []) as PlatformOrg[];
    },
  });

  const accessQuery = useQuery({
    queryKey: ["platform_admin_recent_access"],
    enabled: platformAdmin.isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("platform_admin_recent_access", { p_limit: 20 });
      if (error) throw error;
      return (data ?? []) as AccessLogRow[];
    },
  });

  const orgs = useMemo(() => filterOrgs(orgsQuery.data ?? [], query), [orgsQuery.data, query]);

  if (loading && !platformAdmin.isAdmin) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  if (!platformAdmin.isAdmin) return <Navigate to="/dashboard" replace />;

  const viewing = platformAdmin.viewingOrg;

  const handleEnter = async (org: PlatformOrg) => {
    setPendingOrgId(org.id);
    try {
      await enterOrg(org.id);
      navigate("/dashboard");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not enter organization");
    } finally {
      setPendingOrgId(null);
    }
  };

  const handleExit = async () => {
    try {
      await exitOrg();
      await accessQuery.refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not exit support mode");
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto w-full max-w-[920px] px-4 sm:px-6 py-6 space-y-5">
        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <ShieldCheck size={18} className="text-status-warn shrink-0" />
              <h1 className="font-display text-xl text-foreground">Support console</h1>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Enter any organization with full owner access. Every entry and exit is logged.
            </p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {(viewing || teamMember) && (
              <button
                type="button"
                onClick={() => navigate("/dashboard")}
                className="flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground px-2 py-1.5"
              >
                <ArrowLeft size={14} /> Back to app
              </button>
            )}
            <button
              type="button"
              onClick={() => { void signOut(); }}
              className="flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground px-2 py-1.5"
            >
              <LogOut size={14} /> Log out
            </button>
          </div>
        </header>

        {viewing && (
          <section className="card-surface p-4 flex items-center justify-between gap-3 border-status-warn/40">
            <p className="text-sm text-foreground min-w-0">
              Currently viewing <span className="font-semibold">{viewing.name}</span>
            </p>
            <button
              type="button"
              onClick={handleExit}
              className="shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg border border-border hover:bg-muted"
            >
              Exit support mode
            </button>
          </section>
        )}

        <section className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <p className="section-label">Organizations</p>
            <p className="text-xs text-muted-foreground">
              {orgsQuery.data ? `${orgs.length} of ${orgsQuery.data.length}` : ""}
            </p>
          </div>
          <label className="relative block">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name, owner or email"
              aria-label="Search organizations"
              className="w-full rounded-xl border border-border bg-card pl-9 pr-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </label>

          <div className="card-surface divide-y divide-border">
            {orgsQuery.isLoading && <p className="p-4 text-sm text-muted-foreground">Loading organizations…</p>}
            {orgsQuery.isError && <p className="p-4 text-sm text-status-error">Could not load organizations.</p>}
            {orgsQuery.data && orgs.length === 0 && (
              <p className="p-4 text-sm text-muted-foreground">No organizations match “{query}”.</p>
            )}
            {orgs.map((org) => {
              const isViewing = viewing?.id === org.id;
              return (
                <div key={org.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{org.name}</p>
                      {org.deletion_requested_at && (
                        <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-status-error">Deleting</span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {[org.owner_name, org.owner_email].filter(Boolean).join(" · ") || "No owner"}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      <span className="capitalize">{org.plan}</span> · {org.plan_status} · {org.member_count} members · {org.location_count} locations · since {formatDate(org.created_at)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleEnter(org)}
                    disabled={pendingOrgId !== null}
                    aria-label={`Enter ${org.name}`}
                    className={cn(
                      "shrink-0 flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-60",
                      isViewing ? "border-status-warn/50 text-foreground" : "border-border hover:bg-muted",
                    )}
                  >
                    <LogIn size={13} />
                    {pendingOrgId === org.id ? "Entering…" : isViewing ? "Viewing" : "Enter"}
                  </button>
                </div>
              );
            })}
          </div>
        </section>

        <section className="space-y-2">
          <p className="section-label">Recent access</p>
          <div className="card-surface divide-y divide-border">
            {accessQuery.data?.length === 0 && (
              <p className="p-4 text-sm text-muted-foreground">No support sessions yet.</p>
            )}
            {accessQuery.data?.map((row) => (
              <div key={row.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-xs">
                <p className="min-w-0 truncate text-foreground">
                  {ACTION_LABEL[row.action]} <span className="font-semibold">{row.organization_name ?? "a deleted org"}</span>
                  <span className="text-muted-foreground"> · {row.admin_email}</span>
                </p>
                <p className="shrink-0 text-muted-foreground">{formatDateTime(row.created_at)}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
