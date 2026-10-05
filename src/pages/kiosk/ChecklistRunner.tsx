import { useState, useEffect, useRef, Fragment, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { X, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { getLinkableInfohubResource } from "@/lib/infohub-catalog";
import { sanitizeImageUrl } from "@/lib/sanitize";
import type { AnswerAttribution, KioskChecklist, Question } from "./types";
import {
  INSTRUCTION_ACKNOWLEDGED,
  UNANSWERED_SENTINEL,
  isBlankAnswer,
  loadKioskDraftSnapshot,
  buildRuntimeQuestions,
} from "./utils";
import { useInactivityTimer, useLiveClock } from "./hooks";
import { QuestionInput } from "./QuestionInputs";

// ─── ChecklistRunner (Screen 3) ───────────────────────────────────────────────
// Shows ALL questions in a single scrollable view, grouped by sections.
// Answers are persisted to localStorage so progress survives interruptions.
export function ChecklistRunner({
  checklist, staffName, onComplete, onCancel, onQuestionAnswerChange,
  organizationId, locationId, initialAnswers, initialAttribution,
}: {
  checklist: KioskChecklist;
  staffName: string;
  onComplete: (answers: Record<string, any>, startedAt: Date, attribution: AnswerAttribution) => void;
  onCancel: () => void;
  onQuestionAnswerChange?: (question: Question, value: any) => void;
  /** Organization ID — used to scope photo uploads to the correct storage path */
  organizationId?: string;
  /** Location ID — used to scope photo uploads to the correct storage path */
  locationId?: string;
  /** Pre-filled answers when re-editing a completed checklist */
  initialAnswers?: Record<string, any>;
  /** Who answered what on the earlier submission(s) — carried over on re-edit */
  initialAttribution?: AnswerAttribution;
}) {
  const { t } = useTranslation("kiosk");
  const DRAFT_KEY = `kiosk_draft_${checklist.id}`;
  const [initialDraft] = useState(() => {
    const draft = loadKioskDraftSnapshot(DRAFT_KEY, checklist.questions);
    if (initialAnswers) return { ...draft, answers: initialAnswers, attribution: initialAttribution, hasSavedDraft: false };
    return draft;
  });
  const draftRef = useRef(initialDraft);
  // Per-question "answered by / at" so Reporting can show who did what on a
  // checklist several staff worked on. A ref: it never drives rendering.
  const attributionRef = useRef<AnswerAttribution>({ ...(initialDraft.attribution ?? {}) });
  const attribute = (questionId: string) => {
    attributionRef.current = { ...attributionRef.current, [questionId]: { by: staffName, at: new Date().toISOString() } };
  };

  const [answers, setAnswers] = useState<Record<string, any>>(() => initialDraft.answers);

  const hasSavedDraft = initialDraft.hasSavedDraft;

  const [showDraftBanner, setShowDraftBanner] = useState(hasSavedDraft);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showMissingError, setShowMissingError] = useState(false);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [linkedResourceId, setLinkedResourceId] = useState<string | null>(null);

  // Track when the runner was opened (for PDF metadata)
  const startedAtRef = useRef(new Date());

  const { secondsLeft, cancelCountdown } = useInactivityTimer(true, onCancel);
  const now = useLiveClock();
  const timeStr = now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

  const questions = buildRuntimeQuestions(checklist.questions, answers);
  const scorable = questions.filter(q => q.type !== "instruction");
  const answeredCount = scorable.filter(q => !isBlankAnswer(answers[q.id])).length;
  const progress = scorable.length > 0 ? Math.round((answeredCount / scorable.length) * 100) : 100;
  const hasUnansweredTrigger = (question: Question) =>
    Boolean(question.config?.logicRules?.some(rule => rule.comparator === "unanswered" && (rule.triggers?.length ?? 0) > 0));

  const persistDraft = useCallback((nextAnswers: Record<string, any>) => {
    draftRef.current = { answers: nextAnswers, hasSavedDraft: true };
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ answers: nextAnswers, attribution: attributionRef.current }));
    } catch { /* ignore */ }
  }, []);

  // Derived from live answers so the footer count drops as each missing question is filled in.
  const missingRequired = questions.filter(q => q.required && q.type !== "instruction" && isBlankAnswer(answers[q.id]));
  const completionError = showMissingError && missingRequired.length > 0
    ? t("runner.missingRequired", { count: missingRequired.length })
    : null;

  useEffect(() => {
    if (!lightboxImage) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setLightboxImage(null); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [lightboxImage]);

  const handleComplete = () => {
    // Questions with a "not provided" rule count as skipped once the staff submits without answering.
    let finalAnswers = answers;
    for (const q of questions) {
      if (hasUnansweredTrigger(q) && isBlankAnswer(finalAnswers[q.id])) finalAnswers = { ...finalAnswers, [q.id]: UNANSWERED_SENTINEL };
    }
    if (finalAnswers !== answers) { setAnswers(finalAnswers); persistDraft(finalAnswers); }
    const stillMissing = buildRuntimeQuestions(checklist.questions, finalAnswers)
      .filter(q => q.required && q.type !== "instruction" && isBlankAnswer(finalAnswers[q.id]));
    if (stillMissing.length > 0) {
      setShowMissingError(true);
      document.getElementById(`question-${stillMissing[0].id}`)?.scrollIntoView?.({ behavior: "smooth", block: "center" });
      return;
    }
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
    // Pre-filled defaults nobody touched are attributed to whoever submits.
    const attribution = { ...attributionRef.current };
    const completedAt = new Date().toISOString();
    for (const [questionId, value] of Object.entries(finalAnswers)) {
      if (!attribution[questionId] && !isBlankAnswer(value)) attribution[questionId] = { by: staffName, at: completedAt };
    }
    onComplete(finalAnswers, startedAtRef.current, attribution);
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
              {t("runner.exit")}
            </button>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-sage rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
            </div>
            <p className="text-xs text-muted-foreground shrink-0 w-20 text-right">
              {t("runner.answeredCount", { answered: answeredCount, total: scorable.length })}
            </p>
          </div>
        </div>

        {/* ── Draft-restored banner ── */}
        {showDraftBanner && (
          <div className="shrink-0 mx-5 mt-3">
            <div className="bg-sage/10 border border-sage/20 rounded-xl px-4 py-2.5 flex items-center justify-between">
              <p className="text-xs text-sage font-medium">{t("runner.continuingBanner")}</p>
              <button onClick={() => setShowDraftBanner(false)} className="text-sage/60 hover:text-sage ml-2 p-0.5">
                <X size={12} />
              </button>
            </div>
          </div>
        )}

        {/* ── All questions, always open ── */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {questions.map((q, qi) => {
            const isInstruction = q.type === "instruction";
            const isAnswered = !isBlankAnswer(answers[q.id]);
            const isMissing = !!(completionError && q.required && !isAnswered && !isInstruction);
            // Quiet red edge on required questions still waiting for an answer; gone once answered.
            const needsAnswer = q.required && !isAnswered && !isInstruction;

            const prevQ = qi > 0 ? questions[qi - 1] : null;
            const sectionChanged = !prevQ || prevQ.sectionName !== q.sectionName;
            const showSectionHeader = sectionChanged && !!(q.sectionName);

            return (
              <Fragment key={q.id}>
                {/* ── Section band: name + answered/total ── */}
                {showSectionHeader && (() => {
                  const sectionQs = questions.filter(sq => sq.sectionName === q.sectionName && sq.type !== "instruction");
                  const sectionDone = sectionQs.filter(sq => !isBlankAnswer(answers[sq.id])).length;
                  return (
                    <div className={qi === 0 ? "" : "pt-5"}>
                      <div className="flex items-center justify-between gap-3 rounded-xl bg-gradient-to-r from-powder-blue-deep to-powder-blue-deep/80 text-white px-4 py-2.5 shadow-card">
                        <span className="text-sm font-semibold tracking-wide truncate">{q.sectionName}</span>
                        {sectionQs.length > 0 && (
                          <span className="text-xs font-semibold tabular-nums shrink-0 rounded-full bg-white/20 px-2.5 py-0.5">
                            {sectionDone}/{sectionQs.length}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })()}

                <div
                  id={`question-${q.id}`}
                  className={cn(
                    "bg-card border rounded-2xl p-5 transition-colors shadow-card border-border",
                    needsAnswer && "border-l-[3px] border-l-[#E5251B]",
                    isMissing && "border-status-error/50 bg-status-error/5 ring-1 ring-status-error/20",
                  )}
                >
                  {!isInstruction && (
                    <div className="flex items-start gap-1.5 mb-3">
                      <span className="text-sm font-normal text-foreground tabular-nums shrink-0 leading-snug">
                        {qi + 1}.
                      </span>
                      <p className="text-sm font-normal text-foreground leading-snug flex-1">
                        {q.text}
                        {q.required && <span className="text-status-error ml-1 font-bold">*</span>}
                      </p>
                    </div>
                  )}

                  <QuestionInput
                    question={q}
                    value={answers[q.id]}
                    organizationId={organizationId}
                    locationId={locationId}
                    onChange={v => {
                      const nextAnswers = { ...answers, [q.id]: v };
                      attribute(q.id);
                      setAnswers(nextAnswers);
                      persistDraft(nextAnswers);
                      onQuestionAnswerChange?.(q, v);
                    }}
                    onImageClick={url => setLightboxImage(url)}
                    onLinkedResourceOpen={() => setLinkedResourceId(q.linkedResourceId ?? null)}
                  />

                  {/* Instructions are the only step that still needs an explicit tap. */}
                  {isInstruction && !isAnswered && (
                    <div className="mt-3 flex justify-end">
                      <button
                        onClick={() => {
                          const nextAnswers = { ...answers, [q.id]: INSTRUCTION_ACKNOWLEDGED };
                          attribute(q.id);
                          setAnswers(nextAnswers);
                          persistDraft(nextAnswers);
                        }}
                        className="px-5 py-2 text-xs font-bold tracking-wide rounded-xl transition-colors bg-sage text-white hover:bg-sage-deep active:scale-[0.97]"
                      >
                        {t("runner.acknowledge")}
                      </button>
                    </div>
                  )}
                </div>
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
            {t("runner.completeButton")}
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
              aria-label={t("close")}
            >
              <X size={20} className="text-background" />
            </button>
            <img
              src={sanitizeImageUrl(lightboxImage)}
              alt={t("inputs.fullView")}
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
                    <p className="text-xs text-muted-foreground">{resource.section}</p>
                    <h3 className="text-base font-semibold text-foreground mt-1">{resource.title}</h3>
                    <p className="text-xs text-muted-foreground mt-1">{resource.subtitle}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setLinkedResourceId(null)}
                    className="p-2 rounded-full hover:bg-muted transition-colors shrink-0"
                    aria-label={t("runner.closeLinkedResource")}
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

        {/* ── Exit confirm ── */}
        {showCancelConfirm && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-foreground/30 backdrop-blur-sm">
            <div className="bg-card rounded-2xl p-6 mx-4 max-w-sm w-full space-y-4">
              <h3 className="font-display text-lg text-foreground">{t("runner.cancelConfirmTitle")}</h3>
              <p className="text-sm text-muted-foreground">
                {t("runner.cancelConfirmBody")}
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowCancelConfirm(false)}
                  className="flex-1 py-3 rounded-xl text-sm font-medium border border-border text-foreground hover:bg-muted transition-colors"
                >
                  {t("runner.keepGoing")}
                </button>
                <button
                  onClick={onCancel}
                  className="flex-1 py-3 rounded-xl text-sm font-medium bg-status-error text-primary-foreground hover:opacity-90 transition-colors"
                >
                  {t("runner.exit")}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Inactivity countdown ── */}
        {secondsLeft !== null && (
          <div className="fixed bottom-0 left-0 right-0 bg-foreground/90 text-background px-5 py-3 flex items-center justify-between z-[80]">
            <p className="text-sm">{t("completion.returningIn", { count: secondsLeft })}</p>
            <button onClick={cancelCountdown} className="text-sm font-semibold underline">{t("stayButton")}</button>
          </div>
        )}
      </div>
    </div>
  );
}
