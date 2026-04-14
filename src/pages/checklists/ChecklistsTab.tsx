import { useState, useEffect, lazy, Suspense } from "react";
import { useSearchParams } from "react-router-dom";
import { Plus, Search, ChevronDown, X, GripVertical, MoreVertical, FolderPlus, ClipboardList, Eye, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FolderItem, ChecklistItem, SectionDef } from "./types";
import { getScheduleLabel } from "./types";
import { useFolders, useSaveFolder, useDeleteFolder, useChecklists, useSaveChecklist, useDeleteChecklist } from "@/hooks/useChecklists";
import { useLocations } from "@/hooks/useLocations";
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
  checklist: { location_id: string | null; location_ids?: string[] | null },
  locationId: string,
) {
  const assignedIds = checklist.location_ids?.length
    ? checklist.location_ids
    : (checklist.location_id ? [checklist.location_id] : null);

  if (!assignedIds || assignedIds.length === 0) return true;
  return assignedIds.includes(locationId);
}

export function ChecklistsTab() {
  const [searchParams] = useSearchParams();
  const { can } = usePlan();
  const { data: dbLocations = [] } = useLocations();
  const locationOptions = ["All locations", ...dbLocations.map(l => l.name)];

  // DB data
  const { data: dbFolders = [] } = useFolders();
  const { data: dbChecklists = [] } = useChecklists();
  const saveFolderMut = useSaveFolder();
  const deleteFolderMut = useDeleteFolder();
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
    start_date: c.start_date ?? null,
    createdAt: c.created_at,
    sections: c.sections as SectionDef[],
    due_time: c.due_time ?? null,
    visibility_from: c.visibility_from ?? null,
    visibility_until: c.visibility_until ?? null,
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

  // Local drag-drop order state (visual only — no DB ordering column yet)
  const [folderOrder, setFolderOrder] = useState<string[]>([]);
  useEffect(() => { setFolderOrder(dbFolders.map(f => f.id)); }, [dbFolders]);

  const [currentFolder, setCurrentFolder] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedLocation, setSelectedLocation] = useState("All locations");
  const [showLocationDrop, setShowLocationDrop] = useState(false);
  const [showCreateMenu, setShowCreateMenu] = useState(false);
  const [showBuilder, setShowBuilder] = useState(false);
  const [showConvertFile, setShowConvertFile] = useState(false);
  const [showBuildAI, setShowBuildAI] = useState(false);
  const [upgradeFeature, setUpgradeFeature] = useState<string | null>(null);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [contextMenu, setContextMenu] = useState<{ id: string; type: "folder" | "checklist" } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; type: "folder" | "checklist"; name: string } | null>(null);
  const [moveTarget, setMoveTarget] = useState<{ id: string; type: "folder" | "checklist" } | null>(null);
  const [renameTarget, setRenameTarget] = useState<{ id: string; name: string } | null>(null);
  const [prefillTitle, setPrefillTitle] = useState("");
  const [prefillSections, setPrefillSections] = useState<SectionDef[] | undefined>(undefined);
  const [prefillLocationIds, setPrefillLocationIds] = useState<string[] | null | undefined>(undefined);
  const [dragFolderId, setDragFolderId] = useState<string | null>(null);
  const [editingChecklistId, setEditingChecklistId] = useState<string | null>(null);
  const [previewChecklist, setPreviewChecklist] = useState<ChecklistItem | null>(null);
  const editingChecklist = editingChecklistId ? dbChecklists.find(c => c.id === editingChecklistId) : null;
  const normalizedSearch = search.trim().toLowerCase();
  const visibleFolders = [...folders]
    .filter(f => normalizedSearch ? f.name.toLowerCase().includes(normalizedSearch) : f.parentId === currentFolder)
    .sort((a, b) => folderOrder.indexOf(a.id) - folderOrder.indexOf(b.id));
  const selectedLocationObj = dbLocations.find(l => l.name === selectedLocation);
  const visibleChecklists = checklists
    .filter(c => normalizedSearch ? c.title.toLowerCase().includes(normalizedSearch) : c.folderId === currentFolder)
    .filter(c => {
      if (selectedLocation === "All locations") return true;
      if (!selectedLocationObj) return true;
      return checklistAppliesToLocation(
        { location_id: c.location_id, location_ids: c.location_ids },
        selectedLocationObj.id,
      );
    });

  const isEmpty = visibleFolders.length === 0 && visibleChecklists.length === 0 && !normalizedSearch;

  const handleCreateFolder = () => {
    if (!newFolderName.trim()) return;
    saveFolderMut.mutate({ name: newFolderName.trim(), parent_id: currentFolder });
    setNewFolderName("");
    setShowNewFolder(false);
  };

  const moveFolderInList = (folderId: string, targetIdx: number) => {
    // Visual-only reorder (no DB ordering column yet)
    const siblings = visibleFolders;
    const fromIdx = siblings.findIndex(f => f.id === folderId);
    if (fromIdx < 0 || fromIdx === targetIdx) return;
    setFolderOrder(prev => {
      const copy = [...prev];
      const posA = copy.indexOf(folderId);
      const posB = copy.indexOf(siblings[targetIdx].id);
      [copy[posA], copy[posB]] = [copy[posB], copy[posA]];
      return copy;
    });
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
        setShowBuilder(true);
      }
    } else if (action === "move") {
      setMoveTarget(contextMenu);
    } else if (action === "rename" && contextMenu.type === "folder") {
      const folder = folders.find(f => f.id === contextMenu.id);
      if (folder) setRenameTarget({ id: folder.id, name: folder.name });
    } else if (action === "delete") {
      const name = contextMenu.type === "folder"
        ? folders.find(f => f.id === contextMenu.id)?.name ?? "this folder"
        : checklists.find(c => c.id === contextMenu.id)?.title ?? "this checklist";
      setDeleteConfirm({ id: contextMenu.id, type: contextMenu.type, name });
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
      <Suspense fallback={<div className="flex items-center justify-center py-20"><div className="w-8 h-8 rounded-xl bg-sage animate-pulse" /></div>}>
      <ChecklistBuilderModal
        asPage
        onClose={() => {
          setShowBuilder(false);
          setPrefillTitle("");
          setPrefillSections(undefined);
          setPrefillLocationIds(undefined);
          setEditingChecklistId(null);
        }}
        onAdd={item => {
          const locationIds = item.location_ids ?? null;
          saveChecklistMut.mutate({
            id: "",
            title: item.title,
            folder_id: currentFolder,
            location_id: item.location_id ?? null,
            location_ids: locationIds,
            start_date: item.start_date ?? null,
            sections: item.sections ?? [],
            schedule: item.schedule ?? null,
            time_of_day: "anytime",
            due_time: item.due_time ?? null,
            visibility_from: item.visibility_from ?? null,
            visibility_until: item.visibility_until ?? null,
          });
        }}
        onUpdate={(id, updates) => {
          const orig = dbChecklists.find(c => c.id === id);
          if (orig) saveChecklistMut.mutate({
            ...orig,
            title: updates.title ?? orig.title,
            sections: updates.sections ?? orig.sections,
            schedule: updates.schedule ?? orig.schedule,
            location_id: updates.location_id !== undefined ? updates.location_id : orig.location_id,
            location_ids: updates.location_ids !== undefined ? updates.location_ids : orig.location_ids,
            start_date: updates.start_date !== undefined ? updates.start_date : orig.start_date,
            time_of_day: "anytime",
            due_time: updates.due_time !== undefined ? updates.due_time : orig.due_time,
            visibility_from: updates.visibility_from !== undefined ? updates.visibility_from : (orig.visibility_from ?? null),
            visibility_until: updates.visibility_until !== undefined ? updates.visibility_until : (orig.visibility_until ?? null),
          });
        }}
        initialTitle={prefillTitle}
        initialSections={prefillSections}
        initialLocationIds={prefillLocationIds}
        initialSchedule={editingChecklist?.schedule ?? null}
        initialStartDate={editingChecklist?.start_date ?? null}
        initialVisibilityFrom={editingChecklist?.visibility_from ?? null}
        initialVisibilityUntil={editingChecklist?.visibility_until ?? null}
        editId={editingChecklistId || undefined}
      />
      </Suspense>
    );
  }

  return (
    <>
      {/* Location dropdown */}
      <div className="relative">
        <button onClick={() => setShowLocationDrop(v => !v)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border bg-card w-full text-sm text-foreground hover:bg-muted transition-colors">
          <span className="flex-1 text-left">{selectedLocation}</span>
          <ChevronDown size={14} className={cn("text-muted-foreground transition-transform", showLocationDrop && "rotate-180")} />
        </button>
        {showLocationDrop && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-xl shadow-lg z-30 overflow-hidden">
            {locationOptions.map(loc => (
              <button key={loc} onClick={() => { setSelectedLocation(loc); setShowLocationDrop(false); }}
                className={cn("w-full text-left px-4 py-3 text-sm transition-colors hover:bg-muted",
                  selectedLocation === loc ? "text-sage font-medium" : "text-foreground"
                )}>
                {loc}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Search + Plus */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input type="text" placeholder="Search checklists…" value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 border border-border rounded-xl text-sm bg-card focus:outline-none focus:ring-1 focus:ring-ring" />
        </div>
        <button
          data-testid="checklists-create-btn"
          onClick={() => setShowCreateMenu(true)}
          className="w-10 h-10 rounded-xl bg-sage text-primary-foreground flex items-center justify-center hover:bg-sage-deep transition-colors shrink-0">
          <Plus size={18} />
        </button>
      </div>

      {/* Breadcrumb */}
      <FolderBreadcrumb folders={folders} currentId={currentFolder} onNavigate={setCurrentFolder} />

      {/* Empty state */}
      {isEmpty ? (
        <button onClick={() => setShowCreateMenu(true)}
          className="card-surface p-10 flex flex-col items-center gap-3 text-center w-full hover:bg-muted/30 transition-colors active:scale-[0.99]">
          <div className="w-14 h-14 rounded-2xl bg-sage-light flex items-center justify-center">
            <Plus size={28} className="text-sage-deep" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">
              {currentFolder ? "This folder is empty" : "No checklists yet"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">Tap to create a checklist or folder</p>
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
                  <p className="text-xs text-muted-foreground">{folder.itemCount} items</p>
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
                setShowBuilder(true);
              }}
                className="flex-1 flex items-center gap-3 px-4 py-3.5 text-left hover:bg-muted/30 transition-colors">
                <div className="w-9 h-9 rounded-xl bg-lavender-light flex items-center justify-center shrink-0">
                  <ClipboardList size={16} className="text-lavender-deep" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{cl.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {cl.questionsCount} questions{cl.schedule ? ` · ${getScheduleLabel(cl.schedule)}` : ""}
                  </p>
                </div>
              </button>
              <button onClick={e => { e.stopPropagation(); setPreviewChecklist(cl); }}
                className="p-2 text-muted-foreground hover:text-sage transition-colors shrink-0"
                title="Preview checklist">
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
          onBuildOwn={() => setShowBuilder(true)}
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
        }} />}
        {showBuildAI && <BuildWithAIModal onClose={() => setShowBuildAI(false)} onGenerate={(title, sections) => {
          setPrefillTitle(title);
          setPrefillSections(sections);
          setShowBuilder(true);
        }} />}
        {previewChecklist && (
          <ChecklistPreviewModal checklist={previewChecklist} onClose={() => setPreviewChecklist(null)}
            onEdit={() => {
              setEditingChecklistId(previewChecklist.id);
              setPrefillTitle(previewChecklist.title);
              setPrefillSections(previewChecklist.sections);
              setPreviewChecklist(null);
              setShowBuilder(true);
            }}
          />
        )}
      </Suspense>

      {showNewFolder && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center pb-16 bg-foreground/20 backdrop-blur-sm animate-fade-in">
          <div className="bg-card w-full max-w-lg rounded-t-2xl p-5 pb-20 space-y-4 animate-fade-in">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg text-foreground">New folder</h2>
              <button onClick={() => setShowNewFolder(false)} className="p-1.5 rounded-full hover:bg-muted transition-colors">
                <X size={18} className="text-muted-foreground" />
              </button>
            </div>
            <input autoFocus type="text" placeholder="Folder name" value={newFolderName} onChange={e => setNewFolderName(e.target.value)}
              className="w-full border border-border rounded-xl px-4 py-3 text-sm bg-muted focus:outline-none focus:ring-1 focus:ring-ring" />
            <button disabled={!newFolderName.trim()} onClick={handleCreateFolder}
              className={cn("w-full py-3 rounded-xl text-sm font-medium transition-colors",
                newFolderName.trim() ? "bg-sage text-primary-foreground hover:bg-sage-deep" : "bg-muted text-muted-foreground cursor-not-allowed"
              )}>
              Create folder
            </button>
          </div>
        </div>
      )}

      {contextMenu && (
        <ItemContextMenu type={contextMenu.type} onAction={handleContextAction}
          onClose={() => setContextMenu(null)} />
      )}

      {deleteConfirm && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center pb-16 bg-foreground/20 backdrop-blur-sm animate-fade-in">
          <div className="bg-card w-full max-w-lg rounded-t-2xl p-5 pb-20 space-y-4 animate-fade-in">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-status-error/10 flex items-center justify-center shrink-0">
                <Trash2 size={18} className="text-status-error" />
              </div>
              <div>
                <h2 className="font-display text-base text-foreground">Delete {deleteConfirm.type}?</h2>
                <p className="text-xs text-muted-foreground mt-0.5 truncate">"{deleteConfirm.name}" will be permanently removed.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(null)}
                className="flex-1 py-3 rounded-xl border border-border text-sm font-medium text-foreground hover:bg-muted transition-colors">
                Cancel
              </button>
              <button onClick={() => {
                if (deleteConfirm.type === "folder") deleteFolderMut.mutate(deleteConfirm.id);
                else deleteChecklistMut.mutate(deleteConfirm.id);
                setDeleteConfirm(null);
              }}
                className="flex-1 py-3 rounded-xl bg-status-error text-white text-sm font-medium hover:opacity-90 transition-opacity">
                Delete permanently
              </button>
            </div>
          </div>
        </div>
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

      {renameTarget && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center pb-16 bg-foreground/20 backdrop-blur-sm animate-fade-in">
          <div className="bg-card w-full max-w-lg rounded-t-2xl p-5 pb-20 space-y-4 animate-fade-in">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg text-foreground">Rename folder</h2>
              <button onClick={() => setRenameTarget(null)} className="p-1.5 rounded-full hover:bg-muted transition-colors">
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
              Rename
            </button>
          </div>
        </div>
      )}
    </>
  );
}
