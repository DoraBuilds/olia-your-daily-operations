import { useState, useRef, useEffect } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { MapPin, X, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  type Location, type StaffProfile, type TeamMember, type ManagerPermissions,
  type AuditLogEntry,
  DEFAULT_STAFF_DEPARTMENTS,
  staffDisplayName, getInitials,
} from "@/lib/admin-repository";
import { useAuth } from "@/contexts/AuthContext";
import { usePlan, useSaveActiveLocationsSelection } from "@/hooks/usePlan";
import { PLAN_LABELS, PLAN_PRICES, PLAN_FEATURES } from "@/lib/plan-features";
import { useLocations, useSaveLocation, useDeleteLocation } from "@/hooks/useLocations";
import {
  useStaffProfiles, useSaveStaffProfile, useArchiveStaffProfile,
  useRestoreStaffProfile, useDeleteStaffProfile,
} from "@/hooks/useStaffProfiles";
import { useTeamMembers, useSaveTeamMember, useDeleteTeamMember } from "@/hooks/useTeamMembers";
import { useChecklists } from "@/hooks/useChecklists";
import { toast } from "@/components/ui/sonner";

// ─── Sub-modules ──────────────────────────────────────────────────────────────
import { cloneDepartments } from "./admin/shared";
// Re-export parseGoogleOpeningHours so existing import paths keep working
export { parseGoogleOpeningHours } from "./admin/shared";
import { MyLocationTab } from "./admin/MyLocationTab";
import { AccountTab } from "./admin/AccountTab";
import {
  ConfirmModal, LocationModal, StaffProfileModal, TeamMemberModal,
  type ConfirmState,
} from "./admin/SharedUI";

// ─── Admin Page ───────────────────────────────────────────────────────────────

