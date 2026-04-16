// ─── AccountTab ───────────────────────────────────────────────────────────────

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  MapPin, Plus, Pencil, Trash2, Check, X, ChevronDown, ChevronUp, Eye, EyeOff,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/sonner";
import {
  type Location, type StaffProfile, type TeamMember, type ManagerPermissions,
  type AuditLogEntry, type StaffDepartment,
  DEFAULT_ADMIN_PIN, DEFAULT_PERMISSIONS,
  getInitials, formatTimestamp,
} from "@/lib/admin-repository";
import { usePlan } from "@/hooks/usePlan";
import { PLAN_LABELS, PLAN_PRICES } from "@/lib/plan-features";
import { type ChecklistItem } from "@/hooks/useChecklists";
import { useSaveAdminPin } from "@/hooks/useTeamMembers";
import { PERM_LABELS, roleUsesDepartment } from "./shared";

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
  auditLog: AuditLogEntry[];
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
  onInviteMember: () => void;
  onEditMember: (m: TeamMember) => void;
  onDeleteMember: (m: TeamMember) => void;
}

export function AccountTab({
  locations, activeLocationIds, inactiveLocationIds, staffProfiles, teamMembers, checklists, onSavePerms,
  onSaveAccount, departments, setDepartments, auditLog, authAccount, authMemberId, authUserEmail, authUserName,
  billingUnavailable, locationLimit, isLocationOverLimit, locationGraceEndsAt, isGraceActive, isGraceExpired,
  onAddLocation, onLocationLimitReached, onEditLocation, onDeleteLocation, onSaveActiveLocations, savingActiveLocations,
  onInviteMember, onEditMember, onDeleteMember,
}: AccountTabProps) {
  const navigate = useNavigate();
  const { plan, planStatus, isActive } = usePlan();
  const saveAdminPin = useSaveAdminPin();
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
  const [justSavedPin, setJustSavedPin] = useState<string | null>(null);
  const [revealCurrentPin, setRevealCurrentPin] = useState(false);
  const [revealCountdown, setRevealCountdown] = useState(0);
  const [showAddDepartment, setShowAddDepartment] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [pinSaving, setPinSaving] = useState(false);
  const [selectedActiveLocationIds, setSelectedActiveLocationIds] = useState<string[]>(activeLocationIds);
  const [committedActiveLocationIds, setCommittedActiveLocationIds] = useState<string[]>(activeLocationIds);

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
      toast.success("Account profile saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save account profile");
    } finally {
      setProfileSaving(false);
    }
  };

  const savePin = async () => {
    if (!currentAccount || pin.length !== 4) return;
    setPinSaving(true);
    try {
      const rawPin = pin;
      await saveAdminPin.mutateAsync({ memberId: currentAccount.id, rawPin });
      setPin("");
      setJustSavedPin(rawPin);
      toast.success("Admin PIN updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update admin PIN");
    } finally {
      setPinSaving(false);
    }
  };

  // Reveal current PIN for 30s after saving
  useEffect(() => {
    if (!revealCurrentPin) return;
    setRevealCountdown(30);
    const interval = setInterval(() => {
      setRevealCountdown(prev => {
        if (prev <= 1) { clearInterval(interval); setRevealCurrentPin(false); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [revealCurrentPin]);

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
      toast.error("We couldn't verify your billing plan. Open Billing and refresh the subscription status first.");
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
      toast.error(`Choose exactly ${maxLocations} active location${maxLocations === 1 ? "" : "s"} to continue.`);
      return;
    }
    try {
      await onSaveActiveLocations(selectedActiveLocationIds);
      setCommittedActiveLocationIds(selectedActiveLocationIds);
      toast.success("Active locations updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update active locations");
    }
  };

  return (
    <div className="space-y-4">
      {/* My Account + Security — side by side */}
      <section className="card-surface p-4">
        <div className="flex gap-4">
          {/* Left: My Account */}
          <div className="flex-1 min-w-0 space-y-3">
            <p className="section-label">My account</p>
            <label className="space-y-1 block">
              <span className="text-xs text-muted-foreground font-medium">Full name</span>
              <input
                type="text"
                value={profileName}
                onChange={e => setProfileName(e.target.value)}
                className="w-full border border-border rounded-xl px-3 py-2.5 text-sm bg-muted focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </label>
            <label className="space-y-1 block">
              <span className="text-xs text-muted-foreground font-medium">Email</span>
              <input
                type="email"
                value={profileEmail}
                onChange={e => setProfileEmail(e.target.value)}
                className="w-full border border-border rounded-xl px-3 py-2.5 text-sm bg-muted focus:outline-none focus:ring-1 focus:ring-ring"
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
              {profileSaving ? "Saving…" : "Save"}
            </button>
          </div>

          {/* Divider */}
          <div className="w-px bg-border self-stretch" />

          {/* Right: Security */}
          <div className="flex-1 min-w-0 space-y-3">
            <p className="section-label">Security</p>
            {needsDefaultPinChange && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
                Default PIN is <span className="font-semibold">{DEFAULT_ADMIN_PIN}</span>. Change it before using kiosk mode.
              </div>
            )}
            {/* Current PIN — revealed for 30s after saving */}
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground font-medium">Current PIN</span>
              <div className="relative">
                <input
                  readOnly
                  type={revealCurrentPin ? "text" : "password"}
                  value={justSavedPin ?? "0000"}
                  className="w-full border border-border rounded-xl px-3 py-2.5 pr-9 text-sm bg-muted/50 text-muted-foreground tracking-[0.3em] cursor-default select-none"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (!justSavedPin) { toast("Set a new PIN first — it will be visible here for 30 seconds after saving."); return; }
                    setRevealCurrentPin(v => !v);
                  }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {revealCurrentPin ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              {revealCurrentPin && <p className="text-[10px] text-muted-foreground">Hiding in {revealCountdown}s</p>}
            </div>
            {/* New PIN */}
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground font-medium">New PIN</span>
              <div className="relative">
                <input
                  type={showNewPin ? "text" : "password"}
                  inputMode="numeric"
                  maxLength={4}
                  value={pin}
                  onChange={e => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  placeholder="4 digits"
                  className="w-full border border-border rounded-xl px-3 py-2.5 pr-9 text-sm bg-muted focus:outline-none focus:ring-1 focus:ring-ring tracking-[0.3em]"
                />
                <button type="button" onClick={() => setShowNewPin(v => !v)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                  {showNewPin ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
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
              {pinSaving ? "Saving…" : "Create new PIN"}
            </button>
          </div>
        </div>
      </section>

      {/* All Locations */}
      <section>
        {/* Header row: title */}
        <div className="flex items-center justify-between mb-1">
          <p className="section-label">All locations</p>
        </div>
        {/* Usage + plan line */}
        <div className="flex items-center gap-2 mb-3">
          <span className={cn(
            "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium tracking-wide",
            billingUnavailable
              ? "bg-muted text-muted-foreground"
              : "bg-sage/10 text-sage",
          )}>
            {billingUnavailable ? "Billing unavailable" : PLAN_LABELS[plan]}
          </span>
          <span className={cn(
            "text-xs",
            billingUnavailable
              ? "text-status-warn font-medium"
              : atLocationLimit ? "text-status-warn font-medium" : "text-muted-foreground",
          )}>
            {billingUnavailable
              ? "Plan status could not be verified."
              : `${locations.length} / ${maxLocations === -1 ? "∞" : maxLocations} locations used`}
          </span>
        </div>
        {isLocationOverLimit && (
          <div className="card-surface border border-status-warn/30 bg-status-warn/5 px-4 py-3 mb-3 space-y-3">
            <div className="space-y-1">
              <p className="text-sm font-semibold text-foreground">Location limit grace period</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {isGraceActive
                  ? `This account is over the ${PLAN_LABELS[plan]} location limit. Choose which ${maxLocations} location${maxLocations === 1 ? "" : "s"} stay active by ${graceDeadlineLabel}.`
                  : `The 7-day grace period has ended. Only ${maxLocations} location${maxLocations === 1 ? "" : "s"} can stay operational on ${PLAN_LABELS[plan]}. Extra locations are now read-only until you upgrade or reduce usage.`}
              </p>
            </div>
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Choose active locations
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
                  {selectedActiveLocationIds.length} of {maxLocations} selected
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
                  {savingActiveLocations ? "Saving…" : "Save active locations"}
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
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-sage/10 text-sage text-[10px] font-medium tracking-wide">
                        {isGraceExpired ? "Active" : "Grace window"}
                      </span>
                    ) : null}
                    {inactiveLocationSet.has(loc.id) ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-muted text-muted-foreground text-[10px] font-medium tracking-wide">
                        Read-only
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
              className="py-2 px-4 rounded-xl text-sm font-semibold bg-sage text-white hover:bg-sage-deep transition-colors flex items-center justify-center gap-2 min-w-[168px]"
            >
              <Plus size={14} /> Add location
            </button>
          </div>
        </div>
      </section>

      {/* Team Members */}
      <section>
        <div className="flex items-center justify-between mb-1">
          <p className="section-label">Team members ({teamMembers.length + staffProfiles.filter(s => s.status === "active").length})</p>
        </div>
        <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
          All team members across all locations in the organisation.
        </p>
        <div className="card-surface divide-y divide-border">
          {/* Column headers */}
          <div className="flex items-center gap-3 px-4 py-2">
            <div className="w-9 shrink-0" />
            <p className="flex-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Name</p>
            <p className="w-20 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Role</p>
            <div className="w-20 shrink-0" />
          </div>
          {[...teamMembers].sort((a, b) => a.role === "Owner" ? -1 : b.role === "Owner" ? 1 : 0).map(member => {
            const isExpanded = expandedMemberId === member.id;
            const mp = pendingPerms[member.id] ?? member.permissions;
            return (
              <div key={member.id}>
                <div className="flex items-center gap-3 px-4 py-3">
                  <div className="w-9 h-9 rounded-full bg-sage-light flex items-center justify-center text-xs font-semibold text-sage-deep shrink-0">
                    {member.initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">{member.name}</p>
                    <p className="text-xs text-muted-foreground">{member.email}</p>
                  </div>
                  <span className={cn(
                    "text-xs px-2 py-0.5 rounded-full font-medium",
                    member.role === "Owner" ? "bg-lavender-light text-lavender-deep" : "status-ok",
                  )}>
                    {member.role}
                  </span>
                  <button
                    onClick={() => onEditMember(member)}
                    aria-label={`Edit ${member.name}`}
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
                      aria-label={`Delete ${member.name}`}
                      className="p-1.5 rounded-lg hover:bg-muted transition-colors"
                    >
                      <Trash2 size={14} className="text-status-error" />
                    </button>
                  )}
                </div>
                {isExpanded && (
                  <div className="px-4 pb-4 pt-2 bg-muted/30 space-y-3">
                    {member.role === "Owner" ? (
                      <p className="text-xs text-muted-foreground italic">Full access — all settings</p>
                    ) : (
                      <>
                        <p className="section-label">Permissions</p>
                        <div className="space-y-3">
                          {(Object.keys(PERM_LABELS) as (keyof ManagerPermissions)[]).map(key => (
                            <div key={key} className="flex items-center justify-between gap-3">
                              <p className="text-sm text-foreground">{PERM_LABELS[key]}</p>
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
                          Save permissions
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
              className="py-2 px-4 rounded-xl text-sm font-semibold bg-sage text-white hover:bg-sage-deep transition-colors flex items-center justify-center gap-2 min-w-[168px]"
            >
              <Plus size={14} /> Add a team member
            </button>
          </div>
        </div>
      </section>

      {/* Department Management */}
      <section>
        <p className="section-label mb-3">Department management</p>
        <p className="text-xs text-muted-foreground mb-3">
          Staff roles are managed at the department level only.
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
                      <p className="text-[11px] text-muted-foreground mt-0.5">Department role</p>
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
                      title={departmentInUse ? "Department is in use" : "Delete department"}
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
                  placeholder="Department name…"
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
                className="py-2 px-4 rounded-xl text-sm font-semibold bg-sage text-white hover:bg-sage-deep transition-colors flex items-center justify-center gap-2 min-w-[168px]"
              >
                <Plus size={14} /> Add department
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Billing */}
      <section>
        <p className="section-label mb-3">Billing</p>
        <div className="card-surface divide-y divide-border">
          <div className="flex items-start justify-between gap-2 px-4 py-4">
            <div>
              <p className="text-xs text-muted-foreground font-medium mb-0.5">Current plan</p>
              <p className="font-display text-xl text-foreground leading-tight">Olia {PLAN_LABELS[plan]}</p>
              <p className="text-sm text-muted-foreground mt-1">
                {PLAN_PRICES[plan].monthly === 0
                  ? "Free · No billing required"
                  : `${PLAN_PRICES[plan].currency}${PLAN_PRICES[plan].monthly}/month`}
              </p>
            </div>
            <span className={cn(
              "text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full border shrink-0",
              isActive ? "border-sage/20 text-sage bg-sage/10" : "border-status-warn/30 text-status-warn bg-status-warn/10"
            )}>
              {planStatus === "trialing" ? "Trial" : isActive ? "Active" : planStatus}
            </span>
          </div>
          <div className="flex justify-end px-4 py-3">
            <button
              onClick={() => navigate("/billing")}
              className="py-2 px-4 rounded-xl text-sm font-semibold bg-sage text-white hover:bg-sage-deep transition-colors flex items-center justify-center gap-2 min-w-[168px]"
            >
              Manage Billing
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
