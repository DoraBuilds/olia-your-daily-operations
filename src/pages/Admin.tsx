import { useState, useRef, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Layout } from "@/components/Layout";
import {
  MapPin, Clock, Mail, Phone, Plus, Pencil, Trash2, Archive, RotateCcw,
  ChevronDown, ChevronUp, X, Check, Search, ArrowLeft, Tablet,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import {
  type Location, type StaffProfile, type TeamMember, type ManagerPermissions,
  type AuditLogEntry, type AccountRole,
  DEFAULT_PERMISSIONS, DEFAULT_STAFF_ROLES,
  getInitials, daysAgo, staffDisplayName, formatTimestamp, generatePin,
} from "@/lib/admin-repository";
import { useAuth } from "@/contexts/AuthContext";
import { usePlan } from "@/hooks/usePlan";
import { PLAN_LABELS, PLAN_PRICES } from "@/lib/plan-features";
import { useLocations, useSaveLocation, useDeleteLocation } from "@/hooks/useLocations";
import {
  useStaffProfiles, useSaveStaffProfile, useArchiveStaffProfile,
  useRestoreStaffProfile, useDeleteStaffProfile,
} from "@/hooks/useStaffProfiles";
import { useTeamMembers, useSaveTeamMember, useDeleteTeamMember } from "@/hooks/useTeamMembers";

// ─── Constants ────────────────────────────────────────────────────────────────

const PERM_LABELS: Record<keyof ManagerPermissions, string> = {
  create_edit_checklists: "Create & edit checklists",
  assign_checklists: "Assign checklists",
  manage_staff_profiles: "Manage staff profiles",
  view_reporting: "View reporting",
  edit_location_details: "Edit location details",
  manage_alerts: "Manage alerts",
  export_data: "Export data",
  override_inactivity_threshold: "Override inactivity threshold",
};

const ROLE_COLOR_MAP: Record<string, string> = {
  Waiter: "bg-sage-light text-sage-deep",
  Kitchen: "bg-lavender-light text-lavender-deep",
  Bartender: "status-warn",
  Manager: "bg-lavender-light text-lavender-deep",
  Host: "status-ok",
  Cleaner: "bg-muted text-muted-foreground",
};

const MOCK_CHECKLISTS: Record<string, string[]> = {
  l1: ["Opening Checklist", "Closing Checklist", "Kitchen Safety Check"],
  l2: ["Terrace Opening", "End of Day", "Table Setup"],
};

// ─── Shared UI ────────────────────────────────────────────────────────────────

function BottomSheet({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-foreground/20 backdrop-blur-sm animate-fade-in"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-card w-full max-w-lg rounded-t-2xl p-5 pb-8 space-y-4 animate-fade-in max-h-[85vh] overflow-y-auto">
        {children}
      </div>
    </div>
  );
}

function ModalHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="font-display text-lg text-foreground">{title}</h2>
      <button onClick={onClose} className="p-1.5 rounded-full hover:bg-muted transition-colors">
        <X size={18} className="text-muted-foreground" />
      </button>
    </div>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs text-muted-foreground mb-1 block">{label}</label>
      {children}
    </div>
  );
}

const inputCls = "w-full border border-border rounded-xl px-4 py-3 text-sm bg-muted focus:outline-none focus:ring-1 focus:ring-ring";

function SaveButton({ disabled, label }: { disabled: boolean; label: string }) {
  return (
    <button
      disabled={disabled}
      className={cn(
        "w-full py-3 rounded-xl text-sm font-medium transition-colors",
        !disabled
          ? "bg-sage text-primary-foreground hover:bg-sage-deep"
          : "bg-muted text-muted-foreground cursor-not-allowed",
      )}
      type="submit"
    >
      {label}
    </button>
  );
}

// ─── ConfirmModal ─────────────────────────────────────────────────────────────

function ConfirmModal({
  title, message, actionLabel, onClose, onConfirm,
}: {
  title: string; message: React.ReactNode; actionLabel: string;
  onClose: () => void; onConfirm: () => void;
}) {
  return (
    <BottomSheet onClose={onClose}>
      <ModalHeader title={title} onClose={onClose} />
      <p className="text-sm text-muted-foreground">{message}</p>
      <div className="flex gap-3">
        <button
          onClick={onClose}
          className="flex-1 py-3 rounded-xl text-sm font-medium border border-border text-foreground hover:bg-muted transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          className="flex-1 py-3 rounded-xl text-sm font-medium bg-status-error text-primary-foreground hover:opacity-90 transition-colors"
        >
          {actionLabel}
        </button>
      </div>
    </BottomSheet>
  );
}

