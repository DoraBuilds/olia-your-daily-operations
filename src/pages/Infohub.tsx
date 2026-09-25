import { useState, useMemo, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Layout } from "@/components/Layout";
import { useAuth } from "@/contexts/AuthContext";
import { useConcepts } from "@/hooks/useConcepts";
import { useInfohubContent } from "@/hooks/useInfohubContent";
import { supabase } from "@/lib/supabase";
import { useTeamMembers } from "@/hooks/useTeamMembers";
import { useLocations } from "@/hooks/useLocations";
import { useTrainingProgress } from "@/hooks/useTrainingProgress";
import {
  BookOpen,
  ChevronRight,
  Search,
  Plus,
  Folder,
  Sparkles,
  GraduationCap,
  CheckCircle,
  Play,
  FolderInput,
  Pencil,
  Archive,
  Download,
  Shield,
  Lock,
  MoreVertical,
  GripVertical,
  FileText,
  Building2,
  MapPin,
  UserRound,
  User,
  Tag,
  Files,
  CheckCircle2,
  ChevronDown,
} from "lucide-react";
import { FiltersPopover, FilterField, FilterMultiSelect, ActiveFilterChips, type ActiveFilterChip } from "@/components/FiltersPopover";
import { accessMatchesFilters, activeInfohubFilterCount, DEFAULT_INFOHUB_FILTERS, reachableFolderIds, type AccessFilterContext, type DocKind, type InfohubFilters, type Progress } from "./infohub/infohub-filters";
import { cn } from "@/lib/utils";
import { canAccessInfohubContent, canManageInfohubAccess, type InfohubAccessControl, type InfohubPrincipal } from "@/lib/infohub-access";
import type { InfohubLibraryDoc as DocItem, InfohubLibraryFolder as FolderItem, InfohubTrainingDoc as TrainingDoc, InfohubTrainingFolder as TrainingFolder } from "@/lib/infohub-catalog";
import { type AccessTarget, type SubTab } from "./infohub/infohub-types";
import { countDocsInFolder, countTrainingDocsInFolder, sortFolders, useDragReorder } from "./infohub/infohub-utils";
import { AIActionsSheet, CreateDocModal, CreateFolderModal, FilePreviewModal, FolderBreadcrumb, ItemContextMenu, ManageAccessModal, MoveToFolderSheet, PlusMenu, RenameFolderModal, SearchOverlay, UploadDocModal } from "./infohub/InfohubShared";
import { LibraryDocDetail, TrainingDocDetail } from "./infohub/InfohubDocumentViews";

// ─── Infohub Page ─────────────────────────────────────────────────────────────

