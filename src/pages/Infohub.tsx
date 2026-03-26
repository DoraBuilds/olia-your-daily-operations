import { useState, useMemo, useRef, useEffect } from "react";
import { Layout } from "@/components/Layout";
import {
  BookOpen, ChevronRight, ChevronLeft, Search, FileText, Tag, X,
  Plus, FolderOpen, Upload, File, Sparkles, GraduationCap,
  Play, CheckCircle, Circle, Brain, ListChecks, HelpCircle,
  Folder, GripVertical, MoreVertical, FolderInput, Pencil,
  Archive, Download
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

// ─── Types ───────────────────────────────────────────────────────────────────

type SubTab = "library" | "training";

interface DocItem {
  id: string;
  title: string;
  summary: string;
  content: string;
  tags: string[];
  lastUpdated: string;
  folderId: string;
}

interface FolderItem {
  id: string;
  name: string;
  parentId: string | null;
  sortOrder: number | null;
}

interface TrainingDoc {
  id: string;
  title: string;
  duration: string;
  completed: boolean;
  folderId: string;
  steps: string[];
}

interface TrainingFolder {
  id: string;
  name: string;
  parentId: string | null;
  sortOrder: number | null;
}

// ─── Mock Data (mutable state) ───────────────────────────────────────────────

const initialLibraryFolders: FolderItem[] = [
  { id: "f1", name: "Cleaning & Maintenance", parentId: null, sortOrder: null },
  { id: "f2", name: "Food Safety", parentId: null, sortOrder: null },
  { id: "f3", name: "Opening & Closing", parentId: null, sortOrder: null },
  { id: "f4", name: "Service Standards", parentId: null, sortOrder: null },
  { id: "f5", name: "Allergen Protocols", parentId: "f2", sortOrder: null },
];

const initialLibraryDocs: DocItem[] = [
  {
    id: "s1", title: "How to serve a customer", folderId: "f4",
    summary: "Step-by-step guidance for delivering a consistent, professional customer experience.",
    content: `Welcome every customer within 30 seconds of arrival with eye contact and a calm greeting.\n\nOffer to take their coat or direct them to their table promptly. Present the menu and allow time before taking the order.\n\nWhen taking the order, repeat it back clearly. Note any allergies and mark the ticket accordingly. Communicate allergy information directly to the kitchen.\n\nDuring service, check in once — not repeatedly. Refill water without being asked.\n\nAt the end, present the bill promptly when requested. Thank the customer by name if possible.`,
    tags: ["Service", "Front of house", "Standards"], lastUpdated: "14 Feb 2026",
  },
  {
    id: "s2", title: "Allergen handling procedure", folderId: "f2",
    summary: "Mandatory procedure for handling and communicating allergen information.",
    content: `All allergen queries must be treated as serious and escalated to a supervisor if uncertain.\n\nThe 14 major allergens must be known by all front-of-house staff. A laminated allergen menu must be available at all times.\n\nWhen a customer declares an allergy, mark their ticket clearly and notify the kitchen verbally. Use a clean preparation area and separate utensils.\n\nDo not guess. If in doubt, do not serve the dish.`,
    tags: ["Allergens", "Food Safety", "Legal"], lastUpdated: "10 Jan 2026",
  },
  {
    id: "s3", title: "Opening & closing procedure", folderId: "f3",
    summary: "Daily routine for opening and securing the premises safely.",
    content: `Opening: Arrive 30 minutes before service. Deactivate alarm. Check all areas are clean and set. Verify fridge temperatures and log them. Brief the team on the day's specials, bookings, and any known issues.\n\nClosing: Complete all closing checklists before staff leave. Ensure all food is stored correctly. Check all equipment is off. Lock all doors and activate the alarm. Confirm closure is logged.`,
    tags: ["Opening", "Closing", "Operations"], lastUpdated: "02 Feb 2026",
  },
  {
    id: "s4", title: "Cleaning schedule — weekly", folderId: "f1",
    summary: "Weekly deep-cleaning tasks for kitchen and front-of-house areas.",
    content: `Monday: Deep clean the fryer. Remove and soak all components. Scrub the interior with food-safe degreaser.\n\nWednesday: Clean extractor hoods and filters. Log completion.\n\nFriday: Sanitize all refrigeration unit interiors. Check seals. Log temperatures.\n\nSaturday: Mop all floors including storage. Clean behind equipment.\n\nAll cleaning must be logged in the Cleaning Schedule checklist.`,
    tags: ["Cleaning", "Kitchen", "Weekly"], lastUpdated: "07 Feb 2026",
  },
];

const initialTrainingFolders: TrainingFolder[] = [
  { id: "tf1", name: "Onboarding", parentId: null, sortOrder: null },
  { id: "tf2", name: "Troubleshooting", parentId: null, sortOrder: null },
];

const initialTrainingDocs: TrainingDoc[] = [
  {
    id: "tr1", title: "How to make a latte", folderId: "tf1", duration: "8 min", completed: false,
    steps: [
      "Grind 18–20g of espresso. Ensure a fine, consistent grind.",
      "Tamp firmly and evenly. Apply approximately 30lbs of pressure.",
      "Pull a 25–30 second shot into a pre-warmed cup.",
      "Steam 180ml of full-fat milk to 65°C. The pitcher should be warm to the touch.",
      "Swirl the milk to create a glossy, uniform texture.",
      "Pour the milk in a slow, steady motion. Tilt the cup slightly and aim for the centre of the shot.",
      "Finish with a simple latte art pattern. Present to the customer promptly.",
    ],
  },
  {
    id: "tr2", title: "Taking a table order", folderId: "tf1", duration: "5 min", completed: true,
    steps: [
      "Approach the table within 2 minutes of the guests being seated.",
      "Greet the table calmly. Introduce today's specials if applicable.",
      "Note any dietary requirements or allergies before taking the order.",
      "Repeat the order back to the table clearly.",
      "Input the order accurately into the POS system.",
      "Communicate any allergen or special requirements to the kitchen verbally.",
    ],
  },
  {
    id: "tr3", title: "Cash handling procedure", folderId: "tf1", duration: "6 min", completed: false,
    steps: [
      "Count the float at the start of each shift. Record the amount.",
      "Always announce the denomination of notes received.",
      "Count change back to the customer.",
      "Do not leave the till drawer open.",
      "Report any discrepancy immediately to your manager.",
    ],
  },
  {
    id: "tr4", title: "Coffee machine not heating", folderId: "tf2", duration: "3 min", completed: false,
    steps: [
      "Check that the machine is powered on and the power cable is secure.",
      "Verify the boiler switch is in the ON position.",
      "Allow 15 minutes for the boiler to reach temperature.",
      "If the issue persists, check for error codes on the display panel.",
      "Do not attempt to open the boiler. Contact your maintenance supplier.",
      "Log the fault in the Maintenance section of Olia.",
    ],
  },
  {
    id: "tr5", title: "Card terminal not connecting", folderId: "tf2", duration: "4 min", completed: false,
    steps: [
      "Check Wi-Fi or cellular signal on the terminal.",
      "Restart the terminal using the power button.",
      "If on Wi-Fi, verify the router is functioning normally.",
      "Switch to a mobile data connection if available.",
      "Contact your payment provider if the issue persists.",
      "In the interim, inform customers that card payments are temporarily unavailable.",
    ],
  },
  {
    id: "tr6", title: "Handling a customer complaint", folderId: "tf2", duration: "5 min", completed: false,
    steps: [
      "Listen to the complaint fully without interrupting.",
      "Acknowledge the issue calmly. Do not be defensive.",
      "Apologise sincerely for the experience.",
      "Offer a resolution — replacement, refund, or discount — within your authority.",
      "If escalation is needed, involve a manager immediately.",
      "Log the complaint in the incident register after resolution.",
    ],
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

let nextId = 100;
const genId = () => `gen_${nextId++}`;

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
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-foreground/30 backdrop-blur-sm" />
      <div className="relative w-full max-w-lg bg-card rounded-t-2xl border-t border-border p-5 pb-8 space-y-3 animate-fade-in max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
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
    </div>
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
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-foreground/30 backdrop-blur-sm" />
      <div className="relative w-full max-w-lg bg-card rounded-t-2xl border-t border-border p-5 pb-8 space-y-4 animate-fade-in max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
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
    </div>
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
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-foreground/30 backdrop-blur-sm" />
      <div className="relative w-full max-w-lg bg-card rounded-t-2xl border-t border-border p-5 pb-8 space-y-4 animate-fade-in max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
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
    </div>
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
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-foreground/30 backdrop-blur-sm" />
      <div className="relative w-full max-w-lg bg-card rounded-t-2xl border-t border-border p-5 pb-8 space-y-4 animate-fade-in max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
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
    </div>
  );
}

// ─── Plus Menu ────────────────────────────────────────────────────────────────

function PlusMenu({ onClose, onAction }: {
  onClose: () => void;
  onAction: (action: "document" | "upload" | "folder") => void;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-foreground/30 backdrop-blur-sm" />
      <div
        className="relative w-full bg-card rounded-t-2xl border-t border-border p-5 pb-6 space-y-1 animate-fade-in max-h-[85vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-display text-base text-foreground">Create new</h3>
          <button
            onClick={onClose}
            className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-muted hover:bg-muted/80 transition-colors text-xs font-medium text-muted-foreground"
          >
            <X size={14} />
            Close
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
    </div>
  );
}

// ─── AI Actions Sheet ─────────────────────────────────────────────────────────

function AIActionsSheet({ docTitle, onClose }: { docTitle: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-foreground/30 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-lg bg-card rounded-t-2xl border-t border-border p-5 pb-8 space-y-1 animate-fade-in max-h-[85vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-lavender-deep" />
            <h3 className="font-display text-base text-foreground">AI Tools</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-muted transition-colors">
            <X size={18} className="text-muted-foreground" />
          </button>
        </div>
        <p className="text-xs text-muted-foreground mb-2">Generate study materials for "{docTitle}"</p>
        <div className="px-4 py-2.5 bg-muted/50 rounded-xl mb-2">
          <p className="text-xs text-muted-foreground">AI tools are coming soon to Olia.</p>
        </div>
        <button disabled className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl opacity-50 cursor-not-allowed text-left">
          <div className="w-9 h-9 rounded-xl bg-lavender-light flex items-center justify-center">
            <Brain size={16} className="text-lavender-deep" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">Generate summary</p>
            <p className="text-xs text-muted-foreground">AI-powered key points from this document</p>
          </div>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-medium shrink-0">Soon</span>
        </button>
        <button disabled className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl opacity-50 cursor-not-allowed text-left">
          <div className="w-9 h-9 rounded-xl bg-sage-light flex items-center justify-center">
            <ListChecks size={16} className="text-sage-deep" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">Create flashcards</p>
            <p className="text-xs text-muted-foreground">Turn content into review flashcards</p>
          </div>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-medium shrink-0">Soon</span>
        </button>
        <button disabled className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl opacity-50 cursor-not-allowed text-left">
          <div className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center">
            <HelpCircle size={16} className="text-muted-foreground" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">Generate quiz</p>
            <p className="text-xs text-muted-foreground">Test understanding with auto-generated questions</p>
          </div>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-medium shrink-0">Soon</span>
        </button>
      </div>
    </div>
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
    <div className="min-h-screen bg-background flex flex-col max-w-lg mx-auto">
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
      <main className="flex-1 overflow-auto pb-24 px-5 py-5 space-y-5">
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
      {aiSheet && <AIActionsSheet docTitle={doc.title} onClose={() => setAiSheet(false)} />}
    </div>
  );
}

// ─── Training Doc Detail ──────────────────────────────────────────────────────

function TrainingDocDetail({ doc, onBack, onToggleComplete }: {
  doc: TrainingDoc;
  onBack: () => void;
  onToggleComplete: (completed: boolean) => void;
}) {
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(
    doc.completed ? new Set(doc.steps.map((_, i) => i)) : new Set()
  );
  const [aiSheet, setAiSheet] = useState(false);
  const allDone = completedSteps.size === doc.steps.length;

  useEffect(() => {
    onToggleComplete(allDone);
  }, [allDone, onToggleComplete]);

  const toggle = (i: number) => {
    setCompletedSteps(prev => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  };

  return (
    <div className="min-h-screen bg-background flex flex-col max-w-lg mx-auto">
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
            className="p-2 rounded-full hover:bg-lavender-light transition-colors"
          >
            <Sparkles size={18} className="text-lavender-deep" />
          </button>
        </div>
      </header>
      <main className="flex-1 overflow-auto pb-24 px-5 py-5 space-y-3">
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
      {aiSheet && <AIActionsSheet docTitle={doc.title} onClose={() => setAiSheet(false)} />}
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
    <div className="fixed inset-0 z-50 bg-background flex flex-col max-w-lg mx-auto">
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
  const [subTab, setSubTab] = useState<SubTab>("library");
  const [showSearch, setShowSearch] = useState(false);
  const [showPlusMenu, setShowPlusMenu] = useState(false);
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [showCreateDoc, setShowCreateDoc] = useState(false);

  // Data state
  const [libFolders, setLibFolders] = useState<FolderItem[]>(initialLibraryFolders);
  const [libDocs, setLibDocs] = useState<DocItem[]>(initialLibraryDocs);
  const [trainFolders, setTrainFolders] = useState<TrainingFolder[]>(initialTrainingFolders);
  const [trainDocs, setTrainDocs] = useState<TrainingDoc[]>(initialTrainingDocs);
  const [archivedLibDocs, setArchivedLibDocs] = useState<DocItem[]>([]);
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

  // Sorted folder lists
  const visibleLibFolders = useMemo(() =>
    sortFolders(libFolders.filter(f => f.parentId === currentLibFolder)),
    [libFolders, currentLibFolder]
  );
  const docsInCurrentFolder = useMemo(() =>
    currentLibFolder ? libDocs.filter(d => d.folderId === currentLibFolder).sort((a, b) => a.title.localeCompare(b.title)) : [],
    [libDocs, currentLibFolder]
  );
  const visibleTrainFolders = useMemo(() =>
    sortFolders(trainFolders.filter(f => f.parentId === currentTrainFolder)),
    [trainFolders, currentTrainFolder]
  );
  const docsInCurrentTrainFolder = useMemo(() =>
    currentTrainFolder ? trainDocs.filter(d => d.folderId === currentTrainFolder) : [],
    [trainDocs, currentTrainFolder]
  );

  // Drag reorder
  const libDrag = useDragReorder(visibleLibFolders, (reordered) => {
    const withOrder = reordered.map((f, i) => ({ ...f, sortOrder: i }));
    setLibFolders(prev => [...prev.filter(f => f.parentId !== currentLibFolder), ...withOrder]);
  });
  const trainDrag = useDragReorder(visibleTrainFolders, (reordered) => {
    const withOrder = reordered.map((f, i) => ({ ...f, sortOrder: i }));
    setTrainFolders(prev => [...prev.filter(f => f.parentId !== currentTrainFolder), ...withOrder]);
  });

  // CRUD handlers
  const handleCreateLibFolder = (name: string, parentId: string | null) => {
    setLibFolders(prev => [...prev, { id: genId(), name, parentId, sortOrder: null }]);
  };
  const handleCreateTrainFolder = (name: string, parentId: string | null) => {
    setTrainFolders(prev => [...prev, { id: genId(), name, parentId, sortOrder: null }]);
  };
  const handleCreateLibDoc = (title: string, folderId: string, tags: string[] = []) => {
    setLibDocs(prev => [...prev, {
      id: genId(), title, folderId,
      summary: "New document — tap to edit.",
      content: "",
      tags,
      lastUpdated: new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }),
    }]);
  };
  const handleRenameFolder = (id: string, newName: string, section: "library" | "training") => {
    if (section === "library") {
      setLibFolders(prev => prev.map(f => f.id === id ? { ...f, name: newName } : f));
    } else {
      setTrainFolders(prev => prev.map(f => f.id === id ? { ...f, name: newName } : f));
    }
  };
  const handleMoveFolder = (id: string, targetParentId: string | null, section: "library" | "training") => {
    if (section === "library") {
      setLibFolders(prev => prev.map(f => f.id === id ? { ...f, parentId: targetParentId, sortOrder: null } : f));
    } else {
      setTrainFolders(prev => prev.map(f => f.id === id ? { ...f, parentId: targetParentId, sortOrder: null } : f));
    }
  };
  const handleMoveDoc = (id: string, targetFolderId: string | null, section: "library" | "training") => {
    if (section === "library" && targetFolderId) {
      setLibDocs(prev => prev.map(d => d.id === id ? { ...d, folderId: targetFolderId } : d));
    }
  };
  const handleArchiveFolder = (id: string, section: "library" | "training") => {
    if (section === "library") {
      setLibFolders(prev => prev.filter(f => f.id !== id));
      setLibDocs(prev => prev.filter(d => d.folderId !== id));
    } else {
      setTrainFolders(prev => prev.filter(f => f.id !== id));
    }
  };
  const handleArchiveDoc = (id: string, section: "library" | "training") => {
    if (section === "library") {
      const doc = libDocs.find(d => d.id === id);
      if (doc) {
        setArchivedLibDocs(prev => [...prev, doc]);
        setLibDocs(prev => prev.filter(d => d.id !== id));
      }
    }
  };
  const handleRestoreDoc = (id: string) => {
    const doc = archivedLibDocs.find(d => d.id === id);
    if (doc) {
      setLibDocs(prev => [...prev, doc]);
      setArchivedLibDocs(prev => prev.filter(d => d.id !== id));
    }
  };

  const allLibFolderOptions = useMemo(() => libFolders.map(f => ({ id: f.id, name: f.name })), [libFolders]);
  const allTrainFolderOptions = useMemo(() => trainFolders.map(f => ({ id: f.id, name: f.name })), [trainFolders]);

  // Detail views
  if (selectedDoc) return (
    <LibraryDocDetail
      doc={selectedDoc}
      folders={libFolders}
      onBack={() => setSelectedDoc(null)}
      onSave={(updated) => {
        setLibDocs(prev => prev.map(d => d.id === updated.id ? updated : d));
        setSelectedDoc(updated);
      }}
    />
  );
  if (selectedTrainingDoc) return (
    <TrainingDocDetail
      doc={selectedTrainingDoc}
      onBack={() => setSelectedTrainingDoc(null)}
      onToggleComplete={(completed) => {
        setTrainDocs(prev => {
          const currentDoc = prev.find(d => d.id === selectedTrainingDoc.id);
          if (!currentDoc || currentDoc.completed === completed) {
            return prev;
          }

          return prev.map(d => d.id === selectedTrainingDoc.id ? { ...d, completed } : d);
        });
      }}
    />
  );
  if (showSearch) return (
    <SearchOverlay libraryDocs={libDocs} trainingDocs={trainDocs} onClose={() => setShowSearch(false)}
      onSelectLibDoc={d => { setShowSearch(false); setSelectedDoc(d); }}
      onSelectTrainingDoc={d => { setShowSearch(false); setSelectedTrainingDoc(d); }}
    />
  );

  const subtitle = subTab === "library" ? "Documents & SOPs" : "Staff training modules";

  // Folder menu actions
  const folderActions = (folder: { id: string; name: string }, section: "library" | "training") => [
    { label: "Move to folder", icon: <FolderInput size={16} className="text-muted-foreground" />, onClick: () => setMoveTarget({ type: "folder", id: folder.id, section }) },
    { label: "Rename folder", icon: <Pencil size={16} className="text-muted-foreground" />, onClick: () => setRenameTarget({ id: folder.id, name: folder.name, section }) },
    { label: "Archive folder", icon: <Archive size={16} className="text-muted-foreground" />, onClick: () => handleArchiveFolder(folder.id, section) },
  ];

  const docActions = (doc: DocItem | TrainingDoc, section: "library" | "training") => [
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
    { label: "Archive file", icon: <Archive size={16} className="text-muted-foreground" />, onClick: () => handleArchiveDoc(doc.id, section) },
  ];

  return (
    <Layout title="Infohub" subtitle={subtitle}
      headerRight={
        <div className="flex items-center gap-1">
          <button onClick={() => setShowSearch(true)} className="p-2 rounded-full hover:bg-muted transition-colors">
            <Search size={18} className="text-muted-foreground" />
          </button>
          <button onClick={() => setShowPlusMenu(true)} className="p-2 rounded-full hover:bg-sage-light transition-colors">
            <Plus size={18} className="text-sage-deep" />
          </button>
        </div>
      }
    >
      {/* Sub-tab toggle */}
      <div className="flex gap-1 bg-muted rounded-xl p-1">
        {([
          { key: "library" as const, label: "Library", icon: BookOpen },
          { key: "training" as const, label: "Training", icon: GraduationCap },
        ]).map(({ key, label, icon: Icon }) => (
          <button key={key}
            onClick={() => { setSubTab(key); setCurrentLibFolder(null); setCurrentTrainFolder(null); }}
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

          {visibleLibFolders.length > 0 && (
            <>
              <p className="section-label">Folders</p>
              <div className="card-surface divide-y divide-border">
                {visibleLibFolders.map((folder, idx) => (
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
                        <p className="text-sm font-medium text-foreground">{folder.name}</p>
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
          {currentLibFolder && docsInCurrentFolder.length > 0 && (
            <>
              <p className="section-label">Documents</p>
              <div className="card-surface divide-y divide-border">
                {docsInCurrentFolder.map(doc => (
                  <div key={doc.id} className="relative">
                    <div
                      onClick={() => setSelectedDoc(doc)}
                      className="w-full flex items-center gap-3 px-4 py-4 text-left hover:bg-muted/30 transition-colors cursor-pointer"
                    >
                      <div className="w-9 h-9 rounded-xl bg-sage-light flex items-center justify-center shrink-0">
                        <FileText size={16} className="text-sage-deep" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground">{doc.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{doc.lastUpdated}</p>
                        <p className="text-xs text-muted-foreground/70 mt-0.5 truncate">{doc.summary}</p>
                      </div>
                      <button
                        onClick={e => { e.stopPropagation(); setAiSheetDocTitle(doc.title); }}
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
          {visibleLibFolders.length === 0 && docsInCurrentFolder.length === 0 && (
            <button onClick={() => setShowPlusMenu(true)}
              className="card-surface p-8 text-center w-full hover:bg-muted/30 transition-colors cursor-pointer">
              <div className="w-10 h-10 rounded-full bg-sage-light flex items-center justify-center mx-auto mb-2">
                <Plus size={18} className="text-sage-deep" />
              </div>
              <p className="text-sm text-muted-foreground">{currentLibFolder ? "This folder is empty." : "No folders yet."}</p>
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

          {visibleTrainFolders.length > 0 && (
            <>
              <p className="section-label">Folders</p>
              <div className="card-surface divide-y divide-border">
                {visibleTrainFolders.map((folder, idx) => (
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
                        <p className="text-sm font-medium text-foreground">{folder.name}</p>
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

          {currentTrainFolder && docsInCurrentTrainFolder.length > 0 && (
            <>
              <p className="section-label">Modules</p>
              <div className="card-surface divide-y divide-border">
                {docsInCurrentTrainFolder.map(doc => (
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
                        <p className="text-sm font-medium text-foreground">{doc.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{doc.duration} · {doc.steps.length} steps</p>
                      </div>
                      <button
                        onClick={e => { e.stopPropagation(); setAiSheetDocTitle(doc.title); }}
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

          {visibleTrainFolders.length === 0 && docsInCurrentTrainFolder.length === 0 && currentTrainFolder && (
            <button onClick={() => setShowPlusMenu(true)}
              className="card-surface p-8 text-center w-full hover:bg-muted/30 transition-colors cursor-pointer">
              <div className="w-10 h-10 rounded-full bg-lavender-light flex items-center justify-center mx-auto mb-2">
                <Plus size={18} className="text-lavender-deep" />
              </div>
              <p className="text-sm text-muted-foreground">This folder is empty.</p>
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
          onSave={(title, folderId, tags) => handleCreateLibDoc(title, folderId, tags)}
        />
      )}
      {aiSheetDocTitle && (
        <AIActionsSheet docTitle={aiSheetDocTitle} onClose={() => setAiSheetDocTitle(null)} />
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