// ─── StaffProfileModal ────────────────────────────────────────────────────────

function StaffProfileModal({
  profile, locations, roles, onClose, onSave,
}: {
  profile: StaffProfile | null; locations: Location[]; roles: string[];
  onClose: () => void; onSave: (p: StaffProfile) => void;
}) {
  const isEdit = !!profile;
  const [firstName, setFirstName] = useState(profile?.first_name ?? "");
  const [lastName, setLastName] = useState(profile?.last_name ?? "");
  const [locationId, setLocationId] = useState(profile?.location_id ?? locations[0]?.id ?? "");
  const [role, setRole] = useState(profile?.role ?? roles[0] ?? "");
  const [pin, setPin] = useState(() => profile?.pin ?? generatePin());

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName.trim() || !locationId) return;
    const now = new Date().toISOString();
    onSave({
      id: profile?.id ?? "",
      location_id: locationId,
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      role,
      status: profile?.status ?? "active",
      pin,
      last_used_at: profile?.last_used_at ?? null,
      archived_at: profile?.archived_at ?? null,
      created_at: profile?.created_at ?? now,
    });
    onClose();
  };

  return (
    <BottomSheet onClose={onClose}>
      <ModalHeader title={isEdit ? "Edit staff profile" : "Add staff profile"} onClose={onClose} />
      <form onSubmit={handleSave} className="space-y-3">
        <FormField label="Location (required)">
          <div className="flex gap-2 flex-wrap">
            {locations.map(loc => (
              <button
                type="button" key={loc.id} onClick={() => setLocationId(loc.id)}
                className={cn(
                  "flex-1 py-2 text-xs rounded-lg border transition-colors",
                  locationId === loc.id
                    ? "bg-sage text-primary-foreground border-sage"
                    : "border-border text-muted-foreground hover:border-sage/40",
                )}
              >
                {loc.name}
              </button>
            ))}
          </div>
        </FormField>
        <FormField label="First name (required)">
          <input
            autoFocus type="text" value={firstName}
            onChange={e => setFirstName(e.target.value)}
            placeholder="e.g. Maria" className={inputCls}
          />
        </FormField>
        <FormField label="Last name">
          <input
            type="text" value={lastName}
            onChange={e => setLastName(e.target.value)}
            placeholder="e.g. Garcia" className={inputCls}
          />
        </FormField>
        <FormField label="Role">
          <div className="flex gap-2 flex-wrap">
            {roles.map(r => (
              <button
                type="button" key={r} onClick={() => setRole(r)}
                className={cn(
                  "py-2 px-3 text-xs rounded-lg border transition-colors",
                  role === r
                    ? "bg-sage text-primary-foreground border-sage"
                    : "border-border text-muted-foreground hover:border-sage/40",
                )}
              >
                {r}
              </button>
            ))}
          </div>
        </FormField>
        <FormField label={isEdit ? "PIN" : "Staff PIN"}>
          {!isEdit && (
            <p className="text-xs text-amber-600/80 bg-amber-50 rounded-lg px-3 py-2 mb-2 leading-relaxed">
              Note this PIN and share it with the staff member — they'll use it to log in on the kiosk.
            </p>
          )}
          <div className="flex gap-2">
            <input
              type="text" value={pin} maxLength={4}
              onChange={e => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
              className={cn(inputCls, "text-center font-mono text-lg tracking-widest flex-1")}
              placeholder="4-digit PIN"
            />
            <button type="button" onClick={() => setPin(generatePin())}
              className="shrink-0 px-3 py-2 rounded-xl text-xs font-medium bg-muted border border-border hover:bg-muted/60 transition-colors">
              Generate
            </button>
          </div>
        </FormField>
        <SaveButton disabled={!firstName.trim() || !locationId} label={isEdit ? "Save changes" : "Add profile"} />
      </form>
    </BottomSheet>
  );
}

// ─── TeamMemberModal ──────────────────────────────────────────────────────────

