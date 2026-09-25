// ─── ConceptsTab ──────────────────────────────────────────────────────────────
// Company > Concept > Location browsing + management (#747). Replaces the old
// MyLocationTab. Onboarding CTA when there are no concepts yet, a concept
// picker when there's more than one, location cards within the selected
// concept, and a location detail view: address, and the location's slice of
// departments, kiosks and team members — managed right here with the same
// actions as their own Admin tabs (Owner-only, like those tabs).

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Building2, UtensilsCrossed, MapPin, Mail, Pencil, Trash2, Plus,
  ChevronDown, MoreVertical, UserMinus, Layers, MinusCircle,
} from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import {
  type Location, type Concept, type TeamMember, type ManagerPermissions,
  type DepartmentAssignment, getInitials,
} from "@/lib/admin-repository";
import { type ChecklistItem } from "@/hooks/useChecklists";
import { useCompanyDepartments, useDepartments, useSaveDepartment } from "@/hooks/useDepartments";
import { clearKioskDeviceState, touchKioskDevice } from "@/lib/kiosk-guard";
import { useKioskDevices } from "@/hooks/useKioskDevices";
import { AddLink, ConfirmModal, useMenu, menuPanelCls, menuItemCls, type ConfirmState } from "./SharedUI";
import { KioskDeviceRow, AddKioskModal, KioskCodeModal } from "./KiosksTab";
import {
  departmentUnassignImpact, removeLocationFromAssignments,
} from "./departments";

export interface ConceptsTabProps {
  concepts: Concept[];
  locations: Location[];
  /** Includes plan-inactive locations — department assignment edits must keep covering them. */
  allLocations?: Location[];
  teamMembers: TeamMember[];
  checklists: ChecklistItem[];
  currentConceptId: string;
  setCurrentConceptId: (id: string) => void;
  currentLocationId: string;
  setCurrentLocationId: (id: string) => void;
  /** Concept-level management (add/edit/delete concept) is owner-only — concepts are a new, structural concern with no prior permission to inherit. */
  isOwner: boolean;
  /** null = Owner (full access). Otherwise gates location/department edits the same way the old MyLocationTab did. */
  permissions: ManagerPermissions | null;
  onAddConcept: () => void;
  onEditConcept: (c: Concept) => void;
  onDeleteConcept: (id: string) => void;
  onAddLocation: () => void;
  onEditLocation: (loc: Location) => void;
  onDeleteLocation: (id: string) => void;
  /** Opens Admin -> Devices focused on this kiosk. */
  onManageKiosk: (deviceId: string) => void;
  onAddTeamMember?: (locationId: string) => void;
  onEditTeamMember?: (m: TeamMember) => void;
  onRemoveTeamMember?: (m: TeamMember, locationId: string) => void;
}

