// ─── Shared UI components for the Admin page ─────────────────────────────────
// BottomSheet, ModalHeader, FormField, SaveButton, DepartmentRolePicker,
// ConfirmModal, StaffProfileModal, TeamMemberModal, LocationModal

import { useState, useEffect } from "react";
import {
  MapPin, Plus, Pencil, X,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import {
  PlacesAutocompleteInput, StaticMapPreview, type PlaceResult,
} from "@/components/PlacesAutocompleteInput";
import {
  type Location, type StaffProfile, type TeamMember, type ManagerPermissions,
  type StaffDepartment, type AccountRole,
  DEFAULT_ADMIN_PIN, DEFAULT_PERMISSIONS,
  getRoleDepartment, getInitials, generatePin,
} from "@/lib/admin-repository";
import {
  PERM_LABELS, ROLE_COLOR_MAP as _ROLE_COLOR_MAP,
  DAY_KEYS, DAY_LABELS,
  type DayKey, type TimeWindow, type DayHours, type WeeklyHours,
  cloneDayHours, parseHours, parseGoogleOpeningHours,
} from "./shared";

// Re-export so LocationModal callers can use this without importing from shared
export { PERM_LABELS, _ROLE_COLOR_MAP as ROLE_COLOR_MAP };

export const inputCls = "w-full border border-border rounded-xl px-4 py-3 text-sm bg-muted focus:outline-none focus:ring-1 focus:ring-ring";

// ─── BottomSheet ──────────────────────────────────────────────────────────────

export function BottomSheet({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
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

// ─── ModalHeader ─────────────────────────────────────────────────────────────

export function ModalHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="font-display text-lg text-foreground">{title}</h2>
      <button onClick={onClose} className="p-1.5 rounded-full hover:bg-muted transition-colors">
        <X size={18} className="text-muted-foreground" />
      </button>
    </div>
  );
}

// ─── FormField ───────────────────────────────────────────────────────────────

export function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs text-muted-foreground mb-1 block">{label}</label>
      {children}
    </div>
  );
}

// ─── SaveButton ───────────────────────────────────────────────────────────────

export function SaveButton({ disabled, label }: { disabled: boolean; label: string }) {
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

// ─── DepartmentRolePicker ─────────────────────────────────────────────────────

export function DepartmentRolePicker({
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

export function ConfirmModal({
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

export function StaffProfileModal({
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

export function TeamMemberModal({
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
  const [pin, setPin] = useState(() => member?.id ? "" : (role === "Owner" ? DEFAULT_ADMIN_PIN : generatePin()));

  useEffect(() => {
    if (member?.id) return;
    setPin(role === "Owner" ? DEFAULT_ADMIN_PIN : generatePin());
  }, [member?.id, role]);

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
              {role === "Owner"
                ? `New owner accounts start with PIN ${DEFAULT_ADMIN_PIN} and should change it immediately for security.`
                : "This PIN is used for kiosk access. Generate one now so the staff member can log in."}
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

export function LocationModal({
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
    const autoHours = parseGoogleOpeningHours(place.openingHoursText ?? null);
    if (autoHours) {
      setHours(autoHours);
    }
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
          <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
            Pick a real place from Google Maps to autofill the official address, map preview, and opening hours when available.
          </p>
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
        <FormField label="Alert email (required)">
          <input
            type="email" value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="e.g. main@olia.app" className={inputCls}
            required
          />
          <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">
            Out-of-range alerts and operational notifications are sent here.
          </p>
        </FormField>
        <FormField label="Location phone (optional)">
          <input
            type="tel" value={phone}
            onChange={e => setPhone(e.target.value)}
            placeholder="e.g. +33 4 78 00 11 22" className={inputCls}
          />
        </FormField>
        <SaveButton disabled={!name.trim() || !email.trim()} label={location ? "Save changes" : "Add location"} />
      </form>
    </BottomSheet>
  );
}

// ─── ConfirmState type ────────────────────────────────────────────────────────

export type ConfirmState = {
  title: string;
  message: React.ReactNode;
  actionLabel: string;
  onConfirm: () => void;
} | null;
