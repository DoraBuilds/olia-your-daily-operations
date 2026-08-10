import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Layout } from "@/components/Layout";
import { MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  type Location, type StaffProfile, type TeamMember, type ManagerPermissions,
  staffDisplayName, getInitials,
} from "@/lib/admin-repository";
import { useAuth } from "@/contexts/AuthContext";
import { readKioskAdminSession } from "@/lib/kiosk-admin-session";
import { useAuditLog } from "@/hooks/useAuditLog";
import { usePlan, useSaveActiveLocationsSelection } from "@/hooks/usePlan";
import { PLAN_LABELS, PLAN_PRICES, PLAN_FEATURES } from "@/lib/plan-features";
import { useLocations, useSaveLocation, useDeleteLocation } from "@/hooks/useLocations";
import {
  useStaffProfiles, useSaveStaffProfile, useArchiveStaffProfile,
  useRestoreStaffProfile, useDeleteStaffProfile,
} from "@/hooks/useStaffProfiles";
import { useTeamMembers, useSaveTeamMember, useDeleteTeamMember, useSendInvite, useTeamMemberInvites } from "@/hooks/useTeamMembers";
import { useDepartments } from "@/hooks/useDepartments";
import { useChecklists } from "@/hooks/useChecklists";
import { toast } from "@/components/ui/sonner";
import { useIsNativeApp } from "@/hooks/useIsNativeApp";

// ─── Sub-modules ──────────────────────────────────────────────────────────────
// Re-export parseGoogleOpeningHours so existing import paths keep working
export { parseGoogleOpeningHours } from "./admin/shared";
import { MyLocationTab } from "./admin/MyLocationTab";
import { AccountTab } from "./admin/AccountTab";
import { NotificationsTab } from "./admin/NotificationsTab";
import {
  ConfirmModal, LocationModal, StaffProfileModal, TeamMemberModal,
  type ConfirmState,
} from "./admin/SharedUI";

// ─── Admin Page ───────────────────────────────────────────────────────────────

