// ─── Kiosk Utility Functions ──────────────────────────────────────────────────

import type { LogicComparator, LogicRule, QuestionDef } from "@/pages/checklists/types";
import type { AnswerAttribution, KioskChecklist, KioskDraftSnapshot, Question, QuestionType, TimeOfDay } from "./types";

// "signature" and "person" are excluded (removed from builder); they fall back to "text".
export const SUPPORTED_QUESTION_TYPES: QuestionType[] = [
  "checkbox", "text", "number", "datetime", "multiple_choice", "instruction", "media",
];

/**
 * Flatten SectionDef[] (stored as JSONB in `checklists.sections`) into
 * the kiosk's flat Question[].
 */
export function flattenSectionsToQuestions(sections: any[]): Question[] {
  return (sections ?? []).flatMap((section: any) =>
    (section.questions ?? []).map((q: any) => convertQuestionDefToKioskQuestion(q, section.name || ""))
  );
}

export function convertQuestionDefToKioskQuestion(question: QuestionDef, sectionName = ""): Question {
  // Legacy "person" type: render as multiple_choice using the baked-in choices.
  // Legacy "signature" type: falls through to "text" (the runner renders a plain text input).
  // Neither type is available in the builder any more.
  const isPerson = question.responseType === "person";
  const resolvedType = isPerson
    ? "multiple_choice"
    : (SUPPORTED_QUESTION_TYPES.includes(question.responseType) ? question.responseType : "text") as QuestionType;
  const resolvedOptions = isPerson
    ? (question.config?.personChoices ?? question.choices ?? [])
    : question.choices;

  return {
    id: question.id,
    text: question.text,
    type: resolvedType,
    required: question.required ?? false,
    options: resolvedOptions,
    optionColors: question.choiceColors,
    selectionMode: question.selectionMode ?? "single",
    instructionText: question.config?.instructionText,
    imageUrl: question.config?.instructionImageUrl,
    linkedResourceId: question.config?.instructionLinkId,
    linkedResourceTitle: question.config?.instructionLinkTitle,
    linkedResourceSection: question.config?.instructionLinkSection,
    sectionName,
    // For person type: carry the builder's default so the runner can pre-fill it
    defaultValue: isPerson ? (question.config?.defaultPerson ?? "") : "",
    // Number range: set in builder as config.numberMin / config.numberMax
    min: question.config?.numberMin != null ? Number(question.config.numberMin) : undefined,
    max: question.config?.numberMax != null ? Number(question.config.numberMax) : undefined,
    temperatureUnit: question.config?.temperatureUnit,
    config: question.config?.logicRules?.length
      ? { logicRules: question.config.logicRules }
      : undefined,
  };
}

const VALID_TIMES_OF_DAY: TimeOfDay[] = ["morning", "afternoon", "evening", "anytime"];

export function dbToKioskChecklist(raw: any): KioskChecklist {
  const tod: TimeOfDay = VALID_TIMES_OF_DAY.includes(raw.time_of_day)
    ? raw.time_of_day
    : "anytime";
  return {
    id: raw.id,
    title: raw.title,
    location_id: raw.location_id ?? null,
    time_of_day: tod,
    due_time: raw.due_time ?? null,
    visibility_from: raw.visibility_from ?? null,
    visibility_until: raw.visibility_until ?? null,
    allow_late_completion: raw.allow_late_completion ?? true,
    day_end_time: raw.day_end_time ?? null,
    questions: flattenSectionsToQuestions(raw.sections ?? []),
  };
}

