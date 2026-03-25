import type { ElementType } from "react";
import { CalendarIcon, Type, Hash, CheckSquare, Image, Pencil, User, Info } from "lucide-react";
import type { FolderItem, ChecklistItem, Action, LogEntry, ResponseType } from "./types";

// ─── Mock Data ────────────────────────────────────────────────────────────────

export const locations = ["All locations", "Main Branch", "City Centre", "Riverside"];

export const mockFolders: FolderItem[] = [
  { id: "f1", name: "Daily Operations", type: "folder", parentId: null, itemCount: 3 },
  { id: "f2", name: "Health & Safety", type: "folder", parentId: null, itemCount: 2 },
  { id: "f3", name: "Kitchen", type: "folder", parentId: "f1", itemCount: 1 },
];

export const mockChecklistItems: ChecklistItem[] = [
  { id: "cl-1", title: "Opening Checklist", type: "checklist", questionsCount: 5, schedule: "Every day", folderId: "f1", createdAt: "2026-02-20" },
  { id: "cl-2", title: "Cleaning Schedule", type: "checklist", questionsCount: 3, schedule: "Every weekday", folderId: "f1", createdAt: "2026-02-18" },
  { id: "cl-3", title: "Delivery Intake", type: "checklist", questionsCount: 3, schedule: "Every day", folderId: "f3", createdAt: "2026-02-15" },
  { id: "cl-4", title: "Closing Checklist", type: "checklist", questionsCount: 2, schedule: "Every day", folderId: "f1", createdAt: "2026-02-14" },
  { id: "ins-1", title: "Food Safety Inspection", type: "checklist", questionsCount: 4, schedule: "Every week", folderId: "f2", createdAt: "2026-02-10" },
  { id: "ins-2", title: "Health & Safety Walkthrough", type: "checklist", questionsCount: 3, schedule: "Every month", folderId: "f2", createdAt: "2026-02-05" },
];

export const mockActions: Action[] = [
  { id: "a1", title: "Replace fridge seal — Walk-in unit", checklist: "Food Safety Inspection", assignedTo: "Marc Devaux", due: "Today", status: "open" },
  { id: "a2", title: "Restock first aid kit", checklist: "H&S Walkthrough", assignedTo: "Elena Rossi", due: "This week", status: "in-progress" },
  { id: "a3", title: "Deep clean extractor fan", checklist: "Cleaning Schedule", assignedTo: "Sofia Amara", due: "Yesterday", status: "open" },
  { id: "a4", title: "Renew fire extinguisher certificate", checklist: "H&S Walkthrough", assignedTo: "Elena Rossi", due: "Next week", status: "resolved" },
];

