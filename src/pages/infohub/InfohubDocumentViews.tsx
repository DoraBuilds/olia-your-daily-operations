import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { CheckCircle, ChevronLeft, Circle, Download, FileText, Pencil, Sparkles, Tag } from "lucide-react";
import { supabase } from "@/lib/supabase";

import { cn } from "@/lib/utils";
import type { InfohubLibraryDoc as DocItem, InfohubLibraryFolder as FolderItem, InfohubTrainingDoc as TrainingDoc } from "@/lib/infohub-catalog";

import { AIActionsSheet } from "./InfohubShared";

export function LibraryDocDetail({
  doc,
  folders,
  onBack,
  onSave,
}: {
  doc: DocItem;
  folders: FolderItem[];
  onBack: () => void;
  onSave: (updated: DocItem) => void;
}) {
  const { t } = useTranslation("infohub");
  const folder = folders.find((folderItem) => folderItem.id === doc.folderId);
  const [aiSheet, setAiSheet] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(doc.title);
  const [editSummary, setEditSummary] = useState(doc.summary);
  const [editContent, setEditContent] = useState(doc.content);
  const [editTags, setEditTags] = useState(doc.tags.join(", "));
  const [fileSignedUrl, setFileSignedUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!doc.filePath) return;
    supabase.storage.from("infohub-files").createSignedUrl(doc.filePath, 86400).then(({ data }) => {
      if (data?.signedUrl) setFileSignedUrl(data.signedUrl);
    });
  }, [doc.filePath]);

  function handleSave() {
    onSave({
      ...doc,
      title: editTitle.trim() || doc.title,
      summary: editSummary.trim(),
      content: editContent,
      tags: editTags.split(",").map((tag) => tag.trim()).filter(Boolean),
      lastUpdated: new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }),
    });
    setIsEditing(false);
  }

  return (
    <div className="min-h-screen bg-background flex flex-col w-full min-[900px]:max-w-[1120px] xl:max-w-[1040px] mx-auto">
      <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-sm border-b border-border px-5 py-4">
        <div className="flex items-center gap-3">
          <button onClick={isEditing ? () => setIsEditing(false) : onBack} className="btn-icon" aria-label={isEditing ? t("cancel") : t("back")}>
            <ChevronLeft size={20} className="text-muted-foreground" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="font-display text-lg text-foreground leading-tight truncate">
              {isEditing ? t("docViews.editingDocument") : doc.title}
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">{folder?.name} · {t("docViews.updatedOn", { date: doc.lastUpdated })}</p>
          </div>
          {!isEditing && (
            <button
              onClick={() => setAiSheet(true)}
              aria-label={t("docViews.openAiTools")}
              className="p-2 rounded-full hover:bg-lavender-light transition-colors"
            >
              <Sparkles size={18} className="text-lavender-deep" />
            </button>
          )}
          <button
            data-testid={isEditing ? "doc-save-btn" : "doc-edit-btn"}
            onClick={() => {
              if (isEditing) handleSave();
              else setIsEditing(true);
            }}
            className={cn("p-2 rounded-full transition-colors", isEditing ? "bg-sage-light hover:bg-sage-light/80" : "hover:bg-muted")}
          >
            {isEditing ? <CheckCircle size={18} className="text-sage-deep" /> : <Pencil size={18} className="text-muted-foreground" />}
          </button>
        </div>
      </header>
      <main className="flex-1 overflow-auto pb-24 px-5 py-5 space-y-5 sm:px-6 lg:px-8">
        {isEditing ? (
          <>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">{t("docViews.titleLabel")}</label>
              <input
                autoFocus
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="w-full border border-border rounded-xl px-4 py-3 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-sage/30"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">{t("docViews.summaryLabel")}</label>
              <textarea
                value={editSummary}
                onChange={(e) => setEditSummary(e.target.value)}
                rows={2}
                className="w-full border border-border rounded-xl px-4 py-3 text-sm bg-background resize-none focus:outline-none focus:ring-2 focus:ring-sage/30"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">{t("docViews.contentLabel")}</label>
              <textarea
                data-testid="doc-content-editor"
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                rows={10}
                className="w-full border border-border rounded-xl px-4 py-3 text-sm bg-background resize-none focus:outline-none focus:ring-2 focus:ring-sage/30"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">{t("docViews.tagsLabel")}</label>
              <input
                value={editTags}
                onChange={(e) => setEditTags(e.target.value)}
                placeholder={t("docViews.tagsPlaceholder")}
                className="w-full border border-border rounded-xl px-4 py-3 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-sage/30"
              />
            </div>
            <button onClick={handleSave} className="w-full py-3 rounded-xl bg-sage text-white text-sm font-medium hover:bg-sage-deep transition-colors">
              {t("docViews.saveChanges")}
            </button>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground leading-relaxed">{doc.summary}</p>
            <div className="flex flex-wrap gap-2">
              {doc.tags.map((tag) => (
                <span key={tag} className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-sage-light text-sage-deep">
                  <Tag size={10} /> {tag}
                </span>
              ))}
            </div>
            {doc.filePath && (
              <div className="card-surface p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-lavender-light flex items-center justify-center shrink-0">
                  <FileText size={18} className="text-lavender-deep" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{doc.title}</p>
                  <p className="text-xs text-muted-foreground">{doc.fileType ?? t("docViews.fileFallback")}</p>
                </div>
                {fileSignedUrl ? (
                  <a
                    href={fileSignedUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    download
                    className="p-2 rounded-full hover:bg-muted transition-colors"
                    aria-label={t("actions.downloadFile")}
                  >
                    <Download size={16} className="text-muted-foreground" />
                  </a>
                ) : (
                  <div className="p-2 rounded-full">
                    <Download size={16} className="text-muted-foreground/40" />
                  </div>
                )}
              </div>
            )}
            <div className="card-surface p-5">
              {doc.content ? (
                <p className="text-sm text-foreground leading-relaxed whitespace-pre-line">{doc.content}</p>
              ) : (
                <button onClick={() => setIsEditing(true)} className="w-full text-sm text-muted-foreground text-center py-4 hover:text-foreground transition-colors">
                  {t("docViews.tapToAddContent")}
                </button>
              )}
            </div>
          </>
        )}
      </main>
      {aiSheet && (
        <AIActionsSheet
          docTitle={doc.title}
          sourceLabel={t("aiSheet.libraryDocument")}
          sourceText={`${doc.title}\n\n${doc.summary}\n\n${doc.content}`}
          onClose={() => setAiSheet(false)}
        />
      )}
    </div>
  );
}

