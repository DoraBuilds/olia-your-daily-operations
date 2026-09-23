// ─── DepartmentsTab ───────────────────────────────────────────────────────────
// Company-wide departments (#838). A department is created once, then assigned
// to the whole company, whole concepts (both include locations added later) or
// specific locations. Owner-only. Changing or deleting an
// assignment that staff/checklists still use warns first, then the database
// unassigns them (prune_department_links).

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Building2, Layers, MapPin, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import {
  type CompanyDepartment, type Concept, type DepartmentAssignment, type Location, type TeamMember,
} from "@/lib/admin-repository";
import { type ChecklistItem } from "@/hooks/useChecklists";
import { useCompanyDepartments, useDeleteDepartment, useSaveDepartment } from "@/hooks/useDepartments";
import {
  BottomSheet, ConfirmModal, FormField, ModalHeader, SaveButton, inputCls, type ConfirmState,
} from "./SharedUI";
import { MultiSelectFilter, type MultiSelectOption } from "@/components/MultiSelectFilter";
import { assignmentsToSelection, departmentUnassignImpact, selectionToAssignments } from "./departments";

export interface DepartmentsTabProps {
  concepts: Concept[];
  locations: Location[];
  teamMembers: TeamMember[];
  checklists: ChecklistItem[];
}

