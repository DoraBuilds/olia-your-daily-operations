import { useState, useEffect, useRef, Fragment, useCallback } from "react";
import { X, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { getLinkableInfohubResource } from "@/lib/infohub-catalog";
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

// ─── Question Input Components ─────────────────────────────────────────────────

function CheckboxInput({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={cn(
        "w-full min-h-[44px] rounded-2xl border-2 px-5 py-4 text-left text-sm font-medium transition-colors flex items-center gap-3",
        value
          ? "bg-sage-light border-sage text-sage-deep"
          : "bg-card border-border text-foreground hover:border-sage/40",
      )}
    >
      <div className={cn(
        "w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors",
        value ? "bg-sage border-sage" : "border-muted-foreground/40",
      )}>
        {value && <Check size={12} className="text-primary-foreground" />}
      </div>
      {value ? "Yes, completed" : "Tap to confirm"}
    </button>
  );
}

function NumberInput({
  value, onChange, min, max, unit,
}: {
  value: number | "";
  onChange: (v: number | "") => void;
  min?: number;
  max?: number;
  unit?: "C" | "F";
}) {
  const num = value === "" ? 0 : Number(value);
  const hasRange = min != null || max != null;
  const outOfRange = hasRange && value !== "" && (
    (min != null && num < min) || (max != null && num > max)
  );
  return (
    <div className="space-y-1.5">
      <div className="flex items-center">
        <button
          onClick={() => onChange(num - 1)}
          className="w-14 min-h-[44px] bg-muted rounded-l-2xl border border-border text-xl font-semibold text-foreground hover:bg-muted/60 transition-colors flex items-center justify-center"
        >
          −
        </button>
        <input
          type="number"
          value={value}
          onChange={e => onChange(e.target.value === "" ? "" : Number(e.target.value))}
          className={cn(
            "flex-1 min-h-[44px] border-y border-border text-center text-xl font-semibold bg-card focus:outline-none",
            outOfRange && "text-status-error",
          )}
        />
        <button
          onClick={() => onChange(num + 1)}
          className="w-14 min-h-[44px] bg-muted rounded-r-2xl border border-border text-xl font-semibold text-foreground hover:bg-muted/60 transition-colors flex items-center justify-center"
        >
          +
        </button>
      </div>
      {hasRange && (
        <p className={cn(
          "text-[11px] text-center",
          outOfRange ? "text-status-error font-semibold" : "text-muted-foreground",
        )}>
          {outOfRange ? "⚠ Out of acceptable range · " : ""}
          Acceptable: {min != null ? min : "—"} – {max != null ? max : "—"}{unit ? ` ${unit}` : ""}
        </p>
      )}
    </div>
  );
}

function TextInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <textarea
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder="Type your answer here…"
      className="w-full min-h-[130px] border border-border rounded-xl px-4 py-3 text-sm bg-muted focus:outline-none focus:ring-1 focus:ring-ring resize-none"
    />
  );
}

