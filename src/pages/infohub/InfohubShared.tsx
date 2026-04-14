import { useEffect, useRef, useState } from "react";

import { supabase } from "@/lib/supabase";
import { isInfohubAiResult, type InfohubAiAction, type InfohubAiResult } from "@/lib/infohub-ai";
import { canAccessInfohubContent, type InfohubAccessControl, type InfohubPrincipal } from "@/lib/infohub-access";
import type { InfohubLibraryDoc as DocItem, InfohubLibraryFolder as FolderItem, InfohubTrainingDoc as TrainingDoc, InfohubTrainingFolder as TrainingFolder } from "@/lib/infohub-catalog";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import {
  Archive,
  BookOpen,
  ChevronRight,
  Download,
  FileText,
  Folder,
  FolderOpen,
  FolderInput,
  GraduationCap,
  GripVertical,
  HelpCircle,
  Lock,
  Loader2,
  MoreVertical,
  Pencil,
  Plus,
  Search,
  Shield,
  Sparkles,
  Upload,
  X,
  ListChecks,
  Brain,
  Circle,
  CheckCircle,
} from "lucide-react";

import { type AccessTarget } from "./infohub-types";

export function CenteredModalShell({
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

export function MoveToFolderSheet({
  folders,
  currentParentId,
  onClose,
  onMove,
}: {
  folders: { id: string; name: string; parentId: string | null }[];
  currentParentId: string | null;
  onClose: () => void;
  onMove: (targetFolderId: string | null) => void;
}) {
  const [search, setSearch] = useState("");
  const q = search.toLowerCase();

  const rootFolders = folders.filter((folder) => folder.parentId === null && folder.id !== currentParentId);
  const filteredFolders = q ? folders.filter((folder) => folder.name.toLowerCase().includes(q) && folder.id !== currentParentId) : rootFolders;
  const getSubfolders = (parentId: string) => folders.filter((folder) => folder.parentId === parentId && folder.id !== currentParentId);

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
            onChange={(e) => setSearch(e.target.value)}
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
          {filteredFolders.map((folder) => (
            <div key={folder.id}>
              <button
                onClick={() => onMove(folder.id)}
                className="w-full flex items-center gap-3 px-2 py-3 text-left hover:bg-muted/30 transition-colors rounded-lg"
              >
                <Folder size={16} className="text-sage-deep" />
                <span className="text-sm text-foreground">{folder.name}</span>
              </button>
              {!q && getSubfolders(folder.id).map((sub) => (
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
        {filteredFolders.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No folders found.</p>}
      </div>
    </CenteredModalShell>
  );
}

export function ItemContextMenu({
  open,
  onClose,
  actions,
}: {
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
      {actions.map((action, idx) => (
        <button
          key={idx}
          onClick={(e) => {
            e.stopPropagation();
            action.onClick();
            onClose();
          }}
          className="w-full flex items-center gap-3 px-4 py-3 text-left text-sm text-foreground hover:bg-muted/50 transition-colors"
        >
          {action.icon}
          {action.label}
        </button>
      ))}
    </div>
  );
}

export function CreateFolderModal({
  parentId,
  onClose,
  onSave,
}: {
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
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Health & Safety" />
        </div>
        <button
          disabled={!name.trim()}
          onClick={() => {
            onSave(name.trim(), parentId);
            onClose();
          }}
          className={cn(
            "w-full py-3 rounded-xl text-sm font-medium transition-colors",
            name.trim() ? "bg-primary text-primary-foreground hover:bg-primary/90" : "bg-muted text-muted-foreground",
          )}
        >
          Create folder
        </button>
      </div>
    </CenteredModalShell>
  );
}

export function RenameFolderModal({
  currentName,
  onClose,
  onSave,
}: {
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
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <button
          disabled={!name.trim()}
          onClick={() => {
            onSave(name.trim());
            onClose();
          }}
          className={cn(
            "w-full py-3 rounded-xl text-sm font-medium transition-colors",
            name.trim() ? "bg-primary text-primary-foreground hover:bg-primary/90" : "bg-muted text-muted-foreground",
          )}
        >
          Rename
        </button>
      </div>
    </CenteredModalShell>
  );
}

export function CreateDocModal({
  folderId,
  folders,
  onClose,
  onSave,
}: {
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
          <Input data-testid="doc-title-input" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Fire safety procedure" />
        </div>
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">Folder</label>
          <select
            value={selectedFolder}
            onChange={(e) => setSelectedFolder(e.target.value)}
            className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
          >
            {folders.map((folder) => (
              <option key={folder.id} value={folder.id}>{folder.name}</option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">Tags <span className="text-muted-foreground/60">(comma-separated, optional)</span></label>
          <Input data-testid="doc-tags-input" value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} placeholder="e.g. Safety, Weekly, Kitchen" />
        </div>
        <button
          data-testid="create-doc-submit"
          disabled={!title.trim() || !selectedFolder}
          onClick={() => {
            const tags = tagsInput.split(",").map((tag) => tag.trim()).filter(Boolean);
            onSave(title.trim(), selectedFolder, tags);
            onClose();
          }}
          className={cn(
            "w-full py-3 rounded-xl text-sm font-medium transition-colors",
            title.trim() && selectedFolder ? "bg-primary text-primary-foreground hover:bg-primary/90" : "bg-muted text-muted-foreground",
          )}
        >
          Create document
        </button>
      </div>
    </CenteredModalShell>
  );
}

export function PlusMenu({ onClose, onAction }: { onClose: () => void; onAction: (action: "document" | "upload" | "folder") => void }) {
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
            <Folder size={16} className="text-muted-foreground" />
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

export function ManageAccessModal({
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
    setSelected(selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value]);
  };

  const save = () => {
    onSave({ accessScope, allowedTeamMemberIds, allowedRoles, allowedLocationIds });
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
            className={cn("rounded-xl border px-4 py-3 text-left transition-colors", accessScope === "org" ? "border-sage bg-sage-light" : "border-border hover:border-sage/40")}
          >
            <p className="text-sm font-medium text-foreground">Org-wide access</p>
            <p className="text-xs text-muted-foreground mt-1">Everyone in the organization can see this item.</p>
          </button>
          <button
            type="button"
            onClick={() => setAccessScope("restricted")}
            className={cn("rounded-xl border px-4 py-3 text-left transition-colors", accessScope === "restricted" ? "border-sage bg-sage-light" : "border-border hover:border-sage/40")}
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

function describeCondition(rule: { comparator: string; value?: string | null; valueTo?: string | null }) {
  if (rule.comparator === "unanswered") return "No response provided";
  if (!rule.valueTo) return rule.value ?? "";
  return `${rule.value ?? ""} - ${rule.valueTo}`;
}

export function AIActionsSheet({
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
        body: { action, title: docTitle, content: sourceText },
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
                  <p className="text-xs text-muted-foreground mt-2">{question.answer}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </CenteredModalShell>
  );
}

export function SearchOverlay({
  libraryDocs,
  trainingDocs,
  onClose,
  onSelectLibDoc,
  onSelectTrainingDoc,
}: {
  libraryDocs: DocItem[];
  trainingDocs: TrainingDoc[];
  onClose: () => void;
  onSelectLibDoc: (d: DocItem) => void;
  onSelectTrainingDoc: (d: TrainingDoc) => void;
}) {
  const [query, setQuery] = useState("");
  const q = query.toLowerCase();

  const libResults = q ? libraryDocs.filter((doc) => doc.title.toLowerCase().includes(q) || doc.summary.toLowerCase().includes(q)) : [];
  const trainResults = q ? trainingDocs.filter((doc) => doc.title.toLowerCase().includes(q)) : [];

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col w-full min-[900px]:max-w-[1120px] xl:max-w-[1040px] mx-auto">
      <header className="border-b border-border px-4 py-3 flex items-center gap-3">
        <Search size={16} className="text-muted-foreground shrink-0" />
        <input
          autoFocus
          type="text"
          placeholder="Search all documents..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
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
              {libResults.map((doc) => (
                <button
                  key={doc.id}
                  onClick={() => onSelectLibDoc(doc)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/30 transition-colors"
                >
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
              {trainResults.map((doc) => (
                <button
                  key={doc.id}
                  onClick={() => onSelectTrainingDoc(doc)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/30 transition-colors"
                >
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

export function FolderBreadcrumb<T extends { id: string; name: string; parentId: string | null }>({
  folders,
  currentId,
  onNavigate,
}: {
  folders: T[];
  currentId: string | null;
  onNavigate: (id: string | null) => void;
}) {
  if (!currentId) return null;
  const path: T[] = [];
  let cur = currentId;
  while (cur) {
    const folder = folders.find((item) => item.id === cur);
    if (!folder) break;
    path.unshift(folder);
    cur = folder.parentId as string;
  }

  return (
    <div className="flex items-center gap-1 text-xs text-muted-foreground flex-wrap">
      <button onClick={() => onNavigate(null)} className="hover:text-foreground transition-colors">All folders</button>
      {path.map((folder, idx) => (
        <span key={folder.id} className="flex items-center gap-1">
          <ChevronRight size={10} />
          {idx === path.length - 1 ? (
            <span className="text-foreground font-medium">{folder.name}</span>
          ) : (
            <button onClick={() => onNavigate(folder.id)} className="hover:text-foreground transition-colors">{folder.name}</button>
          )}
        </span>
      ))}
    </div>
  );
}

export function getInfohubActionLabel(value?: string | null) {
  return describeCondition({ comparator: value ? "is" : "unanswered", value });
}