export default function Admin() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const fromKiosk = searchParams.get("from") === "kiosk";
  const userId = searchParams.get("userId");
  const { user, teamMember: authMember, setupError, retrySetup } = useAuth();
  const { plan, billingUnavailable } = usePlan();

  // Data — from Supabase
  const {
    data: locations = [],
    allLocations = [],
    inactiveLocations = [],
    maxLocations,
    isOverLimit,
    graceEndsAt,
    isGraceActive,
    isGraceExpired,
    effectiveActiveLocationIds,
  } = useLocations();
  const { data: staffProfiles = [] } = useStaffProfiles();
  const { data: teamMembers = [] } = useTeamMembers();
  const { data: checklists = [] } = useChecklists();
  const saveActiveLocationsMut = useSaveActiveLocationsSelection();
  const saveLocationMut = useSaveLocation();
  const deleteLocationMut = useDeleteLocation();
  const saveStaffMut = useSaveStaffProfile();
  const archiveStaffMut = useArchiveStaffProfile();
  const restoreStaffMut = useRestoreStaffProfile();
  const deleteStaffMut = useDeleteStaffProfile();
  const saveMemberMut = useSaveTeamMember();
  const deleteMemberMut = useDeleteTeamMember();

  // Local state (not persisted to DB yet)
  const [departments, setDepartments] = useState(() => cloneDepartments(DEFAULT_STAFF_DEPARTMENTS));
  const staffRoleOptions = departments.map(d => d.name);
  const auditLog: AuditLogEntry[] = [];

  // UI state
  const routeTab: "location" | "account" = location.pathname.startsWith("/admin/account") ? "account" : "location";
  const [activeTab, setActiveTab] = useState<"location" | "account">(routeTab);
  const [currentLocationId, setCurrentLocationId] = useState("");

  // Set default location once data loads
  useEffect(() => {
    if (locations.length > 0 && !currentLocationId) {
      setCurrentLocationId(locations[0].id);
    }
  }, [locations, currentLocationId]);

  // Modal state
  const [locationModal, setLocationModal] = useState<Location | null | "new">(null);
  const [staffModal, setStaffModal] = useState<StaffProfile | null | "new">(null);
  const [memberModal, setMemberModal] = useState<TeamMember | null | "new">(null);
  const [confirmModal, setConfirmModal] = useState<ConfirmState>(null);
  // Location-limit upgrade prompt — rendered AFTER </Layout> so position:fixed
  // escapes the animate-fade-in containing block on <main>.
  const [showLocationLimitModal, setShowLocationLimitModal] = useState(false);

  // Determine active user from URL param
  const activeUser = userId ? (teamMembers.find(m => m.id === userId) ?? null) : null;
  const isOwner = !activeUser || activeUser.role === "Owner";

  useEffect(() => {
    if (!isOwner && routeTab === "account") {
      navigate("/admin/location", { replace: true });
      return;
    }
    setActiveTab(routeTab);
  }, [isOwner, navigate, routeTab]);
  const permissions: ManagerPermissions | null = isOwner ? null : (activeUser?.permissions ?? null);

  // Inactivity timer — when from kiosk, redirect back after 90s idle
  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!fromKiosk) return;
    const reset = () => {
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = setTimeout(() => navigate("/kiosk"), 90000);
    };
    const events = ["mousemove", "keydown", "touchstart", "click"] as const;
    events.forEach(e => window.addEventListener(e, reset));
    reset();
    return () => {
      events.forEach(e => window.removeEventListener(e, reset));
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    };
  }, [fromKiosk, navigate]);

  // Restrict manager to their first assigned location
  useEffect(() => {
    if (!isOwner && activeUser && activeUser.location_ids.length > 0) {
      setCurrentLocationId(activeUser.location_ids[0]);
    }
  }, [isOwner, activeUser]);

  // ─── CRUD Handlers ──────────────────────────────────────────────────────────

  const saveLocation = (loc: Location) => {
    saveLocationMut.mutate(loc, {
      onSuccess: () => toast.success(loc.id ? "Location updated" : "Location created"),
      onError: (err: Error) => {
        // Translate the raw Postgres RLS error into a product-level message
        const isLimitError =
          err.message?.toLowerCase().includes("row-level security") ||
          err.message?.toLowerCase().includes("violates") ||
          err.message?.toLowerCase().includes("policy");
        if (isLimitError && !loc.id) {
          // Only INSERT can hit the limit; UPDATE (loc.id truthy) never will.
          // Message and CTA are plan-aware so a Growth user doesn't see "upgrade to Growth".
          if (plan === "growth") {
            toast.error(
              "Growth includes up to 10 locations. Contact us to move to Enterprise for unlimited locations.",
              { action: { label: "Book a demo", onClick: () => window.location.href = "mailto:enterprise@olia.com" } },
            );
          } else {
            const max = PLAN_FEATURES[plan].maxLocations;
            toast.error(
              `Starter includes ${max} location. Upgrade to Growth to add more locations.`,
              { action: { label: "Upgrade", onClick: () => navigate("/billing") } },
            );
          }
        } else {
          toast.error(`Failed to save location: ${err.message}`);
        }
      },
    });
  };

  const deleteLocation = (id: string) => {
    setConfirmModal({
      title: "Delete location",
      message: "This will permanently remove the location and cannot be undone.",
      actionLabel: "Delete",
      onConfirm: () => {
        deleteLocationMut.mutate(id, {
          onSuccess: () => toast.success("Location deleted"),
          onError: (err: Error) => toast.error(`Failed to delete location: ${err.message}`),
        });
        setConfirmModal(null);
      },
    });
  };

  const saveStaff = (sp: StaffProfile) => {
    saveStaffMut.mutate(sp, {
      onSuccess: () => toast.success(sp.id ? "Staff profile updated" : "Staff profile created"),
      onError: (err: Error) => toast.error(`Failed to save staff profile: ${err.message}`),
    });
  };

  const archiveStaff = (sp: StaffProfile) => {
    setConfirmModal({
      title: "Archive staff profile",
      message: (
        <>
          <strong className="text-foreground">{staffDisplayName(sp)}</strong>
          {" "}will be archived and removed from active lists. They can be restored later.
        </>
      ),
      actionLabel: "Archive",
      onConfirm: () => {
        archiveStaffMut.mutate(sp.id, {
          onSuccess: () => toast.success(`${staffDisplayName(sp)} archived`),
          onError: (err: Error) => toast.error(`Could not archive: ${err.message}`),
        });
        setConfirmModal(null);
      },
    });
  };

  const restoreStaff = (id: string) => {
    restoreStaffMut.mutate(id, {
      onSuccess: () => toast.success("Profile restored"),
      onError: (err: Error) => toast.error(`Could not restore: ${err.message}`),
    });
  };

  const deleteStaff = (sp: StaffProfile) => {
    setConfirmModal({
      title: "Delete staff profile",
      message: (
        <>
          Permanently delete{" "}
          <strong className="text-foreground">{staffDisplayName(sp)}</strong>? This cannot be undone.
        </>
      ),
      actionLabel: "Delete permanently",
      onConfirm: () => {
        deleteStaffMut.mutate(sp.id);
        setConfirmModal(null);
      },
    });
  };

  const saveMember = (m: TeamMember & { rawPin?: string }) => {
    saveMemberMut.mutate(m);
  };

  const savePerms = (memberId: string, perms: ManagerPermissions) => {
    const member = teamMembers.find(m => m.id === memberId);
    if (member) saveMemberMut.mutate({ ...member, permissions: perms });
  };

  const deleteMember = (m: TeamMember) => {
    // CRITICAL: Never allow deleting your own team_members row.
    // If you delete yourself, fetchTeamMember finds no row on next load,
    // calls setup_new_organization, and creates a brand-new org — leaving
    // all existing locations, staff, and checklists under the old org_id.
    // RLS then silently blocks every write operation.
    if (m.id === authMember?.id) {
      toast.error("You cannot remove yourself from the team.");
      return;
    }
    setConfirmModal({
      title: "Remove team member",
      message: (
        <>Remove <strong className="text-foreground">{m.name}</strong> from the team? This cannot be undone.</>
      ),
      actionLabel: "Remove",
      onConfirm: () => {
        deleteMemberMut.mutate(m.id);
        setConfirmModal(null);
      },
    });
  };

  // ─── Derived values ─────────────────────────────────────────────────────────

  const userLabel = activeUser
    ? `${activeUser.role} · ${activeUser.name}`
    : authMember
    ? `${authMember.role} · ${authMember.name}`
    : "Admin";

  const TABS = [
    { key: "location" as const, label: "My Location" },
    ...(isOwner ? [{ key: "account" as const, label: "Account" }] : []),
  ];

  // ── Setup error screen — shown when setup_new_organization failed ────────────
  if (setupError) {
    return (
      <Layout title="Admin" subtitle="Setup required">
        <div className="flex flex-col items-center justify-center py-16 px-4 text-center space-y-5">
          <div className="w-16 h-16 rounded-2xl bg-status-error/10 flex items-center justify-center">
            <X size={28} className="text-status-error" />
          </div>
          <div className="space-y-2">
            <h2 className="font-display text-xl text-foreground">Account setup incomplete</h2>
            <p className="text-sm text-muted-foreground max-w-xs leading-relaxed">
              Your account was created but the database setup did not complete.
              Run migration <span className="font-mono text-xs bg-muted px-1 rounded">20260316000001</span> in
              your Supabase SQL Editor, then tap <strong>Try again</strong>.
            </p>
          </div>
          <button
            onClick={retrySetup}
            className="flex items-center gap-2 px-5 py-3 rounded-xl bg-sage text-primary-foreground text-sm font-semibold hover:bg-sage-deep transition-colors"
          >
            Try again
          </button>
        </div>
      </Layout>
    );
  }

  return (
    <>
      <Layout
        title="Admin"
        subtitle={userLabel}
        headerLeft={fromKiosk ? (
          <button
            onClick={() => navigate("/kiosk")}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft size={14} /> Kiosk
          </button>
        ) : undefined}
      >
        <div className="mx-auto w-full max-w-[1040px] space-y-4 xl:max-w-[980px]">
          {/* Sub-tab pill toggle */}
          <div className="flex gap-1 bg-muted rounded-2xl p-1 md:hidden">
            {TABS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => navigate(key === "location" ? "/admin/location" : "/admin/account")}
                className={cn(
                  "flex-1 py-2.5 text-xs font-semibold rounded-xl transition-colors tracking-wide",
                  activeTab === key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {activeTab === "location" && (
            <MyLocationTab
              locations={locations}
              staffProfiles={staffProfiles}
              checklists={checklists}
              roles={staffRoleOptions}
              currentLocationId={currentLocationId}
              setCurrentLocationId={setCurrentLocationId}
              isOwner={isOwner}
              permissions={permissions}
              onAddLocation={() => setLocationModal("new")}
              onEditLocation={loc => setLocationModal(loc)}
              onUpdateLocation={saveLocation}
              onAddStaff={() => setStaffModal("new")}
              onEditStaff={sp => setStaffModal(sp)}
              onArchiveStaff={archiveStaff}
              onRestoreStaff={restoreStaff}
              onDeleteStaff={deleteStaff}
              onLaunchKiosk={() => navigate(`/kiosk?locationId=${currentLocationId}`)}
            />
          )}

          {activeTab === "account" && isOwner && (
            <AccountTab
              locations={allLocations}
              activeLocationIds={effectiveActiveLocationIds}
              inactiveLocationIds={inactiveLocations.map((location) => location.id)}
              staffProfiles={staffProfiles}
              teamMembers={teamMembers}
              checklists={checklists}
              onSavePerms={savePerms}
              onSaveAccount={payload => saveMemberMut.mutateAsync(payload)}
              departments={departments}
              setDepartments={setDepartments}
              auditLog={auditLog}
              authAccount={authMember ? {
                id: authMember.id,
                name: authMember.name,
                email: user?.email ?? authMember.email,
                role: authMember.role,
                initials: getInitials(authMember.name),
                location_ids: authMember.location_ids,
                permissions: authMember.permissions,
                pin_reset_required: authMember.pin_reset_required ?? false,
              } : null}
              authMemberId={authMember?.id}
              authUserEmail={user?.email}
              authUserName={authMember?.name}
              billingUnavailable={billingUnavailable}
              locationLimit={maxLocations}
              isLocationOverLimit={isOverLimit}
              locationGraceEndsAt={graceEndsAt}
              isGraceActive={isGraceActive}
              isGraceExpired={isGraceExpired}
              onAddLocation={() => setLocationModal("new")}
              onLocationLimitReached={() => setShowLocationLimitModal(true)}
              onEditLocation={loc => setLocationModal(loc)}
              onDeleteLocation={deleteLocation}
              onSaveActiveLocations={locationIds => saveActiveLocationsMut.mutateAsync(locationIds)}
              savingActiveLocations={saveActiveLocationsMut.isPending}
              onInviteMember={() => setMemberModal("new")}
              onEditMember={m => setMemberModal(m)}
              onDeleteMember={deleteMember}
            />
          )}
        </div>
      </Layout>

      {/* ─── Modals ──────────────────────────────────────────────────────────── */}

      {/* Location plan-limit upgrade prompt.
          Rendered here (outside Layout/main) so position:fixed is viewport-relative.
          The animate-fade-in keyframe on <main> uses transform, which creates a
          CSS containing block — any fixed element inside it is positioned relative
          to <main> rather than the viewport, causing the modal to appear off-screen
          or require scrolling to see. */}
      {showLocationLimitModal && (
        <div
          className="fixed inset-0 z-50 flex items-end bg-foreground/20 backdrop-blur-sm sm:items-center sm:justify-center sm:px-4 sm:py-8"
          onClick={() => setShowLocationLimitModal(false)}
        >
          <div
            className="w-full bg-card rounded-t-2xl p-6 space-y-4 max-w-[480px] mx-auto sm:max-w-xl sm:rounded-2xl sm:max-h-[90vh] sm:overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            {/* Icon */}
            <div className="flex justify-center">
              <div className="w-12 h-12 rounded-2xl bg-sage/10 flex items-center justify-center">
                <MapPin size={22} className="text-sage" />
              </div>
            </div>

            {plan === "growth" ? (
              /* ── Growth → Enterprise prompt ────────────────────────────── */
              <>
                <div className="text-center space-y-2">
                  <h2 className="font-display text-xl text-foreground">
                    Scale beyond 10 locations with Enterprise
                  </h2>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Growth supports up to 10 locations. Enterprise is built for larger
                    hospitality groups that need unlimited locations, a dedicated account
                    manager, and custom onboarding.
                  </p>
                  <p className="text-xs text-muted-foreground">Current plan: {PLAN_LABELS[plan]}</p>
                </div>
                <div className="space-y-2 pt-1">
                  <a
                    href="mailto:enterprise@olia.com"
                    onClick={() => setShowLocationLimitModal(false)}
                    className="w-full py-3 rounded-xl bg-sage text-primary-foreground text-sm font-semibold hover:bg-sage-deep transition-colors flex items-center justify-center"
                  >
                    Book a demo
                  </a>
                  <button
                    onClick={() => setShowLocationLimitModal(false)}
                    className="w-full py-3 rounded-xl border border-border text-sm text-muted-foreground hover:bg-muted transition-colors"
                  >
                    Not now
                  </button>
                </div>
              </>
            ) : (
              /* ── Starter → Growth prompt ────────────────────────────────── */
              <>
                <div className="text-center space-y-2">
                  <h2 className="font-display text-xl text-foreground">
                    Add more locations with Growth
                  </h2>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Starter includes 1 location. Growth supports up to 10 locations so
                    you can manage multiple venues and teams from one account.
                  </p>
                  <p className="text-xs font-medium text-foreground/70">
                    Growth — {PLAN_PRICES.growth.currency}{PLAN_PRICES.growth.monthly} / month
                  </p>
                  <p className="text-xs text-muted-foreground">Current plan: {PLAN_LABELS[plan]}</p>
                  <button
                    onClick={() => { setShowLocationLimitModal(false); navigate("/billing"); }}
                    className="text-xs text-sage underline underline-offset-2 hover:text-sage-deep transition-colors"
                  >
                    View plans
                  </button>
                </div>
                <div className="space-y-2 pt-1">
                  <button
                    onClick={() => { setShowLocationLimitModal(false); navigate("/billing"); }}
                    className="w-full py-3 rounded-xl bg-sage text-primary-foreground text-sm font-semibold hover:bg-sage-deep transition-colors"
                  >
                    Upgrade to Growth
                  </button>
                  <button
                    onClick={() => setShowLocationLimitModal(false)}
                    className="w-full py-3 rounded-xl border border-border text-sm text-muted-foreground hover:bg-muted transition-colors"
                  >
                    Not now
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {locationModal !== null && (
        <LocationModal
          location={locationModal === "new" ? null : locationModal}
          onClose={() => setLocationModal(null)}
          onSave={loc => { saveLocation(loc); setLocationModal(null); }}
        />
      )}

      {staffModal !== null && (
        <StaffProfileModal
          profile={staffModal === "new" ? null : staffModal}
          locations={locations}
          departments={departments}
          onClose={() => setStaffModal(null)}
          onSave={sp => { saveStaff(sp); setStaffModal(null); }}
        />
      )}

      {memberModal !== null && (
        <TeamMemberModal
          member={memberModal === "new" ? null : memberModal}
          locations={locations}
          onClose={() => setMemberModal(null)}
          onSave={m => { saveMember(m); setMemberModal(null); }}
        />
      )}

      {confirmModal && (
        <ConfirmModal {...confirmModal} onClose={() => setConfirmModal(null)} />
      )}
    </>
  );
}
