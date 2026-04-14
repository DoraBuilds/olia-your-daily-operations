import { useState, useMemo, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { useAuth } from "@/contexts/AuthContext";
import { useInfohubContent } from "@/hooks/useInfohubContent";
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { canAccessInfohubContent, canManageInfohubAccess, type InfohubAccessControl, type InfohubPrincipal } from "@/lib/infohub-access";
import type { InfohubLibraryDoc as DocItem, InfohubLibraryFolder as FolderItem, InfohubTrainingDoc as TrainingDoc, InfohubTrainingFolder as TrainingFolder } from "@/lib/infohub-catalog";
import { type AccessTarget, type SubTab } from "./infohub/infohub-types";
import { countDocsInFolder, countTrainingDocsInFolder, sortFolders, useDragReorder } from "./infohub/infohub-utils";
import { AIActionsSheet, CreateDocModal, CreateFolderModal, FolderBreadcrumb, ItemContextMenu, ManageAccessModal, MoveToFolderSheet, PlusMenu, RenameFolderModal, SearchOverlay } from "./infohub/InfohubShared";
import { LibraryDocDetail, TrainingDocDetail } from "./infohub/InfohubDocumentViews";

// ─── Infohub Page ─────────────────────────────────────────────────────────────

export default function Infohub() {
  const location = useLocation();
  const navigate = useNavigate();
  const { teamMember } = useAuth();
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
    isOwner: teamMember?.role === "Owner",
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

  // Sorted folder lists
  const visibleLibFolders = useMemo(() =>
    sortFolders(libFolders.filter((folder) => {
      if (normalizedSearch) return folder.name.toLowerCase().includes(normalizedSearch);
      return folder.parentId === currentLibFolder;
    })),
    [libFolders, currentLibFolder, normalizedSearch]
  );
  const accessibleLibFolders = useMemo(() =>
    visibleLibFolders.filter(folder => canAccessInfohubContent(folder.access, currentPrincipal)),
    [visibleLibFolders, currentPrincipal]
  );
  const docsInCurrentFolder = useMemo(() =>
    (normalizedSearch
      ? libDocs.filter((doc) =>
          doc.title.toLowerCase().includes(normalizedSearch)
          || doc.summary.toLowerCase().includes(normalizedSearch)
        )
      : currentLibFolder
        ? libDocs.filter(d => d.folderId === currentLibFolder)
        : []
    ).sort((a, b) => a.title.localeCompare(b.title)),
    [libDocs, currentLibFolder, normalizedSearch]
  );
  const accessibleDocsInCurrentFolder = useMemo(() =>
    docsInCurrentFolder.filter(doc => canAccessInfohubContent(doc.access, currentPrincipal)),
    [docsInCurrentFolder, currentPrincipal]
  );
  const visibleTrainFolders = useMemo(() =>
    sortFolders(trainFolders.filter((folder) => {
      if (normalizedSearch) return folder.name.toLowerCase().includes(normalizedSearch);
      return folder.parentId === currentTrainFolder;
    })),
    [trainFolders, currentTrainFolder, normalizedSearch]
  );
  const accessibleTrainFolders = useMemo(() =>
    visibleTrainFolders.filter(folder => canAccessInfohubContent(folder.access, currentPrincipal)),
    [visibleTrainFolders, currentPrincipal]
  );
  const docsInCurrentTrainFolder = useMemo(() =>
    normalizedSearch
      ? trainDocs.filter(d => d.title.toLowerCase().includes(normalizedSearch))
      : currentTrainFolder
        ? trainDocs.filter(d => d.folderId === currentTrainFolder)
        : [],
    [trainDocs, currentTrainFolder, normalizedSearch]
  );
  const accessibleDocsInCurrentTrainFolder = useMemo(() =>
    docsInCurrentTrainFolder.filter(doc => canAccessInfohubContent(doc.access, currentPrincipal)),
    [docsInCurrentTrainFolder, currentPrincipal]
  );
  const visibleLibDocs = useMemo(() =>
    libDocs.filter(doc => canAccessInfohubContent(doc.access, currentPrincipal)),
    [libDocs, currentPrincipal]
  );
  const visibleTrainDocs = useMemo(() =>
    trainDocs.filter(doc => canAccessInfohubContent(doc.access, currentPrincipal)),
    [trainDocs, currentPrincipal]
  );

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

  const subtitle = subTab === "library" ? "Documents & SOPs" : "Staff training modules";

  // Folder menu actions
  const folderActions = (folder: { id: string; name: string; access: InfohubAccessControl }, section: "library" | "training") => {
    const actions = [
      { label: "Move to folder", icon: <FolderInput size={16} className="text-muted-foreground" />, onClick: () => setMoveTarget({ type: "folder", id: folder.id, section }) },
      { label: "Rename folder", icon: <Pencil size={16} className="text-muted-foreground" />, onClick: () => setRenameTarget({ id: folder.id, name: folder.name, section }) },
    ];
    if (canManageAccess) {
      actions.push({
        label: "Manage access",
        icon: <Shield size={16} className="text-muted-foreground" />,
        onClick: () => setAccessTarget({ id: folder.id, type: "folder", section, name: folder.name, access: folder.access }),
      });
    }
    actions.push({ label: "Archive folder", icon: <Archive size={16} className="text-muted-foreground" />, onClick: () => handleArchiveFolder(folder.id, section) });
    return actions;
  };

  const docActions = (doc: DocItem | TrainingDoc, section: "library" | "training") => {
    const actions = [
      { label: "Move to folder", icon: <FolderInput size={16} className="text-muted-foreground" />, onClick: () => setMoveTarget({ type: "doc", id: doc.id, section }) },
      {
        label: "Download file",
        icon: <Download size={16} className="text-muted-foreground" />,
        onClick: () => {
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
        label: "Manage access",
        icon: <Shield size={16} className="text-muted-foreground" />,
        onClick: () => setAccessTarget({ id: doc.id, type: "doc", section, name: doc.title, access: doc.access }),
      });
    }
    actions.push({ label: "Archive file", icon: <Archive size={16} className="text-muted-foreground" />, onClick: () => handleArchiveDoc(doc.id, section) });
    return actions;
  };

  return (
    <Layout title="Infohub" subtitle={subtitle}
    >
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder={subTab === "library" ? "Search documents and folders…" : "Search training and folders…"}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full rounded-xl border border-border bg-card py-2.5 pl-9 pr-4 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <button
          onClick={() => setShowPlusMenu(true)}
          aria-label="Add content"
          className="flex h-10 w-10 items-center justify-center rounded-xl bg-sage text-primary-foreground transition-colors hover:bg-sage-deep shrink-0"
        >
          <Plus size={18} />
        </button>
      </div>

      {/* Sub-tab toggle */}
      <div className="flex gap-1 bg-muted rounded-xl p-1 md:hidden">
        {([
          { key: "library" as const, label: "Library", icon: BookOpen },
          { key: "training" as const, label: "Training", icon: GraduationCap },
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

      {/* ─── Library Tab ─── */}
      {subTab === "library" && (
        <>
          <FolderBreadcrumb folders={libFolders} currentId={currentLibFolder} onNavigate={setCurrentLibFolder} />

          {accessibleLibFolders.length > 0 && (
            <>
              <p className="section-label">Folders</p>
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
                            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                              <Lock size={10} />
                              Restricted
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {countDocsInFolder(folder.id, libFolders, libDocs)} {countDocsInFolder(folder.id, libFolders, libDocs) === 1 ? "document" : "documents"}
                          {libFolders.filter(f => f.parentId === folder.id).length > 0 &&
                            ` · ${libFolders.filter(f => f.parentId === folder.id).length} subfolder${libFolders.filter(f => f.parentId === folder.id).length > 1 ? 's' : ''}`
                          }
                        </p>
                      </div>
                      <button
                        onClick={e => { e.stopPropagation(); setOpenMenuId(openMenuId === folder.id ? null : folder.id); }}
                        className="p-1.5 rounded-full hover:bg-muted transition-colors shrink-0"
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
              <p className="section-label">Documents</p>
              <div className="card-surface divide-y divide-border">
                {accessibleDocsInCurrentFolder.map(doc => (
                  <div key={doc.id} className="relative">
                    <div
                      onClick={() => setSelectedDoc(doc)}
                      className="w-full flex items-center gap-3 px-4 py-4 text-left hover:bg-muted/30 transition-colors cursor-pointer"
                    >
                      <div className="w-9 h-9 rounded-xl bg-sage-light flex items-center justify-center shrink-0">
                        <FileText size={16} className="text-sage-deep" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-foreground">{doc.title}</p>
                          {doc.access.accessScope === "restricted" && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                              <Lock size={10} />
                              Restricted
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{doc.lastUpdated}</p>
                        <p className="text-xs text-muted-foreground/70 mt-0.5 truncate">{doc.summary}</p>
                      </div>
                      <button
                        onClick={e => { e.stopPropagation(); setAiSheetDocTitle(doc.title); }}
                        aria-label={`Open AI tools for ${doc.title}`}
                        className="p-1.5 rounded-full hover:bg-lavender-light transition-colors shrink-0"
                      >
                        <Sparkles size={14} className="text-lavender-deep" />
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); setOpenMenuId(openMenuId === doc.id ? null : doc.id); }}
                        className="p-1.5 rounded-full hover:bg-muted transition-colors shrink-0"
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
                {normalizedSearch
                  ? "No matching library items."
                  : currentLibFolder ? "This folder is empty." : "No folders yet."}
              </p>
              <p className="text-xs text-muted-foreground mt-1">Tap to create a folder or document.</p>
            </button>
          )}
          {archivedLibDocs.length > 0 && (
            <>
              <button
                onClick={() => setShowArchived(v => !v)}
                className="flex items-center gap-1.5 section-label hover:text-foreground transition-colors w-full"
              >
                <Archive size={12} />
                Archived ({archivedLibDocs.length})
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
                        Restore
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
              <p className="section-label">Folders</p>
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
                            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                              <Lock size={10} />
                              Restricted
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{countTrainingDocsInFolder(folder.id, trainFolders, trainDocs)} modules</p>
                      </div>
                      <button
                        onClick={e => { e.stopPropagation(); setOpenMenuId(openMenuId === folder.id ? null : folder.id); }}
                        className="p-1.5 rounded-full hover:bg-muted transition-colors shrink-0"
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
              <p className="section-label">Modules</p>
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
                            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                              <Lock size={10} />
                              Restricted
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{doc.duration} · {doc.steps.length} steps</p>
                      </div>
                      <button
                        onClick={e => { e.stopPropagation(); setAiSheetDocTitle(doc.title); }}
                        aria-label={`Open AI tools for ${doc.title}`}
                        className="p-1.5 rounded-full hover:bg-lavender-light transition-colors shrink-0"
                      >
                        <Sparkles size={14} className="text-lavender-deep" />
                      </button>
                      {doc.completed && (
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium status-ok shrink-0">Done</span>
                      )}
                      <button
                        onClick={e => { e.stopPropagation(); setOpenMenuId(openMenuId === doc.id ? null : doc.id); }}
                        className="p-1.5 rounded-full hover:bg-muted transition-colors shrink-0"
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
                {normalizedSearch ? "No matching training items." : "This folder is empty."}
              </p>
              <p className="text-xs text-muted-foreground mt-1">Tap to create a folder or document.</p>
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
          if (action === "upload") setShowCreateDoc(true);
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
          sourceLabel={subTab === "library" ? "library document" : "training module"}
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
