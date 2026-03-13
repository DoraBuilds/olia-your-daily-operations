import { ChevronRight } from "lucide-react";
import type { FolderItem } from "./types";

export function FolderBreadcrumb({ folders, currentId, onNavigate }: {
  folders: FolderItem[];
  currentId: string | null;
  onNavigate: (id: string | null) => void;
}) {
  if (!currentId) return null;
  const trail: FolderItem[] = [];
  let cur = currentId;
  while (cur) {
    const f = folders.find(x => x.id === cur);
    if (!f) break;
    trail.unshift(f);
    cur = f.parentId!;
  }
  return (
    <div className="flex items-center gap-1 text-xs text-muted-foreground overflow-x-auto pb-1">
      <button onClick={() => onNavigate(null)} className="shrink-0 hover:text-foreground transition-colors">All</button>
      {trail.map(f => (
        <span key={f.id} className="flex items-center gap-1 shrink-0">
          <ChevronRight size={10} />
          <button onClick={() => onNavigate(f.id)} className="hover:text-foreground transition-colors">{f.name}</button>
        </span>
      ))}
    </div>
  );
}
