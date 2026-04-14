// ─── Kiosk Types ──────────────────────────────────────────────────────────────

export type TimeOfDay = "morning" | "afternoon" | "evening" | "anytime";

// "datetime" removed from builder — kept here only as a type so the switch-case
// below doesn't silently drop answers from legacy saved checklists.
// The SUPPORTED_QUESTION_TYPES list no longer includes "datetime", so any
// question stored with responseType "datetime" resolves to "text" in the runner.
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
  questions: Question[];
}

export type KioskScreen = "grid" | "runner" | "completion";

export type KioskDraftSnapshot = {
  answers: Record<string, any>;
  currentQIdx?: number;
  currentQuestionId?: string;
  hasSavedDraft: boolean;
};