function MultipleChoiceInput({
  options, optionColors, selectionMode = "single", value, onChange,
}: {
  options: string[];
  optionColors?: string[];
  selectionMode?: "single" | "multiple";
  value: string | string[];
  onChange: (v: string | string[]) => void;
}) {
  const selected = Array.isArray(value) ? value : value ? [value] : [];

  const toggleOption = (option: string) => {
    if (selectionMode === "multiple") {
      onChange(selected.includes(option)
        ? selected.filter(item => item !== option)
        : [...selected, option]);
      return;
    }

    onChange(option);
  };

  return (
    <div className="space-y-2">
      {options.map((opt, idx) => (
        <button
          key={opt}
          type="button"
          onClick={() => toggleOption(opt)}
          className={cn(
            "w-full min-h-[56px] rounded-xl border-2 px-4 py-3 text-sm text-left font-medium transition-colors",
            selected.includes(opt)
              ? "border-sage text-sage-deep"
              : "bg-card border-border text-foreground hover:border-sage/40",
            selected.includes(opt) && optionColors?.[idx],
            selected.includes(opt) && !optionColors?.[idx] && "bg-sage-light",
          )}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

function DateTimeInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  // Store date and time separately for clear mobile UX; combine on change
  const datePart = value ? value.slice(0, 10) : "";
  const timePart = value ? value.slice(11, 16) : "";
  const emit = (d: string, t: string) => onChange(d && t ? `${d}T${t}` : d ? `${d}T00:00` : "");
  return (
    <div className="space-y-2">
      <div>
        <label className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1 block">Date</label>
        <input
          type="date"
          value={datePart}
          onChange={e => emit(e.target.value, timePart)}
          className="w-full min-h-[44px] border border-border rounded-xl px-4 py-3 text-sm bg-muted focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>
      <div>
        <label className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1 block">Time</label>
        <input
          type="time"
          value={timePart}
          onChange={e => emit(datePart, e.target.value)}
          className="w-full min-h-[44px] border border-border rounded-xl px-4 py-3 text-sm bg-muted focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>
    </div>
  );
}

function InstructionBlock({
  text, imageUrl, linkedResourceTitle, linkedResourceSection, onImageClick, onLinkedResourceOpen,
}: {
  text: string;
  imageUrl?: string;
  linkedResourceTitle?: string;
  linkedResourceSection?: "library" | "training";
  onImageClick?: (url: string) => void;
  onLinkedResourceOpen?: () => void;
}) {
  return (
    <div className="min-h-[44px] bg-lavender-light rounded-xl px-5 py-4 space-y-3">
      {text && <p className="text-sm text-lavender-deep leading-relaxed">{text}</p>}
      {imageUrl && (
        <button
          type="button"
          onClick={() => onImageClick?.(imageUrl)}
          className="w-full relative group overflow-hidden rounded-lg focus:outline-none"
          aria-label="Tap to enlarge image"
        >
          <img
            src={imageUrl}
            alt="Instruction"
            className="w-full max-h-48 object-cover rounded-lg group-hover:opacity-90 transition-opacity"
          />
          <div className="absolute inset-0 flex items-end justify-end p-2 pointer-events-none">
            <span className="bg-foreground/60 text-background text-[10px] px-2 py-0.5 rounded-full font-medium">
              Tap to enlarge
            </span>
          </div>
        </button>
      )}
      {linkedResourceTitle && (
        <button
          type="button"
          onClick={onLinkedResourceOpen}
          className="w-full rounded-lg border border-lavender-deep/20 bg-background/70 px-4 py-3 text-left transition-colors hover:bg-background"
        >
          <p className="text-xs uppercase tracking-wide text-lavender-deep/70">
            Open linked {linkedResourceSection === "training" ? "training" : "document"}
          </p>
          <p className="text-sm font-medium text-lavender-deep mt-1">{linkedResourceTitle}</p>
        </button>
      )}
    </div>
  );
}

// ─── MediaInput ───────────────────────────────────────────────────────────────
// Live camera capture only. No file picker or library access is exposed.
function MediaInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [captured, setCaptured] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopStream = () => {
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    setStream(null);
  };

  useEffect(() => {
    if (!isOpen) {
      stopStream();
      setCaptured(null);
      setError("");
      return;
    }

    const mediaDevices = navigator.mediaDevices;
    if (!mediaDevices?.getUserMedia) {
      setError("Camera access is not available on this device.");
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false })
      .then(nextStream => {
        if (cancelled) {
          nextStream.getTracks().forEach(track => track.stop());
          return;
        }
        streamRef.current = nextStream;
        setStream(nextStream);
        setError("");
      })
      .catch(() => {
        if (!cancelled) setError("Camera access could not be started.");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!stream || !videoRef.current) return;
    videoRef.current.srcObject = stream;
    void videoRef.current.play().catch(() => {});
  }, [stream]);

  useEffect(() => () => stopStream(), []);

  const openCamera = () => {
    setCaptured(null);
    setError("");
    setIsOpen(true);
  };

  const closeCamera = () => {
    stopStream();
    setCaptured(null);
    setIsOpen(false);
  };

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    setCaptured(canvas.toDataURL("image/png"));
  };

  const useCapturedPhoto = () => {
    if (!captured) return;
    onChange(captured);
    closeCamera();
  };

  return (
    <div className="space-y-3">
      {value ? (
        <div className="space-y-2">
          <div className="relative rounded-xl overflow-hidden border border-border">
            <img src={value} alt="Captured" className="w-full max-h-52 object-cover" />
            <button
              type="button"
              onClick={() => onChange("")}
              className="absolute top-2 right-2 w-7 h-7 rounded-full bg-foreground/60 flex items-center justify-center"
              aria-label="Remove photo"
            >
              <X size={14} className="text-background" />
            </button>
          </div>
          <div className="flex items-center gap-2 text-xs font-medium text-sage">
            <Check size={14} />
            Photo attached
          </div>
          <button
            type="button"
            onClick={openCamera}
            className="text-xs font-medium text-sage hover:underline"
          >
            Retake photo
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={openCamera}
          className="w-full min-h-[80px] border-2 border-dashed border-border rounded-xl flex flex-col items-center justify-center gap-2 text-muted-foreground hover:border-sage hover:text-sage transition-colors"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/>
            <circle cx="12" cy="13" r="3"/>
          </svg>
          <span className="text-sm font-medium">Take photo</span>
          <span className="text-xs">Use the camera to capture this now</span>
        </button>
      )}

      {isOpen && (
        <div className="fixed inset-0 z-[80] bg-background/95 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-card shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div>
                <p className="text-sm font-semibold text-foreground">Capture photo</p>
                <p className="text-xs text-muted-foreground">Take a new photo now, then confirm it.</p>
              </div>
              <button
                type="button"
                onClick={closeCamera}
                className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted"
                aria-label="Close camera"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-4 space-y-4">
              {error ? (
                <div className="rounded-xl border border-status-error/30 bg-status-error/10 px-4 py-3 text-sm text-status-error">
                  {error}
                </div>
              ) : captured ? (
                <div className="space-y-3">
                  <img src={captured} alt="Captured preview" className="w-full rounded-xl border border-border max-h-[60vh] object-cover" />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setCaptured(null)}
                      className="flex-1 px-4 py-3 rounded-xl border border-border text-sm font-medium text-foreground hover:bg-muted"
                    >
                      Retake
                    </button>
                    <button
                      type="button"
                      onClick={useCapturedPhoto}
                      className="flex-1 px-4 py-3 rounded-xl bg-sage text-primary-foreground text-sm font-medium hover:bg-sage/90"
                    >
                      Use photo
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="rounded-xl overflow-hidden border border-border bg-black">
                    <video ref={videoRef} autoPlay playsInline muted className="w-full max-h-[60vh] object-cover" />
                  </div>
                  <canvas ref={canvasRef} className="hidden" />
                  {isLoading && (
                    <p className="text-xs text-muted-foreground">Starting camera…</p>
                  )}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={closeCamera}
                      className="flex-1 px-4 py-3 rounded-xl border border-border text-sm font-medium text-foreground hover:bg-muted"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={capturePhoto}
                      disabled={isLoading || !stream}
                      className="flex-1 px-4 py-3 rounded-xl bg-sage text-primary-foreground text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-sage/90"
                    >
                      Capture photo
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function QuestionInput({
  question, value, onChange, onImageClick, onLinkedResourceOpen,
}: {
  question: Question;
  value: any;
  onChange: (v: any) => void;
  onImageClick?: (url: string) => void;
  onLinkedResourceOpen?: () => void;
}) {
  switch (question.type) {
    case "checkbox":
      return <CheckboxInput value={!!value} onChange={onChange} />;
    case "media":
      return <MediaInput value={value ?? ""} onChange={onChange} />;
    case "number":
      return <NumberInput value={value ?? ""} onChange={onChange} min={question.min} max={question.max} unit={question.temperatureUnit} />;
    case "text":
      return <TextInput value={value ?? ""} onChange={onChange} />;
    case "multiple_choice":
      return (
        <MultipleChoiceInput
          options={question.options ?? []}
          optionColors={question.optionColors}
          selectionMode={question.selectionMode}
          value={value ?? (question.selectionMode === "multiple" ? [] : "")}
          onChange={onChange}
        />
      );
    case "datetime":
      return <DateTimeInput value={value ?? ""} onChange={onChange} />;
    case "instruction":
      return (
        <InstructionBlock
          text={question.instructionText ?? ""}
          imageUrl={question.imageUrl}
          linkedResourceTitle={question.linkedResourceTitle}
          linkedResourceSection={question.linkedResourceSection}
          onImageClick={onImageClick}
          onLinkedResourceOpen={onLinkedResourceOpen}
        />
      );
    default:
      return null;
  }
}

// ─── ChecklistRunner (Screen 3) ───────────────────────────────────────────────
// Shows ALL questions in a single scrollable view, grouped by sections.
// Answers are persisted to localStorage so progress survives interruptions.
export function ChecklistRunner({
  checklist, staffName, onComplete, onCancel, onQuestionAnswerChange,
}: {
  checklist: KioskChecklist;
  staffName: string;
  onComplete: (answers: Record<string, any>, startedAt: Date) => void;
  onCancel: () => void;
  onQuestionAnswerChange?: (question: Question, value: any) => void;
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
  const answeredCount = scorable.filter(q => {
    const v = answers[q.id];
    return !isBlankAnswer(v);
  }).length;
  const progress = scorable.length > 0 ? Math.round((answeredCount / scorable.length) * 100) : 100;
  const currentQuestionIndex = Math.max(0, questions.findIndex(q => q.id === currentQuestionId));
  const hasUnansweredTrigger = (question: Question) =>
    Boolean(question.config?.logicRules?.some(rule => rule.comparator === "unanswered" && (rule.triggers?.length ?? 0) > 0));

  const persistDraft = useCallback((nextAnswers: Record<string, any>, nextCurrentQuestionId: string) => {
    draftRef.current = {
      answers: nextAnswers,
      currentQuestionId: nextCurrentQuestionId,
      hasSavedDraft: true,
    };
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({
        answers: nextAnswers,
        currentQuestionId: nextCurrentQuestionId,
      }));
    } catch { /* ignore */ }
  }, []);

  // Move to the next question in the accordion
  const advanceQuestion = (nextAnswers = answers) => {
    const runtimeQuestions = buildRuntimeQuestions(checklist.questions, nextAnswers);
    setCurrentQuestionId(prev => {
      const currentIndex = runtimeQuestions.findIndex(q => q.id === prev);
      const nextIndex = Math.min(Math.max(currentIndex, 0) + 1, runtimeQuestions.length - 1);
      const nextQuestionId = runtimeQuestions[nextIndex]?.id ?? prev;
      persistDraft(nextAnswers, nextQuestionId);
      // Scroll new current question into view after render
      setTimeout(() => {
        const nextQuestion = document.getElementById(`question-${nextQuestionId}`);
        if (typeof nextQuestion?.scrollIntoView === "function") {
          nextQuestion.scrollIntoView({ behavior: "smooth", block: "center" });
        }
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

  // ESC key closes lightbox
  useEffect(() => {
    if (!lightboxImage) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setLightboxImage(null); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [lightboxImage]);

  const handleComplete = () => {
    const missing = questions.filter(q =>
      q.required && q.type !== "instruction" &&
      isBlankAnswer(answers[q.id])
    );
    if (missing.length > 0) {
      setCompletionError(
        `${missing.length} required question${missing.length !== 1 ? "s" : ""} still need an answer.`
      );
      // Scroll to first missing question
      const firstMissingQuestion = document.getElementById(`question-${missing[0].id}`);
      firstMissingQuestion?.scrollIntoView?.({ behavior: "smooth", block: "center" });
      return;
    }
    // All required questions answered — clear draft and submit
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
            <div
              className="h-full bg-sage rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
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
              <button
                onClick={() => setShowDraftBanner(false)}
                className="text-sage/60 hover:text-sage ml-2 p-0.5"
              >
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

          // Inject a centered section divider when section changes
          const prevQ = qi > 0 ? questions[qi - 1] : null;
          const sectionChanged = !prevQ || prevQ.sectionName !== q.sectionName;
          const showSectionHeader = sectionChanged && !!(q.sectionName);

          // For next/acknowledge button: show on current question for types that don't auto-advance
          // "datetime" is legacy — if it resolves to "text" it's included via q.type === "text"
          const isLastQ = qi >= questions.length - 1;
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
                      <span className="text-[10px] text-sage/70 font-medium shrink-0 mt-0.5">
                        {qi + 1}/{questions.length}
                      </span>
                    </div>
                  )}

                  <div className={cn(!isInstruction && "ml-7")}>
                    <QuestionInput
                      question={q}
                      value={answers[q.id]}
                      onChange={v => {
                        const nextAnswers = { ...answers, [q.id]: v };
                        setAnswers(nextAnswers);
                        persistDraft(nextAnswers, currentQuestionId);
                        onQuestionAnswerChange?.(q, v);
                        const shouldAutoAdvance = (
                          (q.type === "checkbox" && v === true) ||
                          (q.type === "multiple_choice" && q.selectionMode !== "multiple" && v)
                        );
                        if (shouldAutoAdvance) {
                          advanceQuestion(nextAnswers);
                        }
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
                            if (isLastQ) {
                              persistDraft(nextAnswers, q.id);
                            } else {
                              advanceQuestion(nextAnswers);
                            }
                            return;
                          }

                          if (hasBlankUnansweredTrigger && isBlankAnswer(answers[q.id])) {
                            const nextAnswers = { ...answers, [q.id]: UNANSWERED_SENTINEL };
                            setAnswers(nextAnswers);
                            advanceQuestion(nextAnswers);
                            return;
                          }

                          if (isLastQ) {
                            persistDraft(answers, q.id);
                            return;
                          }

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
                // ── Collapsed question (past = clickable, future = dimmed) ──
                <button
                  id={`question-${q.id}`}
                  type="button"
                  onClick={() => { if (isPast) setCurrentQuestionId(q.id); }}
                  disabled={!isPast}
                  className={cn(
                    "w-full bg-card border rounded-2xl px-4 py-3 text-left flex items-center gap-3 transition-colors",
                    isPast
                      ? "border-border hover:border-sage/30 cursor-pointer"
                      : "border-border opacity-40 cursor-default",
                    isMissing && "border-status-error/40 bg-status-error/5",
                  )}
                >
                  {isPast && isAnswered ? (
                    <div className="w-5 h-5 rounded-full bg-sage flex items-center justify-center shrink-0">
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
                  {isPast && isAnswered && (
                    <span className="text-[10px] text-sage font-semibold shrink-0">✓ Done</span>
                  )}
                  {isPast && !isAnswered && !isInstruction && (
                    <span className="text-[10px] text-muted-foreground/60 shrink-0">Edit</span>
                  )}
                  {!isPast && (
                    <span className="text-[10px] text-muted-foreground/50 shrink-0">Pending</span>
                  )}
                </button>
              )}
            </Fragment>
          );
        })}

        {/* Bottom padding so the last card clears the sticky footer */}
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
        {lightboxImage && (
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
              src={lightboxImage}
              alt="Full view"
              className="max-w-full max-h-full object-contain rounded-xl"
              onClick={e => e.stopPropagation()}
            />
          </div>
        )}

        {linkedResourceId && (() => {
        const resource = getLinkableInfohubResource(linkedResourceId);
        if (!resource) return null;

        return (
          <div
            className="fixed inset-0 z-[80] flex items-end justify-center bg-foreground/30 backdrop-blur-sm"
            onClick={() => setLinkedResourceId(null)}
          >
            <div
              className="bg-card w-full max-w-2xl rounded-t-2xl max-h-[80vh] overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-border">
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{resource.section}</p>
                  <h3 className="text-base font-semibold text-foreground mt-1">{resource.title}</h3>
                  <p className="text-xs text-muted-foreground mt-1">{resource.subtitle}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setLinkedResourceId(null)}
                  className="p-2 rounded-full hover:bg-muted transition-colors"
                  aria-label="Close linked resource"
                >
                  <X size={16} className="text-muted-foreground" />
                </button>
              </div>
              <div className="px-5 py-4 overflow-y-auto max-h-[60vh]">
                <div className="whitespace-pre-line text-sm text-foreground leading-relaxed">
                  {resource.body}
                </div>
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
