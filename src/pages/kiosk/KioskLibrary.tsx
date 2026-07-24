import { useState, useEffect } from "react";
import { BookOpen, ChevronLeft, FileText, Folder } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { ensureKioskToken } from "./PinEntryModal";
import { useInactivityTimer } from "./hooks";

interface KioskFolder {
  id: string;
  name: string;
  parent_id: string | null;
}

interface KioskDoc {
  id: string;
  title: string;
  summary: string;
  body: string;
  folder_id: string;
  metadata: { tags?: string[]; filePath?: string; fileType?: string };
}

interface KioskLibraryData {
  folders: KioskFolder[];
  documents: KioskDoc[];
}

export function KioskLibrary({
  memberId,
  memberName,
  locationId,
  onBack,
}: {
  memberId: string | null;
  memberName: string;
  locationId: string;
  onBack: () => void;
}) {
  const [data, setData] = useState<KioskLibraryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [selectedDoc, setSelectedDoc] = useState<KioskDoc | null>(null);

  const { secondsLeft, cancelCountdown } = useInactivityTimer(true, onBack);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    ensureKioskToken(locationId).then(token => {
      if (cancelled) return;
      supabase
        .rpc("get_kiosk_library", {
          p_location_id: locationId,
          p_team_member_id: memberId,
          p_kiosk_token: token,
        })
        .then(({ data: rpcData, error: rpcError }) => {
          if (cancelled) return;
          if (rpcError) {
            setError("Could not load library. Check your connection and try again.");
          } else {
            setData((rpcData as KioskLibraryData) ?? { folders: [], documents: [] });
          }
          setLoading(false);
        });
    });
    return () => {
      cancelled = true;
    };
  }, [locationId, memberId]);

  const folders = data?.folders ?? [];
  const documents = data?.documents ?? [];

  const rootFolders = folders.filter(f => f.parent_id === null);
  const childFolders = (parentId: string) => folders.filter(f => f.parent_id === parentId);
  const docsInFolder = (folderId: string) => documents.filter(d => d.folder_id === folderId);

  const currentFolder = folders.find(f => f.id === currentFolderId) ?? null;
  const parentFolder = currentFolder?.parent_id
    ? (folders.find(f => f.id === currentFolder.parent_id) ?? null)
    : null;

  const handleBack = () => {
    if (selectedDoc) { setSelectedDoc(null); return; }
    if (currentFolderId) { setCurrentFolderId(currentFolder?.parent_id ?? null); return; }
    onBack();
  };

  const backLabel = selectedDoc
    ? (currentFolder?.name ?? "Library")
    : currentFolderId
      ? (parentFolder?.name ?? "Library")
      : "Kiosk";

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-2">
          <BookOpen size={32} className="text-muted-foreground mx-auto animate-pulse" />
          <p className="text-sm text-muted-foreground">Loading library…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-5">
        <div className="text-center space-y-3">
          <p className="text-sm text-status-error font-medium">{error}</p>
          <button onClick={onBack} className="text-sm text-muted-foreground underline">
            Back to kiosk
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col w-full min-[900px]:max-w-none mx-auto">
      {/* Header */}
      <div className="px-5 pt-6 pb-4 border-b border-border flex items-center gap-3">
        <button
          data-testid="library-back-btn"
          onClick={handleBack}
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-muted transition-colors shrink-0"
          aria-label="Back"
        >
          <ChevronLeft size={20} className="text-muted-foreground" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-muted-foreground uppercase tracking-widest">← {backLabel}</p>
          <h1 className="font-display text-xl italic text-foreground leading-tight truncate">
            {selectedDoc
              ? selectedDoc.title
              : currentFolder
                ? currentFolder.name
                : "Staff Library"}
          </h1>
        </div>
        <p className="text-xs text-muted-foreground shrink-0">{memberName}</p>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto px-5 py-5 space-y-3 pb-24">
        {selectedDoc ? (
          <DocDetail doc={selectedDoc} />
        ) : currentFolderId ? (
          <FolderContents
            subFolders={childFolders(currentFolderId)}
            docs={docsInFolder(currentFolderId)}
            onFolderSelect={setCurrentFolderId}
            onDocSelect={setSelectedDoc}
          />
        ) : (
          <RootFolders
            folders={rootFolders}
            docsInFolder={docsInFolder}
            onFolderSelect={setCurrentFolderId}
          />
        )}
      </div>

      {secondsLeft !== null && (
        <div className="fixed bottom-0 left-0 right-0 bg-foreground/90 text-background px-5 py-3 flex items-center justify-between z-[70]">
          <p className="text-sm">Returning to home in {secondsLeft}s…</p>
          <button onClick={cancelCountdown} className="text-sm font-semibold underline">
            Stay
          </button>
        </div>
      )}
    </div>
  );
}

