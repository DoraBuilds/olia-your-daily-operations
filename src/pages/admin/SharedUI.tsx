// ─── Shared UI components for the Admin page ─────────────────────────────────
// BottomSheet, ModalHeader, FormField, SaveButton, DepartmentRolePicker,
// ConfirmModal, StaffProfileModal, TeamMemberModal, LocationModal

import { useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import {
  MapPin, Plus, Pencil, X,
  ChevronDown, Eye, EyeOff,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { toast } from "@/components/ui/sonner";
import { Switch } from "@/components/ui/switch";
import {
  PlacesAutocompleteInput, StaticMapPreview, type PlaceResult,
} from "@/components/PlacesAutocompleteInput";
import {
  type Location, type StaffProfile, type TeamMember, type ManagerPermissions,
  type StaffDepartment, type AccountRole,
  DEFAULT_PERMISSIONS,
  getRoleDepartment, getInitials, generatePin,
} from "@/lib/admin-repository";
import {
  PERM_LABELS, ROLE_COLOR_MAP as _ROLE_COLOR_MAP, getPermLabel,
} from "./shared";

// Re-export so LocationModal callers can use this without importing from shared
export { PERM_LABELS, _ROLE_COLOR_MAP as ROLE_COLOR_MAP };

export const inputCls = "w-full border border-border rounded-xl px-4 py-3 text-sm bg-muted focus:outline-none focus:ring-1 focus:ring-ring";

// ─── BottomSheet ──────────────────────────────────────────────────────────────

export function BottomSheet({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-foreground/20 backdrop-blur-sm animate-fade-in sm:items-center sm:px-4 sm:py-8"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-card w-full max-w-lg rounded-t-2xl p-5 pb-8 space-y-4 animate-fade-in max-h-[85vh] overflow-y-auto sm:max-w-2xl sm:rounded-2xl sm:max-h-[90vh] sm:shadow-2xl">
        {children}
      </div>
    </div>,
    document.body
  );
}

// ─── ModalHeader ─────────────────────────────────────────────────────────────

export function ModalHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="font-display text-lg text-foreground">{title}</h2>
      <button onClick={onClose} className="btn-icon">
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
  const { t } = useTranslation("admin");
  return (
    <BottomSheet onClose={onClose}>
      <ModalHeader title={title} onClose={onClose} />
      <p className="text-sm text-muted-foreground">{message}</p>
      <div className="flex gap-3">
        <button
          onClick={onClose}
          className="flex-1 py-3 rounded-xl text-sm font-medium border border-border text-foreground hover:bg-muted transition-colors"
        >
          {t("sharedUI.cancel")}
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
  profile, locations, departments, onClose, onSave, isOwner,
}: {
  profile: StaffProfile | null; locations: Location[]; departments: StaffDepartment[];
  onClose: () => void; onSave: (p: StaffProfile & { rawPin?: string }) => void;
  isOwner?: boolean;
}) {
  const { t } = useTranslation("admin");
  const isEdit = !!profile;
  const [firstName, setFirstName] = useState(profile?.first_name ?? "");
  const [lastName, setLastName] = useState(profile?.last_name ?? "");
  const [locationId, setLocationId] = useState(profile?.location_id ?? locations[0]?.id ?? "");
  const [role, setRole] = useState(getRoleDepartment(profile?.role ?? departments[0]?.name ?? ""));
  const [email, setEmail] = useState(profile?.email ?? "");
  // New staff: generate a PIN upfront; editing: leave empty (only set if manager enters a new one)
  const [pin, setPin] = useState(() => isEdit ? "" : generatePin());
  const [revealedPin, setRevealedPin] = useState<string | null>(null);
  const [showRevealedPin, setShowRevealedPin] = useState(false);
  const [revealLoading, setRevealLoading] = useState(false);

  const handleRevealPin = async () => {
    if (!profile?.id) return;
    setRevealLoading(true);
    try {
      const { data, error } = await supabase.rpc("admin_reveal_pin", {
        p_member_type: "staff_profile",
        p_member_id: profile.id,
      });
      if (error) throw error;
      setRevealedPin((data as string) ?? "");
      setShowRevealedPin(true);
    } catch (err) {
      const msg = (err as any)?.message ?? t("sharedUI.couldNotRevealPin");
      toast.error(msg);
    } finally {
      setRevealLoading(false);
    }
  };

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
      email: email.trim() || null,
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
      <ModalHeader title={isEdit ? t("sharedUI.staffProfile.editTitle") : t("sharedUI.staffProfile.addTitle")} onClose={onClose} />
      <form onSubmit={handleSave} className="space-y-3">
        <FormField label={t("sharedUI.staffProfile.locationRequired")}>
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
        <FormField label={t("sharedUI.staffProfile.firstNameRequired")}>
          <input
            autoFocus type="text" value={firstName}
            onChange={e => setFirstName(e.target.value)}
            placeholder={t("sharedUI.staffProfile.firstNamePlaceholder")} className={inputCls}
          />
        </FormField>
        <FormField label={t("sharedUI.staffProfile.lastName")}>
          <input
            type="text" value={lastName}
            onChange={e => setLastName(e.target.value)}
            placeholder={t("sharedUI.staffProfile.lastNamePlaceholder")} className={inputCls}
          />
        </FormField>
        <FormField label={t("sharedUI.staffProfile.emailOptional")}>
          <input
            type="email" value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder={t("sharedUI.staffProfile.emailPlaceholder")} className={inputCls}
          />
          <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">
            {t("sharedUI.staffProfile.emailHint")}
          </p>
        </FormField>
        <FormField label={t("sharedUI.staffProfile.role")}>
          <DepartmentRolePicker departments={departments} value={role} onChange={setRole} />
        </FormField>
        <FormField label={isEdit ? t("sharedUI.staffProfile.newPinOptional") : t("sharedUI.staffProfile.staffPin")}>
          {isEdit ? (
            <p className="text-xs text-muted-foreground mb-2 leading-relaxed">
              {t("sharedUI.staffProfile.editPinHint")}
            </p>
          ) : (
            <p className="text-xs text-amber-600/80 bg-amber-50 rounded-lg px-3 py-2 mb-2 leading-relaxed">
              {t("sharedUI.staffProfile.newPinHint")}
            </p>
          )}
          <div className="flex gap-2">
            <input
              type="text" value={pin} maxLength={4}
              onChange={e => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
              className={cn(inputCls, "text-center font-mono text-lg tracking-widest flex-1")}
              placeholder={isEdit ? t("sharedUI.staffProfile.newPinToChange") : t("sharedUI.staffProfile.fourDigitPin")}
            />
            <button type="button" onClick={() => setPin(generatePin())}
              className="shrink-0 px-3 py-2 rounded-xl text-xs font-medium bg-muted border border-border hover:bg-muted/60 transition-colors">
              {t("sharedUI.staffProfile.generate")}
            </button>
          </div>
          {isEdit && isOwner && (
            <div className="flex items-center gap-2 mt-1.5">
              {revealedPin !== null ? (
                <>
                  <span className="text-xs text-muted-foreground">
                    {t("sharedUI.staffProfile.currentPin")}&nbsp;
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
                  {revealLoading ? t("sharedUI.staffProfile.loading") : t("sharedUI.staffProfile.viewCurrentPin")}
                </button>
              )}
            </div>
          )}
        </FormField>
        <SaveButton disabled={!firstName.trim() || !locationId || (!isEdit && !pin)} label={isEdit ? t("sharedUI.staffProfile.saveChanges") : t("sharedUI.staffProfile.addProfile")} />
      </form>
    </BottomSheet>
  );
}

// ─── TeamMemberModal ──────────────────────────────────────────────────────────

export function TeamMemberModal({
  member, locations, onClose, onSave, isOwner,
}: {
  member: TeamMember | null; locations: Location[];
  onClose: () => void; onSave: (m: TeamMember & { rawPin?: string }) => void;
  isOwner?: boolean;
}) {
  const { t } = useTranslation("admin");
  const [name, setName] = useState(member?.name ?? "");
  const [email, setEmail] = useState(member?.email ?? "");
  const [role, setRole] = useState<AccountRole>(member?.role ?? "Manager");
  const [locationIds, setLocationIds] = useState<string[]>(member?.location_ids ?? []);
  const [perms, setPerms] = useState<ManagerPermissions>(member?.permissions ?? { ...DEFAULT_PERMISSIONS });
  const [pin, setPin] = useState(() => member?.id ? "" : generatePin());
  const [revealedPin, setRevealedPin] = useState<string | null>(null);
  const [showRevealedPin, setShowRevealedPin] = useState(false);
  const [revealLoading, setRevealLoading] = useState(false);

  const handleRevealPin = async () => {
    if (!member?.id) return;
    setRevealLoading(true);
    try {
      const { data, error } = await supabase.rpc("admin_reveal_pin", {
        p_member_type: "team_member",
        p_member_id: member.id,
      });
      if (error) throw error;
      setRevealedPin((data as string) ?? "");
      setShowRevealedPin(true);
    } catch (err) {
      const msg = (err as any)?.message ?? t("sharedUI.couldNotRevealPin");
      toast.error(msg);
    } finally {
      setRevealLoading(false);
    }
  };

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
      permissions: role === "Owner"
        ? { ...DEFAULT_PERMISSIONS }
        : role === "Manager"
        ? perms
        : Object.fromEntries(Object.keys(DEFAULT_PERMISSIONS).map(k => [k, false])) as ManagerPermissions,
      ...(pin ? { rawPin: pin } : {}),
    });
    onClose();
  };

  return (
    <BottomSheet onClose={onClose}>
      <ModalHeader title={member ? t("sharedUI.teamMember.editTitle") : t("sharedUI.teamMember.addTitle")} onClose={onClose} />
      <form onSubmit={handleSave} className="space-y-3">
        <FormField label={t("sharedUI.teamMember.fullName")}>
          <input
            autoFocus type="text" value={name}
            onChange={e => setName(e.target.value)}
            placeholder={t("sharedUI.teamMember.fullNamePlaceholder")} className={inputCls}
          />
        </FormField>
        <FormField label={t("sharedUI.teamMember.email")}>
          <input
            type="email" value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder={t("sharedUI.teamMember.emailPlaceholder")} className={inputCls}
          />
        </FormField>
        <FormField label={t("sharedUI.teamMember.role")}>
          <div className="flex gap-2">
            {(["Owner", "Manager", "Member"] as AccountRole[]).map(r => (
              <button
                type="button" key={r} onClick={() => setRole(r)}
                className={cn(
                  "flex-1 py-2 text-xs rounded-lg border transition-colors",
                  role === r
                    ? "bg-sage text-primary-foreground border-sage"
                    : "border-border text-muted-foreground hover:border-sage/40",
                )}
              >
                {t(`roles.${r}`)}
              </button>
            ))}
          </div>
        </FormField>
        <FormField label={role === "Owner" ? t("sharedUI.teamMember.adminPin") : t("sharedUI.teamMember.kioskPin")}>
          {member?.id ? (
            <p className="text-xs text-muted-foreground mb-2 leading-relaxed">
              {t("sharedUI.staffProfile.editPinHint")}
            </p>
          ) : (
            <p className="text-xs text-amber-600/80 bg-amber-50 rounded-lg px-3 py-2 mb-2 leading-relaxed">
              {t("sharedUI.teamMember.newPinPlaceholder")}
            </p>
          )}
          <div className="flex gap-2">
            <input
              type="text"
              value={pin}
              onChange={e => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
              placeholder={member?.id ? t("sharedUI.staffProfile.newPinToChange") : t("sharedUI.staffProfile.fourDigitPin")}
              className={cn(inputCls, "flex-1 text-center font-mono text-lg tracking-widest")}
              maxLength={4}
            />
            <button
              type="button"
              onClick={() => setPin(generatePin())}
              className="shrink-0 px-3 py-2 rounded-xl text-xs font-medium bg-muted border border-border hover:bg-muted/60 transition-colors"
            >
              {t("sharedUI.staffProfile.generate")}
            </button>
          </div>
          {member?.id && isOwner && (
            <div className="flex items-center gap-2 mt-1.5">
              {revealedPin !== null ? (
                <>
                  <span className="text-xs text-muted-foreground">
                    {t("sharedUI.staffProfile.currentPin")}&nbsp;
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
                  {revealLoading ? t("sharedUI.staffProfile.loading") : t("sharedUI.staffProfile.viewCurrentPin")}
                </button>
              )}
            </div>
          )}
        </FormField>
        <FormField label={t("sharedUI.teamMember.locations")}>
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
            <p className="section-label">{t("sharedUI.teamMember.permissions")}</p>
            {(Object.keys(PERM_LABELS) as (keyof ManagerPermissions)[]).map(key => (
              <div key={key} className="flex items-center justify-between gap-3">
                <p className="text-sm text-foreground">{getPermLabel(key)}</p>
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
            {t("sharedUI.teamMember.inviteNotice")}
          </p>
        )}
        <SaveButton disabled={!name.trim() || (!member && !pin.trim())} label={member ? t("sharedUI.teamMember.saveChanges") : t("sharedUI.teamMember.addTeamMember")} />
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
  const { t } = useTranslation("admin");
  const [name, setName] = useState(location?.name ?? "");
  const [address, setAddress] = useState(location?.address ?? "");
  const [email, setEmail] = useState(location?.contact_email ?? "");
  const [phone, setPhone] = useState(location?.contact_phone ?? "");
  // Google Maps fields — set when user picks from autocomplete dropdown
  const [lat, setLat] = useState<number | null>(location?.lat ?? null);
  const [lng, setLng] = useState<number | null>(location?.lng ?? null);
  const [placeId, setPlaceId] = useState<string | null>(location?.place_id ?? null);

  const handlePlaceSelect = (place: PlaceResult) => {
    setAddress(place.address);
    setLat(place.lat);
    setLng(place.lng);
    setPlaceId(place.placeId);
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
      trading_hours: null,
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
      <ModalHeader title={location ? t("sharedUI.location.editTitle") : t("sharedUI.location.newTitle")} onClose={onClose} />
      <form onSubmit={handleSave} className="space-y-3">
        <FormField label={t("sharedUI.location.nameRequired")}>
          <input
            autoFocus type="text" value={name}
            onChange={e => setName(e.target.value)}
            placeholder={t("sharedUI.location.namePlaceholder")} className={inputCls}
          />
        </FormField>
        <FormField label={t("sharedUI.location.address")}>
          <PlacesAutocompleteInput
            value={address}
            onChange={handleAddressChange}
            onPlaceSelect={handlePlaceSelect}
            className={inputCls}
            placeholder={t("sharedUI.location.addressPlaceholder")}
          />
          <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
            {t("sharedUI.location.addressHint")}
          </p>
          {lat !== null && lng !== null && (
            <div className="mt-2 space-y-2">
              <StaticMapPreview lat={lat} lng={lng} />
              <div className="flex items-center gap-2 rounded-xl border border-sage/30 bg-sage-light px-3 py-2 text-xs text-sage-deep">
                <MapPin size={13} className="shrink-0" />
                <span>{t("sharedUI.location.officialPlaceSelected")}</span>
              </div>
            </div>
          )}
        </FormField>
        <FormField label={t("sharedUI.location.alertEmailRequired")}>
          <input
            type="email" value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder={t("sharedUI.location.alertEmailPlaceholder")} className={inputCls}
            required
          />
          <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">
            {t("sharedUI.location.alertEmailHint")}
          </p>
        </FormField>
        <FormField label={t("sharedUI.location.phoneOptional")}>
          <input
            type="tel" value={phone}
            onChange={e => setPhone(e.target.value)}
            placeholder={t("sharedUI.location.phonePlaceholder")} className={inputCls}
          />
        </FormField>
        <SaveButton disabled={!name.trim() || !email.trim()} label={location ? t("sharedUI.location.saveChanges") : t("sharedUI.location.addLocation")} />
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