function TeamMemberModal({
  member, locations, onClose, onSave,
}: {
  member: TeamMember | null; locations: Location[];
  onClose: () => void; onSave: (m: TeamMember) => void;
}) {
  const [name, setName] = useState(member?.name ?? "");
  const [email, setEmail] = useState(member?.email ?? "");
  const [role, setRole] = useState<AccountRole>(member?.role ?? "Manager");
  const [locationIds, setLocationIds] = useState<string[]>(member?.location_ids ?? []);
  const [perms, setPerms] = useState<ManagerPermissions>(member?.permissions ?? { ...DEFAULT_PERMISSIONS });

  const toggleLocation = (id: string) => {
    setLocationIds(prev => prev.includes(id) ? prev.filter(l => l !== id) : [...prev, id]);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSave({
      id: member?.id ?? "",
      name: name.trim(),
      email: email.trim(),
      role,
      location_ids: locationIds,
      initials: getInitials(name),
      permissions: role === "Owner" ? { ...DEFAULT_PERMISSIONS } : perms,
    });
    onClose();
  };

  return (
    <BottomSheet onClose={onClose}>
      <ModalHeader title={member ? "Edit team member" : "Invite team member"} onClose={onClose} />
      <form onSubmit={handleSave} className="space-y-3">
        <FormField label="Full name">
          <input
            autoFocus type="text" value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. Marc Devaux" className={inputCls}
          />
        </FormField>
        <FormField label="Email">
          <input
            type="email" value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="e.g. marc@example.com" className={inputCls}
          />
        </FormField>
        <FormField label="Role">
          <div className="flex gap-2">
            {(["Owner", "Manager"] as AccountRole[]).map(r => (
              <button
                type="button" key={r} onClick={() => setRole(r)}
                className={cn(
                  "flex-1 py-2 text-xs rounded-lg border transition-colors",
                  role === r
                    ? "bg-sage text-primary-foreground border-sage"
                    : "border-border text-muted-foreground hover:border-sage/40",
                )}
              >
                {r}
              </button>
            ))}
          </div>
        </FormField>
        <FormField label="Location(s)">
          <div className="flex gap-2 flex-wrap">
            {locations.map(loc => (
              <button
                type="button" key={loc.id} onClick={() => toggleLocation(loc.id)}
                className={cn(
                  "py-2 px-3 text-xs rounded-lg border transition-colors",
                  locationIds.includes(loc.id)
                    ? "bg-sage text-primary-foreground border-sage"
                    : "border-border text-muted-foreground hover:border-sage/40",
                )}
              >
                {loc.name}
              </button>
            ))}
          </div>
        </FormField>
        {role === "Manager" && (
          <div className="border-t border-border pt-3 space-y-3">
            <p className="section-label">Permissions</p>
            {(Object.keys(PERM_LABELS) as (keyof ManagerPermissions)[]).map(key => (
              <div key={key} className="flex items-center justify-between gap-3">
                <p className="text-sm text-foreground">{PERM_LABELS[key]}</p>
                <Switch
                  checked={perms[key]}
                  onCheckedChange={val => setPerms(prev => ({ ...prev, [key]: val }))}
                />
              </div>
            ))}
          </div>
        )}
        <SaveButton disabled={!name.trim()} label={member ? "Save changes" : "Send invitation"} />
      </form>
    </BottomSheet>
  );
}

// ─── LocationModal ────────────────────────────────────────────────────────────

function LocationModal({
  location, onClose, onSave,
}: {
  location: Location | null; onClose: () => void; onSave: (loc: Location) => void;
}) {
  const [name, setName] = useState(location?.name ?? "");
  const [address, setAddress] = useState(location?.address ?? "");
  const [tradingHours, setTradingHours] = useState(location?.trading_hours ?? "");
  const [email, setEmail] = useState(location?.contact_email ?? "");
  const [phone, setPhone] = useState(location?.contact_phone ?? "");
  const [threshold, setThreshold] = useState(location?.archive_threshold_days ?? 90);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSave({
      id: location?.id ?? "",
      name: name.trim(),
      address: address.trim(),
      trading_hours: tradingHours.trim(),
      contact_email: email.trim(),
      contact_phone: phone.trim(),
      archive_threshold_days: threshold,
    });
    onClose();
  };

  return (
    <BottomSheet onClose={onClose}>
      <ModalHeader title={location ? "Edit location" : "New location"} onClose={onClose} />
      <form onSubmit={handleSave} className="space-y-3">
        <FormField label="Location name (required)">
          <input
            autoFocus type="text" value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. Main Branch" className={inputCls}
          />
        </FormField>
        <FormField label="Address">
          <input
            type="text" value={address}
            onChange={e => setAddress(e.target.value)}
            placeholder="e.g. 14 Rue de la Paix, Lyon" className={inputCls}
          />
        </FormField>
        <FormField label="Trading hours">
          <input
            type="text" value={tradingHours}
            onChange={e => setTradingHours(e.target.value)}
            placeholder="e.g. Mon–Sat 08:00–22:00" className={inputCls}
          />
        </FormField>
        <FormField label="Contact email">
          <input
            type="email" value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="e.g. main@olia.app" className={inputCls}
          />
        </FormField>
        <FormField label="Contact phone">
          <input
            type="tel" value={phone}
            onChange={e => setPhone(e.target.value)}
            placeholder="e.g. +33 4 78 00 11 22" className={inputCls}
          />
        </FormField>
        <FormField label="Archive threshold (days)">
          <input
            type="number" value={threshold}
            onChange={e => setThreshold(Number(e.target.value))}
            min={1} className={inputCls}
          />
        </FormField>
        <SaveButton disabled={!name.trim()} label={location ? "Save changes" : "Add location"} />
      </form>
    </BottomSheet>
  );
}

