import { useState, useEffect, useRef, Fragment, useCallback } from "react";
import { X, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { getLinkableInfohubResource } from "@/lib/infohub-catalog";
import { sanitizeImageUrl } from "@/lib/sanitize";
import type { KioskChecklist, Question } from "./types";
import {
  INSTRUCTION_ACKNOWLEDGED,
  UNANSWERED_SENTINEL,
  isBlankAnswer,
  loadKioskDraftSnapshot,
  buildRuntimeQuestions,
  getFirstUnansweredQuestionId,
} from "./utils";
import { useInactivityTimer, useLiveClock } from "./hooks";
import { QuestionInput } from "./QuestionInputs";

// ─── ChecklistRunner (Screen 3) ───────────────────────────────────────────────
// Shows ALL questions in a single scrollable view, grouped by sections.
// Answers are persisted to localStorage so progress survives interruptions.
export function ChecklistRunner({
  checklist, staffName, onComplete, onCancel, onQuestionAnswerChange,
  organizationId, locationId,
}: {
  checklist: KioskChecklist;
  staffName: string;
  onComplete: (answers: Record<string, any>, startedAt: Date) => void;
  onCancel: () => void;
  onQuestionAnswerChange?: (question: Question, value: any) => void;
  /** Organization ID — used to scope photo uploads to the correct storage path */
  organizationId?: string;
  /** Location ID — used to scope photo uploads to the correct storage path */
  locationId?: string;
}) {
  const DRAFT_KEY = `kiosk_draft_${checklist.id}`;
  const [initialDraft] = useState(() => loadKioskDraftSnapshot(DRAFT_KEY, checklist.questions));
  const draftRef = useRef(initialDraft);

  const [answers, setAnswers] = useState<Record<string, any>>(() => initialDraft.answers);

  const hasSavedDraft = initialDraft.hasSavedDraft;
  const initialRuntimeQuestions = buildRuntimeQuestions(checklist.questions, initialDraft.answers);

  const [showDraftBanner, setShowDraftBanner] = useState(hasSavedDraft);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [completionError, setCompletionError] = useState<string | null>(null);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [linkedResourceId, setLinkedResourceId] = useState<string | null>(null);

  // Accordion: track which question is currently open/active
  const [currentQuestionId, setCurrentQuestionId] = useState<string>(() => {
    if (typeof initialDraft.currentQuestionId === "string" && initialDraft.currentQuestionId) {
      return initialDraft.currentQuestionId;
    }
    if (typeof initialDraft.currentQIdx === "number" && Number.isFinite(initialDraft.currentQIdx)) {
      return initialRuntimeQuestions[Math.min(
        Math.max(0, initialDraft.currentQIdx),
        Math.max(0, initialRuntimeQuestions.length - 1),
      )]?.id ?? initialRuntimeQuestions[0]?.id ?? "";
    }
    return getFirstUnansweredQuestionId(initialRuntimeQuestions, initialDraft.answers) ?? initialRuntimeQuestions[0]?.id ?? "";
  });

  // Track when the runner was opened (for PDF metadata)
  const startedAtRef = useRef(new Date());

  const { secondsLeft, cancelCountdown } = useInactivityTimer(true, onCancel);
  const now = useLiveClock();
  const timeStr = now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

  const questions = buildRuntimeQuestions(checklist.questions, answers);
  const scorable = questions.filter(q => q.type !== "instruction");
  const answeredCount = scorable.filter(q => !isBlankAnswer(answers[q.id])).length;
  const progress = scorable.length > 0 ? Math.round((answeredCount / scorable.length) * 100) : 100;
  const currentQuestionIndex = Math.max(0, questions.findIndex(q => q.id === currentQuestionId));
  const hasUnansweredTrigger = (question: Question) =>
    Boolean(question.config?.logicRules?.some(rule => rule.comparator === "unanswered" && (rule.triggers?.length ?? 0) > 0));

  const persistDraft = useCallback((nextAnswers: Record<string, any>, nextCurrentQuestionId: string) => {
    draftRef.current = { answers: nextAnswers, currentQuestionId: nextCurrentQuestionId, hasSavedDraft: true };
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ answers: nextAnswers, currentQuestionId: nextCurrentQuestionId }));
    } catch { /* ignore */ }
  }, []);

  const advanceQuestion = (nextAnswers = answers) => {
    const runtimeQuestions = buildRuntimeQuestions(checklist.questions, nextAnswers);
    setCurrentQuestionId(prev => {
      const currentIndex = runtimeQuestions.findIndex(q => q.id === prev);
      const nextIndex = Math.min(Math.max(currentIndex, 0) + 1, runtimeQuestions.length - 1);
      const nextQuestionId = runtimeQuestions[nextIndex]?.id ?? prev;
      persistDraft(nextAnswers, nextQuestionId);
      setTimeout(() => {
        const el = document.getElementById(`question-${nextQuestionId}`);
        if (typeof el?.scrollIntoView === "function") el.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 60);
      return nextQuestionId;
    });
  };

  useEffect(() => {
    if (!questions.some(q => q.id === currentQuestionId)) {
      const fallbackId = getFirstUnansweredQuestionId(questions, answers) ?? questions[0]?.id ?? "";
      if (fallbackId && fallbackId !== currentQuestionId) {
        persistDraft(answers, fallbackId);
        setCurrentQuestionId(fallbackId);
      }
    }
  }, [answers, currentQuestionId, questions, persistDraft]);

  useEffect(() => {
    if (!lightboxImage) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setLightboxImage(null); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [lightboxImage]);

  const handleComplete = () => {
    const missing = questions.filter(q => q.required && q.type !== "instruction" && isBlankAnswer(answers[q.id]));
    if (missing.length > 0) {
      setCompletionError(`${missing.length} required question${missing.length !== 1 ? "s" : ""} still need an answer.`);
      document.getElementById(`question-${missing[0].id}`)?.scrollIntoView?.({ behavior: "smooth", block: "center" });
      return;
    }
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
    onComplete(answers, startedAtRef.current);
  };

  return (
    <div className="h-screen bg-background w-full overflow-x-hidden">
      <div
        data-testid="kiosk-runner-shell"
        className="mx-auto flex h-full w-full flex-col min-[900px]:max-w-[1120px]"
      >

        {/* ── Sticky header ── */}
        <div className="shrink-0 bg-background border-b border-border px-5 pt-5 pb-3">
          <div className="flex items-start justify-between mb-3">
            <div className="flex-1 min-w-0 pr-4">
              <h2 className="font-display text-xl text-foreground leading-tight">{checklist.title}</h2>
              <p className="text-xs text-muted-foreground mt-0.5">{staffName} · {timeStr}</p>
            </div>
            <button
              onClick={() => setShowCancelConfirm(true)}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors shrink-0 mt-1"
            >
              Cancel
            </button>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-sage rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
            </div>
            <p className="text-xs text-muted-foreground shrink-0 w-20 text-right">
              {answeredCount}/{scorable.length} answered
            </p>
          </div>
        </div>

        {/* ── Draft-restored banner ── */}
        {showDraftBanner && (
          <div className="shrink-0 mx-5 mt-3">
            <div className="bg-sage/10 border border-sage/20 rounded-xl px-4 py-2.5 flex items-center justify-between">
              <p className="text-xs text-sage font-medium">Continuing from where you left off</p>
              <button onClick={() => setShowDraftBanner(false)} className="text-sage/60 hover:text-sage ml-2 p-0.5">
                <X size={12} />
              </button>
            </div>
          </div>
        )}

        {/* ── Accordion questions ── */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2">
          {questions.map((q, qi) => {
            const isInstruction = q.type === "instruction";
            const isCurrent = qi === currentQuestionIndex;
            const isPast = qi < currentQuestionIndex;

            const isAnswered = !isBlankAnswer(answers[q.id]);
            const isMissing = !!(completionError && q.required && !isAnswered && !isInstruction);

            const prevQ = qi > 0 ? questions[qi - 1] : null;
            const sectionChanged = !prevQ || prevQ.sectionName !== q.sectionName;
            const showSectionHeader = sectionChanged && !!(q.sectionName);

            const isLastQ = qi >= questions.length - 1;
            const answerVal = answers[q.id];
            // For colored multiple-choice (e.g. Yes/No preset), reflect the selected option's color
            let selectedOptionSeverity: "error" | "warn" | null = null;
            if (q.type === "multiple_choice" && q.optionColors?.length && typeof answerVal === "string" && q.options?.length) {
              const idx = q.options.indexOf(answerVal);
              if (idx >= 0 && idx < q.optionColors.length) {
                const color = q.optionColors[idx];
                if (color.includes("status-error")) selectedOptionSeverity = "error";
                else if (color.includes("status-warn")) selectedOptionSeverity = "warn";
              }
            }
            // For uncolored multiple-choice, treat a "No" answer as a warning
            const isNoAnswer = q.type === "multiple_choice" && !q.optionColors?.length &&
              typeof answerVal === "string" && answerVal.toLowerCase() === "no";
            const hasBlankUnansweredTrigger = hasUnansweredTrigger(q);
            const needsNextBtn = isCurrent && (
              isInstruction ||
              q.type === "text" ||
              q.type === "number" ||
              q.type === "datetime" ||
              q.type === "media" ||
              (!q.required && q.type === "checkbox") ||
              hasBlankUnansweredTrigger ||
              (q.type === "multiple_choice" && (q.selectionMode === "multiple" || !q.required))
            );
            const nextBtnDisabled = q.type === "multiple_choice" && q.selectionMode === "multiple" && q.required && !isAnswered && !hasBlankUnansweredTrigger;

            return (
              <Fragment key={q.id}>
                {/* ── Centered section header ── */}
                {showSectionHeader && (
                  <div className={cn("flex items-center gap-3", qi === 0 ? "mb-1" : "mt-5 mb-1")}>
                    <div className="flex-1 h-px bg-border" />
                    <span className="section-label text-foreground/70 shrink-0">{q.sectionName}</span>
                    <div className="flex-1 h-px bg-border" />
                  </div>
                )}

                {isCurrent ? (
                  // ── Expanded (active) question ──
                  <div
                    id={`question-${q.id}`}
                    className={cn(
                      "bg-card border rounded-2xl p-4 transition-colors shadow-sm",
                      isMissing
                        ? "border-status-error/50 bg-status-error/5 ring-1 ring-status-error/20"
                        : "border-sage/40 ring-1 ring-sage/15",
                    )}
                  >
                    {!isInstruction && (
                      <div className="flex items-start gap-2.5 mb-3">
                        <div className={cn(
                          "w-5 h-5 rounded-full border-2 shrink-0 mt-0.5",
                          q.required ? "border-sage/50" : "border-muted-foreground/30",
                        )} />
                        <p className="text-sm font-semibold text-foreground leading-snug flex-1">
                          {q.text}
                          {q.required && <span className="text-status-error ml-1 font-bold">*</span>}
                        </p>
                        <span className="text-xs text-sage/70 font-medium shrink-0 mt-0.5">
                          {qi + 1}/{questions.length}
                        </span>
                      </div>
                    )}

                    <div className={cn(!isInstruction && "ml-7")}>
                      <QuestionInput
                        question={q}
                        value={answers[q.id]}
                        organizationId={organizationId}
                        locationId={locationId}
                        onChange={v => {
                          const nextAnswers = { ...answers, [q.id]: v };
                          setAnswers(nextAnswers);
                          persistDraft(nextAnswers, currentQuestionId);
                          onQuestionAnswerChange?.(q, v);
                          const shouldAutoAdvance = (
                            (q.type === "checkbox" && v === true) ||
                            (q.type === "multiple_choice" && q.selectionMode !== "multiple" && v)
                          );
                          if (shouldAutoAdvance) advanceQuestion(nextAnswers);
                        }}
                        onImageClick={url => setLightboxImage(url)}
                        onLinkedResourceOpen={() => setLinkedResourceId(q.linkedResourceId ?? null)}
                      />
                    </div>

                    {needsNextBtn && (
                      <div className={cn("mt-3 flex justify-end", !isInstruction && "ml-7")}>
                        <button
                          onClick={() => {
                            if (isInstruction) {
                              const nextAnswers = { ...answers, [q.id]: INSTRUCTION_ACKNOWLEDGED };
                              setAnswers(nextAnswers);
                              if (isLastQ) { persistDraft(nextAnswers, q.id); } else { advanceQuestion(nextAnswers); }
                              return;
                            }
                            if (hasBlankUnansweredTrigger && isBlankAnswer(answers[q.id])) {
                              const nextAnswers = { ...answers, [q.id]: UNANSWERED_SENTINEL };
                              setAnswers(nextAnswers);
                              advanceQuestion(nextAnswers);
                              return;
                            }
                            if (isLastQ) { persistDraft(answers, q.id); return; }
                            advanceQuestion();
                          }}
                          disabled={nextBtnDisabled}
                          className={cn(
                            "px-5 py-2 text-xs font-bold tracking-wide rounded-xl transition-colors",
                            nextBtnDisabled
                              ? "bg-muted text-muted-foreground cursor-not-allowed"
                              : "bg-sage text-white hover:bg-sage-deep active:scale-[0.97]",
                          )}
                        >
                          {isInstruction ? "Acknowledge" : "Next →"}
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  // ── Collapsed question (all clickable — free-order navigation) ──
                  <button
                    id={`question-${q.id}`}
                    type="button"
                    onClick={() => setCurrentQuestionId(q.id)}
                    className={cn(
                      "w-full bg-card border rounded-2xl px-4 py-3 text-left flex items-center gap-3 transition-colors cursor-pointer hover:border-sage/30",
                      isPast ? "border-border" : "border-border opacity-60",
                      isMissing && "border-status-error/40 bg-status-error/5",
                      !isMissing && selectedOptionSeverity === "error" && "border-status-error/30 bg-status-error/5",
                      !isMissing && selectedOptionSeverity === "warn" && "border-status-warn/30 bg-status-warn/5",
                      !isMissing && isNoAnswer && "border-status-warn/30 bg-status-warn/5",
                    )}
                  >
                    {isAnswered ? (
                      <div className={cn(
                        "w-5 h-5 rounded-full flex items-center justify-center shrink-0",
                        selectedOptionSeverity === "error" ? "bg-status-error" :
                        selectedOptionSeverity === "warn" ? "bg-status-warn" :
                        isNoAnswer ? "bg-status-warn" : "bg-sage",
                      )}>
                        <Check size={11} className="text-white" />
                      </div>
                    ) : (
                      <div className={cn(
                        "w-5 h-5 rounded-full border-2 shrink-0",
                        isMissing ? "border-status-error/50" : "border-muted-foreground/25",
                      )} />
                    )}
                    <p className={cn(
                      "text-sm font-medium truncate flex-1",
                      isPast ? "text-foreground" : "text-muted-foreground",
                    )}>
                      {isInstruction ? (q.instructionText ?? q.text ?? "Note") : q.text}
                      {q.required && !isInstruction && <span className="text-status-error ml-1">*</span>}
                    </p>
                    {isAnswered && (
                      <span className={cn(
                        "text-xs font-semibold shrink-0",
                        selectedOptionSeverity === "error" ? "text-status-error" :
                        selectedOptionSeverity === "warn" ? "text-status-warn" :
                        isNoAnswer ? "text-status-warn" : "text-sage",
                      )}>✓ Done</span>
                    )}
                    {!isAnswered && isPast && !isInstruction && <span className="text-xs text-muted-foreground/60 shrink-0">Edit</span>}
                    {!isAnswered && !isPast && <span className="text-xs text-muted-foreground/50 shrink-0">Pending</span>}
                  </button>
                )}
              </Fragment>
            );
          })}
          <div className="h-4" />
        </div>

        {/* ── Sticky footer ── */}
        <div className="shrink-0 bg-background border-t border-border px-5 py-4 space-y-2.5">
          {completionError && (
            <div className="bg-status-error/10 border border-status-error/20 rounded-xl px-4 py-2.5 text-xs text-status-error font-medium text-center">
              {completionError}
            </div>
          )}
          <button
            id="runner-complete-btn"
            onClick={handleComplete}
            className="w-full py-4 rounded-2xl text-sm font-bold tracking-wide bg-sage text-white hover:bg-sage-deep transition-colors flex items-center justify-center gap-2 active:scale-[0.98]"
          >
            <Check size={16} />
            Complete Checklist
          </button>
        </div>

        {/* ── Image lightbox ── */}
        {lightboxImage && sanitizeImageUrl(lightboxImage) && (
          <div
            className="fixed inset-0 z-[90] bg-foreground/95 flex items-center justify-center p-4"
            onClick={() => setLightboxImage(null)}
          >
            <button
              onClick={() => setLightboxImage(null)}
              className="absolute top-5 right-5 w-10 h-10 rounded-full bg-background/20 hover:bg-background/30 flex items-center justify-center transition-colors"
              aria-label="Close"
            >
              <X size={20} className="text-background" />
            </button>
            <img
              src={sanitizeImageUrl(lightboxImage)}
              alt="Full view"
              className="max-w-full max-h-full object-contain rounded-xl"
              onClick={e => e.stopPropagation()}
            />
          </div>
        )}

        {/* ── Linked infohub resource modal ── */}
        {linkedResourceId && (() => {
          const resource = getLinkableInfohubResource(linkedResourceId);
          if (!resource) return null;
          return (
            <div
              className="fixed inset-0 z-[80] flex items-center justify-center bg-foreground/30 backdrop-blur-sm px-4 py-8"
              onClick={() => setLinkedResourceId(null)}
            >
              <div
                className="bg-card w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col max-h-[90vh]"
                onClick={e => e.stopPropagation()}
              >
                <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-border shrink-0">
                  <div className="min-w-0">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">{resource.section}</p>
                    <h3 className="text-base font-semibold text-foreground mt-1">{resource.title}</h3>
                    <p className="text-xs text-muted-foreground mt-1">{resource.subtitle}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setLinkedResourceId(null)}
                    className="p-2 rounded-full hover:bg-muted transition-colors shrink-0"
                    aria-label="Close linked resource"
                  >
                    <X size={16} className="text-muted-foreground" />
                  </button>
                </div>
                <div className="px-5 py-5 overflow-y-auto flex-1">
                  <div className="whitespace-pre-line text-sm text-foreground leading-relaxed">{resource.body}</div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* ── Cancel confirm ── */}
        {showCancelConfirm && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-foreground/30 backdrop-blur-sm">
            <div className="bg-card rounded-2xl p-6 mx-4 max-w-sm w-full space-y-4">
              <h3 className="font-display text-lg text-foreground">Cancel checklist?</h3>
              <p className="text-sm text-muted-foreground">
                Your answers are saved as a draft. You can pick up where you left off next time.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowCancelConfirm(false)}
                  className="flex-1 py-3 rounded-xl text-sm font-medium border border-border text-foreground hover:bg-muted transition-colors"
                >
                  Keep going
                </button>
                <button
                  onClick={onCancel}
                  className="flex-1 py-3 rounded-xl text-sm font-medium bg-status-error text-primary-foreground hover:opacity-90 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Inactivity countdown ── */}
        {secondsLeft !== null && (
          <div className="fixed bottom-0 left-0 right-0 bg-foreground/90 text-background px-5 py-3 flex items-center justify-between z-[80]">
            <p className="text-sm">Returning to home in {secondsLeft}s…</p>
            <button onClick={cancelCountdown} className="text-sm font-semibold underline">Stay</button>
          </div>
        )}
      </div>
    </div>
  );
}
