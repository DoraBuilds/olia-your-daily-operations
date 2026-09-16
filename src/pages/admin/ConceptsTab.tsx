// ─── ConceptsTab ──────────────────────────────────────────────────────────────
// Company > Concept > Location browsing + management (#747). Replaces the old
// MyLocationTab. Onboarding CTA when there are no concepts yet, a concept
// picker when there's more than one, location cards within the selected
// concept, and a location detail view (departments, address, kiosk launch,
// filtered team members, filtered checklists).

import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Building2, UtensilsCrossed, MapPin, Mail, Pencil, Trash2, Plus,
  ChevronDown, Tablet, Check, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  type Location, type Concept, type TeamMember, type LocationDepartment, type ManagerPermissions,
  getInitials,
} from "@/lib/admin-repository";
import { type ChecklistItem } from "@/hooks/useChecklists";
import { useDepartments, useSaveDepartment, useDeleteDepartment } from "@/hooks/useDepartments";
import { clearKioskDeviceState } from "@/lib/kiosk-guard";
import { clearKioskAdminSession } from "@/lib/kiosk-admin-session";

export interface ConceptsTabProps {
  concepts: Concept[];
  locations: Location[];
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
  onLaunchKiosk: () => void;
}

export function ConceptsTab({
  concepts, locations, teamMembers, checklists,
  currentConceptId, setCurrentConceptId, currentLocationId, setCurrentLocationId,
  isOwner, permissions, onAddConcept, onEditConcept, onDeleteConcept,
  onAddLocation, onEditLocation, onDeleteLocation, onLaunchKiosk,
}: ConceptsTabProps) {
  const { t } = useTranslation("admin");

  // Matches the old MyLocationTab/AccountTab split exactly: editing a
  // location's own details (address, contact info) is permission-gated the
  // same as before, but adding/deleting locations and managing departments
  // were only ever reachable from the Owner-only "All Locations"/Users tabs
  // — so those stay Owner-only here too, not newly opened up to managers.
  const canEditLocation = !permissions || permissions.edit_location_details;

  const [kioskDeviceActive, setKioskDeviceActive] = useState(
    () => Boolean(localStorage.getItem("kiosk_location_id")),
  );
  const [kioskDeviceName] = useState(() => localStorage.getItem("kiosk_location_name") ?? "");
  const [confirmingKioskExit, setConfirmingKioskExit] = useState(false);

  const currentConcept = concepts.find(c => c.id === currentConceptId) ?? concepts[0];
  const conceptLocations = locations.filter(l => l.concept_id === currentConcept?.id);
  const currentLocation = conceptLocations.find(l => l.id === currentLocationId) ?? conceptLocations[0] ?? null;

  const saveDepartment = useSaveDepartment();
  const deleteDepartment = useDeleteDepartment();
  const { data: departments = [] } = useDepartments(currentLocation?.id);
  const [renamingDepartment, setRenamingDepartment] = useState<{ id: string; value: string } | null>(null);
  const [newDepartmentName, setNewDepartmentName] = useState("");
  const [showAddDepartment, setShowAddDepartment] = useState(false);

  const departmentInUse = (dep: LocationDepartment) =>
    teamMembers.some(m => m.department_id === dep.id);

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
          <ConceptPicker
            concepts={concepts}
            currentConceptId={currentConcept?.id ?? ""}
            onChange={setCurrentConceptId}
            onAddConcept={onAddConcept}
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
  const locationChecklists = checklists.filter(c => c.location_id === currentLocation.id);

  const addDepartment = () => {
    const trimmed = newDepartmentName.trim();
    if (!trimmed || departments.some(d => d.name.toLowerCase() === trimmed.toLowerCase())) return;
    saveDepartment.mutate({ location_id: currentLocation.id, name: trimmed });
    setNewDepartmentName("");
    setShowAddDepartment(false);
  };

  const renameDepartment = (id: string, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed || departments.some(d => d.id !== id && d.name.toLowerCase() === trimmed.toLowerCase())) return;
    saveDepartment.mutate({ id, location_id: currentLocation.id, name: trimmed });
    setRenamingDepartment(null);
  };

  return (
    <div className="space-y-4">
      {kioskDeviceActive && (
        <div className="rounded-[18px] border border-status-warn/40 bg-status-warn/10 px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <Tablet size={15} className="text-status-warn shrink-0" />
            <p className="text-xs text-status-warn font-medium">
              {t("myLocationTab.kioskDeviceActive", {
                name: kioskDeviceName || t("myLocationTab.kioskDeviceActiveFallbackName"),
              })}
            </p>
          </div>
          {confirmingKioskExit ? (
            <div className="flex items-center gap-3 shrink-0">
              <span className="text-xs text-muted-foreground">{t("myLocationTab.exitKioskConfirm")}</span>
              <button onClick={() => setConfirmingKioskExit(false)} className="text-xs font-medium text-muted-foreground hover:text-foreground">
                {t("sharedUI.cancel")}
              </button>
              <button
                onClick={() => {
                  clearKioskDeviceState();
                  clearKioskAdminSession();
                  setKioskDeviceActive(false);
                  setConfirmingKioskExit(false);
                }}
                className="text-xs font-semibold text-status-error hover:underline"
              >
                {t("myLocationTab.exitKioskConfirmCta")}
              </button>
            </div>
          ) : (
            <button onClick={() => setConfirmingKioskExit(true)} className="text-xs font-semibold text-status-warn hover:underline shrink-0">
              {t("myLocationTab.exitKiosk")}
            </button>
          )}
        </div>
      )}

      {isOwner && (
        <ConceptPicker
          concepts={concepts}
          currentConceptId={currentConcept?.id ?? ""}
          onChange={id => { setCurrentConceptId(id); setCurrentLocationId(""); }}
          onAddConcept={onAddConcept}
        />
      )}

      {isOwner && (
        <div className="flex items-center justify-end gap-3">
          <button onClick={() => onEditConcept(currentConcept!)} className="flex items-center gap-1 text-xs text-sage font-medium hover:underline">
            <Pencil size={12} /> {t("conceptsTab.editConcept")}
          </button>
          {conceptLocations.length === 0 && (
            <button onClick={() => onDeleteConcept(currentConcept!.id)} className="flex items-center gap-1 text-xs text-status-error font-medium hover:underline">
              <Trash2 size={12} /> {t("conceptsTab.deleteConcept")}
            </button>
          )}
        </div>
      )}

      {/* Location cards */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {conceptLocations.map(loc => (
          <button
            key={loc.id}
            onClick={() => setCurrentLocationId(loc.id)}
            className={cn(
              "flex flex-col items-center gap-2 rounded-2xl border px-3 py-4 text-center transition-colors",
              currentLocation.id === loc.id
                ? "border-sage bg-sage/5"
                : "border-border bg-card hover:border-sage/40",
            )}
          >
            <div className={cn(
              "w-10 h-10 rounded-full flex items-center justify-center",
              currentLocation.id === loc.id ? "bg-sage text-primary-foreground" : "bg-muted text-muted-foreground",
            )}>
              <UtensilsCrossed size={18} />
            </div>
            <p className="text-xs font-medium text-foreground truncate w-full">{loc.name}</p>
          </button>
        ))}
        {isOwner && (
          <button
            onClick={onAddLocation}
            className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border px-3 py-4 text-center text-muted-foreground hover:border-sage/40 hover:text-sage transition-colors"
          >
            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
              <Plus size={18} />
            </div>
            <p className="text-xs font-medium">{t("conceptsTab.addLocation")}</p>
          </button>
        )}
      </div>

      {/* Departments + Address/Kiosk */}
      <div className="flex gap-3 items-stretch flex-wrap sm:flex-nowrap">
        {/* Departments */}
        <div className="card-surface p-4 flex-1 min-w-[200px] space-y-3">
          <div className="flex items-center justify-between">
            <p className="section-label">{t("conceptsTab.departments")}</p>
            {isOwner && (
              <button onClick={() => setShowAddDepartment(true)} className="flex items-center gap-1 text-xs text-sage font-medium hover:underline">
                <Plus size={12} /> {t("myLocationTab.add")}
              </button>
            )}
          </div>
          <div className="space-y-1">
            {departments.length === 0 && !showAddDepartment && (
              <p className="text-xs text-muted-foreground">{t("conceptsTab.noDepartments")}</p>
            )}
            {departments.map(dep => {
              const isRenaming = renamingDepartment?.id === dep.id;
              const inUse = departmentInUse(dep);
              return (
                <div key={dep.id} className="flex items-center gap-2 py-1">
                  {isRenaming ? (
                    <>
                      <input
                        autoFocus type="text" value={renamingDepartment.value}
                        onChange={e => setRenamingDepartment({ id: dep.id, value: e.target.value })}
                        onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); renameDepartment(dep.id, renamingDepartment.value); } }}
                        className="flex-1 border border-border rounded-lg px-2 py-1 text-xs bg-muted focus:outline-none focus:ring-1 focus:ring-ring"
                      />
                      <button onClick={() => renameDepartment(dep.id, renamingDepartment.value)} className="p-1 rounded hover:bg-muted"><Check size={12} className="text-sage" /></button>
                      <button onClick={() => setRenamingDepartment(null)} className="p-1 rounded hover:bg-muted"><X size={12} className="text-muted-foreground" /></button>
                    </>
                  ) : (
                    <>
                      <p className="flex-1 text-sm text-foreground truncate">{dep.name}</p>
                      {isOwner && (
                        <>
                          <button onClick={() => setRenamingDepartment({ id: dep.id, value: dep.name })} className="p-1 rounded hover:bg-muted"><Pencil size={12} className="text-muted-foreground" /></button>
                          <button
                            onClick={() => deleteDepartment.mutate({ id: dep.id, location_id: currentLocation.id })}
                            disabled={inUse}
                            title={inUse ? t("accountTab.departmentInUse") : t("accountTab.deleteDepartment")}
                            className={cn("p-1 rounded", inUse ? "opacity-30 cursor-not-allowed" : "hover:bg-muted")}
                          >
                            <Trash2 size={12} className="text-status-error" />
                          </button>
                        </>
                      )}
                    </>
                  )}
                </div>
              );
            })}
            {showAddDepartment && (
              <div className="flex items-center gap-2 pt-1">
                <input
                  autoFocus type="text" value={newDepartmentName}
                  onChange={e => setNewDepartmentName(e.target.value)}
                  placeholder={t("accountTab.departmentNamePlaceholder")}
                  onKeyDown={e => {
                    if (e.key === "Enter") { e.preventDefault(); addDepartment(); }
                    if (e.key === "Escape") { setShowAddDepartment(false); setNewDepartmentName(""); }
                  }}
                  className="flex-1 border border-border rounded-lg px-2 py-1.5 text-xs bg-muted focus:outline-none focus:ring-1 focus:ring-ring"
                />
                <button onClick={addDepartment} disabled={!newDepartmentName.trim()} className="p-1.5 rounded-lg bg-sage text-white disabled:opacity-40"><Check size={12} /></button>
                <button onClick={() => { setShowAddDepartment(false); setNewDepartmentName(""); }} className="p-1.5 rounded-lg hover:bg-muted"><X size={12} className="text-muted-foreground" /></button>
              </div>
            )}
          </div>
        </div>

        {/* Address + Kiosk */}
        <div className="flex flex-col gap-2 w-full sm:w-[35%] shrink-0">
          <div className="card-surface p-4 space-y-2 flex-1">
            <div className="flex items-center justify-between">
              <p className="section-label">{t("conceptsTab.address")}</p>
              {canEditLocation && (
                <button onClick={() => onEditLocation(currentLocation)} className="flex items-center gap-1 text-xs text-sage font-medium hover:underline">
                  <Pencil size={12} /> {t("myLocationTab.edit")}
                </button>
              )}
            </div>
            {currentLocation.address ? (
              <div className="flex items-start gap-2">
                <MapPin size={13} className="text-muted-foreground mt-0.5 shrink-0" />
                <p className="text-sm text-foreground">{currentLocation.address}</p>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">{t("conceptsTab.noAddress")}</p>
            )}
            {currentLocation.contact_email ? (
              <div className="flex items-start gap-2">
                <Mail size={13} className="text-muted-foreground mt-0.5 shrink-0" />
                <p className="text-sm text-foreground">{currentLocation.contact_email}</p>
              </div>
            ) : null}
          </div>
          <button
            onClick={onLaunchKiosk}
            className="w-full rounded-2xl text-xs font-bold tracking-wider uppercase bg-sage text-white hover:bg-sage-deep transition-colors flex flex-row items-center justify-center gap-2 shadow-md px-2 py-3"
          >
            <span>{t("myLocationTab.kiosk")}</span>
            <Tablet size={14} />
          </button>
        </div>
      </div>

      {/* Team members (filtered, read-only — full management lives in the Users tab) */}
      <div className="card-surface p-4">
        <p className="section-label mb-3">
          {locationTeamMembers.length > 0
            ? t("conceptsTab.teamMembersWithCount", { count: locationTeamMembers.length })
            : t("conceptsTab.teamMembers")}
        </p>
        {locationTeamMembers.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("conceptsTab.noTeamMembers")}</p>
        ) : (
          <div className="space-y-2">
            {locationTeamMembers.map(m => (
              <div key={m.id} className="flex items-center gap-2 py-0.5">
                <div className="w-7 h-7 rounded-full bg-sage-light flex items-center justify-center text-[10px] font-semibold text-sage-deep shrink-0">
                  {getInitials(m.name)}
                </div>
                <p className="text-sm text-foreground flex-1 min-w-0 truncate">{m.name}</p>
                {m.role && <span className="text-xs text-muted-foreground shrink-0">{m.role}</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Assigned checklists */}
      <div className="card-surface p-4">
        <p className="section-label mb-3">
          {locationChecklists.length > 0
            ? t("myLocationTab.assignedChecklistsWithCount", { count: locationChecklists.length })
            : t("myLocationTab.assignedChecklists")}
        </p>
        {locationChecklists.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("myLocationTab.noChecklistsAssigned")}</p>
        ) : (
          <div className="space-y-2">
            {locationChecklists.map((c, i) => (
              <div key={c.id} className="flex items-center gap-2 py-0.5">
                <span className="text-xs font-medium text-muted-foreground w-5 shrink-0">{i + 1}.</span>
                <p className="text-sm text-foreground">{c.title}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {isOwner && (
        <div className="flex justify-end">
          <button onClick={() => onDeleteLocation(currentLocation.id)} className="flex items-center gap-1 text-xs text-status-error font-medium hover:underline">
            <Trash2 size={12} /> {t("conceptsTab.deleteLocation")}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── ConceptPicker ────────────────────────────────────────────────────────────

function ConceptPicker({
  concepts, currentConceptId, onChange, onAddConcept,
}: {
  concepts: Concept[]; currentConceptId: string; onChange: (id: string) => void; onAddConcept: () => void;
}) {
  const { t } = useTranslation("admin");
  return (
    <div>
      <p className="section-label mb-2">{t("conceptsTab.conceptLabel")}</p>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <select
            value={currentConceptId}
            onChange={e => onChange(e.target.value)}
            className="w-full border border-border rounded-xl px-4 py-3 pr-10 text-sm bg-muted appearance-none focus:outline-none focus:ring-1 focus:ring-ring"
          >
            {concepts.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <ChevronDown size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        </div>
        <button
          onClick={onAddConcept}
          className="shrink-0 px-3 py-3 rounded-xl border border-border text-xs font-medium text-sage hover:bg-sage/5 transition-colors flex items-center gap-1"
        >
          <Plus size={13} /> {t("conceptsTab.addConcept")}
        </button>
      </div>
    </div>
  );
}
