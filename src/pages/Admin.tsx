import { useState, useRef, useEffect } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Layout } from "@/components/Layout";
import {
  MapPin, Clock, Mail, Phone, Plus, Pencil, Trash2, Archive, RotateCcw,
  ChevronDown, ChevronUp, X, Check, Search, ArrowLeft, Tablet,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/sonner";
import {
  PlacesAutocompleteInput, StaticMapPreview, type PlaceResult,
} from "@/components/PlacesAutocompleteInput";
import {
  type Location, type StaffProfile, type TeamMember, type ManagerPermissions,
  type AuditLogEntry, type AccountRole,
  type StaffDepartment,
  DEFAULT_PERMISSIONS, DEFAULT_STAFF_DEPARTMENTS, flattenStaffDepartments, getRoleDepartment,
  getInitials, daysAgo, daysAgoTooltip, staffDisplayName, formatTimestamp, generatePin,
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
import { useChecklists, type ChecklistItem } from "@/hooks/useChecklists";

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
  "Front of House": "bg-sage-light text-sage-deep",
  "Back of House": "bg-lavender-light text-lavender-deep",
  Management: "status-warn",
  "Cleaning Crew": "bg-muted text-muted-foreground",
  Waiter: "bg-sage-light text-sage-deep",
  Kitchen: "bg-lavender-light text-lavender-deep",
  Bartender: "status-warn",
  Manager: "status-warn",
  Host: "status-ok",
  Cleaner: "bg-muted text-muted-foreground",
};

// ─── Opening hours helpers ────────────────────────────────────────────────────

type DayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
interface TimeWindow { start: string; end: string; }
interface DayHours { open: boolean; windows: TimeWindow[]; }
type WeeklyHours = Record<DayKey, DayHours>;

const DAY_KEYS: DayKey[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const DAY_LABELS: Record<DayKey, string> = {
  mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun",
};
const DEFAULT_HOURS: WeeklyHours = {
  mon: { open: true, windows: [{ start: "08:00", end: "22:00" }] },
  tue: { open: true, windows: [{ start: "08:00", end: "22:00" }] },
  wed: { open: true, windows: [{ start: "08:00", end: "22:00" }] },
  thu: { open: true, windows: [{ start: "08:00", end: "22:00" }] },
  fri: { open: true, windows: [{ start: "08:00", end: "22:00" }] },
  sat: { open: true, windows: [{ start: "08:00", end: "22:00" }] },
  sun: { open: false, windows: [] },
};

function cloneDayHours(hours: DayHours): DayHours {
  return {
    open: hours.open,
    windows: hours.windows.map(window => ({ ...window })),
  };
}

function cloneWeeklyHours(hours: WeeklyHours): WeeklyHours {
  return DAY_KEYS.reduce((acc, day) => {
    acc[day] = cloneDayHours(hours[day]);
    return acc;
  }, {} as WeeklyHours);
}

function normalizeDayHours(rawDay: unknown, fallback: DayHours): DayHours {
  if (!rawDay || typeof rawDay !== "object") return cloneDayHours(fallback);
  const day = rawDay as Partial<DayHours> & { start?: string; end?: string };
  if (Array.isArray(day.windows)) {
    const windows = day.windows
      .map(window => ({
        start: typeof window?.start === "string" ? window.start : fallback.windows[0]?.start ?? "08:00",
        end: typeof window?.end === "string" ? window.end : fallback.windows[0]?.end ?? "22:00",
      }))
      .filter(window => window.start && window.end)
      .slice(0, 2);
    return {
      open: Boolean(day.open),
      windows: day.open ? (windows.length > 0 ? windows : cloneDayHours(fallback).windows) : [],
    };
  }
  if (typeof day.start === "string" || typeof day.end === "string") {
    return {
      open: Boolean(day.open ?? true),
      windows: (day.open ?? true)
        ? [{
            start: day.start ?? fallback.windows[0]?.start ?? "08:00",
            end: day.end ?? fallback.windows[0]?.end ?? "22:00",
          }]
        : [],
    };
  }
  return cloneDayHours(fallback);
}

function parseHours(raw: string | null | undefined): WeeklyHours {
  if (!raw) return cloneWeeklyHours(DEFAULT_HOURS);
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && "mon" in parsed) {
      return DAY_KEYS.reduce((acc, day) => {
        acc[day] = normalizeDayHours((parsed as Record<string, unknown>)[day], DEFAULT_HOURS[day]);
        return acc;
      }, {} as WeeklyHours);
    }
  } catch { /* not JSON — old plain-text value */ }
  return cloneWeeklyHours(DEFAULT_HOURS);
}