export function DepartmentsTab({ concepts, locations, teamMembers, checklists }: DepartmentsTabProps) {
  const { t } = useTranslation("admin");
  const { data: departments = [], isLoading } = useCompanyDepartments();
  const saveMut = useSaveDepartment();
  const deleteMut = useDeleteDepartment();
  const [modal, setModal] = useState<CompanyDepartment | "new" | null>(null);
  const [confirmModal, setConfirmModal] = useState<ConfirmState>(null);

  const locationById = new Map(locations.map(l => [l.id, l]));

  const impactMessage = (impact: { staff: number; checklists: number }) =>
    t("departmentsTab.impact", {
      staff: t("departmentsTab.staffCount", { count: impact.staff }),
      checklists: t("departmentsTab.checklistCount", { count: impact.checklists }),
    });

  const save = (dep: { id?: string; name: string; assignments: DepartmentAssignment[] }) => {
    saveMut.mutate(dep, {
      onSuccess: () => {
        setModal(null);
        toast.success(t("departmentsTab.saved"));
      },
      onError: (err: Error) => toast.error(t("departmentsTab.saveFailed", { error: err.message })),
    });
  };

  const handleSave = (dep: { id?: string; name: string; assignments: DepartmentAssignment[] }) => {
    const impact = dep.id
      ? departmentUnassignImpact(dep.id, dep.assignments, locations, teamMembers, checklists)
      : { staff: 0, checklists: 0 };
    if (impact.staff + impact.checklists === 0) {
      save(dep);
      return;
    }
    setConfirmModal({
      title: t("departmentsTab.unassignTitle"),
      message: <>{impactMessage(impact)} {t("departmentsTab.unassignBody")}</>,
      actionLabel: t("departmentsTab.unassignConfirm"),
      onConfirm: () => {
        setConfirmModal(null);
        save(dep);
      },
    });
  };

  const confirmDelete = (dep: CompanyDepartment) => {
    const impact = departmentUnassignImpact(dep.id, [], locations, teamMembers, checklists);
    const inUse = impact.staff + impact.checklists > 0;
    setConfirmModal({
      title: t("confirm.deleteDepartmentTitle"),
      message: (
        <>
          {t("confirm.deleteDepartmentPrefix")} <strong className="text-foreground">{dep.name}</strong>{t("confirm.deleteDepartmentSuffix")}
          {inUse && <> {impactMessage(impact)} {t("departmentsTab.unassignBody")}</>}
        </>
      ),
      actionLabel: t("confirm.delete"),
      requireDeleteText: true,
      onConfirm: () => {
        setConfirmModal(null);
        deleteMut.mutate({ id: dep.id }, {
          onError: (err: Error) => toast.error(t("departmentsTab.deleteFailed", { error: err.message })),
        });
      },
    });
  };

  // Chips: a single company-wide chip, or one per whole-concept assignment and
  // one per concept listing its specifically-picked locations.
  const assignmentChips = (dep: CompanyDepartment) => {
    const chips: { key: string; wholeConcept: boolean; label: string }[] = [];
    if (dep.assignments.some(a => a.concept_id === null)) {
      return [{ key: "company", wholeConcept: true, label: t("departmentsTab.allCompany") }];
    }
    for (const concept of concepts) {
      const forConcept = dep.assignments.filter(a => a.concept_id === concept.id);
      if (forConcept.length === 0) continue;
      if (forConcept.some(a => a.location_id === null)) {
        chips.push({ key: concept.id, wholeConcept: true, label: t("departmentsTab.allLocationsIn", { concept: concept.name }) });
      } else {
        const names = forConcept
          .map(a => locationById.get(a.location_id!)?.name)
          .filter((n): n is string => !!n);
        chips.push({ key: concept.id, wholeConcept: false, label: `${concept.name} · ${names.join(", ")}` });
      }
    }
    return chips;
  };

  const usage = (dep: CompanyDepartment) => ({
    staff: teamMembers.filter(m => m.department_ids.includes(dep.id)).length,
    checklists: checklists.filter(c => (c.department_ids ?? []).includes(dep.id)).length,
  });

  const header = (
    <div className="flex items-start justify-between gap-3">
      <div className="space-y-1">
        <h2 className="font-display text-lg text-foreground">{t("departmentsTab.heading")}</h2>
        <p className="text-xs text-muted-foreground">{t("departmentsTab.subtitle")}</p>
      </div>
      {departments.length > 0 && (
        <button
          onClick={() => setModal("new")}
          className="flex items-center gap-1.5 shrink-0 px-3 py-2 rounded-xl bg-sage text-primary-foreground text-xs font-semibold hover:bg-sage-deep transition-colors"
        >
          <Plus size={14} /> {t("departmentsTab.add")}
        </button>
      )}
    </div>
  );

  let body: React.ReactNode;
  if (isLoading) {
    body = <p className="text-sm text-muted-foreground py-8 text-center">{t("departmentsTab.loading")}</p>;
  } else if (departments.length === 0) {
    body = (
      <div className="flex flex-col items-center justify-center py-16 px-4 text-center space-y-5">
        <div className="w-16 h-16 rounded-2xl bg-sage/10 flex items-center justify-center">
          <Layers size={28} className="text-sage" />
        </div>
        <div className="space-y-2">
          <h2 className="font-display text-xl text-foreground">{t("departmentsTab.emptyHeading")}</h2>
          <p className="text-sm text-muted-foreground max-w-xs leading-relaxed">{t("departmentsTab.emptyBody")}</p>
        </div>
        <button
          onClick={() => setModal("new")}
          className="flex items-center gap-2 px-5 py-3 rounded-xl bg-sage text-primary-foreground text-sm font-semibold hover:bg-sage-deep transition-colors"
        >
          <Plus size={15} /> {t("departmentsTab.add")}
        </button>
      </div>
    );
  } else {
    body = (
      <div className="rounded-2xl border border-border bg-card divide-y divide-border overflow-hidden">
        {departments.map(dep => {
          const chips = assignmentChips(dep);
          const used = usage(dep);
          return (
            <div key={dep.id} className="flex items-start justify-between gap-3 px-4 py-3" data-testid="department-row">
              <div className="min-w-0 space-y-1.5">
                <p className="text-sm font-medium text-foreground truncate">{dep.name}</p>
                <div className="flex flex-wrap gap-1.5">
                  {chips.length === 0 ? (
                    <span className="rounded-full border border-dashed border-border px-2 py-0.5 text-[11px] text-muted-foreground">
                      {t("departmentsTab.notAssigned")}
                    </span>
                  ) : chips.map(chip => (
                    <span
                      key={chip.key}
                      className="inline-flex items-center gap-1 rounded-full bg-sage/10 px-2 py-0.5 text-[11px] text-sage-deep"
                    >
                      {chip.wholeConcept ? <Building2 size={11} /> : <MapPin size={11} />}
                      {chip.label}
                    </span>
                  ))}
                </div>
                {(used.staff > 0 || used.checklists > 0) && (
                  <p className="text-[11px] text-muted-foreground">
                    {t("departmentsTab.staffCount", { count: used.staff })} · {t("departmentsTab.checklistCount", { count: used.checklists })}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => setModal(dep)}
                  className="p-1.5 rounded-lg hover:bg-muted"
                  aria-label={t("departmentsTab.edit", { name: dep.name })}
                >
                  <Pencil size={14} className="text-muted-foreground" />
                </button>
                <button
                  onClick={() => confirmDelete(dep)}
                  className="p-1.5 rounded-lg hover:bg-muted"
                  aria-label={t("departmentsTab.delete", { name: dep.name })}
                >
                  <Trash2 size={14} className="text-status-error" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {header}
      {body}

      {modal && (
        <DepartmentModal
          department={modal === "new" ? null : modal}
          existingNames={departments.filter(d => modal === "new" || d.id !== modal.id).map(d => d.name.toLowerCase())}
          concepts={concepts}
          locations={locations}
          saving={saveMut.isPending}
          onClose={() => setModal(null)}
          onSave={handleSave}
        />
      )}

      {confirmModal && (
        <ConfirmModal
          title={confirmModal.title}
          message={confirmModal.message}
          actionLabel={confirmModal.actionLabel}
          requireDeleteText={confirmModal.requireDeleteText}
          onClose={() => setConfirmModal(null)}
          onConfirm={confirmModal.onConfirm}
        />
      )}
    </div>
  );
}

// ─── DepartmentModal ──────────────────────────────────────────────────────────
// Same Concept / Location dropdowns as the Reporting filters: empty = "All".

function DepartmentModal({
  department, existingNames, concepts, locations, saving, onClose, onSave,
}: {
  department: CompanyDepartment | null;
  existingNames: string[];
  concepts: Concept[];
  locations: Location[];
  saving: boolean;
  onClose: () => void;
  onSave: (dep: { id?: string; name: string; assignments: DepartmentAssignment[] }) => void;
}) {
  const { t } = useTranslation("admin");
  const { t: tc } = useTranslation("checklists");
  const [name, setName] = useState(department?.name ?? "");
  const [selection, setSelection] = useState(() => assignmentsToSelection(department?.assignments ?? [], locations));

  const trimmed = name.trim();
  const duplicate = existingNames.includes(trimmed.toLowerCase());

  const locationOptions = locations.filter(l =>
    l.concept_id && (selection.conceptIds.length === 0 || selection.conceptIds.includes(l.concept_id)),
  );

  const setConceptIds = (conceptIds: string[]) => {
    // Drop picked locations that fall outside the newly chosen concepts.
    setSelection(prev => ({
      conceptIds,
      locationIds: conceptIds.length === 0
        ? prev.locationIds
        : prev.locationIds.filter(id => conceptIds.includes(locations.find(l => l.id === id)?.concept_id ?? "")),
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!trimmed || duplicate || saving) return;
    onSave({
      id: department?.id,
      name: trimmed,
      assignments: selectionToAssignments(selection.conceptIds, selection.locationIds, locations),
    });
  };

  const summary = (opts: MultiSelectOption[]) =>
    opts.length === 1 ? opts[0].label : tc("reporting.filters.selectedCount", { count: opts.length });

  return (
    <BottomSheet onClose={onClose}>
      <ModalHeader title={department ? t("departmentsTab.editTitle") : t("departmentsTab.newTitle")} onClose={onClose} />
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormField label={t("departmentsTab.nameLabel")}>
          <input
            autoFocus type="text" value={name}
            onChange={e => setName(e.target.value)}
            placeholder={t("accountTab.departmentNamePlaceholder")}
            className={inputCls}
          />
          {duplicate && <p className="mt-1 text-xs text-status-error">{t("departmentsTab.duplicateName")}</p>}
        </FormField>

        <div className="space-y-2">
          <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">{t("departmentsTab.assignedHeading")}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <span className="text-xs uppercase tracking-widest text-muted-foreground">{tc("reporting.filters.concept")}</span>
              <MultiSelectFilter
                testId="department-concept-filter"
                icon={<Building2 size={14} className="text-muted-foreground shrink-0" />}
                options={concepts.map((c): MultiSelectOption => ({ id: c.id, label: c.name }))}
                selected={selection.conceptIds}
                onChange={setConceptIds}
                allLabel={tc("reporting.filters.allConcepts")}
                renderSelectedSummary={summary}
                searchPlaceholder={tc("reporting.filters.searchPlaceholder")}
                noMatchLabel={tc("reporting.filters.noMatch")}
                noOptionsLabel={tc("reporting.filters.allConcepts")}
              />
            </div>
            <div className="space-y-1">
              <span className="text-xs uppercase tracking-widest text-muted-foreground">{tc("reporting.filters.location")}</span>
              <MultiSelectFilter
                testId="department-location-filter"
                icon={<MapPin size={14} className="text-muted-foreground shrink-0" />}
                options={locationOptions.map((l): MultiSelectOption => ({ id: l.id, label: l.name }))}
                selected={selection.locationIds}
                onChange={locationIds => setSelection(prev => ({ ...prev, locationIds }))}
                allLabel={tc("reporting.filters.allLocations")}
                renderSelectedSummary={summary}
                searchPlaceholder={tc("reporting.filters.searchPlaceholder")}
                noMatchLabel={tc("reporting.filters.noMatch")}
                noOptionsLabel={tc("reporting.filters.allLocations")}
              />
            </div>
          </div>
        </div>

        <SaveButton
          disabled={!trimmed || duplicate || saving}
          label={department ? t("departmentsTab.saveChanges") : t("departmentsTab.create")}
        />
      </form>
    </BottomSheet>
  );
}
