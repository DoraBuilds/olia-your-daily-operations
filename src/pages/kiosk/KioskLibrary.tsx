import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { BookOpen, Check, CheckCircle2, FileText, Folder, GraduationCap } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { ensureKioskToken } from "./PinEntryModal";
import { useInactivityTimer } from "./hooks";
import { cn } from "@/lib/utils";

// Kiosk Infohub: the Library and Training sections of the Info Hub, limited
// server-side (get_kiosk_library) to what this team member may see.
type Section = "library" | "training";

interface KioskFolder {
  id: string;
  name: string;
  parent_id: string | null;
  /** Missing on rows from the pre-Training RPC — treated as library. */
  section?: Section;
}

interface KioskDoc {
  id: string;
  title: string;
  summary: string;
  body: string;
  folder_id: string;
  section?: Section;
  metadata: { tags?: string[]; filePath?: string; fileType?: string; duration?: string; steps?: string[] };
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
  const { t } = useTranslation("kiosk");
  const [data, setData] = useState<KioskLibraryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [section, setSection] = useState<Section>("library");
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [selectedDoc, setSelectedDoc] = useState<KioskDoc | null>(null);
  // Training docs this member has completed (by doc id). Only tracked when a
  // member identified with their PIN — otherwise the Infohub is read-only.
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [savingDocId, setSavingDocId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState(false);
  const canComplete = memberId !== null;

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
            setError(t("library.loadError"));
          } else {
            setData((rpcData as KioskLibraryData) ?? { folders: [], documents: [] });
          }
          setLoading(false);
        });
      if (!memberId) return;
      supabase
        .rpc("get_kiosk_training_progress", {
          p_location_id: locationId,
          p_team_member_id: memberId,
          p_kiosk_token: token,
        })
        .then(({ data: rows, error: progressError }) => {
          if (cancelled || progressError) return;
          const done = ((rows ?? []) as { module_id: string; is_completed: boolean }[])
            .filter(row => row.is_completed)
            .map(row => row.module_id);
          setCompletedIds(new Set(done));
        });
    });
    return () => {
      cancelled = true;
    };
  }, [locationId, memberId, t]);

  const inSection = (item: { section?: Section }) => (item.section ?? "library") === section;
  const folders = (data?.folders ?? []).filter(inSection);
  const documents = (data?.documents ?? []).filter(inSection);

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

  const setDocCompleted = async (docId: string, completed: boolean) => {
    if (!memberId) return;
    setSavingDocId(docId);
    setSaveError(false);
    const token = await ensureKioskToken(locationId);
    const { error: rpcError } = await supabase.rpc("set_kiosk_training_complete", {
      p_location_id: locationId,
      p_team_member_id: memberId,
      p_kiosk_token: token,
      p_document_id: docId,
      p_completed: completed,
    });
    setSavingDocId(null);
    if (rpcError) { setSaveError(true); return; }
    setCompletedIds(prev => {
      const next = new Set(prev);
      if (completed) next.add(docId); else next.delete(docId);
      return next;
    });
  };

  const selectSection = (next: Section) => {
    setSection(next);
    setCurrentFolderId(null);
    setSelectedDoc(null);
  };

  const backLabel = selectedDoc
    ? (currentFolder?.name ?? t(`library.sections.${section}`))
    : currentFolderId
      ? (parentFolder?.name ?? t(`library.sections.${section}`))
      : t("grid.kioskFallbackName");

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-2">
          <BookOpen size={32} className="text-muted-foreground mx-auto animate-pulse" />
          <p className="text-sm text-muted-foreground">{t("library.loading")}</p>
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
            {t("library.backToKiosk")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col w-full min-[900px]:max-w-none mx-auto">
      {/* Header */}
      <div className="px-5 pt-6 pb-4 border-b border-border">
        <div className="flex items-center justify-between">
          <button
            data-testid="library-back-btn"
            onClick={handleBack}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            ← {backLabel}
          </button>
          <p className="text-xs text-muted-foreground shrink-0 pl-3">{memberName}</p>
        </div>
        <h1 className="font-display text-xl text-foreground leading-tight truncate text-center mt-1">
          {selectedDoc
            ? selectedDoc.title
            : currentFolder
              ? currentFolder.name
              : t("library.title")}
        </h1>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto px-5 py-5 space-y-3 pb-24">
        {!selectedDoc && !currentFolderId && (
          <div role="tablist" className="flex gap-1 p-1 rounded-xl bg-muted">
            {(["library", "training"] as const).map(s => (
              <button
                key={s}
                role="tab"
                aria-selected={section === s}
                data-testid={`infohub-tab-${s}`}
                onClick={() => selectSection(s)}
                className={cn(
                  "flex-1 py-2 rounded-lg text-sm font-medium transition-colors",
                  section === s ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t(`library.sections.${s}`)}
              </button>
            ))}
          </div>
        )}
        {selectedDoc ? (
          <DocDetail
            doc={selectedDoc}
            completion={canComplete && selectedDoc.section === "training" ? {
              completed: completedIds.has(selectedDoc.id),
              saving: savingDocId === selectedDoc.id,
              error: saveError,
              onChange: completed => setDocCompleted(selectedDoc.id, completed),
            } : null}
          />
        ) : currentFolderId ? (
          <FolderContents
            subFolders={childFolders(currentFolderId)}
            docs={docsInFolder(currentFolderId)}
            completedIds={canComplete ? completedIds : null}
            onFolderSelect={setCurrentFolderId}
            onDocSelect={setSelectedDoc}
          />
        ) : (
          <RootFolders
            section={section}
            folders={rootFolders}
            docsInFolder={docsInFolder}
            completedIds={canComplete ? completedIds : null}
            onFolderSelect={setCurrentFolderId}
          />
        )}
      </div>

      {secondsLeft !== null && (
        <div className="fixed bottom-0 left-0 right-0 bg-foreground/90 text-background px-5 py-3 flex items-center justify-between z-[70]">
          <p className="text-sm">{t("completion.returningIn", { count: secondsLeft })}</p>
          <button onClick={cancelCountdown} className="text-sm font-semibold underline">
            {t("stayButton")}
          </button>
        </div>
      )}
    </div>
  );
}

