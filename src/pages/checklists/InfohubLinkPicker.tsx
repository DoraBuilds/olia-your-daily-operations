import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight, FileText, Folder, Search } from "lucide-react";
import { useInfohubContent } from "@/hooks/useInfohubContent";
import { cn } from "@/lib/utils";

type Section = "library" | "training";

export interface LinkedInfohubDoc {
  id: string;
  title: string;
  section: Section;
}

// Picks a real Info Hub document: choose Library or Training, browse folders
// into documents, or search across the whole section.
export function InfohubLinkPicker({ onSelect }: { onSelect: (doc: LinkedInfohubDoc) => void }) {
  const { t } = useTranslation("checklists");
  const { data } = useInfohubContent();
  const [section, setSection] = useState<Section>("library");
  const [folderId, setFolderId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const folders = section === "library" ? data.libraryFolders : data.trainingFolders;
  const docs = section === "library" ? data.libraryDocs : data.trainingDocs;
  const query = search.trim().toLowerCase();

  const currentFolder = folders.find(f => f.id === folderId) ?? null;
  const visibleFolders = query
    ? folders.filter(f => f.name.toLowerCase().includes(query))
    : folders.filter(f => f.parentId === folderId);
  const visibleDocs = query
    ? docs.filter(d => d.title.toLowerCase().includes(query))
    : folderId ? docs.filter(d => d.folderId === folderId) : [];

  const switchSection = (next: Section) => {
    setSection(next);
    setFolderId(null);
    setSearch("");
  };

  const sortedFolders = [...visibleFolders].sort((a, b) => a.name.localeCompare(b.name));
  const sortedDocs = [...visibleDocs].sort((a, b) => a.title.localeCompare(b.title));

  return (
    <div className="rounded-xl border border-border bg-background p-3 space-y-3">
      <div className="flex items-center gap-2 border border-border rounded-lg px-3 py-2">
        <Search size={14} className="text-muted-foreground shrink-0" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={t("builder.instruction.searchLibraryTraining")}
          className="flex-1 bg-transparent text-sm outline-none"
        />
      </div>
      <div className="flex gap-2 flex-wrap">
        {([
          { key: "library", label: t("builder.instruction.filterLibrary") },
          { key: "training", label: t("builder.instruction.filterTraining") },
        ] as const).map(option => (
          <button
            key={option.key}
            type="button"
            onClick={() => switchSection(option.key)}
            className={cn(
              "px-3 py-1.5 rounded-full border text-xs transition-colors",
              section === option.key
                ? "bg-sage text-primary-foreground border-sage"
                : "border-border text-muted-foreground hover:border-sage/40",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
      {!query && currentFolder && (
        <button
          type="button"
          onClick={() => setFolderId(currentFolder.parentId)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft size={14} />
          {currentFolder.name}
        </button>
      )}
      <div className="max-h-56 overflow-y-auto space-y-2">
        {sortedFolders.length === 0 && sortedDocs.length === 0 ? (
          <p className="text-xs text-muted-foreground py-4 text-center">
            {query ? t("builder.instruction.noInfohubMatch") : t("builder.instruction.emptyFolder")}
          </p>
        ) : (
          <>
            {sortedFolders.map(folder => (
              <button
                key={folder.id}
                type="button"
                onClick={() => { setFolderId(folder.id); setSearch(""); }}
                className="w-full rounded-xl border border-border px-3 py-3 text-left hover:border-sage/40 hover:bg-muted/30 transition-colors flex items-center gap-2"
              >
                <Folder size={14} className="text-sage shrink-0" />
                <span className="flex-1 min-w-0 text-sm font-medium text-foreground">{folder.name}</span>
                <ChevronRight size={14} className="text-muted-foreground shrink-0" />
              </button>
            ))}
            {sortedDocs.map(doc => (
              <button
                key={doc.id}
                type="button"
                onClick={() => onSelect({ id: doc.id, title: doc.title, section })}
                className="w-full rounded-xl border border-border px-3 py-3 text-left hover:border-sage/40 hover:bg-muted/30 transition-colors flex items-center gap-2"
              >
                <FileText size={14} className="text-sage shrink-0" />
                <span className="text-sm font-medium text-foreground">{doc.title}</span>
              </button>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
