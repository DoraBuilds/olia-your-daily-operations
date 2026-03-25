// ─── Types ────────────────────────────────────────────────────────────────────

export type TaskType = "checkbox" | "numeric" | "photo";

export interface Task {
  id: string;
  label: string;
  type: TaskType;
  required: boolean;
  assignedRole: string;
  completed: boolean;
  value?: string;
  min?: number;
  max?: number;
}

export interface ChecklistItem {
  id: string;
  title: string;
  description?: string;
  type: "checklist";
  questionsCount: number;
  schedule?: string;
  folderId: string | null;
  location_id?: string | null;
  createdAt: string;
  sections?: SectionDef[];
  time_of_day?: "morning" | "afternoon" | "evening" | "anytime";
}

export interface FolderItem {
  id: string;
  name: string;
  type: "folder";
  parentId: string | null;
  itemCount: number;
}

export type ResponseType =
  | "text" | "number" | "checkbox" | "media"
  | "instruction" | "multiple_choice"
  // legacy values removed from builder — still valid in saved checklists;
  // kiosk runner falls back to plain text input for all three
  | "datetime" | "signature" | "person";

export type LogicComparator = "is" | "is_not" | "lt" | "lte" | "eq" | "neq" | "gte" | "gt" | "between" | "not_between";
export type LogicTriggerType = "ask_question" | "notify" | "require_note" | "require_media" | "require_action";

export interface LogicTrigger {
  type: LogicTriggerType;
  config?: {
    questionText?: string;
    notifyUser?: string;
    actionTitle?: string;
    actionAssignee?: string;
  };
}

export interface LogicRule {
  id: string;
  comparator: LogicComparator;
  value: string;
  valueTo?: string; // for "between"
  triggers: LogicTrigger[];
}

export interface QuestionConfig {
  numberMin?: number;
  numberMax?: number;
  textMinLength?: number;
  textMaxLength?: number;
  instructionText?: string;
  logicRules?: LogicRule[];
}

export interface QuestionDef {
  id: string;
  text: string;
  responseType: ResponseType;
  required: boolean;
  choices?: string[];
  config?: QuestionConfig;
  mcSetId?: string;
}

export interface SectionDef {
  id: string;
  name: string;
  questions: QuestionDef[];
}

export type ScheduleType = "daily" | "weekday" | "weekly" | "monthly" | "yearly" | "custom" | "none";

export interface CustomRecurrence {
  interval: number;
  unit: "day" | "week" | "month" | "year";
  weekDays: string[];
  ends: "never" | "on" | "after";
  endDate?: string;
  occurrences?: number;
}

// ─── Reporting types ──────────────────────────────────────────────────────────

export interface Action {
  id: string; title: string; checklist: string; assignedTo: string; due: string;
  status: "open" | "in-progress" | "resolved";
}

export interface LogEntry {
  id: string; checklist: string; completedBy: string; date: string; score: number;
  type: "opening" | "closing" | "cleaning" | "delivery" | "inspection";
  answers?: LogAnswer[];
  startedAt?: string;   // ISO timestamp — present for logs created after migration 20260326000001
  finishedAt?: string;  // ISO timestamp — always present (= created_at)
}

export interface LogAnswer {
  label: string; type: TaskType; required: boolean;
  answer?: string; hasPhoto?: boolean; comment?: string;
}