export function TrainingDocDetail({
  doc,
  onBack,
  onToggleComplete,
}: {
  doc: TrainingDoc;
  onBack: () => void;
  onToggleComplete: (completed: boolean) => void;
}) {
  const { t } = useTranslation("infohub");
  const onToggleCompleteRef = useRef(onToggleComplete);
  const lastReportedCompletion = useRef<boolean | null>(null);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(
    doc.completed ? new Set(doc.steps.map((_, index) => index)) : new Set(),
  );
  const [aiSheet, setAiSheet] = useState(false);
  const allDone = completedSteps.size === doc.steps.length;

  useEffect(() => {
    onToggleCompleteRef.current = onToggleComplete;
  }, [onToggleComplete]);

  useEffect(() => {
    setCompletedSteps(doc.completed ? new Set(doc.steps.map((_, index) => index)) : new Set());
    lastReportedCompletion.current = doc.completed;
  }, [doc.completed, doc.id, doc.steps]);

  useEffect(() => {
    if (lastReportedCompletion.current === allDone) return;
    lastReportedCompletion.current = allDone;
    onToggleCompleteRef.current(allDone);
  }, [allDone]);

  const toggle = (index: number) => {
    setCompletedSteps((prev) => {
      const next = new Set(prev);
      next.has(index) ? next.delete(index) : next.add(index);
      return next;
    });
  };

  return (
    <div className="min-h-screen bg-background flex flex-col w-full min-[900px]:max-w-[1120px] xl:max-w-[1040px] mx-auto">
      <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-sm border-b border-border px-5 py-4">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="btn-icon" aria-label={t("back")}>
            <ChevronLeft size={20} className="text-muted-foreground" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="font-display text-lg text-foreground leading-tight truncate">{doc.title}</h1>
            <p className="text-xs text-muted-foreground mt-0.5">{t("docViews.durationStepsProgress", { duration: doc.duration, completed: completedSteps.size, total: doc.steps.length })}</p>
          </div>
          <button
            onClick={() => setAiSheet(true)}
            aria-label={t("docViews.openAiTools")}
            className="p-2 rounded-full hover:bg-lavender-light transition-colors"
          >
            <Sparkles size={18} className="text-lavender-deep" />
          </button>
        </div>
      </header>
      <main className="flex-1 overflow-auto pb-24 px-5 py-5 space-y-3 sm:px-6 lg:px-8">
        {doc.steps.map((step, index) => {
          const done = completedSteps.has(index);
          return (
            <button
              key={index}
              onClick={() => toggle(index)}
              className={cn(
                "w-full flex items-start gap-3 p-4 rounded-xl border text-left transition-all",
                done ? "border-sage/30 bg-sage-light" : "border-border bg-card hover:border-sage/30",
              )}
            >
              {done ? <CheckCircle size={18} className="text-sage-deep mt-0.5 shrink-0" /> : <Circle size={18} className="text-muted-foreground mt-0.5 shrink-0" />}
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-0.5">{t("docViews.step", { n: index + 1 })}</p>
                <p className={cn("text-sm leading-relaxed", done ? "text-sage-deep" : "text-foreground")}>{step}</p>
              </div>
            </button>
          );
        })}
        {allDone && (
          <div className="card-surface p-5 text-center border-sage/30 bg-sage-light animate-fade-in">
            <CheckCircle size={24} className="text-sage-deep mx-auto mb-2" />
            <p className="text-sm font-medium text-sage-deep">{t("docViews.moduleComplete")}</p>
            <p className="text-xs text-sage-deep/70 mt-1">{t("docViews.moduleCompleteNotice")}</p>
            <button
              onClick={() => {
                setCompletedSteps(new Set());
              }}
              className="mt-3 text-xs text-sage-deep/70 underline hover:text-sage-deep transition-colors"
            >
              {t("docViews.markIncomplete")}
            </button>
          </div>
        )}
      </main>
      {aiSheet && (
        <AIActionsSheet
          docTitle={doc.title}
          sourceLabel={t("aiSheet.trainingModule")}
          sourceText={`${doc.title}\n\n${doc.steps.join("\n\n")}`}
          onClose={() => setAiSheet(false)}
        />
      )}
    </div>
  );
}