export function ConceptsTab({
  concepts, locations, allLocations = locations, teamMembers, checklists,
  currentConceptId, setCurrentConceptId, currentLocationId, setCurrentLocationId,
  isOwner, permissions, onAddConcept, onEditConcept, onDeleteConcept,
  onAddLocation, onEditLocation, onDeleteLocation, onManageKiosk,
  onAddTeamMember, onEditTeamMember, onRemoveTeamMember,
}: ConceptsTabProps) {
  const { t } = useTranslation("admin");

  // Matches the old MyLocationTab/AccountTab split exactly: editing a
  // location's own details (address, contact info) is permission-gated the
  // same as before, but adding/deleting locations and managing departments
  // were only ever reachable from the Owner-only "All Locations"/Users tabs
  // — so those stay Owner-only here too, not newly opened up to managers.
  const canEditLocation = !permissions || permissions.edit_location_details;

  // Active (non-revoked) kiosk devices; the selected location's are listed
  // in its Kiosks card.
  const { data: kioskDevices = [] } = useKioskDevices();

  // Self-heals stale local kiosk state (#824): this browser may have been
  // marked a kiosk device, then deactivated remotely from Admin -> Kiosks on
  // a *different* browser in the meantime — without this, ProtectedRoute
  // would keep locking it to /kiosk. One check on mount is enough; Kiosk.tsx's
  // own 60s heartbeat is what keeps an actual running kiosk's local state honest.
  useEffect(() => {
    if (!localStorage.getItem("kiosk_location_id")) return;
    let cancelled = false;
    void touchKioskDevice().then(stillActive => {
      if (cancelled || stillActive) return;
      clearKioskDeviceState();
    });
    return () => { cancelled = true; };
  }, []);

  const currentConcept = concepts.find(c => c.id === currentConceptId) ?? concepts[0];
  const conceptLocations = locations.filter(l => l.concept_id === currentConcept?.id);
  const currentLocation = conceptLocations.find(l => l.id === currentLocationId) ?? conceptLocations[0] ?? null;

  // Departments are company-wide and managed in Admin → Departments (#838);
  // here they're just listed for the selected location.
  const { data: departments = [] } = useDepartments(currentLocation?.id);
  const { data: companyDepartments = [] } = useCompanyDepartments();
  const saveDepartmentMut = useSaveDepartment();
  const [confirmModal, setConfirmModal] = useState<ConfirmState>(null);
  // Kiosks (#861): "Add kiosk" creates one with a pairing code, then its
  // code is shown straight away.
  const [addingKiosk, setAddingKiosk] = useState(false);
  const [codeDeviceId, setCodeDeviceId] = useState<string | null>(null);
  const [collapsed, toggleSection] = useCollapsedSections();

  // ── No concepts yet → onboarding empty state ──────────────────────────────
  if (concepts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4 text-center space-y-5">
        <div className="w-16 h-16 rounded-2xl bg-sage/10 flex items-center justify-center">
          <Building2 size={28} className="text-sage" />
        </div>
        <div className="space-y-2">
          <h2 className="font-display text-xl text-foreground">{t("conceptsTab.onboarding.conceptHeading")}</h2>
          <p className="text-sm text-muted-foreground max-w-xs leading-relaxed">
            {t("conceptsTab.onboarding.conceptBody")}
          </p>
        </div>
        <button
          onClick={onAddConcept}
          className="flex items-center gap-2 px-5 py-3 rounded-xl bg-sage text-primary-foreground text-sm font-semibold hover:bg-sage-deep transition-colors"
        >
          <Plus size={15} />
          {t("conceptsTab.onboarding.addConceptCta")}
        </button>
      </div>
    );
  }

  // ── Concept exists but has no locations yet ────────────────────────────────
  if (conceptLocations.length === 0) {
    return (
      <div className="space-y-4">
        {isOwner && (
          <ConceptTiles
            concepts={concepts}
            currentConceptId={currentConcept?.id ?? ""}
            onChange={setCurrentConceptId}
            onAddConcept={onAddConcept}
            onEditConcept={() => onEditConcept(currentConcept!)}
            onDeleteConcept={() => onDeleteConcept(currentConcept!.id)}
          />
        )}
        <div className="flex flex-col items-center justify-center py-16 px-4 text-center space-y-5">
          <div className="w-16 h-16 rounded-2xl bg-sage/10 flex items-center justify-center">
            <UtensilsCrossed size={28} className="text-sage" />
          </div>
          <div className="space-y-2">
            <h2 className="font-display text-xl text-foreground">{t("conceptsTab.onboarding.locationHeading", { concept: currentConcept?.name })}</h2>
            <p className="text-sm text-muted-foreground max-w-xs leading-relaxed">
              {t("conceptsTab.onboarding.locationBody")}
            </p>
          </div>
          <button
            onClick={onAddLocation}
            className="flex items-center gap-2 px-5 py-3 rounded-xl bg-sage text-primary-foreground text-sm font-semibold hover:bg-sage-deep transition-colors"
          >
            <Plus size={15} />
            {t("conceptsTab.onboarding.addLocationCta")}
          </button>
        </div>
      </div>
    );
  }

  if (!currentLocation) return null;

  const locationTeamMembers = teamMembers.filter(m => m.location_ids.includes(currentLocation.id));
  const locationKiosks = kioskDevices.filter(d => d.location_id === currentLocation.id);

  // Departments are company-wide and assigned in the Departments tab;
  // removing one here takes just this location out of its assignments.
  const conceptIds = concepts.map(c => c.id);

  const saveDepartment = (dep: { id: string; name: string; assignments: DepartmentAssignment[] }) => {
    saveDepartmentMut.mutate(dep, {
      onSuccess: () => toast.success(t("departmentsTab.saved")),
      onError: (err: Error) => toast.error(t("departmentsTab.saveFailed", { error: err.message })),
    });
  };

  const confirmRemoveDepartment = (depId: string) => {
    const dep = companyDepartments.find(d => d.id === depId);
    if (!dep) return;
    const assignments = removeLocationFromAssignments(dep.assignments, currentLocation, allLocations, conceptIds);
    const impact = departmentUnassignImpact(dep.id, assignments, allLocations, teamMembers, checklists);
    setConfirmModal({
      title: t("conceptsTab.removeDepartmentTitle"),
      message: (
        <>
          {t("conceptsTab.removeDepartmentMessage", { name: dep.name, location: currentLocation.name })}
          {impact.staff + impact.checklists > 0 && (
            <> {t("departmentsTab.impact", {
              staff: t("departmentsTab.staffCount", { count: impact.staff }),
              checklists: t("departmentsTab.checklistCount", { count: impact.checklists }),
            })} {t("departmentsTab.unassignBody")}</>
          )}
        </>
      ),
      actionLabel: t("confirm.remove"),
      onConfirm: () => {
        setConfirmModal(null);
        saveDepartment({ id: dep.id, name: dep.name, assignments });
      },
    });
  };

  return (
    <div className="space-y-4">
      {isOwner && (
        <ConceptTiles
          concepts={concepts}
          currentConceptId={currentConcept?.id ?? ""}
          onChange={id => { setCurrentConceptId(id); setCurrentLocationId(""); }}
          onAddConcept={onAddConcept}
          onEditConcept={() => onEditConcept(currentConcept!)}
          onDeleteConcept={() => onDeleteConcept(currentConcept!.id)}
        />
      )}

      <LocationPicker
        locations={conceptLocations}
        currentLocation={currentLocation}
        onChange={setCurrentLocationId}
        onAddLocation={isOwner ? onAddLocation : undefined}
        onEditLocation={canEditLocation ? () => onEditLocation(currentLocation) : undefined}
        onDeleteLocation={isOwner ? () => onDeleteLocation(currentLocation.id) : undefined}
      />

      {/* Departments — listed like Team members below */}
      <SectionCard
        title={t("conceptsTab.departments")}
        open={!collapsed.has("departments")}
        onToggle={() => toggleSection("departments")}
      >
        <div className="px-4 pb-4">
          {departments.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("conceptsTab.noDepartments")}</p>
          ) : (
            <div className="space-y-1">
              {departments.map(dep => {
                const staffHere = locationTeamMembers.filter(m => m.department_ids.includes(dep.id)).length;
                return (
                  <div key={dep.id} className="flex items-center gap-2 py-0.5">
                    <div className="w-7 h-7 rounded-full bg-sage-light flex items-center justify-center text-sage-deep shrink-0">
                      <Layers size={13} />
                    </div>
                    <p className="text-sm text-foreground flex-1 min-w-0 truncate">{dep.name}</p>
                    {staffHere > 0 && (
                      <span className="text-xs text-muted-foreground shrink-0">
                        {t("departmentsTab.staffCount", { count: staffHere })}
                      </span>
                    )}
                    {isOwner && (
                      <button
                        onClick={() => confirmRemoveDepartment(dep.id)}
                        aria-label={t("conceptsTab.removeDepartmentAria", { name: dep.name })}
                        title={t("conceptsTab.removeFromLocation")}
                        className="p-1.5 rounded-lg hover:bg-muted transition-colors shrink-0"
                      >
                        <MinusCircle size={14} className="text-status-error" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </SectionCard>

      {/* Devices (kiosks) */}
      <SectionCard
        title={t("conceptsTab.kiosks")}
        open={!collapsed.has("devices")}
        onToggle={() => toggleSection("devices")}
        actions={isOwner && (
          <AddLink onClick={() => setAddingKiosk(true)} ariaLabel={t("kiosksTab.addKiosk")} />
        )}
      >
        {locationKiosks.length === 0 ? (
          <p className="px-4 pb-4 text-sm text-muted-foreground">{t("conceptsTab.noKiosks")}</p>
        ) : (
          <div className="divide-y divide-border border-t border-border">
            {locationKiosks.map(device => (
              <KioskDeviceRow
                key={device.id}
                device={device}
                onShowCode={isOwner ? () => setCodeDeviceId(device.id) : undefined}
                onManage={isOwner ? () => onManageKiosk(device.id) : undefined}
              />
            ))}
          </div>
        )}
      </SectionCard>

      {/* Team members */}
      <SectionCard
        title={t("conceptsTab.teamMembers")}
        open={!collapsed.has("team")}
        onToggle={() => toggleSection("team")}
        actions={isOwner && onAddTeamMember && (
          <AddLink onClick={() => onAddTeamMember(currentLocation.id)} ariaLabel={t("accountTab.addTeamMember")} />
        )}
      >
        <div className="px-4 pb-4">
          {locationTeamMembers.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("conceptsTab.noTeamMembers")}</p>
          ) : (
            <div className="space-y-1">
              {locationTeamMembers.map(m => (
                <div key={m.id} className="flex items-center gap-2 py-0.5">
                  <div className="w-7 h-7 rounded-full bg-sage-light flex items-center justify-center text-[10px] font-semibold text-sage-deep shrink-0">
                    {getInitials(m.name)}
                  </div>
                  <p className="text-sm text-foreground flex-1 min-w-0 truncate">{m.name}</p>
                  {(m.is_owner || m.role) && (
                    <span className="text-xs text-muted-foreground shrink-0 truncate max-w-[40%]">
                      {m.is_owner ? t("roles.Owner") : m.role}
                    </span>
                  )}
                  {isOwner && onEditTeamMember && (
                    <button
                      onClick={() => onEditTeamMember(m)}
                      aria-label={t("accountTab.editAria", { name: m.name })}
                      className="p-1.5 rounded-lg hover:bg-muted transition-colors shrink-0"
                    >
                      <Pencil size={14} className="text-muted-foreground" />
                    </button>
                  )}
                  {isOwner && onRemoveTeamMember && (
                    <button
                      onClick={() => onRemoveTeamMember(m, currentLocation.id)}
                      aria-label={t("conceptsTab.removeTeamMemberAria", { name: m.name, location: currentLocation.name })}
                      title={t("conceptsTab.removeFromLocation")}
                      className="p-1.5 rounded-lg hover:bg-muted transition-colors shrink-0"
                    >
                      <UserMinus size={14} className="text-status-error" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </SectionCard>

      {addingKiosk && (
        <AddKioskModal
          locationId={currentLocation.id}
          locationName={currentLocation.name}
          onClose={() => setAddingKiosk(false)}
          onCreated={deviceId => { setAddingKiosk(false); setCodeDeviceId(deviceId); }}
        />
      )}

      {codeDeviceId && (
        <KioskCodeModal deviceId={codeDeviceId} locationName={currentLocation.name} onClose={() => setCodeDeviceId(null)} />
      )}

      {confirmModal && (
        <ConfirmModal {...confirmModal} onClose={() => setConfirmModal(null)} />
      )}
    </div>
  );
}

// ─── SectionCard ──────────────────────────────────────────────────────────────
// Collapsible card for the location's Departments / Devices / Team members.
// Which ones are collapsed is remembered per browser.

const COLLAPSED_KEY = "olia_concepts_collapsed_sections";

function useCollapsedSections(): [Set<string>, (key: string) => void] {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem(COLLAPSED_KEY) ?? "[]"));
    } catch {
      return new Set();
    }
  });
  const toggle = (key: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      try { localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...next])); } catch { /* storage unavailable */ }
      return next;
    });
  };
  return [collapsed, toggle];
}