function parseTimeToMinutes(time: string | null | undefined): number | null {
  if (!time) return null;
  const [h, m] = time.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

/**
 * Legacy due_time helper kept for older checklists that still use the old
 * single-time visibility model.
 */
export function isKioskDue(due_time: string | null | undefined, now: Date): boolean {
  if (!due_time) return true;
  const [h, m] = due_time.split(":").map(Number);
  const dueMinutes = h * 60 + m;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  // Show from 1 hour before due (dueMinutes - 60) through end of day
  return nowMinutes >= dueMinutes - 60 && nowMinutes <= dueMinutes;
}

export function isKioskOverdue(due_time: string | null | undefined, now: Date): boolean {
  if (!due_time) return false;
  const [h, m] = due_time.split(":").map(Number);
  const dueMinutes = h * 60 + m;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  return nowMinutes > dueMinutes;
}

/**
 * On-time / late stamp for a completion happening at `now`: inside the due
 * window is on time, after it is late. Checklists with no window have no
 * deadline, so no stamp.
 */
export function getKioskTimingStatus(
  checklist: Parameters<typeof getKioskVisibilityState>[0],
  now: Date,
): "on_time" | "late" | null {
  if (!checklist.visibility_from && !checklist.visibility_until && !checklist.due_time) return null;
  const state = getKioskVisibilityState(checklist, now);
  if (state === "due") return "on_time";
  if (state === "overdue") return "late";
  return null;
}

export type KioskVisibilityState = "due" | "upcoming" | "overdue" | "missed";

/**
 * Where a checklist is right now. The window end is the deadline: before the
 * window it is upcoming, inside it due, after it overdue (late completion on)
 * or missed (late completion off). Overdue ends at the location's day end
 * (default midnight), when the next operating day starts.
 */
export function getKioskVisibilityState(
  checklist: Pick<KioskChecklist, "due_time" | "visibility_from" | "visibility_until"> &
    Partial<Pick<KioskChecklist, "allow_late_completion" | "day_end_time">>,
  now: Date
): KioskVisibilityState {
  // Measure everything from the start of the operating day (the previous day
  // end) so a 04:00 day end keeps 01:00 in the day that began yesterday.
  const dayEnd = parseTimeToMinutes(checklist.day_end_time) ?? 0;
  const shift = (minutes: number) => (minutes - dayEnd + 24 * 60) % (24 * 60);
  const afterWindow: KioskVisibilityState = checklist.allow_late_completion === false ? "missed" : "overdue";
  const nowMinutes = shift(now.getHours() * 60 + now.getMinutes());
  const rawFrom = parseTimeToMinutes(checklist.visibility_from);
  const rawUntil = parseTimeToMinutes(checklist.visibility_until);

  if (rawFrom != null || rawUntil != null) {
    const start = rawFrom != null ? shift(rawFrom) : 0;
    const end = rawUntil != null ? shift(rawUntil) : 24 * 60 - 1;
    if (start <= end) {
      if (nowMinutes < start) return "upcoming";
      if (nowMinutes > end) return afterWindow;
      return "due";
    }
    // Overnight visibility window: visible from start through midnight, and
    // from midnight through end.
    if (nowMinutes >= start || nowMinutes <= end) return "due";
    return nowMinutes < start ? "upcoming" : afterWindow;
  }

  if (checklist.due_time) {
    const dueMinutes = parseTimeToMinutes(checklist.due_time);
    if (dueMinutes != null) {
      const due = shift(dueMinutes);
      if (nowMinutes >= due - 60 && nowMinutes <= due) return "due";
      if (nowMinutes > due) return afterWindow;
    }
    return "upcoming";
  }

  return "due";
}

/** @deprecated — kept for test compatibility; use isKioskDue instead */
export function isVisibleAtTime(tod: TimeOfDay, now: Date): boolean {
  if (tod === "anytime") return true;
  const h = now.getHours();
  if (tod === "morning")   return h >= 5  && h < 12;
  if (tod === "afternoon") return h >= 12 && h < 17;
  if (tod === "evening")   return h >= 17 && h < 22;
  return true;
}

export const INSTRUCTION_ACKNOWLEDGED = "__instruction_acknowledged__";
export const UNANSWERED_SENTINEL = "__unanswered__";

export function isBlankAnswer(value: any) {
  return Array.isArray(value)
    ? value.length === 0
    : value === UNANSWERED_SENTINEL || value === undefined || value === "" || value === null || value === false;
}

export function loadKioskDraftSnapshot(draftKey: string, questions: Question[]): KioskDraftSnapshot {
  const defaults: Record<string, any> = {};
  for (const q of questions) {
    if (q.defaultValue) defaults[q.id] = q.defaultValue;
  }

  try {
    const raw = localStorage.getItem(draftKey);
    if (!raw) {
      return { answers: defaults, hasSavedDraft: false };
    }

    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      if ("answers" in parsed && parsed.answers && typeof parsed.answers === "object" && !Array.isArray(parsed.answers)) {
        return {
          answers: { ...defaults, ...(parsed.answers as Record<string, any>) },
          attribution: parsed.attribution && typeof parsed.attribution === "object" && !Array.isArray(parsed.attribution)
            ? parsed.attribution as AnswerAttribution
            : undefined,
          currentQuestionId: typeof parsed.currentQuestionId === "string" && parsed.currentQuestionId
            ? parsed.currentQuestionId
            : undefined,
          currentQIdx: typeof parsed.currentQIdx === "number" && Number.isFinite(parsed.currentQIdx)
            ? parsed.currentQIdx
            : undefined,
          hasSavedDraft: true,
        };
      }

      return {
        answers: { ...defaults, ...(parsed as Record<string, any>) },
        hasSavedDraft: true,
      };
    }
  } catch {
    // Ignore malformed draft data and fall back to a clean run.
  }

  return { answers: defaults, hasSavedDraft: false };
}