// Folders and docs share one compact, square-ish tile so they sit in the same grid.
const tileCls = "card-surface min-h-[120px] flex flex-col items-center justify-center gap-1.5 px-3 py-4 text-center hover:border-sage/30 transition-colors active:scale-[0.99]";

function RootFolders({
  section,
  folders,
  docsInFolder,
  completedIds,
  onFolderSelect,
}: {
  section: Section;
  folders: KioskFolder[];
  docsInFolder: (id: string) => KioskDoc[];
  /** null = no member identified, so no progress to show. */
  completedIds: Set<string> | null;
  onFolderSelect: (id: string) => void;
}) {
  const { t } = useTranslation("kiosk");
  if (folders.length === 0) {
    return (
      <div className="text-center py-12 space-y-2">
        <BookOpen size={32} className="text-muted-foreground mx-auto" />
        <p className="text-sm text-muted-foreground">{t(section === "training" ? "library.noTraining" : "library.noDocuments")}</p>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">
      {folders.map(folder => {
        const folderDocs = docsInFolder(folder.id);
        const count = folderDocs.length;
        const showProgress = section === "training" && completedIds !== null && count > 0;
        const done = showProgress ? folderDocs.filter(d => completedIds.has(d.id)).length : 0;
        return (
          <button
            key={folder.id}
            data-testid={`library-folder-${folder.id}`}
            onClick={() => onFolderSelect(folder.id)}
            className={tileCls}
          >
            <div className="w-9 h-9 rounded-lg bg-sage-light flex items-center justify-center shrink-0">
              <Folder size={16} className="text-sage-deep" />
            </div>
            <div className="w-full">
              <p className="text-sm font-medium text-foreground leading-tight line-clamp-2">{folder.name}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {showProgress
                  ? t("library.completedCount", { done, total: count })
                  : t("library.documentCount", { count })}
              </p>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function FolderContents({
  subFolders,
  docs,
  completedIds,
  onFolderSelect,
  onDocSelect,
}: {
  subFolders: KioskFolder[];
  docs: KioskDoc[];
  completedIds: Set<string> | null;
  onFolderSelect: (id: string) => void;
  onDocSelect: (doc: KioskDoc) => void;
}) {
  const { t } = useTranslation("kiosk");
  if (subFolders.length === 0 && docs.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-8">{t("library.noFolderDocuments")}</p>;
  }
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">
      {subFolders.map(folder => (
        <button
          key={folder.id}
          data-testid={`library-folder-${folder.id}`}
          onClick={() => onFolderSelect(folder.id)}
          className={tileCls}
        >
          <div className="w-9 h-9 rounded-lg bg-sage-light flex items-center justify-center shrink-0">
            <Folder size={16} className="text-sage-deep" />
          </div>
          <p className="text-sm font-medium text-foreground leading-tight line-clamp-2">{folder.name}</p>
        </button>
      ))}
      {docs.map(doc => {
        const isTraining = doc.section === "training";
        const isDone = isTraining && !!completedIds?.has(doc.id);
        return (
          <button
            key={doc.id}
            data-testid={`library-doc-${doc.id}`}
            onClick={() => onDocSelect(doc)}
            className={cn(tileCls, "relative")}
          >
            {isDone && (
              <CheckCircle2
                size={16}
                data-testid={`library-doc-done-${doc.id}`}
                aria-label={t("library.completed")}
                className="absolute top-2.5 right-2.5 text-sage"
              />
            )}
            <div className="w-9 h-9 rounded-lg bg-lavender-light flex items-center justify-center shrink-0">
              {isTraining ? <GraduationCap size={16} className="text-lavender-deep" /> : <FileText size={16} className="text-lavender-deep" />}
            </div>
            <p className="text-sm font-medium text-foreground leading-tight line-clamp-2">{doc.title}</p>
            {isTraining && doc.metadata?.duration && (
              <p className="text-xs text-muted-foreground">{doc.metadata.duration}</p>
            )}
          </button>
        );
      })}
    </div>
  );
}

interface DocCompletion {
  completed: boolean;
  saving: boolean;
  error: boolean;
  onChange: (completed: boolean) => void;
}

function DocDetail({ doc, completion }: { doc: KioskDoc; completion: DocCompletion | null }) {
  const { t } = useTranslation("kiosk");
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
      {doc.section === "training" && doc.metadata?.duration && (
        <p className="text-xs text-muted-foreground">{doc.metadata.duration}</p>
      )}
      {doc.section === "training" && doc.metadata?.steps && doc.metadata.steps.length > 0 && (
        <ol className="space-y-3">
          {doc.metadata.steps.map((step, i) => (
            <li key={i} className="card-surface p-4 flex items-start gap-3">
              <span className="w-6 h-6 rounded-full bg-sage-light text-sage-deep text-xs font-semibold flex items-center justify-center shrink-0">
                {i + 1}
              </span>
              <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{step}</p>
            </li>
          ))}
        </ol>
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
              {doc.metadata.fileType ?? t("library.attachmentFallback")} · {t("library.openInAdminToDownload")}
            </p>
          </div>
        </div>
      )}
      {completion && (
        <div className="pt-2 space-y-2">
          {completion.completed ? (
            <div className="flex items-center justify-between gap-3 rounded-xl bg-sage-light px-4 py-3">
              <p className="flex items-center gap-2 text-sm font-medium text-sage-deep">
                <CheckCircle2 size={16} /> {t("library.completed")}
              </p>
              <button
                data-testid="training-undo-btn"
                disabled={completion.saving}
                onClick={() => completion.onChange(false)}
                className="text-xs font-medium text-sage-deep underline disabled:opacity-50"
              >
                {t("library.undo")}
              </button>
            </div>
          ) : (
            <button
              data-testid="training-complete-btn"
              disabled={completion.saving}
              onClick={() => completion.onChange(true)}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-sage text-white py-3 text-sm font-semibold hover:bg-sage-deep transition-colors disabled:opacity-50"
            >
              <Check size={16} /> {t("library.markComplete")}
            </button>
          )}
          {completion.error && (
            <p className="text-xs text-status-error text-center">{t("library.saveError")}</p>
          )}
        </div>
      )}
    </div>
  );
}