export default function Admin() {
  const { t } = useTranslation("admin");
  const location = useLocation();
  const navigate = useNavigate();
  const { user, teamMember: authMember } = useAuth();

  // Resolve the kiosk-authenticated userId from the shared session grant.
  // Read once at mount (not from the "?from=kiosk" query param, which the
  // tab-switcher below drops on every navigate) so the PIN-granted session —
  // and the userId/permission scoping derived from it — survives switching
  // between My Location / Users / Account / Billing / Notifications.
  // ProtectedRoute already guarantees a kiosk device can't reach this page
  // at all without a live grant, so there's no separate "invalid token"
  // redirect to handle here.
  const [kioskAdminSession] = useState(() => readKioskAdminSession());
  const userId = kioskAdminSession?.userId ?? null;
  const { plan, billingUnavailable } = usePlan();
  const isNative = useIsNativeApp();

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
  const sendInviteMut = useSendInvite();
  const { data: pendingInvites = [] } = useTeamMemberInvites();

  // Local state (not persisted to DB yet)
  const { departments, setDepartments } = useDepartments();
  const staffRoleOptions = departments.map(d => d.name);
  const { data: auditLog = [] } = useAuditLog();

  // UI state
  const routeTab: "location" | "users" | "account" | "billing" | "notifications" =
    location.pathname.startsWith("/admin/users") ? "users" :
    location.pathname.startsWith("/admin/account") ? "account" :
    location.pathname.startsWith("/admin/billing") ? "billing" :
    location.pathname.startsWith("/admin/notifications") ? "notifications" : "location";
  const [activeTab, setActiveTab] = useState<"location" | "users" | "account" | "billing" | "notifications">(routeTab);
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
    if (!isOwner && (routeTab === "account" || routeTab === "notifications")) {
      navigate("/admin/location", { replace: true });
      return;
    }
    setActiveTab(routeTab);
  }, [isOwner, navigate, routeTab]);
  const permissions: ManagerPermissions | null = isOwner ? null : (activeUser?.permissions ?? null);

  // Restrict manager to their first assigned location
  useEffect(() => {
    if (!isOwner && activeUser && activeUser.location_ids.length > 0) {
      setCurrentLocationId(activeUser.location_ids[0]);
    }
  }, [isOwner, activeUser]);

  // ─── CRUD Handlers ──────────────────────────────────────────────────────────

  const saveLocation = (loc: Location) => {
    saveLocationMut.mutate(loc, {
      onSuccess: () => toast.success(loc.id ? t("toast.locationUpdated") : t("toast.locationCreated")),
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
              t("toast.growthLimitError"),
              { action: { label: t("toast.bookADemo"), onClick: () => window.location.href = "mailto:enterprise@olia.com" } },
            );
          } else {
            const max = PLAN_FEATURES[plan].maxLocations;
            toast.error(
              t("toast.starterLimitError", { max }),
              isNative ? undefined : { action: { label: t("toast.upgrade"), onClick: () => navigate("/billing") } },
            );
          }
        } else {
          toast.error(t("toast.saveLocationFailed", { error: err.message }));
        }
      },
    });
  };

  const deleteLocation = (id: string) => {
    setConfirmModal({
      title: t("confirm.deleteLocationTitle"),
      message: t("confirm.deleteLocationMessage"),
      actionLabel: t("confirm.delete"),
      onConfirm: () => {
        deleteLocationMut.mutate(id, {
          onSuccess: () => toast.success(t("toast.locationDeleted")),
          onError: (err: Error) => toast.error(t("toast.deleteLocationFailed", { error: err.message })),
        });
        setConfirmModal(null);
      },
    });
  };

  const saveStaff = (sp: StaffProfile) => {
    saveStaffMut.mutate(sp, {
      onSuccess: () => toast.success(sp.id ? t("toast.staffProfileUpdated") : t("toast.staffProfileCreated")),
      onError: (err: Error) => toast.error(t("toast.saveStaffFailed", { error: err.message })),
    });
  };

  const archiveStaff = (sp: StaffProfile) => {
    setConfirmModal({
      title: t("confirm.archiveStaffTitle"),
      message: (
        <>
          <strong className="text-foreground">{staffDisplayName(sp)}</strong>
          {" "}{t("confirm.archiveStaffMessage")}
        </>
      ),
      actionLabel: t("confirm.archive"),
      onConfirm: () => {
        archiveStaffMut.mutate(sp.id, {
          onSuccess: () => toast.success(t("toast.staffArchived", { name: staffDisplayName(sp) })),
          onError: (err: Error) => toast.error(t("toast.archiveStaffFailed", { error: err.message })),
        });
        setConfirmModal(null);
      },
    });
  };

  const restoreStaff = (id: string) => {
    restoreStaffMut.mutate(id, {
      onSuccess: () => toast.success(t("toast.profileRestored")),
      onError: (err: Error) => toast.error(t("toast.restoreStaffFailed", { error: err.message })),
    });
  };

  const deleteStaff = (sp: StaffProfile) => {
    setConfirmModal({
      title: t("confirm.deleteStaffTitle"),
      message: (
        <>
          {t("confirm.deleteStaffPrefix")}{" "}
          <strong className="text-foreground">{staffDisplayName(sp)}</strong>{t("confirm.deleteStaffSuffix")}
        </>
      ),
      actionLabel: t("confirm.deletePermanently"),
      onConfirm: () => {
        deleteStaffMut.mutate(sp.id);
        setConfirmModal(null);
      },
    });
  };

  const saveMember = (m: TeamMember & { rawPin?: string }) => {
    const isNew = !m.id;
    saveMemberMut.mutateAsync(m).then(newId => {
      if (isNew && newId) {
        sendInviteMut.mutate(newId, {
          onSuccess: () => toast.success(t("toast.inviteSent", { email: m.email })),
          onError: () => toast.error(t("toast.inviteFailed")),
        });
      }
    }).catch(() => { /* error shown by mutation */ });
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
      toast.error(t("toast.cannotRemoveSelf"));
      return;
    }
    setConfirmModal({
      title: t("confirm.removeMemberTitle"),
      message: (
        <>{t("confirm.removeMemberPrefix")} <strong className="text-foreground">{m.name}</strong> {t("confirm.removeMemberSuffix")}</>
      ),
      actionLabel: t("confirm.remove"),
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
    : t("userLabelFallback");

  const TABS = [
    { key: "location" as const, label: t("tabs.locations") },
    ...(isOwner ? [
      { key: "users" as const, label: t("tabs.users") },
      { key: "account" as const, label: t("tabs.account") },
      { key: "notifications" as const, label: t("tabs.notifications") },
      { key: "billing" as const, label: t("tabs.billing") },
    ] : []),
  ];


  return (
    <>
      <Layout
        title="Olia"
        subtitle={userLabel}
      >
        <div className="mx-auto w-full max-w-[1040px] space-y-4 xl:max-w-[980px]">
          {/* Sub-tab pill toggle */}
          <div className="flex gap-1 bg-muted rounded-2xl p-1">
            {TABS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => navigate(`/admin/${key === "location" ? "location" : key}`)}
                className={cn(
                  "flex-1 py-2.5 text-xs font-semibold rounded-xl transition-colors tracking-wide",
                  activeTab === key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Shared AccountTab props */}
          {(() => {
            const accountTabProps = isOwner ? {
              locations: allLocations,
              activeLocationIds: effectiveActiveLocationIds,
              inactiveLocationIds: inactiveLocations.map((location) => location.id),
              staffProfiles,
              teamMembers,
              checklists,
              onSavePerms: savePerms,
              onSaveAccount: (payload: any) => saveMemberMut.mutateAsync(payload),
              departments,
              setDepartments,
              auditLog,
              authAccount: authMember ? {
                id: authMember.id,
                name: authMember.name,
                email: user?.email ?? authMember.email,
                role: authMember.role,
                initials: getInitials(authMember.name),
                location_ids: authMember.location_ids,
                permissions: authMember.permissions,
                pin_reset_required: authMember.pin_reset_required ?? false,
              } : null,
              authMemberId: authMember?.id,
              authUserEmail: user?.email,
              authUserName: authMember?.name,
              billingUnavailable,
              locationLimit: maxLocations,
              isLocationOverLimit: isOverLimit,
              locationGraceEndsAt: graceEndsAt,
              isGraceActive,
              isGraceExpired,
              onAddLocation: () => setLocationModal("new"),
              onLocationLimitReached: () => setShowLocationLimitModal(true),
              onEditLocation: (loc: any) => setLocationModal(loc),
              onDeleteLocation: deleteLocation,
              onSaveActiveLocations: (locationIds: any) => saveActiveLocationsMut.mutateAsync(locationIds),
              savingActiveLocations: saveActiveLocationsMut.isPending,
              pendingInviteStatus: new Map(
                pendingInvites.map(i => [i.team_member_id, new Date(i.expires_at) <= new Date()]),
              ),
              onInviteMember: () => setMemberModal("new"),
              onEditMember: (m: any) => setMemberModal(m),
              onDeleteMember: deleteMember,
            } : null;

            return (
              <>
                {activeTab === "location" && (
                  <div className="space-y-4">
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
                    {isOwner && accountTabProps && <AccountTab {...accountTabProps} section="locations" />}
                  </div>
                )}
                {activeTab === "users" && isOwner && accountTabProps && <AccountTab {...accountTabProps} section="users" />}
                {activeTab === "account" && isOwner && accountTabProps && <AccountTab {...accountTabProps} section="account" />}
                {activeTab === "notifications" && isOwner && <NotificationsTab />}
                {activeTab === "billing" && isOwner && accountTabProps && <AccountTab {...accountTabProps} section="billing" />}
              </>
            );
          })()}
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
                    {t("locationLimit.growthTitle")}
                  </h2>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {t("locationLimit.growthBody")}
                  </p>
                  <p className="text-xs text-muted-foreground">{t("locationLimit.currentPlan", { plan: PLAN_LABELS[plan] })}</p>
                </div>
                <div className="space-y-2 pt-1">
                  <a
                    href="mailto:enterprise@olia.com"
                    onClick={() => setShowLocationLimitModal(false)}
                    className="w-full py-3 rounded-xl bg-sage text-primary-foreground text-sm font-semibold hover:bg-sage-deep transition-colors flex items-center justify-center"
                  >
                    {t("locationLimit.bookADemo")}
                  </a>
                  <button
                    onClick={() => setShowLocationLimitModal(false)}
                    className="w-full py-3 rounded-xl border border-border text-sm text-muted-foreground hover:bg-muted transition-colors"
                  >
                    {t("locationLimit.notNow")}
                  </button>
                </div>
              </>
            ) : (
              /* ── Starter → Growth prompt ────────────────────────────────── */
              <>
                <div className="text-center space-y-2">
                  <h2 className="font-display text-xl text-foreground">
                    {t("locationLimit.starterTitle")}
                  </h2>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {t("locationLimit.starterBody")}
                  </p>
                  {!isNative && (
                    <p className="text-xs font-medium text-foreground/70">
                      {t("locationLimit.growthPricePerMonth", { currency: PLAN_PRICES.growth.currency, price: PLAN_PRICES.growth.monthly })}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">{t("locationLimit.currentPlan", { plan: PLAN_LABELS[plan] })}</p>
                  {!isNative && (
                    <button
                      onClick={() => { setShowLocationLimitModal(false); navigate("/billing"); }}
                      className="text-xs text-sage underline underline-offset-2 hover:text-sage-deep transition-colors"
                    >
                      {t("locationLimit.viewPlans")}
                    </button>
                  )}
                </div>
                <div className="space-y-2 pt-1">
                  {isNative ? (
                    <a
                      href="https://olia.app/billing"
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => setShowLocationLimitModal(false)}
                      className="w-full py-3 rounded-xl bg-sage text-primary-foreground text-sm font-semibold hover:bg-sage-deep transition-colors flex items-center justify-center"
                    >
                      {t("locationLimit.upgradeAtOlia")}
                    </a>
                  ) : (
                    <button
                      onClick={() => { setShowLocationLimitModal(false); navigate("/billing"); }}
                      className="w-full py-3 rounded-xl bg-sage text-primary-foreground text-sm font-semibold hover:bg-sage-deep transition-colors"
                    >
                      {t("locationLimit.upgradeToGrowth")}
                    </button>
                  )}
                  <button
                    onClick={() => setShowLocationLimitModal(false)}
                    className="w-full py-3 rounded-xl border border-border text-sm text-muted-foreground hover:bg-muted transition-colors"
                  >
                    {t("locationLimit.notNow")}
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
          isOwner={isOwner}
        />
      )}

      {memberModal !== null && (
        <TeamMemberModal
          member={memberModal === "new" ? null : memberModal}
          locations={locations}
          onClose={() => setMemberModal(null)}
          onSave={m => { saveMember(m); setMemberModal(null); }}
          isOwner={isOwner}
        />
      )}

      {confirmModal && (
        <ConfirmModal {...confirmModal} onClose={() => setConfirmModal(null)} />
      )}
    </>
  );
}