export const mockLogs: LogEntry[] = [
  { id: "l1", checklist: "Opening Checklist", completedBy: "Marc Devaux", date: "Today, 07:12", score: 83, type: "opening",
    answers: [
      { label: "Check and record fridge temperature", type: "numeric", required: true, answer: "4", comment: "All good" },
      { label: "Sanitize all food prep surfaces", type: "checkbox", required: true, answer: "yes" },
      { label: "Confirm stock rotation (FIFO)", type: "checkbox", required: true, answer: "no" },
      { label: "Photo of clean workspace", type: "photo", required: false, hasPhoto: true },
      { label: "Verify alarm system deactivated", type: "checkbox", required: false, answer: "yes" },
    ],
  },
  { id: "l2", checklist: "Cleaning Schedule", completedBy: "Sofia Amara", date: "Today, 11:45", score: 100, type: "cleaning",
    answers: [
      { label: "Deep clean fryer", type: "checkbox", required: true, answer: "yes" },
      { label: "Mop kitchen floor", type: "checkbox", required: true, answer: "yes", comment: "Used new mop head" },
      { label: "Sanitize touch points", type: "checkbox", required: false, answer: "yes" },
    ],
  },
  { id: "l3", checklist: "Delivery Intake", completedBy: "Tariq Nasser", date: "Today, 08:30", score: 67, type: "delivery",
    answers: [
      { label: "Record delivery temperature", type: "numeric", required: true, answer: "6" },
      { label: "Check use-by dates on all items", type: "checkbox", required: true, answer: "no", comment: "Two items near expiry — flagged" },
      { label: "Photo of delivery receipt", type: "photo", required: true, hasPhoto: false },
    ],
  },
  { id: "l4", checklist: "Opening Checklist", completedBy: "Chloe Brandt", date: "Yesterday, 07:05", score: 91, type: "opening",
    answers: [
      { label: "Check and record fridge temperature", type: "numeric", required: true, answer: "3" },
      { label: "Sanitize all food prep surfaces", type: "checkbox", required: true, answer: "yes" },
      { label: "Confirm stock rotation (FIFO)", type: "checkbox", required: true, answer: "yes" },
      { label: "Photo of clean workspace", type: "photo", required: false, hasPhoto: true },
      { label: "Verify alarm system deactivated", type: "checkbox", required: false, answer: "no" },
    ],
  },
  { id: "l5", checklist: "Closing Checklist", completedBy: "Marc Devaux", date: "Yesterday, 22:15", score: 100, type: "closing",
    answers: [
      { label: "Lock all external doors", type: "checkbox", required: true, answer: "yes" },
      { label: "Alarm set", type: "checkbox", required: true, answer: "yes" },
    ],
  },
  { id: "l6", checklist: "Food Safety Inspection", completedBy: "Elena Rossi", date: "Mon, 09:00", score: 75, type: "inspection",
    answers: [
      { label: "All food stored at correct temperatures", type: "checkbox", required: true, answer: "yes" },
      { label: "Date labels on all opened items", type: "checkbox", required: true, answer: "no", comment: "3 items unlabelled in walk-in" },
      { label: "Fridge temperature log up to date", type: "checkbox", required: true, answer: "yes" },
      { label: "Photo of fridge interior", type: "photo", required: false, hasPhoto: true },
    ],
  },
  { id: "l7", checklist: "Cleaning Schedule", completedBy: "Sofia Amara", date: "Mon, 12:30", score: 88, type: "cleaning",
    answers: [
      { label: "Deep clean fryer", type: "checkbox", required: true, answer: "yes" },
      { label: "Mop kitchen floor", type: "checkbox", required: true, answer: "yes" },
      { label: "Sanitize touch points", type: "checkbox", required: false, answer: "no" },
    ],
  },
];

// ─── Multiple Choice Response Sets ───────────────────────────────────────────

export const multipleChoiceSets = [
  { id: "mc1", name: "Good / Fair / Poor", choices: ["Good", "Fair", "Poor", "N/A"], colors: ["status-ok", "status-warn", "status-error", "bg-muted text-muted-foreground"] },
  { id: "mc2", name: "Safe / At Risk", choices: ["Safe", "At Risk", "N/A"], colors: ["status-ok", "status-error", "bg-muted text-muted-foreground"] },
  { id: "mc3", name: "Pass / Fail", choices: ["Pass", "Fail", "N/A"], colors: ["status-ok", "status-error", "bg-muted text-muted-foreground"] },
  { id: "mc4", name: "Yes / No", choices: ["Yes", "No", "N/A"], colors: ["status-ok", "status-error", "bg-muted text-muted-foreground"] },
  { id: "mc5", name: "Compliant / Non-Compliant", choices: ["Compliant", "Non-Compliant", "N/A"], colors: ["status-ok", "status-error", "bg-muted text-muted-foreground"] },
];

// ─── Response type definitions ───────────────────────────────────────────────

export const RESPONSE_TYPES: { key: ResponseType; label: string; icon: ElementType; group: "response" }[] = [
  { key: "checkbox", label: "Checkbox", icon: CheckSquare, group: "response" },
  { key: "text", label: "Text answer", icon: Type, group: "response" },
  { key: "number", label: "Number", icon: Hash, group: "response" },
  { key: "datetime", label: "Date & Time", icon: CalendarIcon, group: "response" },
  { key: "media", label: "Photo / Media", icon: Image, group: "response" },
  { key: "instruction", label: "Instruction", icon: Info, group: "response" },
  // "signature" and "person" removed — not supported in the kiosk runner
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

export const actionStatusStyle: Record<Action["status"], string> = {
  "open": "status-error", "in-progress": "status-warn", "resolved": "status-ok",
};
export const actionStatusLabel: Record<Action["status"], string> = {
  "open": "Open", "in-progress": "In progress", "resolved": "Resolved",
};
