import { useState, useEffect, useMemo, useRef, useCallback, lazy, Suspense } from "react";
import { createPortal } from "react-dom";
import { useSearchParams, useBlocker, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Plus, Search, ChevronDown, X, GripVertical, MoreVertical, FolderPlus, ClipboardList, Eye, Trash2, Building2, MapPin, Layers, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { type MultiSelectOption } from "@/components/MultiSelectFilter";
import { FiltersPopover, FilterField, FilterMultiSelect, ActiveFilterChips, type ActiveFilterChip } from "@/components/FiltersPopover";
import type { FolderItem, ChecklistItem, SectionDef } from "./types";
import { getScheduleLabel } from "./types";
import { useFolders, useSaveFolder, useDeleteFolder, useReorderFolders, useChecklists, useSaveChecklist, useDeleteChecklist } from "@/hooks/useChecklists";
import { useLocations } from "@/hooks/useLocations";
import { useDepartmentsForLocations } from "@/hooks/useDepartments";
import { useConcepts } from "@/hooks/useConcepts";
import { usePlan } from "@/hooks/usePlan";
import { UpgradePrompt } from "@/components/UpgradePrompt";
import { FolderBreadcrumb } from "./FolderBreadcrumb";
import { CreateMenuSheet } from "./CreateMenuSheet";
import { ItemContextMenu } from "./ItemContextMenu";
import { MoveToFolderSheet } from "./MoveToFolderSheet";

// Lazy-load heavy modals — only fetched when the user opens them
const ConvertFileModal = lazy(() => import("./ConvertFileModal").then(m => ({ default: m.ConvertFileModal })));
const BuildWithAIModal = lazy(() => import("./BuildWithAIModal").then(m => ({ default: m.BuildWithAIModal })));
const ChecklistBuilderModal = lazy(() => import("./ChecklistBuilderModal").then(m => ({ default: m.ChecklistBuilderModal })));
const ChecklistPreviewModal = lazy(() => import("./ChecklistPreviewModal").then(m => ({ default: m.ChecklistPreviewModal })));

function checklistAppliesToLocation(
  checklist: { location_id?: string | null; location_ids?: string[] | null; concept_id?: string | null },
  locationId: string,
  locationConceptId?: string | null,
) {
  const assignedIds = checklist.location_ids?.length
    ? checklist.location_ids
    : (checklist.location_id ? [checklist.location_id] : null);

  if (assignedIds && assignedIds.length > 0) return assignedIds.includes(locationId);
  if (checklist.concept_id) return checklist.concept_id === locationConceptId;
  return true;
}

type PublishStatus = "all" | "published" | "draft";

/** Everything the Filters popover edits — staged as a draft and only committed on Apply. */
interface PanelFilters {
  conceptIds: string[];
  locationIds: string[];
  departmentIds: string[];
  status: PublishStatus;
}

const DEFAULT_PANEL_FILTERS: PanelFilters = { conceptIds: [], locationIds: [], departmentIds: [], status: "all" };

export function ChecklistsTab({ onBuilderTitleChange }: { onBuilderTitleChange?: (title: string | null) => void }) {
  const { t } = useTranslation("checklists");
  const [searchParams] = useSearchParams();
  const { can } = usePlan();
  const { data: allDbLocations = [] } = useLocations();
  const dbLocations = allDbLocations;
  const { data: concepts = [] } = useConcepts();

  // DB data
  const { data: dbFolders = [] } = useFolders();
  const { data: dbChecklists = [] } = useChecklists();
  const saveFolderMut = useSaveFolder();
  const deleteFolderMut = useDeleteFolder();
  const reorderFoldersMut = useReorderFolders();
  const saveChecklistMut = useSaveChecklist();
  const deleteChecklistMut = useDeleteChecklist();

  // Map DB → UI types
  const folders: FolderItem[] = dbFolders.map(f => ({
    id: f.id,
    name: f.name,
    type: "folder" as const,
    parentId: f.parent_id,
    itemCount: dbChecklists.filter(c => c.folder_id === f.id).length,
  }));
  const checklists: ChecklistItem[] = dbChecklists.map(c => ({
    id: c.id,
    title: c.title,
    type: "checklist" as const,
    questionsCount: (c.sections as SectionDef[] ?? []).flatMap(s => s.questions).length,
    schedule: typeof c.schedule === "string" ? c.schedule : undefined,
    folderId: c.folder_id,
    location_id: c.location_id,
    location_ids: c.location_ids ?? (c.location_id ? [c.location_id] : null),
    department_ids: c.department_ids ?? null,
    concept_id: c.concept_id ?? null,
    start_date: c.start_date ?? null,
    createdAt: c.created_at,
    sections: c.sections as SectionDef[],
    due_time: c.due_time ?? null,
    visibility_from: c.visibility_from ?? null,
    visibility_until: c.visibility_until ?? null,
    is_published: c.is_published,
  }));

  // PDF download helper — dynamically imports export-utils (pulls in jsPDF) only on demand
  const downloadChecklistPdf = async (cl: typeof dbChecklists[0]) => {
    const { exportChecklistTemplatePdf } = await import("@/lib/export-utils");
    exportChecklistTemplatePdf({
      title: cl.title,
      schedule: getScheduleLabel(cl.schedule ? String(cl.schedule) : null),
      timeOfDay: cl.time_of_day ?? null,
      sections: (cl.sections as SectionDef[] ?? []).map(section => ({
        name: section.name,
        questions: section.questions.map(question => ({
          text: question.text,
          required: question.required,
        })),
      })),
    });
  };

  // Local drag-drop order state — mirrors DB sort_order, persisted via useReorderFolders on drop
  const [folderOrder, setFolderOrder] = useState<string[]>([]);
  useEffect(() => { setFolderOrder(dbFolders.map(f => f.id)); }, [dbFolders]);

  const [currentFolder, setCurrentFolder] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  // Applied filters, plus the staged copy the Filters popover edits —
  // committed on Apply, discarded if the popover is dismissed.
  const [filters, setFilters] = useState<PanelFilters>(DEFAULT_PANEL_FILTERS);
  const [draft, setDraft] = useState<PanelFilters>(DEFAULT_PANEL_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const updateDraft = (patch: Partial<PanelFilters>) => setDraft(prev => ({ ...prev, ...patch }));

  // The popover's location list narrows to the draft concept(s); departments
  // are the union across the draft's locations in scope.
  const draftConceptScopedLocations = useMemo(
    () => draft.conceptIds.length === 0 ? dbLocations : dbLocations.filter(l => l.concept_id && draft.conceptIds.includes(l.concept_id)),
    [dbLocations, draft.conceptIds],
  );
  const departmentLocationIds = useMemo(
    () => (draft.locationIds.length > 0 ? draft.locationIds : draftConceptScopedLocations.map(l => l.id)),
    [draft.locationIds, draftConceptScopedLocations],
  );
  const { data: availableDepartments = [], isFetching: departmentsFetching } = useDepartmentsForLocations(departmentLocationIds);

  // Drop draft locations a concept change put out of scope — keeps the same
  // object when nothing changed to avoid a re-render loop.
  useEffect(() => {
    setDraft(prev => {
      const next = prev.locationIds.filter(id => draftConceptScopedLocations.some(l => l.id === id));
      return next.length === prev.locationIds.length ? prev : { ...prev, locationIds: next };
    });
  }, [draftConceptScopedLocations]);

  // Same for departments — skipped mid-refetch so picks aren't wiped while loading.
  useEffect(() => {
    if (departmentsFetching) return;
    setDraft(prev => {
      const next = prev.departmentIds.filter(id => availableDepartments.some(d => d.id === id));
      return next.length === prev.departmentIds.length ? prev : { ...prev, departmentIds: next };
    });
  }, [departmentsFetching, availableDepartments]);

  const openFiltersPanel = () => {
    setDraft(filters);
    setFiltersOpen(true);
  };
  const applyFilters = () => {
    setFilters(draft);
    setFiltersOpen(false);
  };

  const activeFilterCount = [filters.conceptIds.length > 0, filters.locationIds.length > 0, filters.departmentIds.length > 0, filters.status !== "all"]
    .filter(Boolean).length;
  const [showCreateMenu, setShowCreateMenu] = useState(false);
  const [showBuilder, setShowBuilder] = useState(() => {
    // Auto-reopen builder if a meaningful draft was saved (e.g. after a tab switch that reloaded the page)
    try {
      const raw = sessionStorage.getItem("olia_checklist_draft");
      if (!raw) return false;
      const d = JSON.parse(raw);
      return !!(d.title?.trim() || d.sections?.some((s: any) =>
        s.name?.trim() || s.questions?.some((q: any) => q.text?.trim())
      ));
    } catch { return false; }
  });
  const [showConvertFile, setShowConvertFile] = useState(false);
  const [showBuildAI, setShowBuildAI] = useState(false);
  const [upgradeFeature, setUpgradeFeature] = useState<string | null>(null);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [contextMenu, setContextMenu] = useState<{ id: string; type: "folder" | "checklist" } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; type: "folder" | "checklist"; name: string } | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [moveTarget, setMoveTarget] = useState<{ id: string; type: "folder" | "checklist" } | null>(null);
  const [renameTarget, setRenameTarget] = useState<{ id: string; name: string } | null>(null);
  const [prefillTitle, setPrefillTitle] = useState("");
  const [prefillSections, setPrefillSections] = useState<SectionDef[] | undefined>(undefined);
  const [prefillLocationIds, setPrefillLocationIds] = useState<string[] | null | undefined>(undefined);
  const [prefillDepartmentIds, setPrefillDepartmentIds] = useState<string[] | null | undefined>(undefined);
  const [prefillConceptId, setPrefillConceptId] = useState<string | null | undefined>(undefined);
  const [dragFolderId, setDragFolderId] = useState<string | null>(null);
  const [editingChecklistId, setEditingChecklistId] = useState<string | null>(null);
  const [isBuilderDirty, setIsBuilderDirty] = useState(false);
  const [previewChecklist, setPreviewChecklist] = useState<ChecklistItem | null>(null);
  const editingChecklist = editingChecklistId ? dbChecklists.find(c => c.id === editingChecklistId) : null;
  const normalizedSearch = search.trim().toLowerCase();
  const visibleFolders = [...folders]
    .filter(f => normalizedSearch ? f.name.toLowerCase().includes(normalizedSearch) : f.parentId === currentFolder)
    .sort((a, b) => folderOrder.indexOf(a.id) - folderOrder.indexOf(b.id));
  const matchesScope = (c: ChecklistItem) => {
    if (filters.locationIds.length > 0) {
      return dbLocations.some(l => filters.locationIds.includes(l.id) && checklistAppliesToLocation(c, l.id, l.concept_id));
    }
    if (filters.conceptIds.length > 0) {
      if (!c.location_ids?.length) return !c.concept_id || filters.conceptIds.includes(c.concept_id);
      return dbLocations.some(l => l.concept_id && filters.conceptIds.includes(l.concept_id) && c.location_ids.includes(l.id));
    }
    return true;
  };
  const matchesFilters = (c: ChecklistItem) => {
    if (!matchesScope(c)) return false;
    if (filters.departmentIds.length > 0 && c.department_ids?.length
      && !c.department_ids.some(id => filters.departmentIds.includes(id))) return false;
    if (filters.status === "published" && !c.is_published) return false;
    if (filters.status === "draft" && c.is_published) return false;
    return true;
  };
  // Filters keep the folder structure: folders stay put, their counts only
  // include matching checklists, and inside a folder only matches are listed.
  const filteredChecklists = checklists.filter(matchesFilters);
  const filteredCountByFolder = new Map<string, number>();
  for (const c of filteredChecklists) {
    if (c.folderId) filteredCountByFolder.set(c.folderId, (filteredCountByFolder.get(c.folderId) ?? 0) + 1);
  }
  const visibleChecklists = filteredChecklists
    .filter(c => normalizedSearch ? c.title.toLowerCase().includes(normalizedSearch) : c.folderId === currentFolder);

  const isFiltering = activeFilterCount > 0;
  const isEmpty = visibleFolders.length === 0 && visibleChecklists.length === 0 && !normalizedSearch && !isFiltering;
  const noResults = !isEmpty && visibleFolders.length === 0 && visibleChecklists.length === 0;

  // Applied filters as removable chips, shown at every folder level.
  const departmentNames = useRef(new Map<string, string>());
  availableDepartments.forEach(d => departmentNames.current.set(d.id, d.name));
  const removeFrom = (key: "conceptIds" | "locationIds" | "departmentIds", id: string) =>
    setFilters(prev => ({ ...prev, [key]: prev[key].filter(x => x !== id) }));
  const filterChips: ActiveFilterChip[] = [
    ...filters.conceptIds.map(id => ({ key: `c-${id}`, label: concepts.find(c => c.id === id)?.name ?? id, onRemove: () => removeFrom("conceptIds", id) })),
    ...filters.locationIds.map(id => ({ key: `l-${id}`, label: dbLocations.find(l => l.id === id)?.name ?? id, onRemove: () => removeFrom("locationIds", id) })),
    ...filters.departmentIds.map(id => ({ key: `d-${id}`, label: departmentNames.current.get(id) ?? id, onRemove: () => removeFrom("departmentIds", id) })),
    ...(filters.status === "all" ? [] : [{
      key: "status",
      label: filters.status === "published" ? t("filters.statusPublished") : t("filters.statusDraft"),
      onRemove: () => setFilters(prev => ({ ...prev, status: "all" as const })),
    }]),
  ];

  // Mirror isBuilderDirty into a ref so useBlocker and the location-key effect
  // always read the *current* value synchronously — no render cycle needed.
  const isBuilderDirtyRef = useRef(false);
  const handleDirtyChange = useCallback((dirty: boolean) => {
    isBuilderDirtyRef.current = dirty;
    setIsBuilderDirty(dirty);
  }, []);

  // Hoist discardAndClose so it can be used both in the builder branch and in effects below
  const discardAndClose = useCallback(() => {
    try { sessionStorage.removeItem("olia_checklist_draft"); } catch { /* ignore */ }
    isBuilderDirtyRef.current = false;
    setShowBuilder(false);
    setPrefillTitle("");
    setPrefillSections(undefined);
    setPrefillLocationIds(undefined);
    setPrefillDepartmentIds(undefined);
    setPrefillConceptId(undefined);
    setEditingChecklistId(null);
    setIsBuilderDirty(false);
    onBuilderTitleChange?.(null);
  }, [onBuilderTitleChange]);

  // Show a discard-confirm when the user navigates away with unsaved changes.
  // We use two complementary mechanisms:
  //   1. A capture-phase click listener intercepts same-route nav clicks (Checklists tab) that
  //      React Router treats as no-ops and therefore never triggers useBlocker for.
  //   2. useBlocker handles genuine cross-route navigation (Dashboard, Admin, etc.).
  const [showNavExitConfirm, setShowNavExitConfirm] = useState(false);
  const location = useLocation();

  useEffect(() => {
    if (!showBuilder) return;
    const handleNavClick = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement).closest("a[href]") as HTMLAnchorElement | null;
      if (!anchor) return;
      const href = anchor.getAttribute("href") ?? "";
      // Only intercept internal same-route links — cross-route is handled by useBlocker
      if (!href.startsWith("/") || href !== location.pathname) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (isBuilderDirtyRef.current) {
        setShowNavExitConfirm(true);
      } else {
        discardAndClose();
      }
    };
    window.addEventListener("click", handleNavClick, true);
    return () => window.removeEventListener("click", handleNavClick, true);
  }, [showBuilder, location.pathname, discardAndClose]);

  // useBlocker handles cross-route navigation; reads from ref so the check is always current
  const blocker = useBlocker(() => showBuilder && isBuilderDirtyRef.current);

  // Warn the browser when the user tries to leave the tab/app entirely while the builder has unsaved changes
  useEffect(() => {
    if (!showBuilder || !isBuilderDirty) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [showBuilder, isBuilderDirty]);

  const handleCreateFolder = () => {
    if (!newFolderName.trim()) return;
    saveFolderMut.mutate({ name: newFolderName.trim(), parent_id: currentFolder });
    setNewFolderName("");
    setShowNewFolder(false);
  };

  const moveFolderInList = (folderId: string, targetIdx: number) => {
    const siblings = visibleFolders;
    const fromIdx = siblings.findIndex(f => f.id === folderId);
    if (fromIdx < 0 || fromIdx === targetIdx) return;
    const newOrder = [...folderOrder];
    const posA = newOrder.indexOf(folderId);
    const posB = newOrder.indexOf(siblings[targetIdx].id);
    [newOrder[posA], newOrder[posB]] = [newOrder[posB], newOrder[posA]];
    setFolderOrder(newOrder);
    reorderFoldersMut.mutate(newOrder.map((id, idx) => ({ id, sort_order: idx })));
  };

  const handleContextAction = (action: string) => {
    if (!contextMenu) return;
    if (action === "edit" && contextMenu.type === "checklist") {
      const cl = checklists.find(c => c.id === contextMenu.id);
      if (cl) {
        setEditingChecklistId(cl.id);
        setPrefillTitle(cl.title);
        setPrefillSections(cl.sections);
        setPrefillLocationIds(cl.location_ids ?? (cl.location_id ? [cl.location_id] : null));
        setPrefillDepartmentIds(cl.department_ids ?? null);
        setPrefillConceptId(cl.concept_id ?? null);
        setShowBuilder(true);
        onBuilderTitleChange?.(cl.title);
      }
    } else if (action === "move") {
      setMoveTarget(contextMenu);
    } else if (action === "rename" && contextMenu.type === "folder") {
      const folder = folders.find(f => f.id === contextMenu.id);
      if (folder) setRenameTarget({ id: folder.id, name: folder.name });
    } else if (action === "delete") {
      const name = contextMenu.type === "folder"
        ? folders.find(f => f.id === contextMenu.id)?.name ?? t("deleteConfirm.fallbackFolder")
        : checklists.find(c => c.id === contextMenu.id)?.title ?? t("deleteConfirm.fallbackChecklist");
      setDeleteConfirm({ id: contextMenu.id, type: contextMenu.type, name });
      setDeleteConfirmText("");
    } else if (action === "duplicate" && contextMenu.type === "checklist") {
      const orig = dbChecklists.find(c => c.id === contextMenu.id);
      if (orig) saveChecklistMut.mutate({ ...orig, id: "", title: `${orig.title} (copy)` });
    } else if (action === "download" && contextMenu.type === "checklist") {
      const orig = dbChecklists.find(c => c.id === contextMenu.id);
      if (orig) downloadChecklistPdf(orig);
    }
  };

  // ── Page-mode builder: takes over the whole content area ──────────────────
  if (showBuilder) {
    return (
      <>
      <Suspense fallback={<div className="flex items-center justify-center py-20"><div className="w-8 h-8 rounded-xl bg-sage animate-pulse" /></div>}>
      <ChecklistBuilderModal
        asPage
        onClose={discardAndClose}
        onAdd={async item => {
          const data = await saveChecklistMut.mutateAsync({
            title: item.title,
            description: item.description ?? null,
            folder_id: currentFolder,
            location_id: item.location_id ?? null,
            location_ids: item.location_ids ?? null,
            department_ids: item.department_ids ?? null,
            concept_id: item.concept_id ?? null,
            start_date: item.start_date ?? null,
            sections: item.sections ?? [],
            schedule: item.schedule ?? null,
            time_of_day: "anytime",
            due_time: item.due_time ?? null,
            visibility_from: item.visibility_from ?? null,
            visibility_until: item.visibility_until ?? null,
            is_published: item.is_published ?? false,
          });
          return (data as any)?.id as string | undefined;
        }}
        onUpdate={async (id, updates) => {
          const orig = dbChecklists.find(c => c.id === id);
          if (!orig) throw new Error("Checklist not found — please refresh and try again.");
          await saveChecklistMut.mutateAsync({
            ...orig,
            title: updates.title ?? orig.title,
            description: updates.description ?? orig.description ?? null,
            sections: updates.sections ?? orig.sections,
            schedule: updates.schedule ?? orig.schedule,
            location_id: updates.location_id !== undefined ? updates.location_id : orig.location_id,
            location_ids: updates.location_ids !== undefined ? updates.location_ids : orig.location_ids,
            department_ids: updates.department_ids !== undefined ? updates.department_ids : orig.department_ids,
            concept_id: updates.concept_id !== undefined ? updates.concept_id : orig.concept_id,
            start_date: updates.start_date !== undefined ? updates.start_date : orig.start_date,
            time_of_day: "anytime",
            due_time: updates.due_time !== undefined ? updates.due_time : orig.due_time,
            visibility_from: updates.visibility_from !== undefined ? updates.visibility_from : (orig.visibility_from ?? null),
            visibility_until: updates.visibility_until !== undefined ? updates.visibility_until : (orig.visibility_until ?? null),
            is_published: updates.is_published !== undefined ? updates.is_published : orig.is_published,
          });
        }}
        initialTitle={prefillTitle}
        initialDescription={editingChecklist?.description ?? undefined}
        initialSections={prefillSections}
        initialLocationIds={prefillLocationIds}
        initialDepartmentIds={prefillDepartmentIds}
        initialConceptId={prefillConceptId}
        initialSchedule={editingChecklist?.schedule ?? null}
        initialStartDate={editingChecklist?.start_date ?? null}
        initialVisibilityFrom={editingChecklist?.visibility_from ?? null}
        initialVisibilityUntil={editingChecklist?.visibility_until ?? null}
        initialIsPublished={editingChecklist?.is_published ?? false}
        editId={editingChecklistId || undefined}
        onDirtyChange={handleDirtyChange}
      />
      </Suspense>
      {(blocker.state === "blocked" || showNavExitConfirm) && createPortal(
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-foreground/30 backdrop-blur-sm">
          <div className="bg-card rounded-2xl p-6 mx-4 max-w-sm w-full shadow-xl space-y-4">
            <h3 className="font-display text-lg text-foreground">{t("unsavedExit.heading")}</h3>
            <p className="text-sm text-muted-foreground">{t("unsavedExit.body")}</p>
            <div className="flex gap-3">
              <button
                onClick={() => { setShowNavExitConfirm(false); if (blocker.state === "blocked") blocker.reset(); }}
                className="flex-1 py-2.5 rounded-xl border border-border text-sm font-medium text-foreground hover:bg-muted transition-colors"
              >
                {t("unsavedExit.keepEditing")}
              </button>
              <button
                onClick={() => { discardAndClose(); setShowNavExitConfirm(false); if (blocker.state === "blocked") blocker.proceed(); }}
                className="flex-1 py-2.5 rounded-xl bg-status-error text-white text-sm font-medium hover:opacity-90 transition-opacity"
              >
                {t("unsavedExit.discard")}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
      </>
    );
  }

  return (
    <>

      {/* Toolbar: search + Filters toggle + create */}
      <FiltersPopover
        testIdPrefix="checklists"
        open={filtersOpen}
        onOpenChange={o => (o ? openFiltersPanel() : setFiltersOpen(false))}
        activeCount={activeFilterCount}
        onClear={() => setDraft(DEFAULT_PANEL_FILTERS)}
        onApply={applyFilters}
        search={<>
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input type="text" placeholder={t("search.placeholder")} value={search} onChange={e => setSearch(e.target.value)}
            className="w-full rounded-full border border-border bg-card py-2.5 pl-9 pr-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
        </>}
        trailing={
          <button
            data-testid="checklists-create-btn"
            onClick={() => setShowCreateMenu(true)}
            aria-label={t("shell.newChecklist")}
            className="w-10 h-10 rounded-full bg-sage text-primary-foreground flex items-center justify-center hover:bg-sage-deep transition-colors shrink-0">
            <Plus size={18} />
          </button>
        }
      >
        <FilterField label={t("reporting.filters.concept")}>
          <FilterMultiSelect
            testId="checklists-concept-filter"
            icon={<Building2 size={14} className="text-muted-foreground shrink-0" />}
            options={concepts.map((c): MultiSelectOption => ({ id: c.id, label: c.name }))}
            selected={draft.conceptIds}
            onChange={ids => updateDraft({ conceptIds: ids })}
            allLabel={t("reporting.filters.allConcepts")}
          />
        </FilterField>
        <FilterField label={t("reporting.filters.location")}>
          <FilterMultiSelect
            testId="checklists-location-filter"
            icon={<MapPin size={14} className="text-muted-foreground shrink-0" />}
            options={draftConceptScopedLocations.map((l): MultiSelectOption => ({ id: l.id, label: l.name }))}
            selected={draft.locationIds}
            onChange={ids => updateDraft({ locationIds: ids })}
            allLabel={t("reporting.filters.allLocations")}
          />
        </FilterField>
        <FilterField label={t("reporting.filters.department")}>
          <FilterMultiSelect
            testId="checklists-department-filter"
            icon={<Layers size={14} className="text-muted-foreground shrink-0" />}
            options={availableDepartments.map((d): MultiSelectOption => ({ id: d.id, label: d.name }))}
            selected={draft.departmentIds}
            onChange={ids => updateDraft({ departmentIds: ids })}
            allLabel={t("reporting.filters.allDepartments")}
            noOptionsLabel={t("reporting.filters.noDepartments")}
          />
        </FilterField>
        <FilterField label={t("reporting.filters.status")}>
          <div className="relative">
            <CheckCircle2 size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <select
              data-testid="checklists-status-filter"
              value={draft.status}
              onChange={e => updateDraft({ status: e.target.value as PublishStatus })}
              className="w-full appearance-none rounded-xl border border-border bg-background py-2.5 pl-9 pr-8 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="all">{t("reporting.filters.allStatuses")}</option>
              <option value="published">{t("filters.statusPublished")}</option>
              <option value="draft">{t("filters.statusDraft")}</option>
            </select>
            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          </div>
        </FilterField>
      </FiltersPopover>
      <ActiveFilterChips testIdPrefix="checklists" chips={filterChips} onClearAll={() => setFilters(DEFAULT_PANEL_FILTERS)} />

      {/* Breadcrumb */}
      <FolderBreadcrumb folders={folders} currentId={currentFolder} onNavigate={setCurrentFolder} />

      {/* Empty state */}
      {noResults ? (
        <div className="card-surface p-8 text-center">
          <p data-testid="checklists-no-results" className="text-sm text-muted-foreground">{t("filters.noResults")}</p>
        </div>
      ) : isEmpty ? (
        <button onClick={() => setShowCreateMenu(true)}
          className="card-surface p-10 flex flex-col items-center gap-3 text-center w-full hover:bg-muted/30 transition-colors active:scale-[0.99]">
          <div className="w-14 h-14 rounded-2xl bg-sage-light flex items-center justify-center">
            <Plus size={28} className="text-sage-deep" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">
              {currentFolder ? t("empty.folderEmpty") : t("empty.noChecklists")}
            </p>
            <p className="text-xs text-muted-foreground mt-1">{t("empty.tapToCreate")}</p>
          </div>
        </button>
      ) : (
        <div className="card-surface divide-y divide-border overflow-hidden">
          {/* Folders */}
          {visibleFolders.map((folder, folderIdx) => (
            <div key={folder.id} className="flex items-center"
              draggable
              onDragStart={() => setDragFolderId(folder.id)}
              onDragOver={e => { e.preventDefault(); }}
              onDrop={() => {
                if (dragFolderId && dragFolderId !== folder.id) {
                  moveFolderInList(dragFolderId, folderIdx);
                  setDragFolderId(null);
                }
              }}
              onDragEnd={() => setDragFolderId(null)}
            >
              <div className="pl-2 shrink-0 cursor-grab active:cursor-grabbing touch-none text-muted-foreground hover:text-foreground transition-colors">
                <GripVertical size={16} />
              </div>
              <button onClick={() => setCurrentFolder(folder.id)}
                className="flex-1 flex items-center gap-3 px-2 py-3.5 text-left hover:bg-muted/30 transition-colors">
                <div className="w-9 h-9 rounded-xl bg-sage-light flex items-center justify-center shrink-0">
                  <FolderPlus size={16} className="text-sage-deep" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{folder.name}</p>
                  <p className="text-xs text-muted-foreground">{t("folder.itemCount", { count: isFiltering ? (filteredCountByFolder.get(folder.id) ?? 0) : folder.itemCount })}</p>
                </div>
              </button>
              <button onClick={e => { e.stopPropagation(); setContextMenu({ id: folder.id, type: "folder" }); }}
                className="p-3 text-muted-foreground hover:text-foreground transition-colors shrink-0">
                <MoreVertical size={16} />
              </button>
            </div>
          ))}

          {/* Checklists */}
          {visibleChecklists.map(cl => (
            <div key={cl.id} className="flex items-center">
              <button onClick={() => {
                setEditingChecklistId(cl.id);
                setPrefillTitle(cl.title);
                setPrefillSections(cl.sections);
                setPrefillLocationIds(cl.location_ids ?? (cl.location_id ? [cl.location_id] : null));
                setPrefillDepartmentIds(cl.department_ids ?? null);
                setShowBuilder(true);
                onBuilderTitleChange?.(cl.title);
              }}
                className="flex-1 flex items-center gap-3 px-4 py-3.5 text-left hover:bg-muted/30 transition-colors">
                <div className="w-9 h-9 rounded-xl bg-lavender-light flex items-center justify-center shrink-0">
                  <ClipboardList size={16} className="text-lavender-deep" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{cl.title}</p>
                    {!cl.is_published && (
                      <span className="shrink-0 text-[11px] font-medium px-1.5 py-0.5 rounded-full bg-status-warn/10 text-status-warn">
                        {t("checklist.draftBadge")}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t("checklist.questionsCount", { count: cl.questionsCount })}{cl.schedule ? ` · ${getScheduleLabel(cl.schedule)}` : ""}
                  </p>
                </div>
              </button>
              <button onClick={e => { e.stopPropagation(); setPreviewChecklist(cl); }}
                className="p-2 text-muted-foreground hover:text-sage transition-colors shrink-0"
                title={t("checklist.previewTooltip")}>
                <Eye size={16} />
              </button>
              <button onClick={e => { e.stopPropagation(); setContextMenu({ id: cl.id, type: "checklist" }); }}
                className="p-3 text-muted-foreground hover:text-foreground transition-colors shrink-0">
                <MoreVertical size={16} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Modals */}
      {upgradeFeature && (
        <UpgradePrompt feature={upgradeFeature} onClose={() => setUpgradeFeature(null)} />
      )}

      {showCreateMenu && (
        <CreateMenuSheet
          onClose={() => setShowCreateMenu(false)}
          onBuildOwn={() => { setShowBuilder(true); onBuilderTitleChange?.(""); }}
          onConvertFile={() => {
            if (!can("fileConvert")) { setUpgradeFeature("File conversion"); return; }
            setShowConvertFile(true);
          }}
          onBuildAI={() => {
            if (!can("aiBuilder")) { setUpgradeFeature("AI checklist builder"); return; }
            setShowBuildAI(true);
          }}
          onCreateFolder={() => setShowNewFolder(true)}
        />
      )}

      <Suspense fallback={null}>
        {showConvertFile && <ConvertFileModal onClose={() => setShowConvertFile(false)} onConvert={(sections) => {
          setPrefillTitle("Converted checklist");
          setPrefillSections(sections);
          setShowBuilder(true);
          onBuilderTitleChange?.("");
        }} />}
        {showBuildAI && <BuildWithAIModal onClose={() => setShowBuildAI(false)} onGenerate={(title, sections) => {
          setPrefillTitle(title);
          setPrefillSections(sections);
          setShowBuilder(true);
          onBuilderTitleChange?.("");
        }} />}
        {previewChecklist && (
          <ChecklistPreviewModal checklist={previewChecklist} onClose={() => setPreviewChecklist(null)}
            onEdit={() => {
              setEditingChecklistId(previewChecklist.id);
              setPrefillTitle(previewChecklist.title);
              setPrefillSections(previewChecklist.sections);
              setPreviewChecklist(null);
              setShowBuilder(true);
              onBuilderTitleChange?.(previewChecklist.title);
            }}
          />
        )}
      </Suspense>

      {showNewFolder && createPortal(
        <div className="fixed inset-0 z-[60] flex items-end justify-center pb-16 bg-foreground/20 backdrop-blur-sm animate-fade-in">
          <div className="bg-card w-full max-w-lg rounded-t-2xl p-5 pb-20 space-y-4 animate-fade-in">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg text-foreground">{t("newFolder.heading")}</h2>
              <button onClick={() => setShowNewFolder(false)} className="btn-icon" aria-label={t("close")}>
                <X size={18} className="text-muted-foreground" />
              </button>
            </div>
            <input autoFocus type="text" placeholder={t("newFolder.namePlaceholder")} value={newFolderName} onChange={e => setNewFolderName(e.target.value)}
              className="w-full border border-border rounded-xl px-4 py-3 text-sm bg-muted focus:outline-none focus:ring-1 focus:ring-ring" />
            <button disabled={!newFolderName.trim()} onClick={handleCreateFolder}
              className={cn("w-full py-3 rounded-xl text-sm font-medium transition-colors",
                newFolderName.trim() ? "bg-sage text-primary-foreground hover:bg-sage-deep" : "bg-muted text-muted-foreground cursor-not-allowed"
              )}>
              {t("newFolder.create")}
            </button>
          </div>
        </div>,
        document.body
      )}

      {contextMenu && (
        <ItemContextMenu type={contextMenu.type} onAction={handleContextAction}
          onClose={() => setContextMenu(null)} />
      )}

      {deleteConfirm && createPortal(
        <div className="fixed inset-0 z-[60] flex items-end justify-center pb-16 bg-foreground/20 backdrop-blur-sm animate-fade-in sm:items-center sm:pb-0 sm:px-4 sm:py-8">
          <div className="bg-card w-full max-w-lg rounded-t-2xl p-5 pb-20 space-y-4 animate-fade-in sm:rounded-2xl sm:pb-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-status-error/10 flex items-center justify-center shrink-0">
                <Trash2 size={18} className="text-status-error" />
              </div>
              <div>
                <h2 className="font-display text-base text-foreground">
                  {deleteConfirm.type === "folder" ? t("deleteConfirm.headingFolder") : t("deleteConfirm.headingChecklist")}
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5 truncate">{t("deleteConfirm.body", { name: deleteConfirm.name })}</p>
              </div>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">
                {t("deleteConfirm.typeToConfirm")} <strong className="text-foreground">{t("deleteConfirm.confirmWord")}</strong> {t("deleteConfirm.toConfirm")}
              </p>
              <input
                autoFocus
                type="text"
                value={deleteConfirmText}
                onChange={e => setDeleteConfirmText(e.target.value.toUpperCase())}
                placeholder={t("deleteConfirm.placeholder")}
                className="mt-2 w-full border border-border rounded-xl px-3 py-2 text-sm bg-muted focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <div className="flex gap-3">
              <button onClick={() => { setDeleteConfirm(null); setDeleteConfirmText(""); }}
                className="flex-1 py-3 rounded-xl border border-border text-sm font-medium text-foreground hover:bg-muted transition-colors">
                {t("deleteConfirm.cancel")}
              </button>
              <button
                disabled={deleteConfirmText !== t("deleteConfirm.confirmWord")}
                onClick={() => {
                  if (deleteConfirmText !== t("deleteConfirm.confirmWord")) return;
                  if (deleteConfirm.type === "folder") deleteFolderMut.mutate(deleteConfirm.id);
                  else deleteChecklistMut.mutate(deleteConfirm.id);
                  setDeleteConfirm(null);
                  setDeleteConfirmText("");
                }}
                className="flex-1 py-3 rounded-xl bg-status-error text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:opacity-40">
                {t("deleteConfirm.confirm")}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {moveTarget && (
        <MoveToFolderSheet folders={folders}
          currentFolderId={moveTarget.type === "folder" ? moveTarget.id : checklists.find(c => c.id === moveTarget.id)?.folderId ?? null}
          onMove={folderId => {
            if (moveTarget.type === "folder") {
              saveFolderMut.mutate({ id: moveTarget.id, parent_id: folderId });
            } else {
              const orig = dbChecklists.find(c => c.id === moveTarget.id);
              if (orig) saveChecklistMut.mutate({ ...orig, folder_id: folderId });
            }
            setMoveTarget(null);
          }}
          onClose={() => setMoveTarget(null)}
        />
      )}

      {renameTarget && createPortal(
        <div className="fixed inset-0 z-[60] flex items-end justify-center pb-16 bg-foreground/20 backdrop-blur-sm animate-fade-in">
          <div className="bg-card w-full max-w-lg rounded-t-2xl p-5 pb-20 space-y-4 animate-fade-in">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg text-foreground">{t("renameFolder.heading")}</h2>
              <button onClick={() => setRenameTarget(null)} className="btn-icon" aria-label={t("close")}>
                <X size={18} className="text-muted-foreground" />
              </button>
            </div>
            <input autoFocus type="text" value={renameTarget.name}
              onChange={e => setRenameTarget(prev => prev ? { ...prev, name: e.target.value } : null)}
              className="w-full border border-border rounded-xl px-4 py-3 text-sm bg-muted focus:outline-none focus:ring-1 focus:ring-ring" />
            <button disabled={!renameTarget.name.trim()} onClick={() => {
              saveFolderMut.mutate({ id: renameTarget.id, name: renameTarget.name.trim() });
              setRenameTarget(null);
            }}
              className={cn("w-full py-3 rounded-xl text-sm font-medium transition-colors",
                renameTarget.name.trim() ? "bg-sage text-primary-foreground hover:bg-sage-deep" : "bg-muted text-muted-foreground cursor-not-allowed"
              )}>
              {t("renameFolder.save")}
            </button>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