function RootFolders({
  folders,
  docsInFolder,
  onFolderSelect,
}: {
  folders: KioskFolder[];
  docsInFolder: (id: string) => KioskDoc[];
  onFolderSelect: (id: string) => void;
}) {
  if (folders.length === 0) {
    return (
      <div className="text-center py-12 space-y-2">
        <BookOpen size={32} className="text-muted-foreground mx-auto" />
        <p className="text-sm text-muted-foreground">No library documents available.</p>
      </div>
    );
  }
  return (
    <>
      {folders.map(folder => {
        const count = docsInFolder(folder.id).length;
        return (
          <button
            key={folder.id}
            data-testid={`library-folder-${folder.id}`}
            onClick={() => onFolderSelect(folder.id)}
            className="w-full text-left card-surface p-4 flex items-center gap-3 hover:border-sage/30 transition-colors active:scale-[0.99]"
          >
            <div className="w-10 h-10 rounded-xl bg-sage-light flex items-center justify-center shrink-0">
              <Folder size={18} className="text-sage-deep" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">{folder.name}</p>
              <p className="text-xs text-muted-foreground">
                {count} document{count !== 1 ? "s" : ""}
              </p>
            </div>
          </button>
        );
      })}
    </>
  );
}

function FolderContents({
  subFolders,
  docs,
  onFolderSelect,
  onDocSelect,
}: {
  subFolders: KioskFolder[];
  docs: KioskDoc[];
  onFolderSelect: (id: string) => void;
  onDocSelect: (doc: KioskDoc) => void;
}) {
  if (subFolders.length === 0 && docs.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-8">No documents in this folder.</p>;
  }
  return (
    <>
      {subFolders.map(folder => (
        <button
          key={folder.id}
          data-testid={`library-folder-${folder.id}`}
          onClick={() => onFolderSelect(folder.id)}
          className="w-full text-left card-surface p-4 flex items-center gap-3 hover:border-sage/30 transition-colors active:scale-[0.99]"
        >
          <div className="w-10 h-10 rounded-xl bg-sage-light flex items-center justify-center shrink-0">
            <Folder size={18} className="text-sage-deep" />
          </div>
          <p className="text-sm font-medium text-foreground">{folder.name}</p>
        </button>
      ))}
      {docs.map(doc => (
        <button
          key={doc.id}
          data-testid={`library-doc-${doc.id}`}
          onClick={() => onDocSelect(doc)}
          className="w-full text-left card-surface p-4 flex items-start gap-3 hover:border-sage/30 transition-colors active:scale-[0.99]"
        >
          <div className="w-10 h-10 rounded-xl bg-lavender-light flex items-center justify-center shrink-0 mt-0.5">
            <FileText size={18} className="text-lavender-deep" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground leading-snug">{doc.title}</p>
            {doc.summary && (
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{doc.summary}</p>
            )}
          </div>
        </button>
      ))}
    </>
  );
}

function DocDetail({ doc }: { doc: KioskDoc }) {
  return (
    <div className="space-y-4">
      {doc.summary && (
        <p className="text-sm text-muted-foreground leading-relaxed">{doc.summary}</p>
      )}
      {doc.metadata?.tags && doc.metadata.tags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {doc.metadata.tags.map(tag => (
            <span key={tag} className="text-xs px-2.5 py-1 rounded-full bg-sage-light text-sage-deep">
              {tag}
            </span>
          ))}
        </div>
      )}
      {doc.body && (
        <div className="space-y-3">
          {doc.body.split("\n\n").map((para, i) => (
            <p key={i} className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
              {para}
            </p>
          ))}
        </div>
      )}
      {doc.metadata?.filePath && (
        <div className="card-surface p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-lavender-light flex items-center justify-center shrink-0">
            <FileText size={18} className="text-lavender-deep" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground">{doc.title}</p>
            <p className="text-xs text-muted-foreground">
              {doc.metadata.fileType ?? "Attachment"} · Open in admin panel to download
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
