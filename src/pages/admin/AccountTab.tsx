// ─── AccountTab ───────────────────────────────────────────────────────────────

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import i18n from "@/lib/i18n";
import {
  MapPin, Plus, Pencil, Trash2, Check, X, ChevronDown, ChevronUp, MailCheck, Send, Eye, EyeOff,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/sonner";
import { useAuth } from "@/contexts/AuthContext";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import type { SupportedLanguage } from "@/lib/i18n";
import {
  type Location, type StaffProfile, type TeamMember, type ManagerPermissions,
  type StaffDepartment,
  DEFAULT_ADMIN_PIN, DEFAULT_PERMISSIONS,
  getInitials, daysAgoTooltip,
} from "@/lib/admin-repository";
import type { AuditLogRow } from "@/hooks/useAuditLog";
import { usePlan } from "@/hooks/usePlan";
import { PLAN_LABELS, PLAN_PRICES } from "@/lib/plan-features";
import { useIsNativeApp } from "@/hooks/useIsNativeApp";
import { type ChecklistItem } from "@/hooks/useChecklists";
import { useSaveAdminPin, useSendInvite } from "@/hooks/useTeamMembers";
import { PERM_LABELS, roleUsesDepartment, getPermLabel } from "./shared";
import { ConfirmModal } from "./SharedUI";

export interface AccountTabProps {
  locations: Location[];
  activeLocationIds: string[];
  inactiveLocationIds: string[];
  staffProfiles: StaffProfile[];
  teamMembers: TeamMember[];
  checklists: ChecklistItem[];
  onSavePerms: (memberId: string, perms: ManagerPermissions) => void;
  onSaveAccount: (member: Partial<TeamMember> & { id: string; rawPin?: string }) => Promise<unknown>;
  departments: StaffDepartment[];
  setDepartments: React.Dispatch<React.SetStateAction<StaffDepartment[]>>;
  auditLog: AuditLogRow[];
  authAccount: TeamMember | null;
  authMemberId: string | undefined;
  authUserEmail: string | undefined;
  authUserName: string | undefined;
  billingUnavailable: boolean;
  locationLimit: number;
  isLocationOverLimit: boolean;
  locationGraceEndsAt: string | null;
  isGraceActive: boolean;
  isGraceExpired: boolean;
  onAddLocation: () => void;
  onLocationLimitReached: () => void;
  onEditLocation: (loc: Location) => void;
  onDeleteLocation: (id: string) => void;
  onSaveActiveLocations: (locationIds: string[]) => Promise<unknown>;
  savingActiveLocations: boolean;
  /** team_member_id -> whether their outstanding invite has expired */
  pendingInviteStatus: Map<string, boolean>;
  onInviteMember: () => void;
  onEditMember: (m: TeamMember) => void;
  onDeleteMember: (m: TeamMember) => void;
  /** Which section to display. Defaults to showing all (legacy). */
  section?: "account" | "locations" | "users" | "billing";
}

function formatAuditAction(action: string, details: Record<string, any> | null): string {
  const label = i18n.exists(`accountTab.auditActions.${action}`, { ns: "admin" })
    ? i18n.t(`accountTab.auditActions.${action}`, { ns: "admin" })
    : action.replace(/_/g, " ");
  const name = details?.first_name
    ? `${details.first_name} ${details.last_name ?? ""}`.trim()
    : (details?.name ?? null);
  return name ? `${label}: ${name}` : label;
}

export function AccountTab({
  locations, activeLocationIds, inactiveLocationIds, staffProfiles, teamMembers, checklists, onSavePerms,
  onSaveAccount, departments, setDepartments, auditLog, authAccount, authMemberId, authUserEmail, authUserName,
  billingUnavailable, locationLimit, isLocationOverLimit, locationGraceEndsAt, isGraceActive, isGraceExpired,
  onAddLocation, onLocationLimitReached, onEditLocation, onDeleteLocation, onSaveActiveLocations, savingActiveLocations,
  pendingInviteStatus, onInviteMember, onEditMember, onDeleteMember, section,
}: AccountTabProps) {
  const { t } = useTranslation("admin");
  const navigate = useNavigate();
  const { teamMember: authTeamMember, updateLanguage } = useAuth();
  const { plan, planStatus, isActive } = usePlan();
  const isNative = useIsNativeApp();
  const saveAdminPin = useSaveAdminPin();
  const sendInvite = useSendInvite();
  // Team member expand/collapse
  const [expandedMemberId, setExpandedMemberId] = useState<string | null>(null);
  const [pendingPerms, setPendingPerms] = useState<Record<string, ManagerPermissions>>({});
  const currentTeamMember = teamMembers.find(member => member.id === authMemberId);
  const currentAccount = currentTeamMember ?? authAccount ?? (authMemberId ? {
    id: authMemberId,
    name: authUserName ?? "",
    email: authUserEmail ?? "",
    role: "Owner",
    location_ids: [],
    permissions: DEFAULT_PERMISSIONS,
  } : null);
  const assignedLocationIds = currentAccount?.location_ids ?? [];
  const needsDefaultPinChange = Boolean(currentAccount?.pin_reset_required);
  const [profileName, setProfileName] = useState(authUserName ?? currentAccount?.name ?? "");
  const [profileEmail, setProfileEmail] = useState(authUserEmail ?? currentAccount?.email ?? "");
  const [pin, setPin] = useState("");
  const [showNewPin, setShowNewPin] = useState(false);
  const [savedPin, setSavedPin] = useState<string | null>(null);
  const [showSavedPin, setShowSavedPin] = useState(false);
  const [revealedPin, setRevealedPin] = useState<string | null>(null);
  const [showRevealedPin, setShowRevealedPin] = useState(false);
  const [revealLoading, setRevealLoading] = useState(false);

  const [showAddDepartment, setShowAddDepartment] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [pinSaving, setPinSaving] = useState(false);
  const [selectedActiveLocationIds, setSelectedActiveLocationIds] = useState<string[]>(activeLocationIds);
  const [committedActiveLocationIds, setCommittedActiveLocationIds] = useState<string[]>(activeLocationIds);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    setProfileName(authUserName ?? currentAccount?.name ?? "");
    setProfileEmail(authUserEmail ?? currentAccount?.email ?? "");
  }, [authUserEmail, authUserName, currentAccount?.email, currentAccount?.name]);

  useEffect(() => {
    setSelectedActiveLocationIds(activeLocationIds);
  }, [activeLocationIds]);

  useEffect(() => {
    setCommittedActiveLocationIds(activeLocationIds);
  }, [activeLocationIds]);

  const toggleExpand = (id: string, member: TeamMember) => {
    if (expandedMemberId === id) {
      setExpandedMemberId(null);
    } else {
      setExpandedMemberId(id);
      if (!pendingPerms[id]) {
        setPendingPerms(prev => ({ ...prev, [id]: { ...member.permissions } }));
      }
    }
  };

  const savePerms = (memberId: string) => {
    if (pendingPerms[memberId]) {
      onSavePerms(memberId, pendingPerms[memberId]);
    }
  };

  const saveProfile = async () => {
    if (!currentAccount) return;
    const trimmedName = profileName.trim();
    const trimmedEmail = profileEmail.trim();
    if (!trimmedName || !trimmedEmail) return;

    setProfileSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({
        email: trimmedEmail === (authUserEmail ?? "").trim() ? undefined : trimmedEmail,
        data: { full_name: trimmedName },
      });
      if (error) throw error;

      await onSaveAccount({
        id: currentAccount.id,
        name: trimmedName,
        email: trimmedEmail,
        role: currentAccount.role,
        location_ids: currentAccount.location_ids,
        permissions: currentAccount.permissions,
      });
      toast.success(t("accountTab.toast.accountProfileSaved"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("accountTab.toast.couldNotSaveProfile"));
    } finally {
      setProfileSaving(false);
    }
  };

  const handleLanguageChange = async (language: SupportedLanguage) => {
    try {
      await updateLanguage(language);
      toast.success(t("accountTab.toast.languageUpdated"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("accountTab.toast.couldNotUpdateLanguage"));
    }
  };

  const savePin = async () => {
    if (!currentAccount || pin.length !== 4) return;
    setPinSaving(true);
    try {
      const savedValue = pin;
      await saveAdminPin.mutateAsync({ memberId: currentAccount.id, rawPin: savedValue });
      setPin("");
      setShowNewPin(false);
      setSavedPin(savedValue);
      setShowSavedPin(false);
      setRevealedPin(null);
      setShowRevealedPin(false);
      toast.success(t("accountTab.toast.adminPinUpdated"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("accountTab.toast.couldNotUpdatePin"));
    } finally {
      setPinSaving(false);
    }
  };

  const handleRevealPin = async () => {
    if (!currentAccount?.id) return;
    setRevealLoading(true);
    try {
      const { data, error } = await supabase.rpc("admin_reveal_pin", {
        p_member_type: "team_member",
        p_member_id: currentAccount.id,
      });
      if (error) throw error;
      setRevealedPin((data as string) ?? "");
      setShowRevealedPin(true);
    } catch (err) {
      toast.error((err as any)?.message ?? t("accountTab.toast.couldNotRevealPin"));
    } finally {
      setRevealLoading(false);
    }
  };

  const deleteAccount = async () => {
    setDeleting(true);
    try {
      const { data, error } = await supabase.rpc("delete_my_account");
      if (error) throw error;
      if (!data?.success) throw new Error(data?.reason ?? "Could not delete account");
      // Navigate before signOut to avoid ProtectedRoute race
      navigate("/signup?reason=account-deleted", { replace: true });
      await supabase.auth.signOut();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("accountTab.toast.couldNotDeleteAccount"));
    } finally {
      setDeleting(false);
      setShowDeleteModal(false);
    }
  };

  // Department management
  const [renamingDepartment, setRenamingDepartment] = useState<{ index: number; value: string } | null>(null);
  const [newDepartmentName, setNewDepartmentName] = useState("");

  const addDepartment = () => {
    const trimmed = newDepartmentName.trim();
    if (!trimmed || departments.some(d => d.name.toLowerCase() === trimmed.toLowerCase())) return;
    setDepartments(prev => [...prev, { name: trimmed }]);
    setNewDepartmentName("");
  };

  const renameDepartment = (index: number, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed || departments.some((d, i) => i !== index && d.name.toLowerCase() === trimmed.toLowerCase())) return;
    setDepartments(prev => prev.map((department, i) => (i === index ? { ...department, name: trimmed } : department)));
    setRenamingDepartment(null);
  };

  const deleteDepartment = (index: number) => {
    const department = departments[index];
    if (!department) return;
    if (staffProfiles.some(sp => roleUsesDepartment(sp.role, department.name))) return;
    setDepartments(prev => prev.filter((_, i) => i !== index));
  };

  // Plan limit check — checked here so the "Add" button can be disabled-adjacent.
  // The modal itself lives at Admin level (outside Layout) so position:fixed is
  // viewport-relative and not trapped inside the animate-fade-in containing block.
  const maxLocations = locationLimit;
  const atLocationLimit = maxLocations !== -1 && locations.length >= maxLocations;
  const activeLocationSet = new Set(committedActiveLocationIds);
  const inactiveLocationSet = new Set(inactiveLocationIds);
  const graceDeadlineLabel = locationGraceEndsAt
    ? new Date(locationGraceEndsAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
    : null;

  const handleAddLocationClick = () => {
    if (billingUnavailable) {
      toast.error(t("accountTab.toast.billingUnavailableError"));
      return;
    }
    if (atLocationLimit) {
      onLocationLimitReached();
    } else {
      onAddLocation();
    }
  };

  const toggleActiveLocation = (locationId: string) => {
    setSelectedActiveLocationIds((current) => {
      if (current.includes(locationId)) {
        return current.filter((id) => id !== locationId);
      }
      if (maxLocations !== -1 && current.length >= maxLocations) {
        return current;
      }
      return [...current, locationId];
    });
  };

  const saveActiveSelection = async () => {
    if (maxLocations === -1) return;
    if (selectedActiveLocationIds.length !== maxLocations) {
      toast.error(t("accountTab.toast.chooseExactLocations", { count: maxLocations }));
      return;
    }
    try {
      await onSaveActiveLocations(selectedActiveLocationIds);
      setCommittedActiveLocationIds(selectedActiveLocationIds);
      toast.success(t("accountTab.toast.activeLocationsUpdated"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("accountTab.toast.couldNotUpdateActiveLocations"));
    }
  };

  const show = (s: "account" | "locations" | "users" | "billing") => !section || section === s;

  return (
    <div className="space-y-4">
      {/* My Account + Security — side by side */}
      {show("account") && <section className="card-surface p-4">
        <div className="flex gap-4">
          {/* Left: My Account */}
          <div className="flex-1 min-w-0 space-y-3">
            <p className="section-label">{t("accountTab.myAccount")}</p>
            <label className="space-y-1 block">
              <span className="text-xs text-muted-foreground font-medium">{t("accountTab.fullName")}</span>
              <input
                type="text"
                value={profileName}
                onChange={e => setProfileName(e.target.value)}
                className="w-full border border-border rounded-xl px-3 py-2.5 text-sm bg-muted focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </label>
            <label className="space-y-1 block">
              <span className="text-xs text-muted-foreground font-medium">{t("accountTab.email")}</span>
              <input
                type="email"
                value={profileEmail}
                onChange={e => setProfileEmail(e.target.value)}
                className="w-full border border-border rounded-xl px-3 py-2.5 text-sm bg-muted focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </label>
            <label className="space-y-1 block">
              <span className="text-xs text-muted-foreground font-medium">{t("accountTab.language")}</span>
              <LanguageSwitcher
                value={authTeamMember?.language ?? "en"}
                onChange={handleLanguageChange}
              />
            </label>
            <button
              type="button"
              onClick={saveProfile}
              disabled={profileSaving || !profileName.trim() || !profileEmail.trim()}
              className={cn(
                "w-full py-2.5 rounded-xl text-sm font-semibold transition-colors",
                profileSaving || !profileName.trim() || !profileEmail.trim()
                  ? "bg-muted text-muted-foreground cursor-not-allowed"
                  : "bg-sage text-primary-foreground hover:bg-sage-deep",
              )}
            >
              {profileSaving ? t("accountTab.saving") : t("accountTab.save")}
            </button>
          </div>

          {/* Divider */}
          <div className="w-px bg-border self-stretch" />

          {/* Right: Security */}
          <div className="flex-1 min-w-0 space-y-3">
            <p className="section-label">{t("accountTab.security")}</p>
            {needsDefaultPinChange && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
                {t("accountTab.defaultPinPrefix")} <span className="font-semibold">{DEFAULT_ADMIN_PIN}</span>{t("accountTab.defaultPinSuffix")}
              </div>
            )}
            {/* Current PIN (shown once after save) */}
            {savedPin && (
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground font-medium">{t("accountTab.currentPin")}</span>
                <div className="relative">
                  <input
                    readOnly
                    type={showSavedPin ? "text" : "password"}
                    value={savedPin}
                    className="w-full border border-border rounded-xl px-3 py-2.5 pr-16 text-sm bg-muted/50 text-muted-foreground tracking-[0.3em] cursor-default select-none"
                  />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setShowSavedPin(v => !v)}
                      className="text-muted-foreground hover:text-foreground transition-colors p-0.5"
                    >
                      {showSavedPin ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setSavedPin(null); setShowSavedPin(false); }}
                      className="text-muted-foreground hover:text-foreground transition-colors p-0.5"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>
              </div>
            )}
            {/* PIN */}
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground font-medium">{t("accountTab.newPin")}</span>
              <div className="relative">
                <input
                  type={showNewPin ? "text" : "password"}
                  inputMode="numeric"
                  maxLength={4}
                  value={pin}
                  onChange={e => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  placeholder={t("accountTab.fourDigits")}
                  className="w-full border border-border rounded-xl px-3 py-2.5 pr-9 text-sm bg-muted focus:outline-none focus:ring-1 focus:ring-ring tracking-[0.3em]"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPin(v => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showNewPin ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              {currentAccount?.id && currentAccount.role === "Owner" && (
                <div className="flex items-center gap-2 mt-1.5">
                  {revealedPin !== null ? (
                    <>
                      <span className="text-xs text-muted-foreground">
                        {t("accountTab.currentPinLabel")}&nbsp;
                        <span className="font-mono font-medium">
                          {showRevealedPin ? revealedPin : "••••"}
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowRevealedPin(v => !v)}
                        className="text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {showRevealedPin ? <EyeOff size={13} /> : <Eye size={13} />}
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={handleRevealPin}
                      disabled={revealLoading}
                      className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground transition-colors disabled:opacity-50"
                    >
                      {revealLoading ? t("accountTab.loading") : t("accountTab.viewCurrentPin")}
                    </button>
                  )}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={savePin}
              disabled={pinSaving || pin.length !== 4}
              className={cn(
                "w-full py-2.5 rounded-xl text-sm font-semibold transition-colors",
                pinSaving || pin.length !== 4 ? "bg-muted text-muted-foreground cursor-not-allowed" : "bg-sage text-white hover:bg-sage-deep",
              )}
            >
              {pinSaving ? t("accountTab.saving") : t("accountTab.createNewPin")}
            </button>
          </div>
        </div>
      </section>}

      {/* Danger zone — owner only */}
      {show("account") && currentAccount?.role === "Owner" && (
        <section className="card-surface p-4 border border-status-error/20">
          <p className="section-label text-status-error mb-2">{t("accountTab.dangerZone")}</p>
          <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
            {t("accountTab.dangerZoneNotice")}
          </p>
          <button
            type="button"
            onClick={() => { setDeleteConfirmText(""); setShowDeleteModal(true); }}
            className="w-full py-2.5 rounded-xl text-sm font-semibold border border-status-error text-status-error hover:bg-status-error/5 transition-colors"
          >
            {t("accountTab.deleteAccount")}
          </button>
        </section>
      )}

      {/* All Locations */}
      {show("locations") && <section>
        {/* Header row: title */}
        <div className="flex items-center justify-between mb-1">
          <p className="section-label">{t("accountTab.allLocations")}</p>
        </div>
        {/* Usage + plan line */}
        <div className="flex items-center gap-2 mb-3">
          <span className={cn(
            "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium tracking-wide",
            billingUnavailable
              ? "bg-muted text-muted-foreground"
              : "bg-sage/10 text-sage",
          )}>
            {billingUnavailable ? t("accountTab.billingUnavailableBadge") : PLAN_LABELS[plan]}
          </span>
          <span className={cn(
            "text-xs",
            billingUnavailable
              ? "text-status-warn font-medium"
              : atLocationLimit ? "text-status-warn font-medium" : "text-muted-foreground",
          )}>
            {billingUnavailable
              ? t("accountTab.planStatusUnverified")
              : t("accountTab.locationsUsed", { count: locations.length, max: maxLocations === -1 ? "∞" : maxLocations })}
          </span>
        </div>
        {isLocationOverLimit && (
          <div className="card-surface border border-status-warn/30 bg-status-warn/5 px-4 py-3 mb-3 space-y-3">
            <div className="space-y-1">
              <p className="text-sm font-semibold text-foreground">{t("accountTab.gracePeriod.title")}</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {isGraceActive
                  ? t("accountTab.gracePeriod.active", { plan: PLAN_LABELS[plan], count: maxLocations, plural: maxLocations === 1 ? "" : "s", date: graceDeadlineLabel })
                  : t("accountTab.gracePeriod.expired", { count: maxLocations, plural: maxLocations === 1 ? "" : "s", plan: PLAN_LABELS[plan] })}
              </p>
            </div>
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {t("accountTab.gracePeriod.chooseActive")}
              </p>
              <div className="grid gap-2">
                {locations.map((location) => (
                  <label
                    key={`active-select-${location.id}`}
                    className={cn(
                      "flex items-center justify-between gap-3 rounded-xl border px-3 py-2 text-sm",
                      selectedActiveLocationIds.includes(location.id)
                        ? "border-sage bg-sage/5"
                        : "border-border bg-background",
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block font-medium text-foreground">{location.name}</span>
                      {location.address ? (
                        <span className="block text-xs text-muted-foreground truncate">{location.address}</span>
                      ) : null}
                    </span>
                    <input
                      type="checkbox"
                      checked={selectedActiveLocationIds.includes(location.id)}
                      onChange={() => toggleActiveLocation(location.id)}
                      disabled={
                        !selectedActiveLocationIds.includes(location.id) &&
                        maxLocations !== -1 &&
                        selectedActiveLocationIds.length >= maxLocations
                      }
                      className="h-4 w-4 rounded border-border text-sage focus:ring-sage"
                    />
                  </label>
                ))}
              </div>
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">
                  {t("accountTab.gracePeriod.selectedCount", { selected: selectedActiveLocationIds.length, max: maxLocations })}
                </p>
                <button
                  type="button"
                  onClick={saveActiveSelection}
                  disabled={savingActiveLocations || selectedActiveLocationIds.length !== maxLocations}
                  className={cn(
                    "rounded-xl px-4 py-2 text-sm font-semibold transition-colors",
                    savingActiveLocations || selectedActiveLocationIds.length !== maxLocations
                      ? "bg-muted text-muted-foreground cursor-not-allowed"
                      : "bg-sage text-primary-foreground hover:bg-sage-deep",
                  )}
                >
                  {savingActiveLocations ? t("accountTab.saving") : t("accountTab.gracePeriod.saveActiveLocations")}
                </button>
              </div>
            </div>
          </div>
        )}
        <div className="card-surface divide-y divide-border">
          {locations.map(loc => (
            <div
              key={loc.id}
              className={cn(
                "flex items-center gap-3 px-4 py-4 transition-colors",
                inactiveLocationSet.has(loc.id) && "bg-muted/35 opacity-65",
              )}
            >
              <MapPin
                size={15}
                className={cn("shrink-0", inactiveLocationSet.has(loc.id) ? "text-muted-foreground" : "text-sage")}
              />
              <div className="flex-1 min-w-0">
                <p className={cn("text-sm font-medium", inactiveLocationSet.has(loc.id) ? "text-muted-foreground" : "text-foreground")}>
                  {loc.name}
                </p>
                {loc.address && (
                  <p className={cn("text-xs truncate", inactiveLocationSet.has(loc.id) ? "text-muted-foreground/80" : "text-muted-foreground")}>
                    {loc.address}
                  </p>
                )}
                {isLocationOverLimit && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {activeLocationSet.has(loc.id) ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-sage/10 text-sage text-xs font-medium tracking-wide">
                        {isGraceExpired ? t("accountTab.active") : t("accountTab.graceWindow")}
                      </span>
                    ) : null}
                    {inactiveLocationSet.has(loc.id) ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-muted text-muted-foreground text-xs font-medium tracking-wide">
                        {t("accountTab.readOnly")}
                      </span>
                    ) : null}
                  </div>
                )}
              </div>
              <button
                onClick={() => onEditLocation(loc)}
                disabled={inactiveLocationSet.has(loc.id)}
                className={cn(
                  "p-1.5 rounded-lg transition-colors",
                  inactiveLocationSet.has(loc.id) ? "cursor-not-allowed" : "hover:bg-muted",
                )}
              >
                <Pencil size={14} className={cn("text-muted-foreground", inactiveLocationSet.has(loc.id) && "opacity-40")} />
              </button>
              <button
                onClick={() => onDeleteLocation(loc.id)}
                className="p-1.5 rounded-lg hover:bg-muted transition-colors"
              >
                <Trash2 size={14} className="text-status-error" />
              </button>
            </div>
          ))}
          <div className="flex justify-end px-4 py-3 border-t border-border">
            <button
              onClick={handleAddLocationClick}
              className="py-2 px-4 rounded-xl text-sm font-semibold bg-sage text-white hover:bg-sage-deep transition-colors flex items-center justify-center gap-2 w-52"
            >
              <Plus size={14} /> {t("accountTab.addLocation")}
            </button>
          </div>
        </div>
      </section>}

      {/* Team Members */}
      {show("users") && <section>
        <div className="flex items-center justify-between mb-1">
          <p className="section-label">{t("accountTab.teamMembers", { count: teamMembers.length + staffProfiles.filter(s => s.status === "active").length })}</p>
        </div>
        <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
          {t("accountTab.teamMembersNotice")}
        </p>
        <div className="card-surface divide-y divide-border">
          {/* Column headers */}
          <div className="flex items-center gap-3 px-4 py-2">
            <div className="w-9 shrink-0" />
            <p className="flex-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("accountTab.name")}</p>
            <p className="w-20 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("accountTab.role")}</p>
            <div className="w-20 shrink-0" />
          </div>
          {[...teamMembers].sort((a, b) => a.role === "Owner" ? -1 : b.role === "Owner" ? 1 : 0).map(member => {
            const isExpanded = expandedMemberId === member.id;
            const mp = pendingPerms[member.id] ?? member.permissions;
            const inviteExpired = pendingInviteStatus.get(member.id);
            const hasPendingInvite = inviteExpired !== undefined;
            return (
              <div key={member.id}>
                <div className="flex items-center gap-3 px-4 py-3">
                  <div className="w-9 h-9 rounded-full bg-sage-light flex items-center justify-center text-xs font-semibold text-sage-deep shrink-0">
                    {member.initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">{member.name}</p>
                    <p className="text-xs text-muted-foreground">{member.email}</p>
                    {hasPendingInvite ? (
                      <p className={cn("text-xs flex items-center gap-1", inviteExpired ? "text-muted-foreground" : "text-status-warn")}>
                        <MailCheck size={11} />
                        {inviteExpired ? t("accountTab.inviteExpired") : t("accountTab.invitePending")}
                      </p>
                    ) : member.last_seen_at ? (
                      <p className="text-xs text-muted-foreground/60" title={daysAgoTooltip(member.last_seen_at)}>
                        {t("accountTab.lastSeen", { date: new Date(member.last_seen_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) })}
                      </p>
                    ) : null}
                  </div>
                  <span className={cn(
                    "text-xs px-2 py-0.5 rounded-full font-medium",
                    member.role === "Owner" ? "bg-lavender-light text-lavender-deep" : "status-ok",
                  )}>
                    {member.role}
                  </span>
                  {hasPendingInvite && (
                    <button
                      onClick={() => {
                        sendInvite.mutate(member.id, {
                          onSuccess: () => toast.success(t("accountTab.toast.inviteResent", { email: member.email })),
                          onError: () => toast.error(t("accountTab.toast.resendInviteFailed")),
                        });
                      }}
                      disabled={sendInvite.isPending}
                      aria-label={t("accountTab.resendInviteAria", { name: member.name })}
                      title={t("accountTab.resendInvite")}
                      className="p-1.5 rounded-lg hover:bg-muted transition-colors"
                    >
                      <Send size={14} className="text-status-warn" />
                    </button>
                  )}
                  <button
                    onClick={() => onEditMember(member)}
                    aria-label={t("accountTab.editAria", { name: member.name })}
                    className="p-1.5 rounded-lg hover:bg-muted transition-colors"
                  >
                    <Pencil size={14} className="text-muted-foreground" />
                  </button>
                  <button
                    onClick={() => toggleExpand(member.id, member)}
                    className="p-1.5 rounded-lg hover:bg-muted transition-colors"
                  >
                    {isExpanded
                      ? <ChevronUp size={14} className="text-muted-foreground" />
                      : <ChevronDown size={14} className="text-muted-foreground" />}
                  </button>
                  {member.id !== authMemberId && (
                    <button
                      onClick={() => onDeleteMember(member)}
                      aria-label={t("accountTab.deleteAria", { name: member.name })}
                      className="p-1.5 rounded-lg hover:bg-muted transition-colors"
                    >
                      <Trash2 size={14} className="text-status-error" />
                    </button>
                  )}
                </div>
                {isExpanded && (
                  <div className="px-4 pb-4 pt-2 bg-muted/30 space-y-3">
                    {member.role === "Owner" ? (
                      <p className="text-xs text-muted-foreground italic">{t("accountTab.fullAccessNotice")}</p>
                    ) : (
                      <>
                        <p className="section-label">{t("accountTab.permissions")}</p>
                        <div className="space-y-3">
                          {(Object.keys(PERM_LABELS) as (keyof ManagerPermissions)[]).map(key => (
                            <div key={key} className="flex items-center justify-between gap-3">
                              <p className="text-sm text-foreground">{getPermLabel(key)}</p>
                              <Switch
                                checked={mp[key]}
                                onCheckedChange={val => setPendingPerms(prev => ({
                                  ...prev,
                                  [member.id]: { ...(prev[member.id] ?? member.permissions), [key]: val },
                                }))}
                              />
                            </div>
                          ))}
                        </div>
                        <button
                          onClick={() => savePerms(member.id)}
                          className="w-full py-2.5 rounded-xl text-xs font-medium bg-sage text-primary-foreground hover:bg-sage-deep transition-colors"
                        >
                          {t("accountTab.savePermissions")}
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {/* Active staff profiles */}
          {staffProfiles.filter(s => s.status === "active").map(sp => (
            <div key={sp.id} className="flex items-center gap-3 px-4 py-3">
              <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center text-xs font-semibold text-muted-foreground shrink-0">
                {(sp.first_name[0] ?? "") + (sp.last_name[0] ?? "")}
              </div>
              <p className="flex-1 min-w-0 text-sm font-medium text-foreground truncate">{sp.first_name} {sp.last_name}</p>
              <span className="w-20 text-xs text-muted-foreground truncate">{sp.role}</span>
              <div className="w-20 shrink-0" />
            </div>
          ))}
          <div className="flex justify-end px-4 py-3 border-t border-border">
            <button
              onClick={onInviteMember}
              className="py-2 px-4 rounded-xl text-sm font-semibold bg-sage text-white hover:bg-sage-deep transition-colors flex items-center justify-center gap-2 w-52"
            >
              <Plus size={14} /> {t("accountTab.addTeamMember")}
            </button>
          </div>
        </div>
      </section>}

      {/* Department Management */}
      {show("users") && <section>
        <p className="section-label mb-3">{t("accountTab.departmentManagement")}</p>
        <p className="text-xs text-muted-foreground mb-3">
          {t("accountTab.departmentManagementNotice")}
        </p>
        <div className="card-surface divide-y divide-border">
          {departments.map((department, departmentIndex) => {
            const departmentInUse = staffProfiles.some(sp => roleUsesDepartment(sp.role, department.name));
            const isRenaming = renamingDepartment?.index === departmentIndex;
            return (
              <div key={department.name} className="flex items-center gap-2 px-4 py-4">
                {isRenaming ? (
                  <>
                    <input
                      autoFocus
                      type="text"
                      value={renamingDepartment.value}
                      onChange={e => setRenamingDepartment({ index: departmentIndex, value: e.target.value })}
                      onKeyDown={e => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          renameDepartment(departmentIndex, renamingDepartment.value);
                        }
                      }}
                      className="flex-1 border border-border rounded-lg px-3 py-1.5 text-sm bg-muted focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                    <button
                      onClick={() => renameDepartment(departmentIndex, renamingDepartment.value)}
                      className="p-1.5 rounded-lg hover:bg-muted transition-colors"
                    >
                      <Check size={14} className="text-sage" />
                    </button>
                    <button
                      onClick={() => setRenamingDepartment(null)}
                      className="p-1.5 rounded-lg hover:bg-muted transition-colors"
                    >
                      <X size={14} className="text-muted-foreground" />
                    </button>
                  </>
                ) : (
                  <>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">{department.name}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{t("accountTab.departmentRole")}</p>
                    </div>
                    <button
                      onClick={() => setRenamingDepartment({ index: departmentIndex, value: department.name })}
                      className="p-1.5 rounded-lg hover:bg-muted transition-colors"
                    >
                      <Pencil size={14} className="text-muted-foreground" />
                    </button>
                    <button
                      onClick={() => deleteDepartment(departmentIndex)}
                      disabled={departmentInUse}
                      title={departmentInUse ? t("accountTab.departmentInUse") : t("accountTab.deleteDepartment")}
                      className={cn(
                        "p-1.5 rounded-lg transition-colors",
                        departmentInUse ? "opacity-30 cursor-not-allowed" : "hover:bg-muted",
                      )}
                    >
                      <Trash2 size={14} className="text-status-error" />
                    </button>
                  </>
                )}
              </div>
            );
          })}
          <div className="flex items-center justify-end gap-2 px-4 py-3">
            {showAddDepartment && (
              <>
                <input
                  autoFocus
                  type="text"
                  value={newDepartmentName}
                  onChange={e => setNewDepartmentName(e.target.value)}
                  placeholder={t("accountTab.departmentNamePlaceholder")}
                  onKeyDown={e => {
                    if (e.key === "Enter") { e.preventDefault(); addDepartment(); setShowAddDepartment(false); }
                    if (e.key === "Escape") { setShowAddDepartment(false); setNewDepartmentName(""); }
                  }}
                  className="flex-1 border border-border rounded-xl px-3 py-2 text-sm bg-muted focus:outline-none focus:ring-1 focus:ring-ring"
                />
                <button
                  onClick={() => { addDepartment(); setShowAddDepartment(false); }}
                  disabled={!newDepartmentName.trim()}
                  className={cn("p-2 rounded-xl transition-colors", newDepartmentName.trim() ? "bg-sage text-white hover:bg-sage-deep" : "bg-muted text-muted-foreground cursor-not-allowed")}
                >
                  <Check size={14} />
                </button>
                <button onClick={() => { setShowAddDepartment(false); setNewDepartmentName(""); }} className="p-2 rounded-xl hover:bg-muted transition-colors">
                  <X size={14} className="text-muted-foreground" />
                </button>
              </>
            )}
            {!showAddDepartment && (
              <button
                onClick={() => setShowAddDepartment(true)}
                className="py-2 px-4 rounded-xl text-sm font-semibold bg-sage text-white hover:bg-sage-deep transition-colors flex items-center justify-center gap-2 w-52"
              >
                <Plus size={14} /> {t("accountTab.addDepartment")}
              </button>
            )}
          </div>
        </div>
      </section>}

      {/* Activity log */}
      {show("account") && <section>
        <p className="section-label mb-3">{t("accountTab.activityLog")}</p>
        <div className="card-surface divide-y divide-border">
          {auditLog.length === 0 ? (
            <p className="px-4 py-4 text-sm text-muted-foreground">{t("accountTab.noActivity")}</p>
          ) : (
            auditLog.map(entry => (
              <div key={entry.id} className="px-4 py-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm text-foreground truncate">{formatAuditAction(entry.action, entry.details)}</p>
                  {entry.actor_name && (
                    <p className="text-xs text-muted-foreground mt-0.5">{entry.actor_name}</p>
                  )}
                </div>
                <p className="text-xs text-muted-foreground shrink-0">
                  {new Date(entry.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            ))
          )}
        </div>
      </section>}

      {/* Billing */}
      {show("billing") && <section>
        <p className="section-label mb-3">{t("accountTab.billing")}</p>
        <div className="card-surface divide-y divide-border">
          <div className="flex items-start justify-between gap-2 px-4 py-4">
            <div>
              <p className="text-xs text-muted-foreground font-medium mb-0.5">{t("accountTab.currentPlanLabel")}</p>
              <p className="font-display font-semibold text-xl text-foreground leading-tight">{t("accountTab.planName", { plan: PLAN_LABELS[plan] })}</p>
              <p className="text-sm text-muted-foreground mt-1">
                {PLAN_PRICES[plan].monthly === 0
                  ? t("accountTab.freeNoBilling")
                  : t("accountTab.pricePerMonth", { currency: PLAN_PRICES[plan].currency, price: PLAN_PRICES[plan].monthly })}
              </p>
            </div>
            <span className={cn(
              "text-xs font-bold uppercase tracking-widest px-2.5 py-1 rounded-full border shrink-0",
              isActive ? "border-sage/20 text-sage bg-sage/10" : "border-status-warn/30 text-status-warn bg-status-warn/10"
            )}>
              {planStatus === "trialing" ? t("accountTab.trial") : isActive ? t("accountTab.active") : planStatus}
            </span>
          </div>
          <div className="flex justify-end px-4 py-3">
            {isNative ? (
              <a
                href="https://olia.app/billing"
                target="_blank"
                rel="noopener noreferrer"
                className="py-2 px-4 rounded-xl text-sm font-semibold bg-sage text-white hover:bg-sage-deep transition-colors flex items-center justify-center gap-2 w-52"
              >
                {t("accountTab.manageAtOlia")}
              </a>
            ) : (
              <button
                onClick={() => navigate("/billing")}
                className="py-2 px-4 rounded-xl text-sm font-semibold bg-sage text-white hover:bg-sage-deep transition-colors flex items-center justify-center gap-2 w-52"
              >
                {t("accountTab.manageBilling")}
              </button>
            )}
          </div>
        </div>
      </section>}

      {/* Delete account confirmation modal */}
      {showDeleteModal && (
        <ConfirmModal
          title={t("accountTab.deleteAccountModal.title")}
          message={
            <span>
              {t("accountTab.deleteAccountModal.body")}{" "}
              <strong>{t("accountTab.deleteAccountModal.cannotBeUndone")}</strong>
              <br /><br />
              {t("accountTab.deleteAccountModal.typeToConfirm")} <strong>DELETE</strong> {t("accountTab.deleteAccountModal.toConfirm")}
              <br />
              <input
                autoFocus
                type="text"
                value={deleteConfirmText}
                onChange={e => setDeleteConfirmText(e.target.value.toUpperCase())}
                placeholder={t("accountTab.deleteAccountModal.placeholder")}
                className="mt-3 w-full border border-border rounded-xl px-3 py-2 text-sm bg-muted focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </span>
          }
          actionLabel={deleting ? t("accountTab.deleteAccountModal.deleting") : t("accountTab.deleteAccountModal.confirmAction")}
          onClose={() => setShowDeleteModal(false)}
          onConfirm={() => { if (deleteConfirmText === "DELETE") deleteAccount(); }}
        />
      )}
    </div>
  );
}
