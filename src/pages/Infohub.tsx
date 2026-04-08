import { useState, useMemo, useRef, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { isInfohubAiResult, type InfohubAiAction, type InfohubAiResult } from "@/lib/infohub-ai";
import { useInfohubContent } from "@/hooks/useInfohubContent";
import { useTeamMembers } from "@/hooks/useTeamMembers";
import { useLocations } from "@/hooks/useLocations";
import { useTrainingProgress } from "@/hooks/useTrainingProgress";
import {
  BookOpen, ChevronRight, ChevronLeft, Search, FileText, Tag, X,
  Plus, FolderOpen, Upload, File, Sparkles, GraduationCap,
  Play, CheckCircle, Circle, Brain, ListChecks, HelpCircle, Loader2,
  Folder, GripVertical, MoreVertical, FolderInput, Pencil,
  Archive, Download, Shield, Lock
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import {
  DEFAULT_INFOHUB_ACCESS,
  canAccessInfohubContent,
  canManageInfohubAccess,
  type InfohubAccessControl,
  type InfohubPrincipal,
} from "@/lib/infohub-access";
import {
  type InfohubLibraryDoc as DocItem,
  type InfohubLibraryFolder as FolderItem,
  type InfohubTrainingDoc as TrainingDoc,
  type InfohubTrainingFolder as TrainingFolder,
} from "@/lib/infohub-catalog";

// ─── Types ───────────────────────────────────────────────────────────────────

type SubTab = "library" | "training";
type AccessTarget = {
  id: string;
  type: "folder" | "doc";
  section: "library" | "training";
  name: string;
  access: InfohubAccessControl;
};

function CenteredModalShell({
  children,
  onClose,
  maxWidthClass = "max-w-lg",
}: {
  children: React.ReactNode;
  onClose: () => void;
  maxWidthClass?: string;
}) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-foreground/30 px-4 pb-8 backdrop-blur-sm sm:items-center sm:px-6 sm:py-10"
      onClick={onClose}
    >
      <div
        className={cn(
          "relative w-full rounded-3xl border border-border bg-card p-5 pb-6 shadow-2xl animate-fade-in max-h-[85vh] overflow-y-auto",
          maxWidthClass,
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sortFolders<T extends { name: string; sortOrder: number | null }>(folders: T[]): T[] {
  return [...folders].sort((a, b) => {
    if (a.sortOrder !== null && b.sortOrder !== null) return a.sortOrder - b.sortOrder;
    if (a.sortOrder !== null) return -1;
    if (b.sortOrder !== null) return 1;
    return a.name.localeCompare(b.name);
  });
}

function countDocsInFolder(folderId: string, folders: FolderItem[], docs: DocItem[]): number {
  const directDocs = docs.filter(d => d.folderId === folderId).length;
  const childFolders = folders.filter(f => f.parentId === folderId);
  return directDocs + childFolders.reduce((sum, cf) => sum + countDocsInFolder(cf.id, folders, docs), 0);
}

function countTrainingDocsInFolder(folderId: string, folders: TrainingFolder[], docs: TrainingDoc[]): number {
  const directDocs = docs.filter(d => d.folderId === folderId).length;
  const childFolders = folders.filter(f => f.parentId === folderId);
  return directDocs + childFolders.reduce((sum, cf) => sum + countTrainingDocsInFolder(cf.id, folders, docs), 0);
}

// ─── Context Menu (3-dot) ─────────────────────────────────────────────────────

function ItemContextMenu({ open, onClose, actions }: {
  open: boolean;
  onClose: () => void;
  actions: { label: string; icon: React.ReactNode; onClick: () => void }[];
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div ref={ref} className="absolute right-0 top-full mt-1 z-50 bg-card border border-border rounded-xl shadow-lg min-w-[200px] py-1 animate-fade-in">
      {actions.map((a, i) => (
        <button
          key={i}
          onClick={(e) => { e.stopPropagation(); a.onClick(); onClose(); }}
          className="w-full flex items-center gap-3 px-4 py-3 text-left text-sm text-foreground hover:bg-muted/50 transition-colors"
        >
          {a.icon}
          {a.label}
        </button>
      ))}
    </div>
  );
}

// ─── Move to Folder Sheet ─────────────────────────────────────────────────────

function MoveToFolderSheet({ folders, currentParentId, onClose, onMove }: {
  folders: { id: string; name: string; parentId: string | null }[];
  currentParentId: string | null;
  onClose: () => void;
  onMove: (targetFolderId: string | null) => void;
}) {
  const [search, setSearch] = useState("");
  const q = search.toLowerCase();

  // Build folder tree for display
  const rootFolders = folders.filter(f => f.parentId === null && f.id !== currentParentId);
  const filteredFolders = q
    ? folders.filter(f => f.name.toLowerCase().includes(q) && f.id !== currentParentId)
    : rootFolders;

  const getSubfolders = (parentId: string) =>
    folders.filter(f => f.parentId === parentId && f.id !== currentParentId);

  return (
    <CenteredModalShell onClose={onClose}>
      <div className="space-y-3">
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-display text-base text-foreground">Move to folder</h3>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-muted transition-colors">
            <X size={18} className="text-muted-foreground" />
          </button>
        </div>
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search folders"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 text-sm bg-muted rounded-xl border-0 focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <div className="divide-y divide-border">
          {!q && (
            <button
              onClick={() => onMove(null)}
              className="w-full flex items-center gap-3 px-2 py-3 text-left hover:bg-muted/30 transition-colors rounded-lg"
            >
              <FolderOpen size={16} className="text-muted-foreground" />
              <span className="text-sm text-foreground">Root (no folder)</span>
            </button>
          )}
          {filteredFolders.map(folder => (
            <div key={folder.id}>
              <button
                onClick={() => onMove(folder.id)}
                className="w-full flex items-center gap-3 px-2 py-3 text-left hover:bg-muted/30 transition-colors rounded-lg"
              >
                <Folder size={16} className="text-sage-deep" />
                <span className="text-sm text-foreground">{folder.name}</span>
              </button>
              {!q && getSubfolders(folder.id).map(sub => (
                <button
                  key={sub.id}
                  onClick={() => onMove(sub.id)}
                  className="w-full flex items-center gap-3 pl-8 pr-2 py-3 text-left hover:bg-muted/30 transition-colors rounded-lg"
                >
                  <Folder size={14} className="text-muted-foreground" />
                  <span className="text-sm text-foreground">{sub.name}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
        {filteredFolders.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">No folders found.</p>
        )}
      </div>
    </CenteredModalShell>
  );
}

// ─── Create Folder Modal ──────────────────────────────────────────────────────

function CreateFolderModal({ parentId, onClose, onSave }: {
  parentId: string | null;
  onClose: () => void;
  onSave: (name: string, parentId: string | null) => void;
}) {
  const [name, setName] = useState("");
  return (
    <CenteredModalShell onClose={onClose}>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-base text-foreground">New folder</h3>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-muted transition-colors">
            <X size={18} className="text-muted-foreground" />
          </button>
        </div>
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">Folder name</label>
          <Input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Health & Safety" />
        </div>
        <button
          disabled={!name.trim()}
          onClick={() => { onSave(name.trim(), parentId); onClose(); }}
          className={cn(
            "w-full py-3 rounded-xl text-sm font-medium transition-colors",
            name.trim() ? "bg-primary text-primary-foreground hover:bg-primary/90" : "bg-muted text-muted-foreground"
          )}
        >
          Create folder
        </button>
      </div>
    </CenteredModalShell>
  );
}

// ─── Rename Folder Modal ──────────────────────────────────────────────────────

function RenameFolderModal({ currentName, onClose, onSave }: {
  currentName: string;
  onClose: () => void;
  onSave: (newName: string) => void;
}) {
  const [name, setName] = useState(currentName);
  return (
    <CenteredModalShell onClose={onClose}>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-base text-foreground">Rename folder</h3>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-muted transition-colors">
            <X size={18} className="text-muted-foreground" />
          </button>
        </div>
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">Folder name</label>
          <Input autoFocus value={name} onChange={e => setName(e.target.value)} />
        </div>
        <button
          disabled={!name.trim()}
          onClick={() => { onSave(name.trim()); onClose(); }}
          className={cn(
            "w-full py-3 rounded-xl text-sm font-medium transition-colors",
            name.trim() ? "bg-primary text-primary-foreground hover:bg-primary/90" : "bg-muted text-muted-foreground"
          )}
        >
          Rename
        </button>
      </div>
    </CenteredModalShell>
  );
}

// ─── Create Document Modal ────────────────────────────────────────────────────

function CreateDocModal({ folderId, folders, onClose, onSave }: {
  folderId: string | null;
  folders: { id: string; name: string }[];
  onClose: () => void;
  onSave: (title: string, folderId: string, tags: string[]) => void;
}) {
  const [title, setTitle] = useState("");
  const [selectedFolder, setSelectedFolder] = useState(folderId || folders[0]?.id || "");
  const [tagsInput, setTagsInput] = useState("");
  return (
    <CenteredModalShell onClose={onClose}>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-base text-foreground">New document</h3>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-muted transition-colors">
            <X size={18} className="text-muted-foreground" />
          </button>
        </div>
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">Title</label>
          <Input data-testid="doc-title-input" autoFocus value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Fire safety procedure" />
        </div>
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">Folder</label>
          <select
            value={selectedFolder}
            onChange={e => setSelectedFolder(e.target.value)}
            className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
          >
            {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </div>
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">Tags <span className="text-muted-foreground/60">(comma-separated, optional)</span></label>
          <Input data-testid="doc-tags-input" value={tagsInput} onChange={e => setTagsInput(e.target.value)} placeholder="e.g. Safety, Weekly, Kitchen" />
        </div>
        <button
          data-testid="create-doc-submit"
          disabled={!title.trim() || !selectedFolder}
          onClick={() => {
            const tags = tagsInput.split(",").map(t => t.trim()).filter(Boolean);
            onSave(title.trim(), selectedFolder, tags);
            onClose();
          }}
          className={cn(
            "w-full py-3 rounded-xl text-sm font-medium transition-colors",
            title.trim() && selectedFolder ? "bg-primary text-primary-foreground hover:bg-primary/90" : "bg-muted text-muted-foreground"
          )}
        >
          Create document
        </button>
      </div>
    </CenteredModalShell>
  );
}

// ─── Plus Menu ────────────────────────────────────────────────────────────────

function PlusMenu({ onClose, onAction }: {
  onClose: () => void;
  onAction: (action: "document" | "upload" | "folder") => void;
}) {
  return (
    <CenteredModalShell onClose={onClose} maxWidthClass="max-w-md">
      <div className="space-y-1">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-display text-base text-foreground">Create new</h3>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-muted transition-colors">
            <X size={18} className="text-muted-foreground" />
          </button>
        </div>
        <button onClick={() => onAction("document")} className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl hover:bg-muted/50 transition-colors text-left">
          <div className="w-9 h-9 rounded-xl bg-sage-light flex items-center justify-center">
            <FileText size={16} className="text-sage-deep" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">New document</p>
            <p className="text-xs text-muted-foreground">Create a new document from scratch</p>
          </div>
        </button>
        <button onClick={() => onAction("upload")} className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl hover:bg-muted/50 transition-colors text-left">
          <div className="w-9 h-9 rounded-xl bg-lavender-light flex items-center justify-center">
            <Upload size={16} className="text-lavender-deep" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">Upload file</p>
            <p className="text-xs text-muted-foreground">Upload a PDF, DOC, or image</p>
          </div>
        </button>
        <button onClick={() => onAction("folder")} className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl hover:bg-muted/50 transition-colors text-left">
          <div className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center">
            <FolderOpen size={16} className="text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">New folder</p>
            <p className="text-xs text-muted-foreground">Organise documents into a folder</p>
          </div>
        </button>
      </div>
    </CenteredModalShell>
  );
}

function ManageAccessModal({
  target,
  teamMembers,
  locations,
  roleOptions,
  onClose,
  onSave,
}: {
  target: AccessTarget;
  teamMembers: { id: string; name: string; role: string }[];
  locations: { id: string; name: string }[];
  roleOptions: string[];
  onClose: () => void;
  onSave: (access: InfohubAccessControl) => void;
}) {
  const [accessScope, setAccessScope] = useState<InfohubAccessControl["accessScope"]>(target.access.accessScope);
  const [allowedTeamMemberIds, setAllowedTeamMemberIds] = useState<string[]>(target.access.allowedTeamMemberIds);
  const [allowedRoles, setAllowedRoles] = useState<string[]>(target.access.allowedRoles);
  const [allowedLocationIds, setAllowedLocationIds] = useState<string[]>(target.access.allowedLocationIds);

  const toggleValue = (value: string, selected: string[], setSelected: (next: string[]) => void) => {
    setSelected(selected.includes(value)
      ? selected.filter((item) => item !== value)
      : [...selected, value]);
  };

  const save = () => {
    onSave({
      accessScope,
      allowedTeamMemberIds,
      allowedRoles,
      allowedLocationIds,
    });
    onClose();
  };

  return (
    <CenteredModalShell onClose={onClose} maxWidthClass="max-w-2xl">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-display text-base text-foreground">Manage access</h3>
            <p className="text-xs text-muted-foreground mt-1">{target.name}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-muted transition-colors">
            <X size={18} className="text-muted-foreground" />
          </button>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setAccessScope("org")}
            className={cn(
              "rounded-xl border px-4 py-3 text-left transition-colors",
              accessScope === "org" ? "border-sage bg-sage-light" : "border-border hover:border-sage/40",
            )}
          >
            <p className="text-sm font-medium text-foreground">Org-wide access</p>
            <p className="text-xs text-muted-foreground mt-1">Everyone in the organization can see this item.</p>
          </button>
          <button
            type="button"
            onClick={() => setAccessScope("restricted")}
            className={cn(
              "rounded-xl border px-4 py-3 text-left transition-colors",
              accessScope === "restricted" ? "border-sage bg-sage-light" : "border-border hover:border-sage/40",
            )}
          >
            <p className="text-sm font-medium text-foreground">Restricted access</p>
            <p className="text-xs text-muted-foreground mt-1">Limit visibility by person, role, or location.</p>
          </button>
        </div>

        {accessScope === "restricted" && (
          <div className="space-y-4">
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Team members</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {teamMembers.map((member) => (
                  <button
                    key={member.id}
                    type="button"
                    onClick={() => toggleValue(member.id, allowedTeamMemberIds, setAllowedTeamMemberIds)}
                    className={cn(
                      "rounded-xl border px-3 py-2 text-left transition-colors",
                      allowedTeamMemberIds.includes(member.id) ? "border-sage bg-sage-light" : "border-border hover:border-sage/40",
                    )}
                  >
                    <p className="text-sm font-medium text-foreground">{member.name}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{member.role}</p>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Roles</p>
              <div className="flex flex-wrap gap-2">
                {roleOptions.map((role) => (
                  <button
                    key={role}
                    type="button"
                    onClick={() => toggleValue(role, allowedRoles, setAllowedRoles)}
                    className={cn(
                      "px-3 py-1.5 rounded-full border text-xs transition-colors",
                      allowedRoles.includes(role) ? "border-sage bg-sage-light text-sage-deep" : "border-border text-muted-foreground hover:border-sage/40",
                    )}
                  >
                    {role}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Locations</p>
              <div className="flex flex-wrap gap-2">
                {locations.map((location) => (
                  <button
                    key={location.id}
                    type="button"
                    onClick={() => toggleValue(location.id, allowedLocationIds, setAllowedLocationIds)}
                    className={cn(
                      "px-3 py-1.5 rounded-full border text-xs transition-colors",
                      allowedLocationIds.includes(location.id) ? "border-sage bg-sage-light text-sage-deep" : "border-border text-muted-foreground hover:border-sage/40",
                    )}
                  >
                    {location.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={save}
          className="w-full py-3 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          Save access
        </button>
      </div>
    </CenteredModalShell>
  );
}

// ─── AI Actions Sheet ─────────────────────────────────────────────────────────

function AIActionsSheet({
  docTitle,
  sourceLabel,
  sourceText,
  onClose,
}: {
  docTitle: string;
  sourceLabel: string;
  sourceText: string;
  onClose: () => void;
}) {
  const [loadingAction, setLoadingAction] = useState<InfohubAiAction | null>(null);
  const [result, setResult] = useState<InfohubAiResult | null>(null);
  const [error, setError] = useState("");

  const runAction = async (action: InfohubAiAction) => {
    if (!sourceText.trim()) {
      setError("This document does not have enough content for AI generation.");
      return;
    }

    setLoadingAction(action);
    setError("");
    setResult(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke("infohub-ai-tools", {
        body: {
          action,
          title: docTitle,
          content: sourceText,
        },
      });

      if (fnError) throw new Error(fnError.message);
      if (data?.error) throw new Error(data.error);
      if (!isInfohubAiResult(data)) throw new Error("Unexpected AI response. Please try again.");

      setResult(data);
    } catch (err: any) {
      setError(err?.message ?? "Something went wrong. Please try again.");
    } finally {
      setLoadingAction(null);
    }
  };

  return (
    <CenteredModalShell onClose={onClose}>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-lavender-deep" />
            <h3 className="font-display text-base text-foreground">AI Tools</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-muted transition-colors">
            <X size={18} className="text-muted-foreground" />
          </button>
        </div>
        <div className="px-4 py-3 bg-muted/50 rounded-xl">
          <p className="text-xs text-muted-foreground">Generate study materials for "{docTitle}" from {sourceLabel} content.</p>
        </div>

        <div className="space-y-2">
          <button
            onClick={() => runAction("summary")}
            disabled={!!loadingAction}
            className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-left border border-border hover:border-lavender/40 hover:bg-muted/30 transition-colors disabled:opacity-60 disabled:cursor-wait"
          >
            <div className="w-9 h-9 rounded-xl bg-lavender-light flex items-center justify-center">
              {loadingAction === "summary" ? <Loader2 size={16} className="text-lavender-deep animate-spin" /> : <Brain size={16} className="text-lavender-deep" />}
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground">Generate summary</p>
              <p className="text-xs text-muted-foreground">AI-powered key points from this content</p>
            </div>
          </button>

          <button
            onClick={() => runAction("flashcards")}
            disabled={!!loadingAction}
            className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-left border border-border hover:border-sage/40 hover:bg-muted/30 transition-colors disabled:opacity-60 disabled:cursor-wait"
          >
            <div className="w-9 h-9 rounded-xl bg-sage-light flex items-center justify-center">
              {loadingAction === "flashcards" ? <Loader2 size={16} className="text-sage-deep animate-spin" /> : <ListChecks size={16} className="text-sage-deep" />}
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground">Create flashcards</p>
              <p className="text-xs text-muted-foreground">Turn content into review flashcards</p>
            </div>
          </button>

          <button
            onClick={() => runAction("quiz")}
            disabled={!!loadingAction}
            className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-left border border-border hover:border-sage/40 hover:bg-muted/30 transition-colors disabled:opacity-60 disabled:cursor-wait"
          >
            <div className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center">
              {loadingAction === "quiz" ? <Loader2 size={16} className="text-muted-foreground animate-spin" /> : <HelpCircle size={16} className="text-muted-foreground" />}
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground">Generate quiz</p>
              <p className="text-xs text-muted-foreground">Test understanding with auto-generated questions</p>
            </div>
          </button>
        </div>

        {error && (
          <div className="rounded-xl border border-status-error/20 bg-status-error/10 px-4 py-3">
            <p className="text-xs text-status-error">{error}</p>
          </div>
        )}

        {result && result.type === "summary" && (
          <div className="space-y-3 rounded-2xl border border-border bg-background p-4">
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Summary</p>
              <h4 className="text-sm font-semibold text-foreground mt-1">{result.title}</h4>
            </div>
            <ul className="space-y-2">
              {result.bullets.map((bullet, idx) => (
                <li key={idx} className="text-sm text-foreground flex gap-2">
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-lavender-deep shrink-0" />
                  <span>{bullet}</span>
                </li>
              ))}
            </ul>
            <div className="rounded-xl bg-lavender-light px-4 py-3">
              <p className="text-[10px] uppercase tracking-wide text-lavender-deep/70">Takeaway</p>
              <p className="text-sm text-lavender-deep mt-1">{result.takeaway}</p>
            </div>
          </div>
        )}

        {result && result.type === "flashcards" && (
          <div className="space-y-3 rounded-2xl border border-border bg-background p-4">
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Flashcards</p>
              <h4 className="text-sm font-semibold text-foreground mt-1">{result.title}</h4>
            </div>
            <div className="space-y-2">
              {result.cards.map((card, idx) => (
                <div key={idx} className="rounded-xl border border-border p-3">
                  <p className="text-xs font-medium text-muted-foreground">Front</p>
                  <p className="text-sm text-foreground mt-1">{card.front}</p>
                  <p className="text-xs font-medium text-muted-foreground mt-3">Back</p>
                  <p className="text-sm text-foreground mt-1">{card.back}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {result && result.type === "quiz" && (
          <div className="space-y-3 rounded-2xl border border-border bg-background p-4">
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Quiz</p>
              <h4 className="text-sm font-semibold text-foreground mt-1">{result.title}</h4>
            </div>
            <div className="space-y-3">
              {result.questions.map((question, idx) => (
                <div key={idx} className="rounded-xl border border-border p-3">
                  <p className="text-sm font-medium text-foreground">{question.question}</p>
                  <div className="mt-2 space-y-1">
                    {question.options.map((option, optionIdx) => (
                      <div
                        key={optionIdx}
                        className={cn(
                          "text-xs rounded-lg border px-3 py-2",
                          optionIdx === question.answerIndex
                            ? "border-sage bg-sage-light text-sage-deep"
                            : "border-border bg-muted/30 text-muted-foreground",
                        )}
                      >
                        {option}
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">{question.explanation}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </CenteredModalShell>
  );
}

// ─── Library Doc Detail ───────────────────────────────────────────────────────

function LibraryDocDetail({ doc, folders, onBack, onSave }: {
  doc: DocItem;
  folders: FolderItem[];
  onBack: () => void;
  onSave: (updated: DocItem) => void;
}) {
  const folder = folders.find(f => f.id === doc.folderId);
  const [aiSheet, setAiSheet] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(doc.title);
  const [editSummary, setEditSummary] = useState(doc.summary);
  const [editContent, setEditContent] = useState(doc.content);
  const [editTags, setEditTags] = useState(doc.tags.join(", "));

  function handleSave() {
    onSave({
      ...doc,
      title: editTitle.trim() || doc.title,
      summary: editSummary.trim(),
      content: editContent,
      tags: editTags.split(",").map(t => t.trim()).filter(Boolean),
      lastUpdated: new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }),
    });
    setIsEditing(false);
  }

  return (
    <div className="min-h-screen bg-background flex flex-col w-full min-[900px]:max-w-none mx-auto">
      <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-sm border-b border-border px-5 py-4">
        <div className="flex items-center gap-3">
          <button onClick={isEditing ? () => setIsEditing(false) : onBack} className="p-1.5 rounded-full hover:bg-muted transition-colors">
            <ChevronLeft size={20} className="text-muted-foreground" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="font-display text-lg text-foreground leading-tight truncate">
              {isEditing ? "Editing document" : doc.title}
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">{folder?.name} · Updated {doc.lastUpdated}</p>
          </div>
          {!isEditing && (
            <button
              onClick={() => setAiSheet(true)}
              aria-label="Open AI tools"
              className="p-2 rounded-full hover:bg-lavender-light transition-colors"
            >
              <Sparkles size={18} className="text-lavender-deep" />
            </button>
          )}
          <button
            data-testid={isEditing ? "doc-save-btn" : "doc-edit-btn"}
            onClick={() => { if (isEditing) handleSave(); else setIsEditing(true); }}
            className={cn("p-2 rounded-full transition-colors", isEditing ? "bg-sage-light hover:bg-sage-light/80" : "hover:bg-muted")}
          >
            {isEditing
              ? <CheckCircle size={18} className="text-sage-deep" />
              : <Pencil size={18} className="text-muted-foreground" />
            }
          </button>
        </div>
      </header>
      <main className="flex-1 overflow-auto pb-24 px-5 py-5 space-y-5 sm:px-6 lg:px-8">
        {isEditing ? (
          <>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Title</label>
              <input
                autoFocus
                value={editTitle}
                onChange={e => setEditTitle(e.target.value)}
                className="w-full border border-border rounded-xl px-4 py-3 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-sage/30"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Summary</label>
              <textarea
                value={editSummary}
                onChange={e => setEditSummary(e.target.value)}
                rows={2}
                className="w-full border border-border rounded-xl px-4 py-3 text-sm bg-background resize-none focus:outline-none focus:ring-2 focus:ring-sage/30"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Content</label>
              <textarea
                data-testid="doc-content-editor"
                value={editContent}
                onChange={e => setEditContent(e.target.value)}
                rows={10}
                className="w-full border border-border rounded-xl px-4 py-3 text-sm bg-background resize-none focus:outline-none focus:ring-2 focus:ring-sage/30"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Tags (comma-separated)</label>
              <input
                value={editTags}
                onChange={e => setEditTags(e.target.value)}
                placeholder="e.g. Service, Safety, Weekly"
                className="w-full border border-border rounded-xl px-4 py-3 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-sage/30"
              />
            </div>
            <button onClick={handleSave} className="w-full py-3 rounded-xl bg-sage text-white text-sm font-medium hover:bg-sage-deep transition-colors">
              Save changes
            </button>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground leading-relaxed">{doc.summary}</p>
            <div className="flex flex-wrap gap-2">
              {doc.tags.map(tag => (
                <span key={tag} className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-sage-light text-sage-deep">
                  <Tag size={10} /> {tag}
                </span>
              ))}
            </div>
            <div className="card-surface p-5">
              {doc.content ? (
                <p className="text-sm text-foreground leading-relaxed whitespace-pre-line">{doc.content}</p>
              ) : (
                <button onClick={() => setIsEditing(true)} className="w-full text-sm text-muted-foreground text-center py-4 hover:text-foreground transition-colors">
                  Tap to add content
                </button>
              )}
            </div>
          </>
        )}
      </main>
      {aiSheet && (
        <AIActionsSheet
          docTitle={doc.title}
          sourceLabel="library document"
          sourceText={`${doc.title}\n\n${doc.summary}\n\n${doc.content}`}
          onClose={() => setAiSheet(false)}
        />
      )}
    </div>
  );
}

// ─── Training Doc Detail ──────────────────────────────────────────────────────

function TrainingDocDetail({ doc, onBack, onToggleComplete }: {
  doc: TrainingDoc;
  onBack: () => void;
  onToggleComplete: (completed: boolean) => void;
}) {
  const onToggleCompleteRef = useRef(onToggleComplete);
  const lastReportedCompletion = useRef<boolean | null>(null);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(
    doc.completed ? new Set(doc.steps.map((_, i) => i)) : new Set()
  );
  const [aiSheet, setAiSheet] = useState(false);
  const allDone = completedSteps.size === doc.steps.length;

  useEffect(() => {
    onToggleCompleteRef.current = onToggleComplete;
  }, [onToggleComplete]);

  useEffect(() => {
    setCompletedSteps(doc.completed ? new Set(doc.steps.map((_, i) => i)) : new Set());
    lastReportedCompletion.current = doc.completed;
  }, [doc.completed, doc.id, doc.steps]);

  useEffect(() => {
    if (lastReportedCompletion.current === allDone) return;
    lastReportedCompletion.current = allDone;
    onToggleCompleteRef.current(allDone);
  }, [allDone]);

  const toggle = (i: number) => {
    setCompletedSteps(prev => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  };

  return (
    <div className="min-h-screen bg-background flex flex-col w-full min-[900px]:max-w-none mx-auto">
      <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-sm border-b border-border px-5 py-4">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-1.5 rounded-full hover:bg-muted transition-colors">
            <ChevronLeft size={20} className="text-muted-foreground" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="font-display text-lg text-foreground leading-tight truncate">{doc.title}</h1>
            <p className="text-xs text-muted-foreground mt-0.5">{doc.duration} · {completedSteps.size}/{doc.steps.length} steps</p>
          </div>
          <button
            onClick={() => setAiSheet(true)}
            aria-label="Open AI tools"
            className="p-2 rounded-full hover:bg-lavender-light transition-colors"
          >
            <Sparkles size={18} className="text-lavender-deep" />
          </button>
        </div>
      </header>
      <main className="flex-1 overflow-auto pb-24 px-5 py-5 space-y-3 sm:px-6 lg:px-8">
        {doc.steps.map((step, i) => {
          const done = completedSteps.has(i);
          return (
            <button
              key={i}
              onClick={() => toggle(i)}
              className={cn(
                "w-full flex items-start gap-3 p-4 rounded-xl border text-left transition-all",
                done ? "border-sage/30 bg-sage-light" : "border-border bg-card hover:border-sage/30"
              )}
            >
              {done
                ? <CheckCircle size={18} className="text-sage-deep mt-0.5 shrink-0" />
                : <Circle size={18} className="text-muted-foreground mt-0.5 shrink-0" />
              }
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-0.5">Step {i + 1}</p>
                <p className={cn("text-sm leading-relaxed", done ? "text-sage-deep" : "text-foreground")}>{step}</p>
              </div>
            </button>
          );
        })}
        {allDone && (
          <div className="card-surface p-5 text-center border-sage/30 bg-sage-light animate-fade-in">
            <CheckCircle size={24} className="text-sage-deep mx-auto mb-2" />
            <p className="text-sm font-medium text-sage-deep">Module complete.</p>
            <p className="text-xs text-sage-deep/70 mt-1">Well done. This module has been marked as completed.</p>
            <button
              onClick={() => { setCompletedSteps(new Set()); }}
              className="mt-3 text-xs text-sage-deep/70 underline hover:text-sage-deep transition-colors"
            >
              Mark as incomplete
            </button>
          </div>
        )}
      </main>
      {aiSheet && (
        <AIActionsSheet
          docTitle={doc.title}
          sourceLabel="training module"
          sourceText={`${doc.title}\n\n${doc.steps.join("\n\n")}`}
          onClose={() => setAiSheet(false)}
        />
      )}
    </div>
  );
}

// ─── Search Overlay ───────────────────────────────────────────────────────────

function SearchOverlay({ libraryDocs, trainingDocs, onClose, onSelectLibDoc, onSelectTrainingDoc }: {
  libraryDocs: DocItem[];
  trainingDocs: TrainingDoc[];
  onClose: () => void;
  onSelectLibDoc: (d: DocItem) => void;
  onSelectTrainingDoc: (d: TrainingDoc) => void;
}) {
  const [query, setQuery] = useState("");
  const q = query.toLowerCase();

  const libResults = q ? libraryDocs.filter(d =>
    d.title.toLowerCase().includes(q) || d.summary.toLowerCase().includes(q)
  ) : [];
  const trainResults = q ? trainingDocs.filter(d =>
    d.title.toLowerCase().includes(q)
  ) : [];

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col w-full min-[900px]:max-w-none mx-auto">
      <header className="border-b border-border px-4 py-3 flex items-center gap-3">
        <Search size={16} className="text-muted-foreground shrink-0" />
        <input
          autoFocus type="text" placeholder="Search all documents..."
          value={query} onChange={e => setQuery(e.target.value)}
          className="flex-1 text-sm bg-transparent focus:outline-none"
        />
        <button onClick={onClose} className="p-1.5 rounded-full hover:bg-muted transition-colors">
          <X size={18} className="text-muted-foreground" />
        </button>
      </header>
      <main className="flex-1 overflow-auto px-4 py-4 space-y-4">
        {!q && <p className="text-sm text-muted-foreground text-center mt-8">Start typing to search across Library and Training.</p>}
        {q && libResults.length === 0 && trainResults.length === 0 && (
          <div className="text-center mt-8">
            <BookOpen size={24} className="text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No results found.</p>
          </div>
        )}
        {libResults.length > 0 && (
          <>
            <p className="section-label">Library</p>
            <div className="card-surface divide-y divide-border">
              {libResults.map(doc => (
                <button key={doc.id} onClick={() => onSelectLibDoc(doc)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/30 transition-colors">
                  <FileText size={16} className="text-sage-deep shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">{doc.title}</p>
                    <p className="text-xs text-muted-foreground truncate">{doc.summary}</p>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}
        {trainResults.length > 0 && (
          <>
            <p className="section-label">Training</p>
            <div className="card-surface divide-y divide-border">
              {trainResults.map(doc => (
                <button key={doc.id} onClick={() => onSelectTrainingDoc(doc)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/30 transition-colors">
                  <GraduationCap size={16} className="text-lavender-deep shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">{doc.title}</p>
                    <p className="text-xs text-muted-foreground">{doc.duration} · {doc.steps.length} steps</p>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

// ─── Breadcrumb ───────────────────────────────────────────────────────────────

function FolderBreadcrumb<T extends { id: string; name: string; parentId: string | null }>({
  folders, currentId, onNavigate,
}: { folders: T[]; currentId: string | null; onNavigate: (id: string | null) => void; }) {
  if (!currentId) return null;
  const path: T[] = [];
  let cur = currentId;
  while (cur) {
    const f = folders.find(fo => fo.id === cur);
    if (!f) break;
    path.unshift(f);
    cur = f.parentId as string;
  }

  return (
    <div className="flex items-center gap-1 text-xs text-muted-foreground flex-wrap">
      <button onClick={() => onNavigate(null)} className="hover:text-foreground transition-colors">All folders</button>
      {path.map((f, i) => (
        <span key={f.id} className="flex items-center gap-1">
          <ChevronRight size={10} />
          {i === path.length - 1
            ? <span className="text-foreground font-medium">{f.name}</span>
            : <button onClick={() => onNavigate(f.id)} className="hover:text-foreground transition-colors">{f.name}</button>
          }
        </span>
      ))}
    </div>
  );
}

// ─── Drag Reorder Hook ───────────────────────────────────────────────────────

function useDragReorder<T extends { id: string }>(items: T[], onReorder: (reordered: T[]) => void) {
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const handleDragStart = (idx: number) => setDragIdx(idx);
  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (dragIdx === null || dragIdx === idx) return;
    const reordered = [...items];
    const [moved] = reordered.splice(dragIdx, 1);
    reordered.splice(idx, 0, moved);
    onReorder(reordered);
    setDragIdx(idx);
  };
  const handleDragEnd = () => setDragIdx(null);
  return { dragIdx, handleDragStart, handleDragOver, handleDragEnd };
}

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
