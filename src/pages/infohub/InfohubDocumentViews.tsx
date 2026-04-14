import { useEffect, useRef, useState } from "react";

import { CheckCircle, ChevronLeft, Circle, Pencil, Sparkles, Tag } from "lucide-react";

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
  const folder = folders.find((folderItem) => folderItem.id === doc.folderId);
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
      tags: editTags.split(",").map((tag) => tag.trim()).filter(Boolean),
      lastUpdated: new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }),
    });
    setIsEditing(false);
  }

  return (
    <div className="min-h-screen bg-background flex flex-col w-full min-[900px]:max-w-[1120px] xl:max-w-[1040px] mx-auto">
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
              <label className="text-xs font-medium text-muted-foreground">Title</label>
              <input
                autoFocus
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="w-full border border-border rounded-xl px-4 py-3 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-sage/30"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Summary</label>
              <textarea
                value={editSummary}
                onChange={(e) => setEditSummary(e.target.value)}
                rows={2}
                className="w-full border border-border rounded-xl px-4 py-3 text-sm bg-background resize-none focus:outline-none focus:ring-2 focus:ring-sage/30"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Content</label>
              <textarea
                data-testid="doc-content-editor"
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                rows={10}
                className="w-full border border-border rounded-xl px-4 py-3 text-sm bg-background resize-none focus:outline-none focus:ring-2 focus:ring-sage/30"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Tags (comma-separated)</label>
              <input
                value={editTags}
                onChange={(e) => setEditTags(e.target.value)}
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
              {doc.tags.map((tag) => (
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

export function TrainingDocDetail({
  doc,
  onBack,
  onToggleComplete,
}: {
  doc: TrainingDoc;
  onBack: () => void;
  onToggleComplete: (completed: boolean) => void;
}) {
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
                <p className="text-xs font-semibold text-muted-foreground mb-0.5">Step {index + 1}</p>
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
              onClick={() => {
                setCompletedSteps(new Set());
              }}
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