export function runtimeTriggerKey(questionId: string, ruleId: string, triggerIdx: number, kind: "note" | "media") {
  return `__trigger_${kind}:${questionId}:${ruleId}:${triggerIdx}`;
}

export function normalizeAnswerText(value: any): string {
  if (Array.isArray(value)) return value.map(item => String(item)).join(" | ");
  if (value === undefined || value === null) return "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value).trim();
}

/** A reading passes when it sits inside the acceptable range; a missing bound is open-ended. */
export function isWithinRange(value: number, min?: number, max?: number) {
  return (min == null || value >= min) && (max == null || value <= max);
}

export function parseComparableNumber(value: any): number | null {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function getQuestionAnswer(question: Question, answers: Record<string, any>) {
  return answers[question.id];
}

export function doesRuleMatch(question: Question, rule: LogicRule, answers: Record<string, any>) {
  const rawAnswer = getQuestionAnswer(question, answers);
  if (rule.comparator === "unanswered") {
    return rawAnswer === UNANSWERED_SENTINEL;
  }
  // Blank and checkbox rules are decided by whether there is an answer at all.
  if (rule.comparator === "is_blank" || rule.comparator === "not_checked") return isBlankAnswer(rawAnswer);
  if (rule.comparator === "is_not_blank") return !isBlankAnswer(rawAnswer);
  if (rule.comparator === "checked") return !isBlankAnswer(rawAnswer);
  if (rule.comparator === "passes" || rule.comparator === "fails") {
    const reading = parseComparableNumber(rawAnswer);
    if (reading == null) return false;
    const inRange = isWithinRange(reading, question.min, question.max);
    return rule.comparator === "passes" ? inRange : !inRange;
  }
  if (isBlankAnswer(rawAnswer)) return false;

  const answerText = normalizeAnswerText(rawAnswer).toLowerCase();
  const ruleValue = normalizeAnswerText(rule.value).toLowerCase();
  const ruleValueTo = normalizeAnswerText(rule.valueTo).toLowerCase();
  const ruleValues = (rule.values ?? []).map(v => normalizeAnswerText(v).toLowerCase());
  const answerNumber = parseComparableNumber(rawAnswer);
  const ruleNumber = parseComparableNumber(rule.value);
  const ruleNumberTo = parseComparableNumber(rule.valueTo);

  switch (rule.comparator as LogicComparator) {
    case "is":
    case "is_selected":
    case "eq":
      if (Array.isArray(rawAnswer)) return rawAnswer.map(item => normalizeAnswerText(item).toLowerCase()).includes(ruleValue);
      return answerText === ruleValue;
    case "is_not":
    case "is_not_selected":
    case "neq":
      if (Array.isArray(rawAnswer)) return !rawAnswer.map(item => normalizeAnswerText(item).toLowerCase()).includes(ruleValue);
      return answerText !== ruleValue;
    case "is_one_of":
      if (Array.isArray(rawAnswer)) return rawAnswer.some(item => ruleValues.includes(normalizeAnswerText(item).toLowerCase()));
      return ruleValues.includes(answerText);
    case "is_not_one_of":
      if (Array.isArray(rawAnswer)) return !rawAnswer.some(item => ruleValues.includes(normalizeAnswerText(item).toLowerCase()));
      return !ruleValues.includes(answerText);
    case "lt":
      return answerNumber != null && ruleNumber != null ? answerNumber < ruleNumber : false;
    case "lte":
      return answerNumber != null && ruleNumber != null ? answerNumber <= ruleNumber : false;
    case "gte":
      return answerNumber != null && ruleNumber != null ? answerNumber >= ruleNumber : false;
    case "gt":
      return answerNumber != null && ruleNumber != null ? answerNumber > ruleNumber : false;
    case "between":
      return answerNumber != null && ruleNumber != null && ruleNumberTo != null
        ? answerNumber >= ruleNumber && answerNumber <= ruleNumberTo
        : false;
    case "not_between":
      return answerNumber != null && ruleNumber != null && ruleNumberTo != null
        ? answerNumber < ruleNumber || answerNumber > ruleNumberTo
        : false;
    default:
      return answerText === ruleValue;
  }
}

export function createRuntimeQuestion(
  kind: "note" | "media",
  question: Question,
  rule: LogicRule,
  triggerIdx: number,
): Question {
  const suffix = kind === "note" ? "Note required" : "Photo required";
  return {
    id: runtimeTriggerKey(question.id, rule.id, triggerIdx, kind),
    text: `${suffix}: ${question.text || "Question"}`,
    type: kind === "note" ? "text" : "media",
    required: true,
    sectionName: question.sectionName,
  };
}

export function getTriggeredRuntimeQuestions(question: Question, answers: Record<string, any>) {
  const rawAnswer = getQuestionAnswer(question, answers);
  if (isBlankAnswer(rawAnswer) && rawAnswer !== UNANSWERED_SENTINEL) return [];

  const rules = question.config?.logicRules ?? [];
  const followUps: Question[] = [];
  let noteQuestion: Question | null = null;
  let mediaQuestion: Question | null = null;

  rules.forEach((rule) => {
    if (!doesRuleMatch(question, rule, answers)) return;
    rule.triggers.forEach((trigger, triggerIdx) => {
      if (trigger.type === "ask_question" && trigger.config?.followUpQuestion) {
        followUps.push(convertQuestionDefToKioskQuestion(trigger.config.followUpQuestion, question.sectionName));
      }
      if (trigger.type === "require_note" && !noteQuestion) {
        noteQuestion = createRuntimeQuestion("note", question, rule, triggerIdx);
      }
      if (trigger.type === "require_media" && !mediaQuestion) {
        mediaQuestion = createRuntimeQuestion("media", question, rule, triggerIdx);
      }
    });
  });

  return [...followUps, ...(noteQuestion ? [noteQuestion] : []), ...(mediaQuestion ? [mediaQuestion] : [])];
}

export function buildRuntimeQuestions(baseQuestions: Question[], answers: Record<string, any>): Question[] {
  const next: Question[] = [];
  for (const question of baseQuestions) {
    next.push(question);
    const children = getTriggeredRuntimeQuestions(question, answers);
    if (children.length > 0) {
      next.push(...buildRuntimeQuestions(children, answers));
    }
  }
  return next;
}

export function getFirstUnansweredQuestionId(questions: Question[], answers: Record<string, any>) {
  for (const question of questions) {
    if (isBlankAnswer(getQuestionAnswer(question, answers))) return question.id;
  }
  return questions[0]?.id ?? null;
}

/**
 * The operating date ("yyyy-MM-dd") `now` belongs to for a location whose day
 * ends at `dayEndTime` (default midnight). With a 04:00 day end, 01:30 still
 * belongs to the day that began yesterday.
 */
export function getKioskOperatingDate(now: Date, dayEndTime: string | null | undefined): string {
  const dayEnd = parseTimeToMinutes(dayEndTime) ?? 0;
  const shifted = new Date(now.getTime() - dayEnd * 60_000);
  const y = shifted.getFullYear();
  const m = String(shifted.getMonth() + 1).padStart(2, "0");
  const d = String(shifted.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
