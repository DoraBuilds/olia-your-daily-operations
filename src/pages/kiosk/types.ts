// ─── Kiosk Types ──────────────────────────────────────────────────────────────

export type TimeOfDay = "morning" | "afternoon" | "evening" | "anytime";

export type QuestionType = "checkbox" | "text" | "number" | "multiple_choice" | "datetime" | "instruction" | "media";

export interface Question {
  id: string;
  text: string;
  type: QuestionType;
  required?: boolean;        // if true, must be answered before "Complete" is allowed
  options?: string[];
  optionColors?: string[];
  selectionMode?: "single" | "multiple";
  instructionText?: string;
  imageUrl?: string;         // for instruction-type image
  linkedResourceId?: string;
  linkedResourceTitle?: string;
  linkedResourceSection?: "library" | "training";
  sectionName?: string;      // section this question belongs to (for dividers in runner)
  defaultValue?: string;     // pre-fill value (used for person type defaultPerson)
  min?: number;              // number questions: acceptable range minimum
  max?: number;              // number questions: acceptable range maximum
  temperatureUnit?: "C" | "F";
  config?: {
    logicRules?: import("@/pages/checklists/types").LogicRule[];
  };
}

export interface KioskChecklist {
  id: string;
  title: string;
  location_id: string | null;
  time_of_day: TimeOfDay;
  due_time: string | null;   // HH:MM — kiosk visibility based on this
  visibility_from: string | null;
  visibility_until: string | null;
  /** Off = after the window closes the checklist is Missed instead of Overdue. */
  allow_late_completion: boolean;
  /** End of the location's operating day, HH:MM (default 00:00 = midnight). */
  day_end_time: string | null;
  questions: Question[];
}

export type KioskScreen = "grid" | "runner" | "completion" | "library";

/** Who answered each question, and when (ISO) — keyed by question id. */
export type AnswerAttribution = Record<string, { by: string; at: string }>;

/** One question's state in a partly completed checklist, reported to the server. */
export type KioskDraftItem = { label: string; type: string; section?: string; done: boolean; answer: string };
export type KioskDraftProgress = { answered: number; total: number; items: KioskDraftItem[] };

export type KioskDraftSnapshot = {
  answers: Record<string, any>;
  attribution?: AnswerAttribution;
  currentQIdx?: number;
  currentQuestionId?: string;
  hasSavedDraft: boolean;
};