function formatHoursText(hours: WeeklyHours): string {
  const openDays = DAY_KEYS.filter(d => hours[d].open);
  if (!openDays.length) return "Closed all week";
  return openDays
    .map(d => `${DAY_LABELS[d]}: ${hours[d].windows.map(window => `${window.start}–${window.end}`).join(" / ")}`)
    .join(" · ");
}

// ─── Shared UI ────────────────────────────────────────────────────────────────

function BottomSheet({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-foreground/20 backdrop-blur-sm animate-fade-in sm:items-center sm:px-4 sm:py-8"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-card w-full max-w-lg rounded-t-2xl p-5 pb-8 space-y-4 animate-fade-in max-h-[85vh] overflow-y-auto sm:max-w-2xl sm:rounded-2xl sm:max-h-[90vh] sm:shadow-2xl">
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

function cloneDepartments(departments: StaffDepartment[]): StaffDepartment[] {
  return departments.map((department) => ({ name: department.name }));
}

function roleUsesDepartment(role: string, departmentName: string): boolean {
  return getRoleDepartment(role) === departmentName;
}

function DepartmentRolePicker({
  departments,
  value,
  onChange,
}: {
  departments: StaffDepartment[];
  value: string;
  onChange: (role: string) => void;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {departments.map(department => {
        const departmentSelected = value === department.name;
        return (
          <button
            key={department.name}
            type="button"
            onClick={() => onChange(department.name)}
            className={cn(
              "w-full rounded-xl border px-3 py-3 text-left text-sm font-medium transition-colors",
              departmentSelected
                ? "bg-sage text-primary-foreground border-sage"
                : "bg-card border-border text-foreground hover:border-sage/40",
            )}
          >
            {department.name}
          </button>
        );
      })}
    </div>
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
  profile, locations, departments, onClose, onSave,
}: {
  profile: StaffProfile | null; locations: Location[]; departments: StaffDepartment[];
  onClose: () => void; onSave: (p: StaffProfile & { rawPin?: string }) => void;
}) {
  const isEdit = !!profile;
  const [firstName, setFirstName] = useState(profile?.first_name ?? "");
  const [lastName, setLastName] = useState(profile?.last_name ?? "");
  const [locationId, setLocationId] = useState(profile?.location_id ?? locations[0]?.id ?? "");
  const [role, setRole] = useState(getRoleDepartment(profile?.role ?? departments[0]?.name ?? ""));
  // New staff: generate a PIN upfront; editing: leave empty (only set if manager enters a new one)
  const [pin, setPin] = useState(() => isEdit ? "" : generatePin());

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName.trim() || !locationId) return;
    if (!isEdit && !pin) return; // new staff must have a PIN
    const now = new Date().toISOString();
    onSave({
      id: profile?.id ?? "",
      location_id: locationId,
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      role,
      status: profile?.status ?? "active",
      // rawPin triggers SHA-256 hashing in useSaveStaffProfile;
      // omit for edits where the manager didn't enter a new PIN (existing PIN preserved)
      ...(pin ? { rawPin: pin } : {}),
      pin: profile?.pin ?? "",   // satisfies StaffProfile type; hook uses rawPin when present
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
          <DepartmentRolePicker departments={departments} value={role} onChange={setRole} />
        </FormField>
        <FormField label={isEdit ? "New PIN (optional)" : "Staff PIN"}>
          {isEdit ? (
            <p className="text-xs text-muted-foreground mb-2 leading-relaxed">
              Leave blank to keep the existing PIN. Enter a new 4-digit PIN to change it.
            </p>
          ) : (
            <p className="text-xs text-amber-600/80 bg-amber-50 rounded-lg px-3 py-2 mb-2 leading-relaxed">
              Note this PIN and share it with the staff member — they'll use it to log in on the kiosk.
            </p>
          )}
          <div className="flex gap-2">
            <input
              type="text" value={pin} maxLength={4}
              onChange={e => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
              className={cn(inputCls, "text-center font-mono text-lg tracking-widest flex-1")}
              placeholder={isEdit ? "Enter new PIN to change" : "4-digit PIN"}
            />
            <button type="button" onClick={() => setPin(generatePin())}
              className="shrink-0 px-3 py-2 rounded-xl text-xs font-medium bg-muted border border-border hover:bg-muted/60 transition-colors">
              Generate
            </button>
          </div>
        </FormField>
        <SaveButton disabled={!firstName.trim() || !locationId || (!isEdit && !pin)} label={isEdit ? "Save changes" : "Add profile"} />
      </form>
    </BottomSheet>
  );
}

// ─── TeamMemberModal ──────────────────────────────────────────────────────────

function TeamMemberModal({
  member, locations, onClose, onSave,
}: {
  member: TeamMember | null; locations: Location[];
  onClose: () => void; onSave: (m: TeamMember & { rawPin?: string }) => void;
}) {
  const [name, setName] = useState(member?.name ?? "");
  const [email, setEmail] = useState(member?.email ?? "");
  const [role, setRole] = useState<AccountRole>(member?.role ?? "Manager");
  const [locationIds, setLocationIds] = useState<string[]>(member?.location_ids ?? []);
  const [perms, setPerms] = useState<ManagerPermissions>(member?.permissions ?? { ...DEFAULT_PERMISSIONS });
  const [pin, setPin] = useState(() => member?.id ? "" : generatePin());

  const toggleLocation = (id: string) => {
    setLocationIds(prev => prev.includes(id) ? prev.filter(l => l !== id) : [...prev, id]);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    if (!member && !pin.trim()) return;
    onSave({
      id: member?.id ?? "",
      name: name.trim(),
      email: email.trim(),
      role,
      location_ids: locationIds,
      initials: getInitials(name),
      permissions: role === "Owner" ? { ...DEFAULT_PERMISSIONS } : perms,
      ...(pin ? { rawPin: pin } : {}),
    });
    onClose();
  };

  return (
    <BottomSheet onClose={onClose}>
      <ModalHeader title={member ? "Edit team member" : "Add team member"} onClose={onClose} />
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
        <FormField label={role === "Owner" ? "Admin PIN" : "Kiosk PIN"}>
          {member?.id ? (
            <p className="text-xs text-muted-foreground mb-2 leading-relaxed">
              Leave blank to keep the existing PIN. Enter a new 4-digit PIN to change it.
            </p>
          ) : (
            <p className="text-xs text-amber-600/80 bg-amber-50 rounded-lg px-3 py-2 mb-2 leading-relaxed">
              This PIN is used for kiosk/admin access. Generate one now so the account owner can log in from the kiosk.
            </p>
          )}
          <div className="flex gap-2">
            <input
              type="text"
              value={pin}
              onChange={e => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
              placeholder={member?.id ? "Enter new PIN to change" : "4-digit PIN"}
              className={cn(inputCls, "flex-1 text-center font-mono text-lg tracking-widest")}
              maxLength={4}
            />
            <button
              type="button"
              onClick={() => setPin(generatePin())}
              className="shrink-0 px-3 py-2 rounded-xl text-xs font-medium bg-muted border border-border hover:bg-muted/60 transition-colors"
            >
              Generate
            </button>
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
        {!member && (
          <p className="text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-2 leading-relaxed">
            This adds the staff profile and kiosk PIN now. Login invitations are not part of the live flow yet, so new team members cannot sign in to the admin app until email invites are built.
          </p>
        )}
        <SaveButton disabled={!name.trim() || (!member && !pin.trim())} label={member ? "Save changes" : "Add team member"} />
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
  const [hours, setHours] = useState<WeeklyHours>(() => parseHours(location?.trading_hours));
  const [email, setEmail] = useState(location?.contact_email ?? "");
  const [phone, setPhone] = useState(location?.contact_phone ?? "");
  // Google Maps fields — set when user picks from autocomplete dropdown
  const [lat, setLat] = useState<number | null>(location?.lat ?? null);
  const [lng, setLng] = useState<number | null>(location?.lng ?? null);
  const [placeId, setPlaceId] = useState<string | null>(location?.place_id ?? null);

  const updateDay = (day: DayKey, patch: Partial<DayHours>) =>
    setHours(prev => ({ ...prev, [day]: { ...prev[day], ...patch } }));

  const handlePlaceSelect = (place: PlaceResult) => {
    setAddress(place.address);
    setLat(place.lat);
    setLng(place.lng);
    setPlaceId(place.placeId);
  };

  const setDayOpen = (day: DayKey, open: boolean) => {
    setHours(prev => {
      const nextDay = cloneDayHours(prev[day]);
      nextDay.open = open;
      if (open && nextDay.windows.length === 0) {
        nextDay.windows = [{ start: "08:00", end: "22:00" }];
      }
      return { ...prev, [day]: nextDay };
    });
  };

  const updateWindow = (day: DayKey, index: number, patch: Partial<TimeWindow>) => {
    setHours(prev => {
      const nextDay = cloneDayHours(prev[day]);
      nextDay.windows = nextDay.windows.map((window, windowIdx) =>
        windowIdx === index ? { ...window, ...patch } : window
      );
      return { ...prev, [day]: nextDay };
    });
  };

  const addSplitWindow = (day: DayKey) => {
    setHours(prev => {
      const current = prev[day];
      if (!current.open || current.windows.length >= 2) return prev;
      const lastWindow = current.windows[current.windows.length - 1];
      return {
        ...prev,
        [day]: {
          ...current,
          windows: [
            ...current.windows,
            { start: lastWindow?.end ?? "14:00", end: "22:00" },
          ],
        },
      };
    });
  };

  const removeSplitWindow = (day: DayKey, index: number) => {
    setHours(prev => {
      const current = prev[day];
      if (current.windows.length <= 1) return prev;
      return {
        ...prev,
        [day]: {
          ...current,
          windows: current.windows.filter((_, windowIdx) => windowIdx !== index),
        },
      };
    });
  };

  const copyHoursToLaterDays = (day: DayKey) => {
    setHours(prev => {
      const sourceIndex = DAY_KEYS.indexOf(day);
      const source = cloneDayHours(prev[day]);
      const next = { ...prev };
      for (const laterDay of DAY_KEYS.slice(sourceIndex + 1)) {
        next[laterDay] = cloneDayHours(source);
      }
      return next;
    });
  };

  const handleAddressChange = (val: string) => {
    setAddress(val);
    // Clear map data when user types manually (they may have changed the address)
    setLat(null);
    setLng(null);
    setPlaceId(null);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSave({
      id: location?.id ?? "",
      name: name.trim(),
      address: address.trim(),
      trading_hours: JSON.stringify(hours),
      contact_email: email.trim(),
      contact_phone: phone.trim(),
      // preserve existing archive threshold (or default for new locations)
      archive_threshold_days: location?.archive_threshold_days ?? 90,
      lat: lat ?? null,
      lng: lng ?? null,
      place_id: placeId ?? null,
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
          <PlacesAutocompleteInput
            value={address}
            onChange={handleAddressChange}
            onPlaceSelect={handlePlaceSelect}
            className={inputCls}
            placeholder="e.g. 14 Rue de la Paix, Lyon"
          />
          {lat !== null && lng !== null && (
            <div className="mt-2 space-y-2">
              <StaticMapPreview lat={lat} lng={lng} />
              <div className="flex items-center gap-2 rounded-xl border border-sage/30 bg-sage-light px-3 py-2 text-xs text-sage-deep">
                <MapPin size={13} className="shrink-0" />
                <span>Official place selected from maps</span>
              </div>
            </div>
          )}
        </FormField>
        <FormField label="Opening hours">
          <div className="space-y-2">
            {DAY_KEYS.map(day => (
              <div key={day} className="rounded-xl border border-border bg-muted/20 px-3 py-2 space-y-2">
                <div className="flex items-center gap-2.5">
                  <Switch
                    checked={hours[day].open}
                    onCheckedChange={val => setDayOpen(day, val)}
                  />
                  <span className="w-8 text-xs font-medium text-muted-foreground shrink-0">
                    {DAY_LABELS[day]}
                  </span>
                  {hours[day].open ? (
                    <button
                      type="button"
                      onClick={() => copyHoursToLaterDays(day)}
                      aria-label={`Copy ${DAY_LABELS[day]} to later days`}
                      className="ml-auto text-[10px] font-medium text-sage hover:text-sage-deep transition-colors"
                    >
                      Copy to later days
                    </button>
                  ) : (
                    <span className="ml-auto text-xs text-muted-foreground">Closed</span>
                  )}
                </div>
                {hours[day].open && (
                  <div className="space-y-2 pl-10">
                    {hours[day].windows.map((window, idx) => (
                      <div key={`${day}-${idx}`} className="flex items-center gap-2">
                        <span className="w-14 text-[10px] text-muted-foreground uppercase tracking-widest shrink-0">
                          Window {idx + 1}
                        </span>
                        <input
                          type="time"
                          value={window.start}
                          onChange={e => updateWindow(day, idx, { start: e.target.value })}
                          aria-label={`${DAY_LABELS[day]} start time window ${idx + 1}`}
                          className="flex-1 border border-border rounded-lg px-2 py-1.5 text-xs bg-muted focus:outline-none focus:ring-1 focus:ring-ring"
                        />
                        <span className="text-xs text-muted-foreground">–</span>
                        <input
                          type="time"
                          value={window.end}
                          onChange={e => updateWindow(day, idx, { end: e.target.value })}
                          aria-label={`${DAY_LABELS[day]} end time window ${idx + 1}`}
                          className="flex-1 border border-border rounded-lg px-2 py-1.5 text-xs bg-muted focus:outline-none focus:ring-1 focus:ring-ring"
                        />
                        {idx > 0 && (
                          <button
                            type="button"
                            onClick={() => removeSplitWindow(day, idx)}
                            className="text-[10px] font-medium text-status-error hover:opacity-80 transition-opacity"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    ))}
                    {hours[day].windows.length < 2 && (
                      <button
                        type="button"
                        onClick={() => addSplitWindow(day)}
                        aria-label={`Add split hours for ${DAY_LABELS[day]}`}
                        className="text-[10px] font-medium text-sage hover:text-sage-deep transition-colors"
                      >
                        Add split hours
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </FormField>
        {location && (
          <FormField label="Location email">
            <input
              type="email" value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="e.g. main@olia.app" className={inputCls}
            />
          </FormField>
        )}
        <FormField label="Location phone (optional)">
          <input
            type="tel" value={phone}
            onChange={e => setPhone(e.target.value)}
            placeholder="e.g. +33 4 78 00 11 22" className={inputCls}
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
  checklists: ChecklistItem[];
  roles: string[];
  currentLocationId: string;
  setCurrentLocationId: (id: string) => void;
  isOwner: boolean;
  permissions: ManagerPermissions | null;
  onAddLocation: () => void;
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
  locations, staffProfiles, checklists, roles, currentLocationId, setCurrentLocationId,
  isOwner, permissions,
  onAddLocation, onEditLocation, onUpdateLocation, onAddStaff, onEditStaff, onArchiveStaff, onRestoreStaff, onDeleteStaff,
  onLaunchKiosk,
}: MyLocationTabProps) {
  const [staffSearch, setStaffSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  // Local state for archive threshold — string so the user can clear the field
  // freely while typing. null = not editing (show saved value).
  // Save is only enabled when the draft is a valid integer >= 1 AND differs from saved.
  const [thresholdDraft, setThresholdDraft] = useState<string | null>(null);

  const currentLocation = locations.find(l => l.id === currentLocationId) ?? locations[0];

  const canEditLocation = !permissions || permissions.edit_location_details;
  const canEditThreshold = !permissions || permissions.override_inactivity_threshold;
  const canManageStaff = !permissions || permissions.manage_staff_profiles;

  const filteredStaff = staffProfiles.filter(sp => {
    if (sp.location_id !== (currentLocation?.id ?? "")) return false;
    const statusMatch = showArchived ? sp.status === "archived" : sp.status === "active";
    if (!statusMatch) return false;
    if (!staffSearch.trim()) return true;
    return staffDisplayName(sp).toLowerCase().includes(staffSearch.toLowerCase());
  });

  // ── No locations yet → onboarding empty state ─────────────────────────────
  if (locations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4 text-center space-y-5">
        <div className="w-16 h-16 rounded-2xl bg-sage/10 flex items-center justify-center">
          <MapPin size={28} className="text-sage" />
        </div>
        <div className="space-y-2">
          <h2 className="font-display text-xl text-foreground">Add your first location</h2>
          <p className="text-sm text-muted-foreground max-w-xs leading-relaxed">
            Locations are where your team works. Set up your first one to start
            creating checklists, managing staff, and using the kiosk.
          </p>
        </div>
        <button
          onClick={onAddLocation}
          className="flex items-center gap-2 px-5 py-3 rounded-xl bg-sage text-primary-foreground text-sm font-semibold hover:bg-sage-deep transition-colors"
        >
          <Plus size={15} />
          Add your first location
        </button>
      </div>
    );
  }

  if (!currentLocation) return null;

  return (
    <div className="space-y-4">
      {/* Location picker */}
      {isOwner ? (
        <div>
          <p className="section-label mb-2">Location</p>
          <div className="relative">
            <select
              value={currentLocationId}
              onChange={e => setCurrentLocationId(e.target.value)}
              className="w-full border border-border rounded-xl px-4 py-3 pr-10 text-sm bg-muted appearance-none focus:outline-none focus:ring-1 focus:ring-ring"
            >
              {locations.map(loc => (
                <option key={loc.id} value={loc.id}>{loc.name}</option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          </div>
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
          {currentLocation.trading_hours && (() => {
            let display = currentLocation.trading_hours;
            try {
              display = formatHoursText(parseHours(currentLocation.trading_hours));
            } catch { /* plain-text fallback */ }
            return (
              <div className="flex items-start gap-2">
                <Clock size={13} className="text-muted-foreground mt-0.5 shrink-0" />
                <p className="text-sm text-foreground">{display}</p>
              </div>
            );
          })()}
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
              "flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-xl border transition-colors whitespace-nowrap",
              showArchived
                ? "bg-muted text-foreground border-border"
                : "text-muted-foreground border-border hover:text-foreground hover:bg-muted",
            )}
          >
            {showArchived ? (
              <><RotateCcw size={11} /> Active</>
            ) : (
              <><Archive size={11} /> Archived</>
            )}
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
            const displayRole = getRoleDepartment(sp.role);
            const roleColor = ROLE_COLOR_MAP[displayRole] ?? "bg-muted text-muted-foreground";
            return (
              <div key={sp.id} className="flex items-center gap-3 px-4 py-3">
                <div className="w-9 h-9 rounded-full bg-sage-light flex items-center justify-center text-xs font-semibold text-sage-deep shrink-0">
                  {getInitials(staffDisplayName(sp))}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{staffDisplayName(sp)}</p>
                  <p className="text-[11px] text-muted-foreground/70 mt-0.5"
                     title={daysAgoTooltip(sp.last_used_at)}>{daysAgo(sp.last_used_at)}</p>
                </div>
                <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap", roleColor)}>
                  {displayRole}
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

        {/* Auto-archive threshold — only shown when viewing archived staff,
            where the setting is contextually relevant. Hidden in active view. */}
        {showArchived && canEditThreshold && (
          <div className="border border-border rounded-2xl px-4 py-3 bg-muted/30 mt-3">
            <p className="section-label mb-1">Auto-archive threshold</p>
            <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
              Staff profiles inactive for this many days are automatically archived.
            </p>
            {(() => {
              const parsedDraft = thresholdDraft !== null
                ? (thresholdDraft.trim() !== "" && /^\d+$/.test(thresholdDraft.trim())
                    ? parseInt(thresholdDraft.trim(), 10)
                    : null)
                : null;
              const isDraftValid   = parsedDraft !== null && parsedDraft >= 1;
              const isDraftChanged = isDraftValid && parsedDraft !== currentLocation.archive_threshold_days;

              return (
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    value={thresholdDraft ?? String(currentLocation.archive_threshold_days)}
                    onChange={e => setThresholdDraft(e.target.value)}
                    onFocus={() => setThresholdDraft(String(currentLocation.archive_threshold_days))}
                    onBlur={() => {
                      if (thresholdDraft !== null && !isDraftValid) setThresholdDraft(null);
                    }}
                    min={1}
                    className={cn(
                      "w-24 border rounded-xl px-3 py-2 text-sm bg-card focus:outline-none focus:ring-1 focus:ring-ring",
                      thresholdDraft !== null && !isDraftValid ? "border-status-error" : "border-border",
                    )}
                  />
                  <span className="text-sm text-muted-foreground">days</span>
                  {thresholdDraft !== null && (
                    isDraftValid ? (
                      isDraftChanged ? (
                        <button
                          onClick={() => {
                            onUpdateLocation({ ...currentLocation, archive_threshold_days: parsedDraft! });
                            setThresholdDraft(null);
                          }}
                          className="px-3 py-2 rounded-xl text-xs font-medium bg-sage text-primary-foreground hover:bg-sage-deep transition-colors"
                        >
                          Save
                        </button>
                      ) : null
                    ) : (
                      <span className="text-xs text-status-error">Enter a number ≥ 1</span>
                    )
                  )}
                </div>
              );
            })()}
          </div>
        )}
      </section>

      {/* Assigned Checklists */}
      <div className="card-surface p-4">
        <p className="section-label mb-3">Assigned checklists</p>
        {(() => {
          const locationChecklists = checklists.filter(c => c.location_id === currentLocation.id);
          return locationChecklists.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No checklists assigned to this location yet.
            </p>
          ) : (
            <div className="space-y-2">
              {locationChecklists.map(c => (
                <div key={c.id} className="flex items-center gap-2 py-0.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-sage shrink-0" />
                  <p className="text-sm text-foreground">{c.title}</p>
                </div>
              ))}
            </div>
          );
        })()}
      </div>

    </div>
  );
}

// ─── AccountTab ───────────────────────────────────────────────────────────────

interface AccountTabProps {
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

function AccountTab({
  locations, activeLocationIds, inactiveLocationIds, staffProfiles, teamMembers, checklists, onSavePerms,
  onSaveAccount, departments, setDepartments, auditLog, authAccount, authMemberId, authUserEmail, authUserName,
  billingUnavailable, locationLimit, isLocationOverLimit, locationGraceEndsAt, isGraceActive, isGraceExpired,
  onAddLocation, onLocationLimitReached, onEditLocation, onDeleteLocation, onSaveActiveLocations, savingActiveLocations,
  onInviteMember, onEditMember, onDeleteMember,
}: AccountTabProps) {
  const navigate = useNavigate();
  const { plan, planStatus, isActive } = usePlan();
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
  const [profileName, setProfileName] = useState(authUserName ?? currentAccount?.name ?? "");
  const [profileEmail, setProfileEmail] = useState(authUserEmail ?? currentAccount?.email ?? "");
  const [pin, setPin] = useState("");
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
      await onSaveAccount({
        id: currentAccount.id,
        name: currentAccount.name,
        email: currentAccount.email,
        role: currentAccount.role,
        location_ids: currentAccount.location_ids,
        permissions: currentAccount.permissions,
        rawPin: pin,
      });
      setPin("");
      toast.success("Admin PIN updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update admin PIN");
    } finally {
      setPinSaving(false);
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
      {/* My account */}
      <section className="card-surface p-4 space-y-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="section-label">My account</p>
            <p className="text-xs text-muted-foreground mt-1">Manage the admin profile, email, password, and kiosk PIN.</p>
          </div>
          <span className="text-[10px] px-2 py-1 rounded-full bg-sage-light text-sage-deep font-semibold uppercase tracking-wide">
            Admin
          </span>
        </div>

        <div className="grid gap-3">
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground font-medium">Full name</span>
            <input
              type="text"
              value={profileName}
              onChange={e => setProfileName(e.target.value)}
              className="w-full border border-border rounded-xl px-4 py-3 text-sm bg-muted focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground font-medium">Email</span>
            <input
              type="email"
              value={profileEmail}
              onChange={e => setProfileEmail(e.target.value)}
              className="w-full border border-border rounded-xl px-4 py-3 text-sm bg-muted focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </label>
          <button
            type="button"
            onClick={saveProfile}
            disabled={profileSaving || !profileName.trim() || !profileEmail.trim()}
            className={cn(
              "w-full py-3 rounded-xl text-sm font-semibold transition-colors",
              profileSaving || !profileName.trim() || !profileEmail.trim()
                ? "bg-muted text-muted-foreground cursor-not-allowed"
                : "bg-sage text-primary-foreground hover:bg-sage-deep",
            )}
          >
            {profileSaving ? "Saving profile…" : "Save profile"}
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-border bg-background p-3 space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Assigned locations</p>
            {assignedLocationIds.length ? (
              <div className="flex flex-wrap gap-2">
                {locations.filter(loc => assignedLocationIds.includes(loc.id)).map(loc => (
                  <span key={loc.id} className="text-xs px-2 py-1 rounded-full bg-muted text-foreground">
                    {loc.name}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">All locations</p>
            )}
          </div>
          <div className="rounded-xl border border-border bg-background p-3 space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Role and permissions</p>
            <p className="text-sm font-medium text-foreground">{currentAccount?.role ?? "Owner"}</p>
            {currentAccount?.role === "Owner" ? (
              <p className="text-xs text-muted-foreground">Full access to all admin settings.</p>
            ) : (
              <p className="text-xs text-muted-foreground">Permissions inherited from the current manager profile.</p>
            )}
          </div>
        </div>
      </section>

      <section className="card-surface p-4 space-y-4">
        <div>
          <p className="section-label">Security</p>
          <p className="text-xs text-muted-foreground mt-1">
            Admin app sign-in uses email codes. Use a 4-digit PIN for kiosk-side admin access, or create a new PIN if the old one was forgotten.
          </p>
        </div>

        <div className="space-y-3">
          <label className="space-y-1 block">
            <span className="text-xs text-muted-foreground font-medium">Create a new Admin PIN</span>
            <input
              type="text"
              inputMode="numeric"
              maxLength={4}
              value={pin}
              onChange={e => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
              placeholder="Enter a new 4-digit PIN"
              className="w-full border border-border rounded-xl px-4 py-3 text-sm bg-muted focus:outline-none focus:ring-1 focus:ring-ring tracking-[0.4em]"
            />
          </label>
          <button
            type="button"
            onClick={savePin}
            disabled={pinSaving || pin.length !== 4}
            className={cn(
              "w-full py-3 rounded-xl text-sm font-semibold transition-colors",
              pinSaving || pin.length !== 4
                ? "bg-muted text-muted-foreground cursor-not-allowed"
                : "bg-sage text-primary-foreground hover:bg-sage-deep",
            )}
          >
            {pinSaving ? "Saving new PIN…" : "Create or reset PIN"}
          </button>
        </div>
      </section>

      {/* All Locations */}
      <section>
        {/* Header row: title + button */}
        <div className="flex items-center justify-between mb-1">
          <p className="section-label">All locations</p>
          <button
            onClick={handleAddLocationClick}
            className="flex items-center gap-1 text-xs text-sage font-medium hover:underline"
          >
            <Plus size={12} /> Add location
          </button>
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
            <Plus size={12} /> Add
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
        </div>
      </section>

      <div className="card-surface p-4">
        <div className="mb-3 space-y-1">
          <p className="section-label">Checklist coverage</p>
          <p className="text-xs text-muted-foreground">
            Checklists currently inherit their location coverage from the builder. This view gives a quick read on what is already assigned to the current location.
          </p>
        </div>
        {checklists.length === 0 ? (
          <p className="text-sm text-muted-foreground">No checklists created yet.</p>
        ) : (
          <div className="card-surface divide-y divide-border">
            {checklists.map(c => (
              <div key={c.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground truncate">{c.title}</p>
                  <p className="text-xs text-muted-foreground">
                    Assigned to {locations.find(l => l.id === c.location_id)?.name ?? "all locations"}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
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

      {/* Department Management */}
      <section>
        <p className="section-label mb-3">Department management</p>
        <p className="text-xs text-muted-foreground mb-3">
          Staff roles are managed at the department level only.
        </p>
        <div className="space-y-3">
          {departments.map((department, departmentIndex) => {
            const departmentInUse = staffProfiles.some(sp => roleUsesDepartment(sp.role, department.name));
            const isRenaming = renamingDepartment?.index === departmentIndex;
            return (
              <div key={department.name} className="card-surface p-4 space-y-3">
                <div className="flex items-center gap-2">
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
              </div>
            );
          })}
          <div className="card-surface p-4">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newDepartmentName}
                onChange={e => setNewDepartmentName(e.target.value)}
                placeholder="Add department…"
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addDepartment(); } }}
                className="flex-1 border border-border rounded-lg px-3 py-1.5 text-sm bg-muted focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <button
                onClick={addDepartment}
                disabled={!newDepartmentName.trim()}
                className={cn(
                  "p-1.5 rounded-lg transition-colors",
                  newDepartmentName.trim()
                    ? "bg-sage text-primary-foreground hover:bg-sage-deep"
                    : "bg-muted text-muted-foreground cursor-not-allowed",
                )}
              >
                <Plus size={14} />
              </button>
            </div>
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
  const [departments, setDepartments] = useState<StaffDepartment[]>(cloneDepartments(DEFAULT_STAFF_DEPARTMENTS));
  const staffRoleOptions = flattenStaffDepartments(departments);
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