// ─── MyLocationTab ────────────────────────────────────────────────────────────

interface MyLocationTabProps {
  locations: Location[];
  staffProfiles: StaffProfile[];
  roles: string[];
  currentLocationId: string;
  setCurrentLocationId: (id: string) => void;
  isOwner: boolean;
  permissions: ManagerPermissions | null;
  onEditLocation: (loc: Location) => void;
  onUpdateLocation: (loc: Location) => void;
  onAddStaff: () => void;
  onEditStaff: (sp: StaffProfile) => void;
  onArchiveStaff: (sp: StaffProfile) => void;
  onRestoreStaff: (id: string) => void;
  onDeleteStaff: (sp: StaffProfile) => void;
  onLaunchKiosk: () => void;
}

function MyLocationTab({
  locations, staffProfiles, roles, currentLocationId, setCurrentLocationId,
  isOwner, permissions,
  onEditLocation, onUpdateLocation, onAddStaff, onEditStaff, onArchiveStaff, onRestoreStaff, onDeleteStaff,
  onLaunchKiosk,
}: MyLocationTabProps) {
  const [staffSearch, setStaffSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [notifAlerts, setNotifAlerts] = useState({ critical: true, digest: false, activity: true });

  const currentLocation = locations.find(l => l.id === currentLocationId) ?? locations[0];

  const canEditLocation = !permissions || permissions.edit_location_details;
  const canEditThreshold = !permissions || permissions.override_inactivity_threshold;
  const canManageStaff = !permissions || permissions.manage_staff_profiles;
  const canManageAlerts = !permissions || permissions.manage_alerts;

  const filteredStaff = staffProfiles.filter(sp => {
    if (sp.location_id !== (currentLocation?.id ?? "")) return false;
    const statusMatch = showArchived ? sp.status === "archived" : sp.status === "active";
    if (!statusMatch) return false;
    if (!staffSearch.trim()) return true;
    return staffDisplayName(sp).toLowerCase().includes(staffSearch.toLowerCase());
  });

  if (!currentLocation) return null;

  return (
    <div className="space-y-4">
      {/* Location picker */}
      {isOwner ? (
        <div>
          <p className="section-label mb-2">Location</p>
          <select
            value={currentLocationId}
            onChange={e => setCurrentLocationId(e.target.value)}
            className="w-full border border-border rounded-xl px-4 py-3 text-sm bg-muted focus:outline-none focus:ring-1 focus:ring-ring"
          >
            {locations.map(loc => (
              <option key={loc.id} value={loc.id}>{loc.name}</option>
            ))}
          </select>
        </div>
      ) : (
        <div className="flex items-center gap-2 py-1">
          <MapPin size={14} className="text-sage" />
          <p className="text-sm font-medium text-foreground">{currentLocation.name}</p>
        </div>
      )}

      {/* Location details card */}
      <div className="card-surface p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="section-label">Location details</p>
          {canEditLocation && (
            <button
              onClick={() => onEditLocation(currentLocation)}
              className="flex items-center gap-1 text-xs text-sage font-medium hover:underline"
            >
              <Pencil size={12} /> Edit
            </button>
          )}
        </div>
        <div className="space-y-2">
          {currentLocation.address && (
            <div className="flex items-start gap-2">
              <MapPin size={13} className="text-muted-foreground mt-0.5 shrink-0" />
              <p className="text-sm text-foreground">{currentLocation.address}</p>
            </div>
          )}
          {currentLocation.trading_hours && (
            <div className="flex items-start gap-2">
              <Clock size={13} className="text-muted-foreground mt-0.5 shrink-0" />
              <p className="text-sm text-foreground">{currentLocation.trading_hours}</p>
            </div>
          )}
          {currentLocation.contact_email && (
            <div className="flex items-start gap-2">
              <Mail size={13} className="text-muted-foreground mt-0.5 shrink-0" />
              <p className="text-sm text-foreground">{currentLocation.contact_email}</p>
            </div>
          )}
          {currentLocation.contact_phone && (
            <div className="flex items-start gap-2">
              <Phone size={13} className="text-muted-foreground mt-0.5 shrink-0" />
              <p className="text-sm text-foreground">{currentLocation.contact_phone}</p>
            </div>
          )}
        </div>
      </div>

      {/* Launch Kiosk Mode */}
      <button
        onClick={onLaunchKiosk}
        className="w-full py-4 rounded-2xl text-sm font-bold tracking-widest uppercase bg-sage text-white hover:bg-sage-deep transition-colors flex items-center justify-center gap-2 shadow-md"
      >
        <Tablet size={16} /> Launch Kiosk Mode
      </button>

      {/* Auto-archive card */}
      <div className="card-surface p-4">
        <p className="section-label mb-1">Auto-archive threshold</p>
        <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
          Staff profiles inactive for this many days will be automatically archived.
        </p>
        <div className="flex items-center gap-3">
          <input
            type="number"
            value={currentLocation.archive_threshold_days}
            onChange={e => onUpdateLocation({ ...currentLocation, archive_threshold_days: Number(e.target.value) })}
            min={1}
            readOnly={!canEditThreshold}
            className={cn("w-28 border border-border rounded-xl px-4 py-2.5 text-sm bg-muted focus:outline-none focus:ring-1 focus:ring-ring", !canEditThreshold && "opacity-50 cursor-not-allowed")}
          />
          <span className="text-sm text-muted-foreground">days</span>
        </div>
      </div>

      {/* Staff Profiles */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <p className="section-label">Staff profiles</p>
          {canManageStaff && (
            <button
              onClick={onAddStaff}
              className="flex items-center gap-1 text-xs text-sage font-medium hover:underline"
            >
              <Plus size={12} /> Add
            </button>
          )}
        </div>

        {/* Search + archive toggle */}
        <div className="flex gap-2 mb-3">
          <div className="relative flex-1">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text" value={staffSearch} onChange={e => setStaffSearch(e.target.value)}
              placeholder="Search staff…"
              className="w-full border border-border rounded-xl pl-8 pr-4 py-2 text-xs bg-muted focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <button
            onClick={() => setShowArchived(!showArchived)}
            className={cn(
              "text-xs font-medium px-3 py-2 rounded-xl border transition-colors whitespace-nowrap",
              showArchived
                ? "bg-muted text-foreground border-border"
                : "text-muted-foreground border-transparent hover:text-foreground",
            )}
          >
            {showArchived ? "Active" : "Archived"}
          </button>
        </div>

        <div className="card-surface divide-y divide-border">
          {filteredStaff.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="text-sm text-muted-foreground">
                {showArchived ? "No archived profiles." : "No active profiles."}
              </p>
            </div>
          ) : filteredStaff.map(sp => {
            const roleColor = ROLE_COLOR_MAP[sp.role] ?? "bg-muted text-muted-foreground";
            return (
              <div key={sp.id} className="flex items-center gap-3 px-4 py-3">
                <div className="w-9 h-9 rounded-full bg-sage-light flex items-center justify-center text-xs font-semibold text-sage-deep shrink-0">
                  {getInitials(staffDisplayName(sp))}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{staffDisplayName(sp)}</p>
                  <p className="text-[11px] text-muted-foreground/70 mt-0.5">{daysAgo(sp.last_used_at)}</p>
                </div>
                <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap", roleColor)}>
                  {sp.role}
                </span>
                {sp.status === "active" ? (
                  <>
                    {canManageStaff && (
                      <button
                        onClick={() => onEditStaff(sp)}
                        className="p-1.5 rounded-lg hover:bg-muted transition-colors" aria-label="Edit"
                      >
                        <Pencil size={14} className="text-muted-foreground" />
                      </button>
                    )}
                    {canManageStaff && (
                      <button
                        onClick={() => onArchiveStaff(sp)}
                        className="p-1.5 rounded-lg hover:bg-muted transition-colors" aria-label="Archive"
                      >
                        <Archive size={14} className="text-muted-foreground" />
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => onRestoreStaff(sp.id)}
                      className="p-1.5 rounded-lg hover:bg-muted transition-colors" aria-label="Restore"
                    >
                      <RotateCcw size={14} className="text-sage" />
                    </button>
                    {canManageStaff && (
                      <button
                        onClick={() => onDeleteStaff(sp)}
                        className="p-1.5 rounded-lg hover:bg-muted transition-colors" aria-label="Delete permanently"
                      >
                        <Trash2 size={14} className="text-status-error" />
                      </button>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Assigned Checklists */}
      <div className="card-surface p-4">
        <p className="section-label mb-3">Assigned checklists</p>
        <div className="space-y-2">
          {(MOCK_CHECKLISTS[currentLocation.id] ?? []).map(name => (
            <div key={name} className="flex items-center gap-2 py-0.5">
              <div className="w-1.5 h-1.5 rounded-full bg-sage shrink-0" />
              <p className="text-sm text-foreground">{name}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Notifications & Alerts */}
      {canManageAlerts && (
        <div className="card-surface p-4 space-y-4">
          <p className="section-label">Notifications & alerts</p>
          {[
            { key: "critical" as const, label: "Critical alerts", desc: "Get notified for urgent operational issues" },
            { key: "digest" as const, label: "Daily digest", desc: "Summary of completed checklists each morning" },
            { key: "activity" as const, label: "Staff activity", desc: "Notifications for staff login and profile changes" },
          ].map(item => (
            <div key={item.key} className="flex items-start gap-3">
              <Switch
                checked={notifAlerts[item.key]}
                onCheckedChange={val => setNotifAlerts(prev => ({ ...prev, [item.key]: val }))}
              />
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground leading-tight">{item.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── AccountTab ───────────────────────────────────────────────────────────────

interface AccountTabProps {
  locations: Location[];
  staffProfiles: StaffProfile[];
  teamMembers: TeamMember[];
  onSavePerms: (memberId: string, perms: ManagerPermissions) => void;
  roles: string[];
  setRoles: React.Dispatch<React.SetStateAction<string[]>>;
  auditLog: AuditLogEntry[];
  onAddLocation: () => void;
  onEditLocation: (loc: Location) => void;
  onDeleteLocation: (id: string) => void;
  onInviteMember: () => void;
  onEditMember: (m: TeamMember) => void;
  onDeleteMember: (m: TeamMember) => void;
}

function AccountTab({
  locations, staffProfiles, teamMembers, onSavePerms,
  roles, setRoles, auditLog,
  onAddLocation, onEditLocation, onDeleteLocation,
  onInviteMember, onEditMember, onDeleteMember,
}: AccountTabProps) {
  const navigate = useNavigate();
  const { plan, planStatus, isActive } = usePlan();
  // Team member expand/collapse
  const [expandedMemberId, setExpandedMemberId] = useState<string | null>(null);
  const [pendingPerms, setPendingPerms] = useState<Record<string, ManagerPermissions>>({});

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

  // Role management
  const [renamingRole, setRenamingRole] = useState<{ index: number; value: string } | null>(null);
  const [newRoleName, setNewRoleName] = useState("");

  const addRole = () => {
    const trimmed = newRoleName.trim();
    if (!trimmed || roles.includes(trimmed)) return;
    setRoles(prev => [...prev, trimmed]);
    setNewRoleName("");
  };

  const renameRole = (index: number, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed || (roles.includes(trimmed) && roles[index] !== trimmed)) return;
    setRoles(prev => prev.map((r, i) => (i === index ? trimmed : r)));
    setRenamingRole(null);
  };

  const deleteRole = (role: string) => {
    if (staffProfiles.some(sp => sp.role === role)) return;
    setRoles(prev => prev.filter(r => r !== role));
  };

  return (
    <div className="space-y-4">
      {/* All Locations */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <p className="section-label">All locations</p>
          <button
            onClick={onAddLocation}
            className="flex items-center gap-1 text-xs text-sage font-medium hover:underline"
          >
            <Plus size={12} /> Add location
          </button>
        </div>
        <div className="card-surface divide-y divide-border">
          {locations.map(loc => (
            <div key={loc.id} className="flex items-center gap-3 px-4 py-4">
              <MapPin size={15} className="text-sage shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{loc.name}</p>
                {loc.address && <p className="text-xs text-muted-foreground truncate">{loc.address}</p>}
              </div>
              <button
                onClick={() => onEditLocation(loc)}
                className="p-1.5 rounded-lg hover:bg-muted transition-colors"
              >
                <Pencil size={14} className="text-muted-foreground" />
              </button>
              <button
                onClick={() => onDeleteLocation(loc.id)}
                className="p-1.5 rounded-lg hover:bg-muted transition-colors"
              >
                <Trash2 size={14} className="text-status-error" />
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Team Members */}
      <section>
        <div className="flex items-center justify-between mb-1">
          <p className="section-label">Team members</p>
          <button
            onClick={onInviteMember}
            className="flex items-center gap-1 text-xs text-sage font-medium hover:underline"
          >
            <Plus size={12} /> Invite
          </button>
        </div>
        <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
          Owners and managers only. For shift staff, use Staff Profiles.
        </p>
        <div className="card-surface divide-y divide-border">
          {teamMembers.map(member => {
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
                  <button
                    onClick={() => onDeleteMember(member)}
                    className="p-1.5 rounded-lg hover:bg-muted transition-colors"
                  >
                    <Trash2 size={14} className="text-status-error" />
                  </button>
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
        </div>
      </section>

      {/* Checklist Assignment placeholder */}
      <div className="card-surface p-4">
        <p className="section-label mb-2">Checklist assignment</p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Assign checklists to team members across locations. Full assignment management coming soon.
        </p>
      </div>

      {/* Audit Log */}
      <section>
        <p className="section-label mb-3">Audit log</p>
        <div className="card-surface divide-y divide-border max-h-64 overflow-y-auto">
          {auditLog.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground text-center">No activity yet.</p>
          ) : auditLog.map(entry => (
            <div key={entry.id} className="px-4 py-3">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm text-foreground leading-snug">
                  <strong>{entry.user}</strong>{" "}{entry.action}
                </p>
                {entry.location_name && (
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-sage-light text-sage-deep whitespace-nowrap shrink-0">
                    {entry.location_name}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground/70 mt-0.5">{formatTimestamp(entry.timestamp)}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Role Management */}
      <section>
        <p className="section-label mb-3">Role management</p>
        <div className="card-surface divide-y divide-border">
          {roles.map((role, index) => {
            const isDefault = DEFAULT_STAFF_ROLES.includes(role);
            const isInUse = staffProfiles.some(sp => sp.role === role);
            const isRenaming = renamingRole?.index === index;
            return (
              <div key={`${role}-${index}`} className="flex items-center gap-2 px-4 py-3">
                {isRenaming ? (
                  <>
                    <input
                      autoFocus
                      type="text"
                      value={renamingRole.value}
                      onChange={e => setRenamingRole({ index, value: e.target.value })}
                      onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); renameRole(index, renamingRole.value); } }}
                      className="flex-1 border border-border rounded-lg px-3 py-1.5 text-sm bg-muted focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                    <button
                      onClick={() => renameRole(index, renamingRole.value)}
                      className="p-1.5 rounded-lg hover:bg-muted transition-colors"
                    >
                      <Check size={14} className="text-sage" />
                    </button>
                    <button
                      onClick={() => setRenamingRole(null)}
                      className="p-1.5 rounded-lg hover:bg-muted transition-colors"
                    >
                      <X size={14} className="text-muted-foreground" />
                    </button>
                  </>
                ) : (
                  <>
                    <p className="flex-1 text-sm text-foreground">{role}</p>
                    <span className={cn(
                      "text-[10px] px-2 py-0.5 rounded-full font-medium",
                      isDefault ? "bg-sage-light text-sage-deep" : "bg-lavender-light text-lavender-deep",
                    )}>
                      {isDefault ? "Default" : "Custom"}
                    </span>
                    <button
                      onClick={() => setRenamingRole({ index, value: role })}
                      className="p-1.5 rounded-lg hover:bg-muted transition-colors"
                    >
                      <Pencil size={14} className="text-muted-foreground" />
                    </button>
                    <button
                      onClick={() => deleteRole(role)}
                      disabled={isInUse}
                      title={isInUse ? "Role is in use" : "Delete role"}
                      className={cn("p-1.5 rounded-lg transition-colors", isInUse ? "opacity-30 cursor-not-allowed" : "hover:bg-muted")}
                    >
                      <Trash2 size={14} className="text-status-error" />
                    </button>
                  </>
                )}
              </div>
            );
          })}
          {/* Add custom role */}
          <div className="flex items-center gap-2 px-4 py-3">
            <input
              type="text" value={newRoleName}
              onChange={e => setNewRoleName(e.target.value)}
              placeholder="Add custom role…"
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addRole(); } }}
              className="flex-1 border border-border rounded-lg px-3 py-1.5 text-sm bg-muted focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <button
              onClick={addRole}
              disabled={!newRoleName.trim()}
              className={cn(
                "p-1.5 rounded-lg transition-colors",
                newRoleName.trim()
                  ? "bg-sage text-primary-foreground hover:bg-sage-deep"
                  : "bg-muted text-muted-foreground cursor-not-allowed",
              )}
            >
              <Plus size={14} />
            </button>
          </div>
        </div>
      </section>

      {/* Billing — dark midnight blue card */}
      <div className="rounded-2xl p-5 space-y-3 bg-sage">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-white/60 mb-1">Current Plan</p>
            <p className="font-display text-2xl text-white leading-tight">Olia {PLAN_LABELS[plan]}</p>
          </div>
          <span className={cn(
            "text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full border",
            isActive ? "border-white/30 text-white bg-white/10" : "border-yellow-300/40 text-yellow-200 bg-yellow-300/10"
          )}>
            {planStatus === "trialing" ? "Trial" : isActive ? "Active" : planStatus}
          </span>
        </div>
        <p className="text-sm text-white/70">
          {PLAN_PRICES[plan].monthly === 0
            ? "Free plan · No billing required"
            : `${PLAN_PRICES[plan].currency}${PLAN_PRICES[plan].monthly}/month`}
        </p>
        <button
          onClick={() => navigate("/billing")}
          className="w-full py-2.5 rounded-xl border border-white/30 text-white text-xs font-semibold tracking-wide hover:bg-white/10 transition-colors"
        >
          Manage Billing
        </button>
      </div>
    </div>
  );
}

// ─── Admin Page ───────────────────────────────────────────────────────────────

type ConfirmState = {
  title: string;
  message: React.ReactNode;
  actionLabel: string;
  onConfirm: () => void;
} | null;

export default function Admin() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const fromKiosk = searchParams.get("from") === "kiosk";
  const userId = searchParams.get("userId");
  const { teamMember: authMember } = useAuth();

  // Data — from Supabase
  const { data: locations = [] } = useLocations();
  const { data: staffProfiles = [] } = useStaffProfiles();
  const { data: teamMembers = [] } = useTeamMembers();
  const saveLocationMut = useSaveLocation();
  const deleteLocationMut = useDeleteLocation();
  const saveStaffMut = useSaveStaffProfile();
  const archiveStaffMut = useArchiveStaffProfile();
  const restoreStaffMut = useRestoreStaffProfile();
  const deleteStaffMut = useDeleteStaffProfile();
  const saveMemberMut = useSaveTeamMember();
  const deleteMemberMut = useDeleteTeamMember();

  // Local state (not persisted to DB yet)
  const [roles, setRoles] = useState<string[]>([...DEFAULT_STAFF_ROLES]);
  const auditLog: AuditLogEntry[] = [];

  // UI state
  const [activeTab, setActiveTab] = useState<"location" | "account">("location");
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

  // Determine active user from URL param
  const activeUser = userId ? (teamMembers.find(m => m.id === userId) ?? null) : null;
  const isOwner = !activeUser || activeUser.role === "Owner";
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
    saveLocationMut.mutate(loc);
  };

  const deleteLocation = (id: string) => {
    setConfirmModal({
      title: "Delete location",
      message: "This will permanently remove the location and cannot be undone.",
      actionLabel: "Delete",
      onConfirm: () => {
        deleteLocationMut.mutate(id);
        setConfirmModal(null);
      },
    });
  };

  const saveStaff = (sp: StaffProfile) => {
    saveStaffMut.mutate(sp);
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
        archiveStaffMut.mutate(sp.id);
        setConfirmModal(null);
      },
    });
  };

  const restoreStaff = (id: string) => {
    restoreStaffMut.mutate(id);
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

  const saveMember = (m: TeamMember) => {
    saveMemberMut.mutate(m);
  };

  const savePerms = (memberId: string, perms: ManagerPermissions) => {
    const member = teamMembers.find(m => m.id === memberId);
    if (member) saveMemberMut.mutate({ ...member, permissions: perms });
  };

  const deleteMember = (m: TeamMember) => {
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
        {/* Sub-tab pill toggle */}
        <div className="flex gap-1 bg-muted rounded-2xl p-1">
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
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
            roles={roles}
            currentLocationId={currentLocationId}
            setCurrentLocationId={setCurrentLocationId}
            isOwner={isOwner}
            permissions={permissions}
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
            locations={locations}
            staffProfiles={staffProfiles}
            teamMembers={teamMembers}
            onSavePerms={savePerms}
            roles={roles}
            setRoles={setRoles}
            auditLog={auditLog}
            onAddLocation={() => setLocationModal("new")}
            onEditLocation={loc => setLocationModal(loc)}
            onDeleteLocation={deleteLocation}
            onInviteMember={() => setMemberModal("new")}
            onEditMember={m => setMemberModal(m)}
            onDeleteMember={deleteMember}
          />
        )}
      </Layout>

      {/* ─── Modals ──────────────────────────────────────────────────────────── */}

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
          roles={roles}
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
