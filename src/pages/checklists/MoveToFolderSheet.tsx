import { useState } from "react";
import { X, Folder, Home, Search } from "lucide-react";
import type { FolderItem } from "./types";

export function MoveToFolderSheet({ folders, currentFolderId, onMove, onClose }: {
  folders: FolderItem[];
  currentFolderId: string | null;
  onMove: (folderId: string | null) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const rootOption = { id: null as string | null, name: "No folder" };
  const filtered = [rootOption, ...folders.filter(f => f.id !== currentFolderId)]
    .filter(f => f.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center pb-16 bg-foreground/20 backdrop-blur-sm animate-fade-in">
      <div className="bg-card w-full max-w-lg rounded-t-2xl p-5 pb-20 space-y-4 animate-fade-in max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg text-foreground">Move to folder</h2>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-muted transition-colors">
            <X size={18} className="text-muted-foreground" />
          </button>
        </div>
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input type="text" placeholder="Search folders" value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 border border-border rounded-xl text-sm bg-muted focus:outline-none focus:ring-1 focus:ring-ring" />
        </div>
        {filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No folders match your search.</p>
        ) : (
          <div className="divide-y divide-border card-surface overflow-hidden">
            {filtered.map(f => {
              const isRoot = f.id === null;
              return (
                <button key={f.id ?? "root"} onClick={() => { onMove(f.id); onClose(); }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/50 transition-colors">
                  {isRoot
                    ? <Home size={16} className="text-muted-foreground shrink-0" />
                    : <Folder size={16} className="text-sage shrink-0" />}
                  <span className="text-sm text-foreground">{isRoot ? "No folder (unfiled)" : f.name}</span>
                </button>
              );
            })}
          </div>
        )}
        {folders.length === 0 && (
          <p className="text-xs text-muted-foreground text-center">
            No folders yet — create one from the Checklists main view.
          </p>
        )}
      </div>
    </div>
  );
}