function SectionCard({
  title, open, onToggle, actions, children,
}: {
  title: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="card-surface overflow-hidden">
      <div className="flex items-center justify-between gap-2 flex-wrap p-4">
        <button onClick={onToggle} aria-expanded={open} className="flex items-center gap-1.5 text-left min-w-0">
          <ChevronDown size={15} className={cn("text-muted-foreground shrink-0 transition-transform", !open && "-rotate-90")} />
          <span className="section-label">{title}</span>
        </button>
        {actions}
      </div>
      {open && children}
    </div>
  );
}

// ─── ConceptTiles ─────────────────────────────────────────────────────────────
// Small rounded tiles with the name underneath; the selected one carries the
// edit/delete menu.

function ConceptTiles({
  concepts, currentConceptId, onChange, onAddConcept, onEditConcept, onDeleteConcept,
}: {
  concepts: Concept[];
  currentConceptId: string;
  onChange: (id: string) => void;
  onAddConcept: () => void;
  onEditConcept: () => void;
  onDeleteConcept: () => void;
}) {
  const { t } = useTranslation("admin");
  const menu = useMenu();

  return (
    <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1 pt-1">
      {concepts.map(c => {
        const selected = c.id === currentConceptId;
        return (
          <div key={c.id} className="relative shrink-0 w-20">
            <button
              onClick={() => onChange(c.id)}
              aria-pressed={selected}
              className="group flex w-20 flex-col items-center gap-1.5"
            >
              <span className={cn(
                "flex h-20 w-20 items-center justify-center rounded-[22px] font-display text-2xl transition-all",
                selected
                  ? "bg-sage text-primary-foreground shadow-md"
                  : "bg-muted text-muted-foreground group-hover:bg-muted/70",
              )}>
                {getInitials(c.name)}
              </span>
              <span className={cn(
                "w-full truncate text-center text-xs",
                selected ? "font-semibold text-foreground" : "text-muted-foreground",
              )}>
                {c.name}
              </span>
            </button>
            {selected && (
              <div ref={menu.ref} className="absolute right-1 top-1">
                <button
                  onClick={() => menu.setOpen(v => !v)}
                  aria-label={t("conceptsTab.conceptOptionsAria")}
                  className="flex h-6 w-6 items-center justify-center rounded-full bg-card/90 text-foreground shadow-sm hover:bg-card"
                >
                  <MoreVertical size={13} />
                </button>
                {menu.open && (
                  <div className={cn(menuPanelCls, "left-0 right-auto min-w-[180px]")}>
                    <button onClick={() => { menu.setOpen(false); onEditConcept(); }} className={cn(menuItemCls, "text-foreground")}>
                      <Pencil size={14} /> {t("conceptsTab.editConcept")}
                    </button>
                    {concepts.length > 1 && (
                      <button onClick={() => { menu.setOpen(false); onDeleteConcept(); }} className={cn(menuItemCls, "text-status-error")}>
                        <Trash2 size={14} /> {t("conceptsTab.deleteConcept")}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
      <button onClick={onAddConcept} className="group flex w-20 shrink-0 flex-col items-center gap-1.5">
        <span className="flex h-20 w-20 items-center justify-center rounded-[22px] border border-dashed border-border text-muted-foreground transition-colors group-hover:border-sage/40 group-hover:text-sage">
          <Plus size={20} />
        </span>
        <span className="w-full truncate text-center text-xs text-muted-foreground">{t("conceptsTab.addConcept")}</span>
      </button>
    </div>
  );
}

// ─── LocationPicker ───────────────────────────────────────────────────────────
// Dropdown of the concept's locations. Address/contact live in the 3-dot menu
// with edit/delete, since they're rarely needed at a glance.

function LocationPicker({
  locations, currentLocation, onChange, onAddLocation, onEditLocation, onDeleteLocation,
}: {
  locations: Location[];
  currentLocation: Location;
  onChange: (id: string) => void;
  onAddLocation?: () => void;
  onEditLocation?: () => void;
  onDeleteLocation?: () => void;
}) {
  const { t } = useTranslation("admin");
  const menu = useMenu();

  return (
    <div className="flex gap-2">
      <div className="relative flex-1 min-w-0">
        <MapPin size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <select
          value={currentLocation.id}
          onChange={e => onChange(e.target.value)}
          aria-label={t("conceptsTab.locationLabel")}
          className="w-full border border-border rounded-xl pl-10 pr-10 py-3 text-sm bg-muted appearance-none focus:outline-none focus:ring-1 focus:ring-ring"
        >
          {locations.map(l => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
        <ChevronDown size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
      </div>
      {onAddLocation && (
        <button
          onClick={onAddLocation}
          aria-label={t("conceptsTab.addLocation")}
          className="shrink-0 px-3 py-3 rounded-xl border border-border text-xs font-medium text-sage hover:bg-sage/5 transition-colors flex items-center gap-1"
        >
          <Plus size={13} /> <span className="hidden sm:inline">{t("conceptsTab.addLocation")}</span>
        </button>
      )}
      <div ref={menu.ref} className="relative shrink-0">
        <button
          onClick={() => menu.setOpen(v => !v)}
          aria-label={t("conceptsTab.locationOptionsAria")}
          className="h-full px-2.5 rounded-xl border border-border text-muted-foreground hover:bg-muted transition-colors flex items-center"
        >
          <MoreVertical size={16} />
        </button>
        {menu.open && (
          <div className={cn(menuPanelCls, "min-w-[240px] max-w-[300px]")}>
            <div className="px-4 py-2.5 space-y-1.5">
              <p className="section-label">{t("conceptsTab.address")}</p>
              {currentLocation.address ? (
                <div className="flex items-start gap-2">
                  <MapPin size={13} className="text-muted-foreground mt-0.5 shrink-0" />
                  <p className="text-sm text-foreground">{currentLocation.address}</p>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">{t("conceptsTab.noAddressYet")}</p>
              )}
              {currentLocation.contact_email && (
                <div className="flex items-start gap-2">
                  <Mail size={13} className="text-muted-foreground mt-0.5 shrink-0" />
                  <p className="text-sm text-foreground break-all">{currentLocation.contact_email}</p>
                </div>
              )}
            </div>
            {(onEditLocation || onDeleteLocation) && <div className="my-1 border-t border-border" />}
            {onEditLocation && (
              <button onClick={() => { menu.setOpen(false); onEditLocation(); }} className={cn(menuItemCls, "text-foreground")}>
                <Pencil size={14} /> {t("conceptsTab.editLocation")}
              </button>
            )}
            {onDeleteLocation && (
              <button onClick={() => { menu.setOpen(false); onDeleteLocation(); }} className={cn(menuItemCls, "text-status-error")}>
                <Trash2 size={14} /> {t("conceptsTab.deleteLocation")}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

