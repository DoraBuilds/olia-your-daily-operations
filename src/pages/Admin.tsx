import { useState, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Trans, useTranslation } from "react-i18next";
import { Layout } from "@/components/Layout";
import { MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  type Location, type Concept, type TeamMember, type ManagerPermissions,
  getInitials,
} from "@/lib/admin-repository";
import { useAuth } from "@/contexts/AuthContext";
import { readKioskAdminSession } from "@/lib/kiosk-admin-session";
import { usePlan, useSaveActiveLocationsSelection } from "@/hooks/usePlan";
import { PLAN_LABELS, PLAN_PRICES } from "@/lib/plan-features";
import { useLocations, useSaveLocation, useDeleteLocation } from "@/hooks/useLocations";
import { useConcepts, useSaveConcept, useDeleteConcept } from "@/hooks/useConcepts";
import { useTeamMembers, useSaveTeamMember, useDeleteTeamMember, useSendInvite, useTeamMemberInvites } from "@/hooks/useTeamMembers";
import { useChecklists } from "@/hooks/useChecklists";
import { toast } from "@/components/ui/sonner";
import { useIsNativeApp } from "@/hooks/useIsNativeApp";

// ─── Sub-modules ──────────────────────────────────────────────────────────────
// Re-export parseGoogleOpeningHours so existing import paths keep working
export { parseGoogleOpeningHours } from "./admin/shared";
import { ConceptsTab } from "./admin/ConceptsTab";
import { AccountTab } from "./admin/AccountTab";
import { NotificationsTab } from "./admin/NotificationsTab";
import { KiosksTab } from "./admin/KiosksTab";
import {
  ConfirmModal, LocationModal, TeamMemberModal, ConceptModal,
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
  // between Concepts / Users / Account / Billing / Notifications.
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
  const { data: concepts = [] } = useConcepts();
  const { data: teamMembers = [] } = useTeamMembers();
  const { data: checklists = [] } = useChecklists();
  const saveActiveLocationsMut = useSaveActiveLocationsSelection();
  const saveLocationMut = useSaveLocation();
  const deleteLocationMut = useDeleteLocation();
  const saveConceptMut = useSaveConcept();
  const deleteConceptMut = useDeleteConcept();
  const saveMemberMut = useSaveTeamMember();
  const deleteMemberMut = useDeleteTeamMember();
  const sendInviteMut = useSendInvite();
  const { data: pendingInvites = [] } = useTeamMemberInvites();

  // UI state
  const routeTab: "location" | "users" | "account" | "billing" | "notifications" | "kiosks" =
    location.pathname.startsWith("/admin/users") ? "users" :
    location.pathname.startsWith("/admin/account") ? "account" :
    location.pathname.startsWith("/admin/billing") ? "billing" :
    location.pathname.startsWith("/admin/notifications") ? "notifications" :
    location.pathname.startsWith("/admin/kiosks") ? "kiosks" : "location";
  const [activeTab, setActiveTab] = useState<"location" | "users" | "account" | "billing" | "notifications" | "kiosks">(routeTab);
  const [currentConceptId, setCurrentConceptId] = useState("");
  const [currentLocationId, setCurrentLocationId] = useState("");

  // Default to the first concept once data loads
  useEffect(() => {
    if (concepts.length > 0 && !currentConceptId) {
      setCurrentConceptId(concepts[0].id);
    }
  }, [concepts, currentConceptId]);

  // Default currentLocationId to the current concept's first location —
  // ConceptsTab falls back to this internally for its own rendering, but
  // Admin.tsx's own handlers (launchKiosk in particular) read this state
  // directly, so it must actually be set once data loads, not just visually
  // implied (#regression: launchKiosk silently used an empty locationId for
  // an Owner who hadn't yet clicked a location card).
  useEffect(() => {
    if (!currentConceptId) return;
    const stillValid = locations.some(l => l.id === currentLocationId && l.concept_id === currentConceptId);
    if (stillValid) return;
    const firstInConcept = locations.find(l => l.concept_id === currentConceptId);
    setCurrentLocationId(firstInConcept?.id ?? "");
  }, [locations, currentConceptId, currentLocationId]);

  // Modal state
  const [locationModal, setLocationModal] = useState<Location | null | "new">(null);
  const [conceptModal, setConceptModal] = useState<Concept | null | "new">(null);
  const [memberModal, setMemberModal] = useState<TeamMember | null | "new">(null);
  const [confirmModal, setConfirmModal] = useState<ConfirmState>(null);
  // Location-limit upgrade prompt — rendered AFTER </Layout> so position:fixed
  // escapes the animate-fade-in containing block on <main>.
  const [showLocationLimitModal, setShowLocationLimitModal] = useState(false);

  // Determine active user from URL param
  const activeUser = userId ? (teamMembers.find(m => m.id === userId) ?? null) : null;
  const isOwner = !activeUser || activeUser.is_owner;

  useEffect(() => {
    if (!isOwner && (routeTab === "account" || routeTab === "notifications")) {
      navigate("/admin/location", { replace: true });
      return;
    }
    setActiveTab(routeTab);
  }, [isOwner, navigate, routeTab]);
  const permissions: ManagerPermissions | null = isOwner ? null : (activeUser?.permissions ?? null);

  // Restrict manager to their first assigned location (and its concept)
  useEffect(() => {
    if (!isOwner && activeUser && activeUser.location_ids.length > 0) {
      const loc = locations.find(l => l.id === activeUser.location_ids[0]);
      setCurrentLocationId(activeUser.location_ids[0]);
      if (loc?.concept_id) setCurrentConceptId(loc.concept_id);
    }
  }, [isOwner, activeUser, locations]);

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
          // Only Starter is capped at 1 location — Growth and Enterprise are
          // both unlimited (maxLocations -1), so this can only fire for a
          // Starter org. The CTA is always "upgrade to Growth".
          toast.error(
            t("toast.locationLimitError"),
            { action: { label: t("toast.upgrade"), onClick: () => navigate("/billing") } },
          );
        } else {
          toast.error(t("toast.saveLocationFailed", { error: err.message }));
        }
      },
    });
  };

  const deleteLocation = (id: string) => {
    const locationName = (locations.find(l => l.id === id) ?? allLocations.find(l => l.id === id))?.name;
    setConfirmModal({
      title: t("confirm.deleteLocationTitle"),
      message: locationName
        ? (
          <Trans
            i18nKey="admin:confirm.deleteLocationMessage"
            values={{ name: locationName }}
            components={{ bold: <strong className="text-foreground" /> }}
          />
        )
        : t("confirm.deleteLocationMessageGeneric"),
      actionLabel: t("confirm.delete"),
      requireDeleteText: true,
      onConfirm: () => {
        deleteLocationMut.mutate(id, {
          onSuccess: () => toast.success(t("toast.locationDeleted")),
          onError: (err: Error) => toast.error(t("toast.deleteLocationFailed", { error: err.message })),
        });
        setConfirmModal(null);
      },
    });
  };

  // Plan-limit gating for adding a location, lifted here so both the
  // Concepts tab's "Add location" card and onboarding CTA route through it.
  const atLocationLimit = maxLocations !== -1 && locations.length >= maxLocations;
  const handleAddLocationClick = () => {
    if (billingUnavailable) {
      toast.error(t("accountTab.toast.billingUnavailableError"));
      return;
    }
    if (atLocationLimit) {
      setShowLocationLimitModal(true);
    } else {
      setLocationModal("new");
    }
  };

  const saveConcept = (c: { id?: string; name: string }) => {
    saveConceptMut.mutate(c, {
      onSuccess: (newId) => {
        toast.success(c.id ? t("toast.conceptUpdated") : t("toast.conceptCreated"));
        if (!c.id && typeof newId === "string") setCurrentConceptId(newId);
      },
      onError: (err: Error) => toast.error(t("toast.saveConceptFailed", { error: err.message })),
    });
  };

  const deleteConcept = (id: string) => {
    const conceptLocationCount = locations.filter(l => l.concept_id === id).length;
    setConfirmModal({
      title: t("confirm.deleteConceptTitle"),
      message: conceptLocationCount > 0
        ? t("confirm.deleteConceptWithLocationsMessage", { count: conceptLocationCount })
        : t("confirm.deleteConceptMessage"),
      actionLabel: t("confirm.delete"),
      requireDeleteText: true,
      onConfirm: () => {
        deleteConceptMut.mutate(id, {
          onSuccess: () => {
            toast.success(t("toast.conceptDeleted"));
            if (currentConceptId === id) setCurrentConceptId("");
          },
          onError: (err: Error) => toast.error(t("toast.deleteConceptFailed", { error: err.message })),
        });
        setConfirmModal(null);
      },
    });
  };

  const saveMember = (m: TeamMember & { rawPin?: string }) => {
    const isNew = !m.id;
    // Kiosk-only members (is_manager = false) never get admin-app login, so
    // there's no invite email to send for them — the PIN alone is their
    // access. An invite is only needed the moment a member first becomes a
    // manager: either brand new, or an existing kiosk-only member whose
    // manager-role toggle was just switched on.
    const wasManager = !isNew && (teamMembers.find(existing => existing.id === m.id)?.is_manager ?? false);
    const needsInvite = m.is_manager && (isNew || !wasManager);
    saveMemberMut.mutateAsync(m).then(newId => {
      const memberId = newId ?? m.id;
      if (needsInvite && memberId) {
        sendInviteMut.mutate(memberId, {
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

  // Clicking "Kiosk" instantly and permanently turns *this* browser into
  // the registered kiosk device for the location (see Kiosk.tsx's
  // urlLocationId effect) — with no way to tell that's what's about to
  // happen. A confirmation here is the only guard against someone
  // previewing kiosk mode from their own laptop/phone and getting it
  // silently locked into kiosk mode (#733).
  //
  // The device-name input below (#818) feeds Admin -> Kiosks, where devices
  // are told apart by this label rather than just the location name — a
  // location can have more than one kiosk (host stand, kitchen, etc). It's
  // an uncontrolled input read via a ref at confirm time rather than state,
  // so typing into it doesn't force a re-render of the modal's own message
  // JSX (which was already captured by value in the state below).
  const kioskDeviceLabelRef = useRef("");
  const launchKiosk = () => {
    const loc = locations.find(l => l.id === currentLocationId);
    kioskDeviceLabelRef.current = "";
    setConfirmModal({
      title: t("confirm.launchKioskTitle"),
      message: (
        <div className="space-y-3">
          <p>
            {t("confirm.launchKioskMessage", {
              name: loc?.name ?? t("myLocationTab.kioskDeviceActiveFallbackName"),
            })}
          </p>
          <div>
            <label className="block mb-1 text-xs font-medium text-muted-foreground">
              {t("confirm.launchKioskDeviceLabel")}
            </label>
            <input
              autoFocus
              type="text"
              defaultValue=""
              onChange={e => { kioskDeviceLabelRef.current = e.target.value; }}
              placeholder={t("confirm.launchKioskDeviceLabelPlaceholder")}
              className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-muted focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        </div>
      ),
      actionLabel: t("confirm.launchKioskCta"),
      onConfirm: () => {
        const label = kioskDeviceLabelRef.current.trim();
        const suffix = label ? `&deviceLabel=${encodeURIComponent(label)}` : "";
        navigate(`/kiosk?locationId=${currentLocationId}${suffix}`);
        setConfirmModal(null);
      },
    });
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
      requireDeleteText: true,
      onConfirm: () => {
        deleteMemberMut.mutate(m.id);
        setConfirmModal(null);
      },
    });
  };

  // ─── Derived values ─────────────────────────────────────────────────────────

  const TABS = [
    { key: "location" as const, label: t("tabs.locations") },
    ...(isOwner ? [
      { key: "users" as const, label: t("tabs.users") },
      { key: "account" as const, label: t("tabs.account") },
      { key: "notifications" as const, label: t("tabs.notifications") },
      { key: "billing" as const, label: t("tabs.billing") },
      { key: "kiosks" as const, label: t("tabs.kiosks") },
    ] : []),
  ];


  return (
    <>
      <Layout>
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
              concepts,
              onAddConcept: () => setConceptModal("new"),
              onEditConcept: (c: Concept) => setConceptModal(c),
              onDeleteConcept: deleteConcept,
              activeLocationIds: effectiveActiveLocationIds,
              inactiveLocationIds: inactiveLocations.map((location) => location.id),
              teamMembers,
              onSavePerms: savePerms,
              onSaveAccount: (payload: any) => saveMemberMut.mutateAsync(payload),
              authAccount: authMember ? {
                id: authMember.id,
                name: authMember.name,
                email: user?.email ?? authMember.email,
                role: authMember.role,
                is_owner: authMember.is_owner,
                is_manager: authMember.is_manager,
                department_ids: authMember.department_ids,
                initials: getInitials(authMember.name),
                location_ids: authMember.location_ids,
                permissions: authMember.permissions as unknown as ManagerPermissions,
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
                  <ConceptsTab
                    concepts={concepts}
                    locations={locations}
                    teamMembers={teamMembers}
                    checklists={checklists}
                    currentConceptId={currentConceptId}
                    setCurrentConceptId={setCurrentConceptId}
                    currentLocationId={currentLocationId}
                    setCurrentLocationId={setCurrentLocationId}
                    isOwner={isOwner}
                    permissions={permissions}
                    onAddConcept={() => setConceptModal("new")}
                    onEditConcept={c => setConceptModal(c)}
                    onDeleteConcept={deleteConcept}
                    onAddLocation={handleAddLocationClick}
                    onEditLocation={loc => setLocationModal(loc)}
                    onDeleteLocation={deleteLocation}
                    onLaunchKiosk={launchKiosk}
                  />
                )}
                {activeTab === "users" && isOwner && accountTabProps && <AccountTab {...accountTabProps} section="users" />}
                {activeTab === "account" && isOwner && accountTabProps && <AccountTab {...accountTabProps} section="account" />}
                {activeTab === "notifications" && isOwner && <NotificationsTab />}
                {activeTab === "billing" && isOwner && accountTabProps && <AccountTab {...accountTabProps} section="billing" />}
                {activeTab === "kiosks" && isOwner && <KiosksTab concepts={concepts} locations={locations} />}
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

            {/* Only Starter is capped at 1 location — Growth and Enterprise
                are both unlimited, so this can only ever fire for a Starter
                org. Always a self-serve "upgrade to Growth" prompt. */}
            <div className="text-center space-y-2">
              <h2 className="font-display text-xl text-foreground">
                {t("locationLimit.title")}
              </h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {t("locationLimit.body")}
              </p>
              {!isNative && (
                <p className="text-xs font-medium text-foreground/70">
                  {t("locationLimit.growthPricePerMonth", { currency: PLAN_PRICES.growth.currency, price: PLAN_PRICES.growth.monthly })}
                </p>
              )}
              <p className="text-xs text-muted-foreground">{t("locationLimit.currentPlan", { plan: PLAN_LABELS[plan] })}</p>
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
          </div>
        </div>
      )}

      {locationModal !== null && (
        <LocationModal
          location={locationModal === "new" ? null : locationModal}
          conceptId={currentConceptId}
          onClose={() => setLocationModal(null)}
          onSave={loc => { saveLocation(loc); setLocationModal(null); }}
        />
      )}

      {conceptModal !== null && (
        <ConceptModal
          concept={conceptModal === "new" ? null : conceptModal}
          onClose={() => setConceptModal(null)}
          onSave={saveConcept}
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
