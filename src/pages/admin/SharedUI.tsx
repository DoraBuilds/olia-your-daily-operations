// ─── Shared UI components for the Admin page ─────────────────────────────────
// BottomSheet, ModalHeader, FormField, SaveButton,
// ConfirmModal, TeamMemberModal, ConceptModal, LocationModal

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import {
  MapPin, Plus, Pencil, X,
  Eye, EyeOff,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { toast } from "@/components/ui/sonner";
import { Switch } from "@/components/ui/switch";
import {
  PlacesAutocompleteInput, StaticMapPreview, type PlaceResult,
} from "@/components/PlacesAutocompleteInput";
import {
  type Location, type Concept, type TeamMember, type ManagerPermissions,
  DEFAULT_PERMISSIONS,
  getInitials, generatePin,
} from "@/lib/admin-repository";
import { useDepartmentsForLocations } from "@/hooks/useDepartments";
import { FilterMultiSelect } from "@/components/FiltersPopover";
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
  const { t } = useTranslation("admin");
  return (
    <div className="flex items-center justify-between">
      <h2 className="font-display text-lg text-foreground">{title}</h2>
      <button onClick={onClose} className="btn-icon" aria-label={t("close")}>
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

// ─── AddLink ─────────────────────────────────────────────────────────────────
// The quiet "+ Add" used at the top of admin lists and sections. The visible
// text is always "Add"; ariaLabel says what gets added.

export function AddLink({ onClick, ariaLabel }: { onClick: () => void; ariaLabel: string }) {
  const { t } = useTranslation("admin");
  return (
    <button
      onClick={onClick}
      aria-label={ariaLabel}
      className="flex items-center gap-1 text-xs text-sage font-medium hover:underline"
    >
      <Plus size={12} /> {t("sharedUI.add")}
    </button>
  );
}

// ─── Menus ────────────────────────────────────────────────────────────────────

/** Open state for a click-away popover menu (the 3-dot / Add menus). */
export function useMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);
  return { open, setOpen, ref };
}

export const menuPanelCls = "absolute right-0 top-full mt-1 z-50 bg-card border border-border rounded-xl shadow-lg min-w-[200px] py-1 animate-fade-in";
export const menuItemCls = "w-full flex items-center gap-2 px-4 py-2.5 text-left text-sm hover:bg-muted/50 transition-colors";

// ─── ConfirmModal ─────────────────────────────────────────────────────────────