export default function Infohub() {
  const { t } = useTranslation("infohub");
  const location = useLocation();
  const navigate = useNavigate();
  const { teamMember } = useAuth();
  const { data: concepts = [] } = useConcepts();
  const { data: teamMembers = [] } = useTeamMembers();
  const { data: locations = [] } = useLocations();
  const {
    data: infohubData,
    createFolder,
    createDocument,
    updateFolder,
    updateDocument,
    deleteFolder,
    archiveDocument,
    restoreDocument,
    reorderFolders,
  } = useInfohubContent();
  const { data: trainingProgress = [], saveProgress } = useTrainingProgress();
  const routeSubTab: SubTab = location.pathname.startsWith("/infohub/training") ? "training" : "library";
  const [subTab, setSubTab] = useState<SubTab>(routeSubTab);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showPlusMenu, setShowPlusMenu] = useState(false);
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [showCreateDoc, setShowCreateDoc] = useState(false);
  const [showUploadDoc, setShowUploadDoc] = useState(false);
  const [filePreview, setFilePreview] = useState<{ signedUrl: string; fileType: string; title: string } | null>(null);
  // Library and Training keep separate applied filters; the popover edits a
  // staged draft of the current tab's, committed on Apply.
  const [libFilters, setLibFilters] = useState<InfohubFilters>(DEFAULT_INFOHUB_FILTERS);
  const [trainFilters, setTrainFilters] = useState<InfohubFilters>(DEFAULT_INFOHUB_FILTERS);
  const [draft, setDraft] = useState<InfohubFilters>(DEFAULT_INFOHUB_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const updateDraft = (patch: Partial<InfohubFilters>) => setDraft(prev => ({ ...prev, ...patch }));

  // Data state
  const libFolders = infohubData.libraryFolders;
  const libDocs = infohubData.libraryDocs;
  const archivedLibDocs = infohubData.archivedLibraryDocs;
  const trainFolders = infohubData.trainingFolders;
  const [showArchived, setShowArchived] = useState(false);

  // Navigation state
  const [currentLibFolder, setCurrentLibFolder] = useState<string | null>(null);
  const [selectedDoc, setSelectedDoc] = useState<DocItem | null>(null);
  const [currentTrainFolder, setCurrentTrainFolder] = useState<string | null>(null);
  const [selectedTrainingDoc, setSelectedTrainingDoc] = useState<TrainingDoc | null>(null);

  // Context menu state
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [aiSheetDocTitle, setAiSheetDocTitle] = useState<string | null>(null);
  const [moveTarget, setMoveTarget] = useState<{ type: "folder" | "doc"; id: string; section: "library" | "training" } | null>(null);
  const [renameTarget, setRenameTarget] = useState<{ id: string; name: string; section: "library" | "training" } | null>(null);
  const [accessTarget, setAccessTarget] = useState<AccessTarget | null>(null);

  useEffect(() => {
    setSubTab(routeSubTab);
  }, [routeSubTab]);

  const currentPrincipal: InfohubPrincipal = {
    teamMemberId: teamMember?.id ?? null,
    role: teamMember?.role ?? null,
    locationIds: teamMember?.location_ids ?? [],
    permissions: teamMember?.permissions ?? null,
    isOwner: teamMember?.is_owner ?? false,
  };
  const canManageAccess = canManageInfohubAccess(currentPrincipal);
  const roleOptions = useMemo(
    () => Array.from(new Set(teamMembers.map(member => member.role).filter(Boolean))).sort(),
    [teamMembers],
  );
  const trainCompletionMap = useMemo(
    () => new Map(trainingProgress.map((row) => [row.module_id, row])),
    [trainingProgress],
  );
  const trainDocs = useMemo(
    () => infohubData.trainingDocs.map((doc) => ({
      ...doc,
      completed: trainCompletionMap.get(doc.id)?.is_completed ?? false,
    })),
    [infohubData.trainingDocs, trainCompletionMap],
  );
  const normalizedSearch = searchQuery.trim().toLowerCase();

  // ─── Filters ───
  const draftLocationOptions = useMemo(
    () => draft.conceptIds.length === 0 ? locations : locations.filter(l => l.concept_id && draft.conceptIds.includes(l.concept_id)),
    [locations, draft.conceptIds],
  );
  // Drop draft locations a concept change put out of scope.
  useEffect(() => {
    setDraft(prev => {
      const next = prev.locationIds.filter(id => draftLocationOptions.some(l => l.id === id));
      return next.length === prev.locationIds.length ? prev : { ...prev, locationIds: next };
    });
  }, [draftLocationOptions]);

  const accessContext = (f: InfohubFilters): AccessFilterContext => ({
    locationIds: f.locationIds.length > 0
      ? f.locationIds
      : f.conceptIds.length > 0 ? locations.filter(l => l.concept_id && f.conceptIds.includes(l.concept_id)).map(l => l.id) : null,
    roles: f.roles,
    members: teamMembers.filter(m => f.memberIds.includes(m.id)),
  });
  const isLibFiltering = activeInfohubFilterCount(libFilters) > 0;
  const isTrainFiltering = activeInfohubFilterCount(trainFilters) > 0;
  const currentFilters = subTab === "library" ? libFilters : trainFilters;
  const setCurrentFilters = subTab === "library" ? setLibFilters : setTrainFilters;

  const isVisibleToMe = (access: InfohubAccessControl) =>
    canAccessInfohubContent(access, currentPrincipal);

  // Docs that are visible to the viewer AND match the tab's filters, including
  // their folder path. Folder counts and folder contents are built from these,
  // so counts shrink as filters narrow and a folder only lists what matches.
  const filteredLibDocs = useMemo(() => {
    const ctx = accessContext(libFilters);
    const reachable = reachableFolderIds(libFolders, access => accessMatchesFilters(access, ctx));
    return libDocs.filter(doc =>
      isVisibleToMe(doc.access)
      && reachable.has(doc.folderId)
      && accessMatchesFilters(doc.access, ctx)
      && (libFilters.tags.length === 0 || doc.tags.some(tag => libFilters.tags.includes(tag)))
      && (libFilters.kind === "all" || (libFilters.kind === "file") === Boolean(doc.filePath))
    );
  }, [libDocs, libFolders, libFilters, teamMembers, locations, currentPrincipal]); // eslint-disable-line react-hooks/exhaustive-deps
  const filteredTrainDocs = useMemo(() => {
    const ctx = accessContext(trainFilters);
    const reachable = reachableFolderIds(trainFolders, access => accessMatchesFilters(access, ctx));
    return trainDocs.filter(doc =>
      isVisibleToMe(doc.access)
      && reachable.has(doc.folderId)
      && accessMatchesFilters(doc.access, ctx)
      && (trainFilters.progress === "all" || (trainFilters.progress === "completed") === doc.completed)
    );
  }, [trainDocs, trainFolders, trainFilters, teamMembers, locations, currentPrincipal]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sorted folder lists
  const visibleLibFolders = useMemo(() =>
    sortFolders(libFolders.filter((folder) => {
      if (normalizedSearch) return folder.name.toLowerCase().includes(normalizedSearch);
      return folder.parentId === currentLibFolder;
    })),
    [libFolders, currentLibFolder, normalizedSearch]
  );
  const accessibleLibFolders = useMemo(() =>
    visibleLibFolders.filter(folder => isVisibleToMe(folder.access)),
    [visibleLibFolders, currentPrincipal] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const accessibleDocsInCurrentFolder = useMemo(() =>
    (normalizedSearch
      ? filteredLibDocs.filter((doc) =>
          doc.title.toLowerCase().includes(normalizedSearch)
          || doc.summary.toLowerCase().includes(normalizedSearch)
        )
      : currentLibFolder
        ? filteredLibDocs.filter(d => d.folderId === currentLibFolder)
        : []
    ).sort((a, b) => a.title.localeCompare(b.title)),
    [filteredLibDocs, currentLibFolder, normalizedSearch]
  );
  const visibleTrainFolders = useMemo(() =>
    sortFolders(trainFolders.filter((folder) => {
      if (normalizedSearch) return folder.name.toLowerCase().includes(normalizedSearch);
      return folder.parentId === currentTrainFolder;
    })),
    [trainFolders, currentTrainFolder, normalizedSearch]
  );
  const accessibleTrainFolders = useMemo(() =>
    visibleTrainFolders.filter(folder => isVisibleToMe(folder.access)),
    [visibleTrainFolders, currentPrincipal] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const accessibleDocsInCurrentTrainFolder = useMemo(() =>
    normalizedSearch
      ? filteredTrainDocs.filter(d => d.title.toLowerCase().includes(normalizedSearch))
      : currentTrainFolder
        ? filteredTrainDocs.filter(d => d.folderId === currentTrainFolder)
        : [],
    [filteredTrainDocs, currentTrainFolder, normalizedSearch]
  );
  const visibleLibDocs = useMemo(() =>
    libDocs.filter(doc => isVisibleToMe(doc.access)),
    [libDocs, currentPrincipal] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const visibleTrainDocs = useMemo(() =>
    trainDocs.filter(doc => isVisibleToMe(doc.access)),
    [trainDocs, currentPrincipal] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const tagOptions = useMemo(
    () => Array.from(new Set(visibleLibDocs.flatMap(doc => doc.tags))).sort((a, b) => a.localeCompare(b)),
    [visibleLibDocs],
  );

  const openFiltersPanel = () => {
    setDraft(currentFilters);
    setFiltersOpen(true);
  };
  const applyFilters = () => {
    setCurrentFilters(draft);
    setFiltersOpen(false);
  };

  // The current tab's applied filters as removable chips — shown at every folder level.
  const removeFrom = (key: "conceptIds" | "locationIds" | "roles" | "memberIds" | "tags", value: string) =>
    setCurrentFilters(prev => ({ ...prev, [key]: prev[key].filter(x => x !== value) }));
  const filterChips: ActiveFilterChip[] = [
    ...currentFilters.conceptIds.map(id => ({ key: `c-${id}`, label: concepts.find(c => c.id === id)?.name ?? id, onRemove: () => removeFrom("conceptIds", id) })),
    ...currentFilters.locationIds.map(id => ({ key: `l-${id}`, label: locations.find(l => l.id === id)?.name ?? id, onRemove: () => removeFrom("locationIds", id) })),
    ...currentFilters.roles.map(role => ({ key: `r-${role}`, label: role, onRemove: () => removeFrom("roles", role) })),
    ...currentFilters.memberIds.map(id => ({ key: `m-${id}`, label: teamMembers.find(m => m.id === id)?.name ?? id, onRemove: () => removeFrom("memberIds", id) })),
    ...currentFilters.tags.map(tag => ({ key: `t-${tag}`, label: `#${tag}`, onRemove: () => removeFrom("tags", tag) })),
    ...(currentFilters.kind === "all" ? [] : [{
      key: "kind",
      label: currentFilters.kind === "file" ? t("filters.typeFile") : t("filters.typeWritten"),
      onRemove: () => setCurrentFilters(prev => ({ ...prev, kind: "all" as const })),
    }]),
    ...(currentFilters.progress === "all" ? [] : [{
      key: "progress",
      label: currentFilters.progress === "completed" ? t("filters.completed") : t("filters.notCompleted"),
      onRemove: () => setCurrentFilters(prev => ({ ...prev, progress: "all" as const })),
    }]),
  ];

  // Drag reorder
  const libDrag = useDragReorder(visibleLibFolders, (reordered) => {
    reorderFolders.mutate({ section: "library", orderedIds: reordered.map((folder) => folder.id) });
  });
  const trainDrag = useDragReorder(visibleTrainFolders, (reordered) => {
    reorderFolders.mutate({ section: "training", orderedIds: reordered.map((folder) => folder.id) });
  });

  // CRUD handlers
  const handleCreateLibFolder = (name: string, parentId: string | null) => {
    createFolder.mutate({ section: "library", name, parentId });
  };
  const handleCreateTrainFolder = (name: string, parentId: string | null) => {
    createFolder.mutate({ section: "training", name, parentId });
  };
  const handleCreateLibDoc = (title: string, folderId: string, tags: string[] = []) => {
    createDocument.mutate({ section: "library", title, folderId, tags });
  };
  const handleRenameFolder = (id: string, newName: string, section: "library" | "training") => {
    updateFolder.mutate({ id, name: newName });
  };
  const handleMoveFolder = (id: string, targetParentId: string | null, section: "library" | "training") => {
    updateFolder.mutate({ id, parentId: targetParentId, sortOrder: null });
  };
  const handleMoveDoc = (id: string, targetFolderId: string | null, section: "library" | "training") => {
    if (targetFolderId) {
      updateDocument.mutate({ id, section, folderId: targetFolderId });
    }
  };
  const handleArchiveFolder = (id: string, section: "library" | "training") => {
    deleteFolder.mutate(id);
  };
  const handleArchiveDoc = (id: string, section: "library" | "training") => {
    archiveDocument.mutate(id);
  };
  const handleRestoreDoc = (id: string) => {
    restoreDocument.mutate(id);
  };
  const handleSaveAccess = (target: AccessTarget, access: InfohubAccessControl) => {
    if (target.type === "folder") {
      updateFolder.mutate({ id: target.id, access });
      return;
    }

    updateDocument.mutate({ id: target.id, section: target.section, access });
  };

  const allLibFolderOptions = useMemo(() => libFolders.map(f => ({ id: f.id, name: f.name })), [libFolders]);
  const allTrainFolderOptions = useMemo(() => trainFolders.map(f => ({ id: f.id, name: f.name })), [trainFolders]);

  const activeSelectedDoc = selectedDoc
    ? libDocs.find((doc) => doc.id === selectedDoc.id) ?? selectedDoc
    : null;
  const activeSelectedTrainingDoc = selectedTrainingDoc
    ? trainDocs.find((doc) => doc.id === selectedTrainingDoc.id) ?? selectedTrainingDoc
    : null;

  // Detail views
  if (activeSelectedDoc) return (
    <LibraryDocDetail
      doc={activeSelectedDoc}
      folders={libFolders}
      onBack={() => setSelectedDoc(null)}
      onSave={(updated) => {
        updateDocument.mutate({
          id: updated.id,
          section: "library",
          title: updated.title,
          summary: updated.summary,
          body: updated.content,
          tags: updated.tags,
        });
        setSelectedDoc(updated);
      }}
    />
  );
  if (activeSelectedTrainingDoc) return (
    <TrainingDocDetail
      doc={activeSelectedTrainingDoc}
      onBack={() => setSelectedTrainingDoc(null)}
      onToggleComplete={(completed) => {
        const totalSteps = activeSelectedTrainingDoc.steps.length;
        saveProgress.mutate({
          moduleId: activeSelectedTrainingDoc.id,
          completedStepIndices: completed ? activeSelectedTrainingDoc.steps.map((_, index) => index) : [],
          totalSteps,
        });
      }}
    />
  );
  if (showSearch) return (
    <SearchOverlay libraryDocs={visibleLibDocs} trainingDocs={visibleTrainDocs} onClose={() => setShowSearch(false)}
      onSelectLibDoc={d => { setShowSearch(false); setSelectedDoc(d); }}
      onSelectTrainingDoc={d => { setShowSearch(false); setSelectedTrainingDoc(d); }}
    />
  );

  // Folder menu actions
  const folderActions = (folder: { id: string; name: string; access: InfohubAccessControl }, section: "library" | "training") => {
    const actions = [
      { label: t("actions.moveToFolder"), icon: <FolderInput size={16} className="text-muted-foreground" />, onClick: () => setMoveTarget({ type: "folder", id: folder.id, section }) },
      { label: t("actions.renameFolder"), icon: <Pencil size={16} className="text-muted-foreground" />, onClick: () => setRenameTarget({ id: folder.id, name: folder.name, section }) },
    ];
    if (canManageAccess) {
      actions.push({
        label: t("actions.manageAccess"),
        icon: <Shield size={16} className="text-muted-foreground" />,
        onClick: () => setAccessTarget({ id: folder.id, type: "folder", section, name: folder.name, access: folder.access }),
      });
    }
    actions.push({ label: t("actions.archiveFolder"), icon: <Archive size={16} className="text-muted-foreground" />, onClick: () => handleArchiveFolder(folder.id, section) });
    return actions;
  };

  const docActions = (doc: DocItem | TrainingDoc, section: "library" | "training") => {
    const actions = [
      { label: t("actions.moveToFolder"), icon: <FolderInput size={16} className="text-muted-foreground" />, onClick: () => setMoveTarget({ type: "doc", id: doc.id, section }) },
      {
        label: t("actions.downloadFile"),
        icon: <Download size={16} className="text-muted-foreground" />,
        onClick: async () => {
          const libraryDoc = section === "library" ? (doc as DocItem) : null;
          if (libraryDoc?.filePath) {
            const { data } = await supabase.storage.from("infohub-files").createSignedUrl(libraryDoc.filePath, 3600);
            if (data?.signedUrl) {
              const a = document.createElement("a");
              a.href = data.signedUrl;
              a.download = doc.title;
              a.click();
            }
            return;
          }
          let text: string;
          if (section === "library") {
            const libraryDoc = doc as DocItem;
            text = `${libraryDoc.title}\n${"=".repeat(libraryDoc.title.length)}\n\n${libraryDoc.summary}\n\n${libraryDoc.content}`;
          } else {
            const trainingDoc = doc as TrainingDoc;
            text = `${trainingDoc.title}\n${"=".repeat(trainingDoc.title.length)}\n\n${trainingDoc.steps.map((step, i) => `Step ${i + 1}: ${step}`).join("\n\n")}`;
          }
          const blob = new Blob([text], { type: "text/plain" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `${doc.title.replace(/[^a-z0-9]/gi, "_")}.txt`;
          a.click();
          URL.revokeObjectURL(url);
        },
      },
    ];
    if (canManageAccess) {
      actions.push({
        label: t("actions.manageAccess"),
        icon: <Shield size={16} className="text-muted-foreground" />,
        onClick: () => setAccessTarget({ id: doc.id, type: "doc", section, name: doc.title, access: doc.access }),
      });
    }
    actions.push({ label: t("actions.archiveFile"), icon: <Archive size={16} className="text-muted-foreground" />, onClick: () => handleArchiveDoc(doc.id, section) });
    return actions;
  };

  const handleOpenLibDoc = async (doc: DocItem) => {
    if (doc.filePath) {
      const { data } = await supabase.storage.from("infohub-files").createSignedUrl(doc.filePath, 3600);
      if (data?.signedUrl) setFilePreview({ signedUrl: data.signedUrl, fileType: doc.fileType ?? "", title: doc.title });
    } else {
      setSelectedDoc(doc);
    }
  };

  return (
    <Layout>

      <FiltersPopover
        testIdPrefix="infohub"
        open={filtersOpen}
        onOpenChange={o => (o ? openFiltersPanel() : setFiltersOpen(false))}
        activeCount={activeInfohubFilterCount(currentFilters)}
        onClear={() => setDraft(DEFAULT_INFOHUB_FILTERS)}
        onApply={applyFilters}
        search={<>
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder={subTab === "library" ? t("searchLibraryPlaceholder") : t("searchTrainingPlaceholder")}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full rounded-full border border-border bg-card py-2.5 pl-9 pr-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </>}
        trailing={
          <button
            onClick={() => setShowPlusMenu(true)}
            aria-label={t("addContent")}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-sage text-primary-foreground transition-colors hover:bg-sage-deep shrink-0"
          >
            <Plus size={18} />
          </button>
        }
      >
        <FilterField label={t("filters.concept")}>
          <FilterMultiSelect
            testId="infohub-concept-filter"
            icon={<Building2 size={14} className="text-muted-foreground shrink-0" />}
            options={concepts.map(c => ({ id: c.id, label: c.name }))}
            selected={draft.conceptIds}
            onChange={ids => updateDraft({ conceptIds: ids })}
            allLabel={t("filters.allConcepts")}
          />
        </FilterField>
        <FilterField label={t("filters.location")}>
          <FilterMultiSelect
            testId="infohub-location-filter"
            icon={<MapPin size={14} className="text-muted-foreground shrink-0" />}
            options={draftLocationOptions.map(l => ({ id: l.id, label: l.name }))}
            selected={draft.locationIds}
            onChange={ids => updateDraft({ locationIds: ids })}
            allLabel={t("filters.allLocations")}
          />
        </FilterField>
        <FilterField label={t("filters.role")}>
          <FilterMultiSelect
            testId="infohub-role-filter"
            icon={<UserRound size={14} className="text-muted-foreground shrink-0" />}
            options={roleOptions.map(role => ({ id: role, label: role }))}
            selected={draft.roles}
            onChange={roles => updateDraft({ roles })}
            allLabel={t("filters.allRoles")}
          />
        </FilterField>
        <FilterField label={t("filters.member")}>
          <FilterMultiSelect
            testId="infohub-member-filter"
            icon={<User size={14} className="text-muted-foreground shrink-0" />}
            options={[...teamMembers].sort((a, b) => a.name.localeCompare(b.name)).map(m => ({ id: m.id, label: m.name }))}
            selected={draft.memberIds}
            onChange={ids => updateDraft({ memberIds: ids })}
            allLabel={t("filters.allMembers")}
          />
        </FilterField>
        {subTab === "library" ? (
          <>
            <FilterField label={t("filters.tags")}>
              <FilterMultiSelect
                testId="infohub-tag-filter"
                icon={<Tag size={14} className="text-muted-foreground shrink-0" />}
                options={tagOptions.map(tag => ({ id: tag, label: tag }))}
                selected={draft.tags}
                onChange={tags => updateDraft({ tags })}
                allLabel={t("filters.allTags")}
                noOptionsLabel={t("filters.noTags")}
              />
            </FilterField>
            <FilterField label={t("filters.type")}>
              <div className="relative">
                <Files size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                <select
                  data-testid="infohub-type-filter"
                  value={draft.kind}
                  onChange={e => updateDraft({ kind: e.target.value as DocKind })}
                  className="w-full appearance-none rounded-xl border border-border bg-background py-2.5 pl-9 pr-8 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="all">{t("filters.allTypes")}</option>
                  <option value="written">{t("filters.typeWritten")}</option>
                  <option value="file">{t("filters.typeFile")}</option>
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              </div>
            </FilterField>
          </>
        ) : (
          <FilterField label={t("filters.progress")}>
            <div className="relative">
              <CheckCircle2 size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <select
                data-testid="infohub-progress-filter"
                value={draft.progress}
                onChange={e => updateDraft({ progress: e.target.value as Progress })}
                className="w-full appearance-none rounded-xl border border-border bg-background py-2.5 pl-9 pr-8 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="all">{t("filters.allProgress")}</option>
                <option value="completed">{t("filters.completed")}</option>
                <option value="incomplete">{t("filters.notCompleted")}</option>
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            </div>
          </FilterField>
        )}
      </FiltersPopover>

      {/* Sub-tab toggle */}
      <div className="flex gap-1 bg-muted rounded-xl p-1">
        {([
          { key: "library" as const, label: t("tabs.library"), icon: BookOpen },
          { key: "training" as const, label: t("tabs.training"), icon: GraduationCap },
        ]).map(({ key, label, icon: Icon }) => (
          <button key={key}
            onClick={() => {
              setCurrentLibFolder(null);
              setCurrentTrainFolder(null);
              navigate(key === "library" ? "/infohub/library" : "/infohub/training");
            }}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium rounded-lg transition-colors",
              subTab === key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon size={13} />
            {label}
          </button>
        ))}
      </div>

      <ActiveFilterChips testIdPrefix="infohub" chips={filterChips} onClearAll={() => setCurrentFilters(DEFAULT_INFOHUB_FILTERS)} />

      {/* ─── Library Tab ─── */}
      {subTab === "library" && (
        <>
          <FolderBreadcrumb folders={libFolders} currentId={currentLibFolder} onNavigate={setCurrentLibFolder} />

          {accessibleLibFolders.length > 0 && (
            <>
              <p className="section-label">{t("folders")}</p>
              <div className="card-surface divide-y divide-border">
                {accessibleLibFolders.map((folder, idx) => (
                  <div key={folder.id} className="relative"
                    draggable
                    onDragStart={() => libDrag.handleDragStart(idx)}
                    onDragOver={e => libDrag.handleDragOver(e, idx)}
                    onDragEnd={libDrag.handleDragEnd}
                  >
                    <div
                      className={cn(
                        "flex items-center gap-3 px-4 py-4 transition-colors cursor-pointer hover:bg-muted/30",
                        libDrag.dragIdx === idx && "opacity-50"
                      )}
                      onClick={() => setCurrentLibFolder(folder.id)}
                    >
                      <GripVertical size={14} className="text-muted-foreground/40 shrink-0 cursor-grab" />
                      <div className="w-9 h-9 rounded-xl bg-sage-light flex items-center justify-center shrink-0">
                        <Folder size={16} className="text-sage-deep" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-foreground">{folder.name}</p>
                          {folder.access.accessScope === "restricted" && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                              <Lock size={10} />
                              {t("restricted")}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {t("docCount", { count: countDocsInFolder(folder.id, libFolders, filteredLibDocs) })}
                          {libFolders.filter(f => f.parentId === folder.id).length > 0 &&
                            ` · ${t("subfolderCount", { count: libFolders.filter(f => f.parentId === folder.id).length })}`
                          }
                        </p>
                      </div>
                      <button
                        onClick={e => { e.stopPropagation(); setOpenMenuId(openMenuId === folder.id ? null : folder.id); }}
                        className="btn-icon shrink-0"
                        aria-label={t("openOptions")}
                      >
                        <MoreVertical size={16} className="text-muted-foreground" />
                      </button>
                    </div>
                    <ItemContextMenu
                      open={openMenuId === folder.id}
                      onClose={() => setOpenMenuId(null)}
                      actions={folderActions(folder, "library")}
                    />
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Documents in current folder */}
          {(currentLibFolder || normalizedSearch) && accessibleDocsInCurrentFolder.length > 0 && (
            <>
              <p className="section-label">{t("documents")}</p>
              <div className="card-surface divide-y divide-border">
                {accessibleDocsInCurrentFolder.map(doc => (
                  <div key={doc.id} className="relative">
                    <div
                      onClick={() => handleOpenLibDoc(doc)}
                      className="w-full flex items-center gap-3 px-4 py-4 text-left hover:bg-muted/30 transition-colors cursor-pointer"
                    >
                      <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center shrink-0", doc.filePath ? "bg-lavender-light" : "bg-sage-light")}>
                        <FileText size={16} className={doc.filePath ? "text-lavender-deep" : "text-sage-deep"} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-foreground">{doc.title}</p>
                          {doc.access.accessScope === "restricted" && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                              <Lock size={10} />
                              {t("restricted")}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{doc.lastUpdated}</p>
                        <p className="text-xs text-muted-foreground/70 mt-0.5 truncate">{doc.summary}</p>
                      </div>
                      <button
                        onClick={e => { e.stopPropagation(); setAiSheetDocTitle(doc.title); }}
                        aria-label={t("openAiTools", { title: doc.title })}
                        className="p-1.5 rounded-full hover:bg-lavender-light transition-colors shrink-0"
                      >
                        <Sparkles size={14} className="text-lavender-deep" />
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); setOpenMenuId(openMenuId === doc.id ? null : doc.id); }}
                        className="btn-icon shrink-0"
                        aria-label={t("openOptions")}
                      >
                        <MoreVertical size={16} className="text-muted-foreground" />
                      </button>
                    </div>
                    <ItemContextMenu
                      open={openMenuId === doc.id}
                      onClose={() => setOpenMenuId(null)}
                      actions={docActions(doc, "library")}
                    />
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Empty state */}
          {accessibleLibFolders.length === 0 && accessibleDocsInCurrentFolder.length === 0 && (
            <button onClick={() => setShowPlusMenu(true)}
              className="card-surface p-8 text-center w-full hover:bg-muted/30 transition-colors cursor-pointer">
              <div className="w-10 h-10 rounded-full bg-sage-light flex items-center justify-center mx-auto mb-2">
                <Plus size={18} className="text-sage-deep" />
              </div>
              <p className="text-sm text-muted-foreground">
                {normalizedSearch || isLibFiltering
                  ? t("emptyState.noMatchLibrary")
                  : currentLibFolder ? t("emptyState.folderEmpty") : t("emptyState.noFolders")}
              </p>
              <p className="text-xs text-muted-foreground mt-1">{t("emptyState.tapToCreate")}</p>
            </button>
          )}
          {archivedLibDocs.length > 0 && (
            <>
              <button
                onClick={() => setShowArchived(v => !v)}
                className="flex items-center gap-1.5 section-label hover:text-foreground transition-colors w-full"
              >
                <Archive size={12} />
                {t("archived")}
                <ChevronRight size={12} className={cn("ml-0.5 transition-transform", showArchived && "rotate-90")} />
              </button>
              {showArchived && (
                <div className="card-surface divide-y divide-border">
                  {archivedLibDocs.map(doc => (
                    <div key={doc.id} className="flex items-center gap-3 px-4 py-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-muted-foreground line-through truncate">{doc.title}</p>
                        <p className="text-xs text-muted-foreground/60 mt-0.5">{doc.lastUpdated}</p>
                      </div>
                      <button
                        onClick={() => handleRestoreDoc(doc.id)}
                        className="text-xs text-sage font-medium px-2.5 py-1 rounded-lg hover:bg-sage-light transition-colors shrink-0"
                      >
                        {t("restore")}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* ─── Training Tab ─── */}
      {subTab === "training" && (
        <>

          <FolderBreadcrumb folders={trainFolders} currentId={currentTrainFolder} onNavigate={setCurrentTrainFolder} />

          {accessibleTrainFolders.length > 0 && (
            <>
              <p className="section-label">{t("folders")}</p>
              <div className="card-surface divide-y divide-border">
                {accessibleTrainFolders.map((folder, idx) => (
                  <div key={folder.id} className="relative"
                    draggable
                    onDragStart={() => trainDrag.handleDragStart(idx)}
                    onDragOver={e => trainDrag.handleDragOver(e, idx)}
                    onDragEnd={trainDrag.handleDragEnd}
                  >
                    <div
                      className={cn(
                        "flex items-center gap-3 px-4 py-4 transition-colors cursor-pointer hover:bg-muted/30",
                        trainDrag.dragIdx === idx && "opacity-50"
                      )}
                      onClick={() => setCurrentTrainFolder(folder.id)}
                    >
                      <GripVertical size={14} className="text-muted-foreground/40 shrink-0 cursor-grab" />
                      <div className="w-9 h-9 rounded-xl bg-lavender-light flex items-center justify-center shrink-0">
                        <Folder size={16} className="text-lavender-deep" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-foreground">{folder.name}</p>
                          {folder.access.accessScope === "restricted" && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                              <Lock size={10} />
                              {t("restricted")}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{t("moduleCount", { count: countTrainingDocsInFolder(folder.id, trainFolders, filteredTrainDocs) })}</p>
                      </div>
                      <button
                        onClick={e => { e.stopPropagation(); setOpenMenuId(openMenuId === folder.id ? null : folder.id); }}
                        className="btn-icon shrink-0"
                        aria-label={t("openOptions")}
                      >
                        <MoreVertical size={16} className="text-muted-foreground" />
                      </button>
                    </div>
                    <ItemContextMenu
                      open={openMenuId === folder.id}
                      onClose={() => setOpenMenuId(null)}
                      actions={folderActions(folder, "training")}
                    />
                  </div>
                ))}
              </div>
            </>
          )}

          {(currentTrainFolder || normalizedSearch) && accessibleDocsInCurrentTrainFolder.length > 0 && (
            <>
              <p className="section-label">{t("modules")}</p>
              <div className="card-surface divide-y divide-border">
                {accessibleDocsInCurrentTrainFolder.map(doc => (
                  <div key={doc.id} className="relative">
                    <div
                      onClick={() => setSelectedTrainingDoc(doc)}
                      className="w-full flex items-center gap-3 px-4 py-4 text-left hover:bg-muted/30 transition-colors cursor-pointer"
                    >
                      <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center shrink-0",
                        doc.completed ? "bg-sage-light" : "bg-muted")}>
                        {doc.completed ? <CheckCircle size={17} className="text-sage-deep" /> : <Play size={17} className="text-muted-foreground" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-foreground">{doc.title}</p>
                          {doc.access.accessScope === "restricted" && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                              <Lock size={10} />
                              {t("restricted")}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{t("durationSteps", { duration: doc.duration, count: doc.steps.length })}</p>
                      </div>
                      <button
                        onClick={e => { e.stopPropagation(); setAiSheetDocTitle(doc.title); }}
                        aria-label={t("openAiTools", { title: doc.title })}
                        className="p-1.5 rounded-full hover:bg-lavender-light transition-colors shrink-0"
                      >
                        <Sparkles size={14} className="text-lavender-deep" />
                      </button>
                      {doc.completed && (
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium status-ok shrink-0">{t("done")}</span>
                      )}
                      <button
                        onClick={e => { e.stopPropagation(); setOpenMenuId(openMenuId === doc.id ? null : doc.id); }}
                        className="btn-icon shrink-0"
                        aria-label={t("openOptions")}
                      >
                        <MoreVertical size={16} className="text-muted-foreground" />
                      </button>
                    </div>
                    <ItemContextMenu
                      open={openMenuId === doc.id}
                      onClose={() => setOpenMenuId(null)}
                      actions={docActions(doc, "training")}
                    />
                  </div>
                ))}
              </div>
            </>
          )}

          {accessibleTrainFolders.length === 0 && accessibleDocsInCurrentTrainFolder.length === 0 && (currentTrainFolder || normalizedSearch) && (
            <button onClick={() => setShowPlusMenu(true)}
              className="card-surface p-8 text-center w-full hover:bg-muted/30 transition-colors cursor-pointer">
              <div className="w-10 h-10 rounded-full bg-lavender-light flex items-center justify-center mx-auto mb-2">
                <Plus size={18} className="text-lavender-deep" />
              </div>
              <p className="text-sm text-muted-foreground">
                {normalizedSearch || isTrainFiltering ? t("emptyState.noMatchTraining") : t("emptyState.folderEmpty")}
              </p>
              <p className="text-xs text-muted-foreground mt-1">{t("emptyState.tapToCreate")}</p>
            </button>
          )}
        </>
      )}

      {/* Modals */}
      {showPlusMenu && (
        <PlusMenu onClose={() => setShowPlusMenu(false)} onAction={action => {
          setShowPlusMenu(false);
          if (action === "folder") setShowCreateFolder(true);
          if (action === "document") setShowCreateDoc(true);
          if (action === "upload") setShowUploadDoc(true);
        }} />
      )}
      {showCreateFolder && (
        <CreateFolderModal
          parentId={subTab === "library" ? currentLibFolder : currentTrainFolder}
          onClose={() => setShowCreateFolder(false)}
          onSave={(name, parentId) => {
            if (subTab === "library") handleCreateLibFolder(name, parentId);
            else handleCreateTrainFolder(name, parentId);
          }}
        />
      )}
      {showCreateDoc && (
        <CreateDocModal
          folderId={subTab === "library" ? currentLibFolder : currentTrainFolder}
          folders={subTab === "library" ? allLibFolderOptions : allTrainFolderOptions}
          onClose={() => setShowCreateDoc(false)}
          onSave={(title, folderId, tags) => {
            if (subTab === "library") {
              handleCreateLibDoc(title, folderId, tags);
              return;
            }

            createDocument.mutate({ section: "training", title, folderId });
          }}
        />
      )}
      {showUploadDoc && (
        <UploadDocModal
          folderId={subTab === "library" ? currentLibFolder : currentTrainFolder}
          folders={subTab === "library" ? allLibFolderOptions : allTrainFolderOptions}
          onClose={() => setShowUploadDoc(false)}
          onSave={(title, folderId, filePath, fileType, tags) => {
            createDocument.mutate({
              section: subTab === "library" ? "library" : "training",
              title,
              folderId,
              filePath,
              fileType,
              tags,
            });
          }}
        />
      )}
      {filePreview && (
        <FilePreviewModal
          signedUrl={filePreview.signedUrl}
          fileType={filePreview.fileType}
          title={filePreview.title}
          onClose={() => setFilePreview(null)}
        />
      )}
      {accessTarget && (
        <ManageAccessModal
          target={accessTarget}
          teamMembers={teamMembers.map(member => ({ id: member.id, name: member.name, role: member.role }))}
          locations={locations.map(location => ({ id: location.id, name: location.name }))}
          roleOptions={roleOptions}
          onClose={() => setAccessTarget(null)}
          onSave={(access) => handleSaveAccess(accessTarget, access)}
        />
      )}
      {aiSheetDocTitle && (
        <AIActionsSheet
          docTitle={aiSheetDocTitle}
          sourceLabel={subTab === "library" ? t("aiSheet.libraryDocument") : t("aiSheet.trainingModule")}
          sourceText={
            subTab === "library"
              ? (libDocs.find(doc => doc.title === aiSheetDocTitle)?.content ?? "")
              : (trainDocs.find(doc => doc.title === aiSheetDocTitle)?.steps.join("\n\n") ?? "")
          }
          onClose={() => setAiSheetDocTitle(null)}
        />
      )}
      {moveTarget && (
        <MoveToFolderSheet
          folders={(moveTarget.section === "library" ? libFolders : trainFolders).filter(f => f.id !== moveTarget.id)}
          currentParentId={moveTarget.type === "folder"
            ? (moveTarget.section === "library" ? libFolders : trainFolders).find(f => f.id === moveTarget.id)?.parentId ?? null
            : null
          }
          onClose={() => setMoveTarget(null)}
          onMove={(targetId) => {
            if (moveTarget.type === "folder") handleMoveFolder(moveTarget.id, targetId, moveTarget.section);
            else handleMoveDoc(moveTarget.id, targetId, moveTarget.section);
            setMoveTarget(null);
          }}
        />
      )}
      {renameTarget && (
        <RenameFolderModal
          currentName={renameTarget.name}
          onClose={() => setRenameTarget(null)}
          onSave={(newName) => {
            handleRenameFolder(renameTarget.id, newName, renameTarget.section);
            setRenameTarget(null);
          }}
        />
      )}
    </Layout>
  );
}