export function ConfirmModal({
  title, message, actionLabel, onClose, onConfirm, requireDeleteText, extra,
}: {
  title: string; message: React.ReactNode; actionLabel: string;
  onClose: () => void; onConfirm: () => void; requireDeleteText?: boolean;
  /** Block-level content (inputs, etc.) rendered below the message — never put block elements in `message` itself, which is wrapped in a <p>. */
  extra?: React.ReactNode;
}) {
  const { t } = useTranslation("admin");
  const [deleteText, setDeleteText] = useState("");
  const confirmWord = t("confirm.confirmWord");
  const locked = requireDeleteText && deleteText !== confirmWord;
  return (
    <BottomSheet onClose={onClose}>
      <ModalHeader title={title} onClose={onClose} />
      <p className="text-sm text-muted-foreground">{message}</p>
      {extra}
      {requireDeleteText && (
        <div>
          <p className="text-xs text-muted-foreground">
            {t("confirm.typeToConfirm")} <strong className="text-foreground">{confirmWord}</strong> {t("confirm.toConfirm")}
          </p>
          <input
            autoFocus
            type="text"
            value={deleteText}
            onChange={e => setDeleteText(e.target.value.toUpperCase())}
            placeholder={t("confirm.placeholder")}
            className="mt-2 w-full border border-border rounded-xl px-3 py-2 text-sm bg-muted focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      )}
      <div className="flex gap-3">
        <button
          onClick={onClose}
          className="flex-1 py-3 rounded-xl text-sm font-medium border border-border text-foreground hover:bg-muted transition-colors"
        >
          {t("sharedUI.cancel")}
        </button>
        <button
          disabled={locked}
          onClick={onConfirm}
          className="flex-1 py-3 rounded-xl text-sm font-medium bg-status-error text-primary-foreground hover:opacity-90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:opacity-40"
        >
          {actionLabel}
        </button>
      </div>
    </BottomSheet>
  );
}

// ─── TeamMemberModal ──────────────────────────────────────────────────────────
// Unified add/edit for every team member (#748). Default access is kiosk-PIN
// only (mirrors the old StaffProfileModal); the "Manager role" toggle opts
// into admin-app login + permissions (the old TeamMemberModal's behavior).
// is_owner is never editable here — it's a non-removable status stamped only
// at signup.

export function TeamMemberModal({
  member, concepts, locations, onClose, onSave, isOwner, initialLocationIds,
}: {
  member: TeamMember | null; concepts: Concept[]; locations: Location[];
  onClose: () => void; onSave: (m: TeamMember & { rawPin?: string }) => void;
  isOwner?: boolean;
  /** Pre-ticked locations for a new member (e.g. added from a location's page). */
  initialLocationIds?: string[];
}) {
  const { t } = useTranslation("admin");
  const [name, setName] = useState(member?.name ?? "");
  const [email, setEmail] = useState(member?.email ?? "");
  const [role, setRole] = useState(member?.role ?? "");
  // Stored empty location_ids means "every location in the company", so it
  // opens with every concept and location ticked; otherwise concepts are
  // seeded from the member's (or pre-ticked) locations.
  const initialLocations = member?.location_ids ?? initialLocationIds ?? [];
  const [locationIds, setLocationIds] = useState<string[]>(
    () => initialLocations.length === 0 ? locations.map(l => l.id) : initialLocations,
  );
  const [conceptIds, setConceptIds] = useState<string[]>(() => initialLocations.length === 0
    ? concepts.map(c => c.id)
    : [...new Set(
      locations.filter(l => initialLocations.includes(l.id) && l.concept_id).map(l => l.concept_id as string),
    )]);
  const [isManager, setIsManager] = useState(member?.is_manager ?? false);
  const [departmentIds, setDepartmentIds] = useState<string[]>(member?.department_ids ?? []);
  const [perms, setPerms] = useState<ManagerPermissions>(member?.permissions ?? { ...DEFAULT_PERMISSIONS });
  const [pin, setPin] = useState(() => member?.id ? "" : generatePin());
  const [revealedPin, setRevealedPin] = useState<string | null>(null);
  const [showRevealedPin, setShowRevealedPin] = useState(false);
  const [revealLoading, setRevealLoading] = useState(false);

  // Locations without a concept (legacy rows) are always offered.
  const visibleLocations = locations.filter(l => !l.concept_id || conceptIds.includes(l.concept_id));

  // Every location ticked is saved as empty — "every location in the
  // company", which also covers locations added later.
  const pickedLocationIds = locationIds.filter(id => locations.some(l => l.id === id));
  const savedLocationIds = locations.length > 0 && pickedLocationIds.length === locations.length
    ? []
    : pickedLocationIds;
  const departmentLocationIds = pickedLocationIds;

  // Departments are company-wide (#838); offer every department that applies
  // to at least one of the member's locations.
  const { data: assignedDepartments = [], isLoading: departmentsLoading } = useDepartmentsForLocations(departmentLocationIds);

  // Drop any stale picks once we know they no longer belong to any of the
  // member's locations (e.g. that location was just deselected) — otherwise
  // the old ids would still be saved underneath the picker.
  useEffect(() => {
    if (!departmentsLoading && departmentIds.some(id => !assignedDepartments.some(d => d.id === id))) {
      setDepartmentIds(prev => prev.filter(id => assignedDepartments.some(d => d.id === id)));
    }
  }, [departmentIds, assignedDepartments, departmentsLoading]);

  // Ticking a concept ticks its locations; unticking one drops them, so
  // nothing stays ticked that's no longer offered.
  const changeConcepts = (ids: string[]) => {
    const added = ids.filter(id => !conceptIds.includes(id));
    setConceptIds(ids);
    setLocationIds(prev => [
      ...prev.filter(lid => {
        const conceptId = locations.find(l => l.id === lid)?.concept_id;
        return !conceptId || ids.includes(conceptId);
      }),
      ...locations.filter(l => l.concept_id && added.includes(l.concept_id) && !prev.includes(l.id)).map(l => l.id),
    ]);
  };

  const pickerWidth = "w-[var(--radix-popover-trigger-width)]";
  const conceptName = (id: string | null) => concepts.find(c => c.id === id)?.name;
  const showConceptOnLocations = conceptIds.length > 1;
  const allConceptsPicked = conceptIds.length === concepts.length;

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

  const canSave = name.trim().length > 0
    && (member?.id || pin.trim().length > 0)
    && (!isManager || email.trim().length > 0)
    && (locations.length === 0 || pickedLocationIds.length > 0);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave) return;
    onSave({
      id: member?.id ?? "",
      name: name.trim(),
      email: email.trim() || null,
      role: role.trim(),
      location_ids: savedLocationIds,
      department_ids: departmentIds,
      is_manager: isManager,
      // is_owner is never set by this modal — passed through unchanged
      // purely to satisfy the TeamMember shape; useSaveTeamMember ignores
      // it entirely when building the actual write payload.
      is_owner: member?.is_owner ?? false,
      initials: getInitials(name),
      permissions: isManager
        ? perms
        : (Object.fromEntries(Object.keys(DEFAULT_PERMISSIONS).map(k => [k, false])) as unknown as ManagerPermissions),
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
        <FormField label={isManager ? t("sharedUI.teamMember.emailRequired") : t("sharedUI.teamMember.emailOptional")}>
          <input
            type="email" value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder={t("sharedUI.teamMember.emailPlaceholder")} className={inputCls}
          />
        </FormField>
        {concepts.length > 0 && (
          <FormField label={t("sharedUI.teamMember.concepts")}>
            <FilterMultiSelect
              testId="member-concepts"
              icon={null}
              contentClassName={pickerWidth}
              options={concepts.map(c => ({ id: c.id, label: c.name }))}
              selected={conceptIds}
              onChange={changeConcepts}
              mode="pick"
              allLabel={t("sharedUI.teamMember.allConcepts")}
              noneLabel={t("sharedUI.teamMember.selectConcepts")}
            />
          </FormField>
        )}
        <FormField label={t("sharedUI.teamMember.locations")}>
          <FilterMultiSelect
            testId="member-locations"
            icon={null}
            contentClassName={pickerWidth}
            options={visibleLocations.map(l => ({
              id: l.id,
              label: l.name,
              sublabel: showConceptOnLocations ? conceptName(l.concept_id) : undefined,
            }))}
            selected={locationIds}
            onChange={setLocationIds}
            mode="pick"
            allLabel={allConceptsPicked
              ? t("sharedUI.teamMember.allLocations")
              : t("sharedUI.teamMember.allLocationsInConcepts")}
            noneLabel={t("sharedUI.teamMember.selectLocations")}
            noOptionsLabel={t("sharedUI.teamMember.noLocationsInConcept")}
          />
        </FormField>
        {departmentLocationIds.length > 0 && (
          <FormField label={t("sharedUI.teamMember.department")}>
            {assignedDepartments.length > 0 ? (
              <FilterMultiSelect
                testId="member-departments"
                icon={null}
                contentClassName={pickerWidth}
                options={assignedDepartments.map(d => ({ id: d.id, label: d.name }))}
                selected={departmentIds}
                onChange={setDepartmentIds}
                mode="pick"
                allLabel={t("sharedUI.teamMember.allDepartments")}
                noneLabel={t("sharedUI.teamMember.noDepartmentSelected")}
              />
            ) : (
              !departmentsLoading && (
                <p className="text-xs text-muted-foreground">{t("sharedUI.teamMember.noDepartment")}</p>
              )
            )}
          </FormField>
        )}
        <FormField label={t("sharedUI.teamMember.roleOptional")}>
          <input
            type="text" value={role}
            onChange={e => setRole(e.target.value)}
            placeholder={t("sharedUI.teamMember.rolePlaceholder")} className={inputCls}
          />
        </FormField>
        <FormField label={t("sharedUI.teamMember.kioskPin")}>
          <div className="flex items-center gap-2">
            <input
              type="text"
              inputMode="numeric"
              value={pin}
              onChange={e => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
              placeholder={member?.id ? "••••" : t("sharedUI.staffProfile.fourDigitPin")}
              aria-label={t("sharedUI.teamMember.kioskPin")}
              className="w-24 shrink-0 border border-border rounded-lg px-2 py-1.5 bg-muted text-center font-mono text-sm tracking-widest focus:outline-none focus:ring-1 focus:ring-ring"
              maxLength={4}
            />
            <button
              type="button"
              onClick={() => setPin(generatePin())}
              className="shrink-0 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-muted border border-border hover:bg-muted/60 transition-colors"
            >
              {t("sharedUI.staffProfile.generate")}
            </button>
            <p className="min-w-0 text-xs text-muted-foreground leading-snug">
              {member?.id ? t("sharedUI.teamMember.editPinHint") : t("sharedUI.teamMember.newPinHint")}
            </p>
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
        <div className="border-t border-border pt-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">{t("sharedUI.teamMember.managerRole")}</p>
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{t("sharedUI.teamMember.managerRoleHint")}</p>
          </div>
          <Switch checked={isManager} onCheckedChange={setIsManager} />
        </div>
        {isManager && (
          <div className="space-y-3">
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
            {!member && (
              <p className="text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-2 leading-relaxed">
                {t("sharedUI.teamMember.inviteNotice")}
              </p>
            )}
          </div>
        )}
        <SaveButton disabled={!canSave} label={member ? t("sharedUI.teamMember.saveChanges") : t("sharedUI.teamMember.addTeamMember")} />
      </form>
    </BottomSheet>
  );
}

// ─── ConceptModal ─────────────────────────────────────────────────────────────

export function ConceptModal({
  concept, onClose, onSave,
}: {
  concept: Concept | null; onClose: () => void; onSave: (c: { id?: string; name: string }) => void;
}) {
  const { t } = useTranslation("admin");
  const [name, setName] = useState(concept?.name ?? "");

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSave({ id: concept?.id, name: name.trim() });
    onClose();
  };

  return (
    <BottomSheet onClose={onClose}>
      <ModalHeader title={concept ? t("sharedUI.concept.editTitle") : t("sharedUI.concept.newTitle")} onClose={onClose} />
      <form onSubmit={handleSave} className="space-y-3">
        <FormField label={t("sharedUI.concept.nameRequired")}>
          <input
            autoFocus type="text" value={name}
            onChange={e => setName(e.target.value)}
            placeholder={t("sharedUI.concept.namePlaceholder")} className={inputCls}
          />
        </FormField>
        <SaveButton disabled={!name.trim()} label={concept ? t("sharedUI.concept.saveChanges") : t("sharedUI.concept.addConcept")} />
      </form>
    </BottomSheet>
  );
}

// ─── LocationModal ────────────────────────────────────────────────────────────

export function LocationModal({
  location, conceptId, onClose, onSave,
}: {
  location: Location | null; conceptId?: string | null; onClose: () => void; onSave: (loc: Location) => void;
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
      concept_id: location?.concept_id ?? conceptId ?? null,
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
  requireDeleteText?: boolean;
  extra?: React.ReactNode;
} | null;
