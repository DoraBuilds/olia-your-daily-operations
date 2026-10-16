import React, { useState, useRef, useEffect } from "react";
import { toast } from "@/components/ui/sonner";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import {
  Camera, Plus, X, CalendarIcon, ChevronDown, Clock, Search,
  AlertTriangle, Upload, ArrowLeft, BookOpen, GraduationCap, Link2, GripVertical,
  Building2, MapPin, Layers,
  Thermometer,
} from "lucide-react";
import { FilterField, FilterMultiSelect } from "@/components/FiltersPopover";
import { sanitizeImageUrl } from "@/lib/sanitize";
import { cn, blurOnWheel } from "@/lib/utils";
import { format } from "date-fns";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { useLocations } from "@/hooks/useLocations";
import { useDepartmentsForLocations } from "@/hooks/useDepartments";
import { useStaffProfiles } from "@/hooks/useStaffProfiles";
import { useTeamMembers } from "@/hooks/useTeamMembers";
import { useAuth } from "@/contexts/AuthContext";
import { useConcepts } from "@/hooks/useConcepts";
import { createDefaultFollowUpQuestion } from "./FollowUpQuestionEditor";
import { rulesForResponseTypeChange, withTemperatureDefaults } from "./logic-comparators";
import { LogicRulesEditor } from "./LogicRulesEditor";
import type {
  ChecklistItem, SectionDef, ScheduleType, CustomRecurrence,
  QuestionDef, ResponseType
} from "./types";
import { parseScheduleType } from "./types";
import { RESPONSE_TYPES, multipleChoiceSets, getResponseTypeLabel, getMcSetName } from "./data";
import { ResponseTypePicker } from "./ResponseTypePicker";
import { CustomRecurrencePicker } from "./CustomRecurrencePicker";
import { linkableInfohubResources } from "@/lib/infohub-catalog";
import type { ChecklistDraftContent } from "@/hooks/useChecklists";

const DRAFT_KEY = "olia_checklist_draft";

function loadDraft(): { title: string; description?: string; sections: SectionDef[] } | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function clearChecklistDraft() {
  try { sessionStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
}

const getQuestionChoices = (q: QuestionDef) => q.choices?.length
  ? q.choices
  : (q.mcSetId ? multipleChoiceSets.find(m => m.id === q.mcSetId)?.choices ?? [] : []);

function useMcColorOptions(t: (key: string) => string) {
  return [
    { label: t("followUpEditor.multipleChoice.colors.green"), value: "bg-status-ok/10 border-status-ok/40 text-status-ok" },
    { label: t("followUpEditor.multipleChoice.colors.yellow"), value: "bg-status-warn/10 border-status-warn/40 text-status-warn" },
    { label: t("followUpEditor.multipleChoice.colors.red"), value: "bg-status-error/10 border-status-error/40 text-status-error" },
    { label: t("followUpEditor.multipleChoice.colors.blue"), value: "bg-blue-100 border-blue-300 text-blue-700" },
    { label: t("followUpEditor.multipleChoice.colors.neutral"), value: "bg-muted text-muted-foreground border-border" },
  ];
}
const DEFAULT_MC_COLOR = "bg-muted text-muted-foreground border-border";

interface ChecklistBuilderModalProps {
  onClose: () => void;
  onAdd: (item: ChecklistItem) => Promise<string | void>;
  onUpdate?: (id: string, item: Partial<ChecklistItem>) => Promise<void>;
  initialTitle?: string;
  initialSections?: SectionDef[];
  initialDescription?: string;
  initialLocationIds?: string[] | null;
  initialDepartmentIds?: string[] | null;
  /** The concept this checklist is scoped to when it applies to "all locations" (null = true org-wide). Ignored when initialLocationIds is set. */
  initialConceptId?: string | null;
  initialSchedule?: string | null;
  initialStartDate?: string | null;
  initialVisibilityFrom?: string | null;
  initialVisibilityUntil?: string | null;
  /** Whether staff can still complete after the due window closes (recorded as late). Defaults to true. */
  initialAllowLateCompletion?: boolean;
  /** Whether this checklist is currently visible on the kiosk. Defaults to false (Draft) for new checklists. */
  initialIsPublished?: boolean;
  editId?: string;
  /** When true, renders as a full-page editor (no overlay).
   *  The parent is responsible for showing/hiding it. */
  asPage?: boolean;
  /** Called whenever the dirty state changes so the parent can gate router-level navigation blocking. */
  onDirtyChange?: (isDirty: boolean) => void;
  /** Unpublished edits of a live checklist, restored when the editor opens. */
  initialDraft?: ChecklistDraftContent | null;
  /** Autosave target for edits to a live checklist. Autosave is off when omitted. */
  onSaveDraft?: (id: string, content: ChecklistDraftContent) => Promise<void>;
  /** Removes the draft once its content has been published. */
  onClearDraft?: (id: string) => Promise<void>;
}

export function ChecklistBuilderModal({
  onClose, onAdd, onUpdate, initialTitle, initialDescription, initialSections, initialLocationIds,
  initialDepartmentIds, initialConceptId, initialSchedule, initialStartDate, initialVisibilityFrom, initialVisibilityUntil,
  initialAllowLateCompletion, initialIsPublished, editId, asPage = false, onDirtyChange,
  initialDraft, onSaveDraft, onClearDraft,
}: ChecklistBuilderModalProps) {
  const { t } = useTranslation("checklists");
  const MC_COLOR_OPTIONS = useMcColorOptions(t);
  const responseTypeLabel = (type: ResponseType) =>
    RESPONSE_TYPES.find(r => r.key === type) ? getResponseTypeLabel(type) : t("preview.multipleChoiceFallback");
  const { user, teamMember: authTeamMember } = useAuth();
  const { data: allDbLocations = [] } = useLocations();
  const { data: concepts = [] } = useConcepts();
  const dbLocations = allDbLocations;
  const { data: staffProfiles = [] } = useStaffProfiles();
  const { data: teamMembers = [] } = useTeamMembers();
  const imgInputRef = useRef<Record<string, HTMLInputElement | null>>({});

  // For new checklists with no pre-filled content, restore from sessionStorage draft (survives tab switches / page reloads)
  const isNewChecklist = !editId && !initialTitle && (!initialSections || initialSections.length === 0);
  const draft = isNewChecklist ? loadDraft() : null;

  const [title, setTitle] = useState(initialDraft?.title ?? draft?.title ?? initialTitle ?? "");
  const [description, setDescription] = useState(initialDraft?.description ?? draft?.description ?? initialDescription ?? "");
  const initialStart = initialDraft ? initialDraft.startDate : initialStartDate;
  const [startDate, setStartDate] = useState<Date | undefined>(
    initialStart ? new Date(`${initialStart}T00:00:00`) : undefined,
  );
  const [startDateOpen, setStartDateOpen] = useState(false);
  const [visibilityWindowEnabled, setVisibilityWindowEnabled] = useState(initialDraft ? initialDraft.visibilityWindowEnabled : Boolean(initialVisibilityFrom || initialVisibilityUntil));
  const [visibilityFrom, setVisibilityFrom] = useState(initialDraft?.visibilityFrom ?? (initialVisibilityFrom || "09:00"));
  const [visibilityUntil, setVisibilityUntil] = useState(initialDraft?.visibilityUntil ?? (initialVisibilityUntil || "10:00"));
  const [allowLateCompletion, setAllowLateCompletion] = useState(initialDraft?.allowLateCompletion ?? initialAllowLateCompletion ?? true);
  const [isPublished, setIsPublished] = useState(initialDraft?.isPublished ?? initialIsPublished ?? false);
  const [schedule, setSchedule] = useState<ScheduleType>(() => parseScheduleType(initialDraft?.schedule ?? initialSchedule));
  const [customRecurrence, setCustomRecurrence] = useState<CustomRecurrence>(initialDraft?.customRecurrence ?? {
    interval: 1, unit: "week", weekDays: ["tue"], ends: "never", occurrences: 13,
  });
  const [showCustomRecurrence, setShowCustomRecurrence] = useState(false);
  // "Applies to": a concept (or every concept), then locations within it, then
  // departments. No locations picked = every location of that concept (saved
  // as concept_id); picked locations are saved as location_ids. Same for departments.
  const [selectedLocationIds, setSelectedLocationIds] = useState<string[]>(
    initialDraft ? initialDraft.selectedLocationIds : initialLocationIds?.length ? initialLocationIds : [],
  );
  const [allLocationsConceptId, setAllLocationsConceptId] = useState<string | null>(() => {
    if (initialDraft) return initialDraft.selectedLocationIds.length > 0 ? null : initialDraft.allLocationsConceptId;
    if (initialLocationIds && initialLocationIds.length > 0) return null;
    return initialConceptId ?? null;
  });
  const [selectedDepartmentIds, setSelectedDepartmentIds] = useState<string[]>(
    initialDraft ? initialDraft.selectedDepartmentIds : initialDepartmentIds?.length ? initialDepartmentIds : [],
  );
  const locationMode: "all" | "specific" = selectedLocationIds.length > 0 ? "specific" : "all";
  const departmentMode: "all" | "specific" = selectedDepartmentIds.length > 0 ? "specific" : "all";

  // An existing checklist saved with specific locations shows their concept
  // in the Concept picker when they all share one (once locations load).
  const conceptPresetFromLocations = useRef(false);
  useEffect(() => {
    if (conceptPresetFromLocations.current || allDbLocations.length === 0) return;
    conceptPresetFromLocations.current = true;
    if (selectedLocationIds.length === 0) return;
    const conceptIds = new Set(allDbLocations.filter(l => selectedLocationIds.includes(l.id)).map(l => l.concept_id ?? null));
    if (conceptIds.size === 1) setAllLocationsConceptId([...conceptIds][0]);
  }, [allDbLocations, selectedLocationIds]);
  const [sections, setSections] = useState<SectionDef[]>(
    initialDraft?.sections ?? draft?.sections ?? initialSections ?? [{
      id: "sec-default", name: "", questions: [{ id: "q-1", text: "", responseType: "checkbox", required: true, config: {} }],
    }]
  );

  const [lastPublishedAt, setLastPublishedAt] = useState<Date | null>(null);
  const [savedId, setSavedId] = useState<string | null>(editId ?? null);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [sectionToDelete, setSectionToDelete] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [dragQuestionKey, setDragQuestionKey] = useState<string | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  const suppressQuestionDragRef = useRef(false);
  const [insertDropdown, setInsertDropdown] = useState<{ si: number; qi: number } | null>(null);
  const insertDropdownRef = useRef<HTMLDivElement>(null);
  const footerPublishRef = useRef<HTMLButtonElement>(null);
  const [footerPublishVisible, setFooterPublishVisible] = useState(false);

  // Serialise all schedule/location/visibility settings into one comparable string
  const settingsSnapshot = () => JSON.stringify({
    startDate: startDate ? format(startDate, "yyyy-MM-dd") : null,
    schedule,
    customRecurrence: schedule === "custom" ? customRecurrence : null,
    visibilityWindowEnabled,
    visibilityFrom: visibilityWindowEnabled ? visibilityFrom : null,
    visibilityUntil: visibilityWindowEnabled ? visibilityUntil : null,
    allowLateCompletion,
    locationMode,
    selectedLocationIds: locationMode === "specific" ? [...selectedLocationIds].sort() : [],
    allLocationsConceptId: locationMode === "all" ? allLocationsConceptId : null,
    departmentMode,
    selectedDepartmentIds: departmentMode === "specific" ? [...selectedDepartmentIds].sort() : [],
    isPublished,
  });

  // If the concept this "all locations" checklist is scoped to gets deleted
  // while the builder is open, fall back to org-wide rather than pointing at
  // a concept that no longer exists.
  useEffect(() => {
    if (!allLocationsConceptId) return;
    if (concepts.length === 0) return;
    if (!concepts.some(c => c.id === allLocationsConceptId)) {
      setAllLocationsConceptId(null);
    }
  }, [concepts, allLocationsConceptId]);

  const hasContent = !!(
    title.trim() ||
    description.trim() ||
    sections.some(s => s.name.trim() || s.questions.some(q => q.text.trim())) ||
    startDate != null ||
    schedule !== "none" ||
    visibilityWindowEnabled ||
    locationMode === "specific" ||
    departmentMode === "specific"
  );

  // Snapshot the actual initial state values (not the raw props) so that
  // null/undefined initialSections that fall back to the default section
  // still compare equal to the state React actually initialised.
  const initialTitleRef = useRef(title);
  const initialDescriptionRef = useRef(description);
  const initialSectionsRef = useRef(JSON.stringify(sections));
  const initialSettingsRef = useRef(settingsSnapshot());

  // ── Autosave ──────────────────────────────────────────────────────────────
  // Every edit is saved as one document. A live checklist saves into its draft
  // (the kiosk keeps the published version until Publish); a checklist that
  // isn't live yet has nothing to protect, so its own hidden row is the draft.
  type SaveStatus = "idle" | "saving" | "saved" | "error";
  const autosaveEnabled = !!onSaveDraft;
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [hasDraft, setHasDraft] = useState(!!initialDraft);
  const [retryTick, setRetryTick] = useState(0);
  const hasDraftRef = useRef(!!initialDraft);
  const savedIdRef = useRef<string | null>(editId ?? null);
  const liveInDbRef = useRef(initialIsPublished ?? false);
  const touchedRef = useRef(false);
  const queueRef = useRef<Promise<unknown>>(Promise.resolve());
  const lastSavedRef = useRef<string | null>(null);
  const initialContentRef = useRef<string | null>(null);
  const [exitSaveFailed, setExitSaveFailed] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const latestSnapshotRef = useRef("");
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const buildDraftContent = (): ChecklistDraftContent => ({
    title, description, sections,
    startDate: startDate ? format(startDate, "yyyy-MM-dd") : null,
    schedule, customRecurrence,
    visibilityWindowEnabled, visibilityFrom, visibilityUntil, allowLateCompletion,
    selectedLocationIds, allLocationsConceptId, selectedDepartmentIds, isPublished,
  });
  const contentSnapshot = autosaveEnabled ? JSON.stringify(buildDraftContent()) : "";
  latestSnapshotRef.current = contentSnapshot;
  if (lastSavedRef.current === null) lastSavedRef.current = contentSnapshot;
  if (initialContentRef.current === null) initialContentRef.current = contentSnapshot;
  const hasUnsavedEdits = autosaveEnabled && touchedRef.current && contentSnapshot !== lastSavedRef.current;
  // Edited since the editor opened (saved or not): leaving asks first.
  const changedSinceOpen = autosaveEnabled && touchedRef.current && contentSnapshot !== initialContentRef.current;

  // Hidden-row payload for a checklist that isn't live. Never publishes, and
  // keeps the picked locations/departments as they are (no filtering against
  // lists that may still be loading).
  const hiddenRowPayload = (c: ChecklistDraftContent): Partial<ChecklistItem> => {
    const specific = c.selectedLocationIds.length > 0;
    return {
      title: c.title.trim() || t("builder.untitled"),
      description: c.description.trim() || null,
      questionsCount: c.sections.reduce((n, sec) => n + sec.questions.length, 0),
      schedule: c.schedule === "none" ? null
        : c.schedule === "custom" ? `Every ${c.customRecurrence.interval} ${c.customRecurrence.unit}(s)`
        : c.schedule,
      start_date: c.startDate,
      sections: c.sections,
      time_of_day: "anytime",
      due_time: null,
      visibility_from: c.visibilityWindowEnabled ? c.visibilityFrom : null,
      visibility_until: c.visibilityWindowEnabled ? c.visibilityUntil : null,
      allow_late_completion: c.allowLateCompletion,
      location_id: specific && c.selectedLocationIds.length === 1 ? c.selectedLocationIds[0] : null,
      location_ids: specific ? c.selectedLocationIds : null,
      concept_id: specific ? null : c.allLocationsConceptId,
      department_ids: c.selectedDepartmentIds.length > 0 ? c.selectedDepartmentIds : null,
      is_published: false,
    };
  };

  const persistAutosave = async (c: ChecklistDraftContent) => {
    const id = savedIdRef.current;
    if (id && liveInDbRef.current) {
      await onSaveDraft!(id, c);
      hasDraftRef.current = true;
      setHasDraft(true);
    } else if (id && onUpdate) {
      await onUpdate(id, hiddenRowPayload(c));
    } else if (!id) {
      const result = await onAdd({
        id: `cl-${Date.now()}`,
        ...hiddenRowPayload(c),
        type: "checklist",
        folderId: null,
        createdAt: new Date().toISOString().slice(0, 10),
      } as any);
      if (result) { savedIdRef.current = result as string; setSavedId(result as string); }
    }
  };

  /** Saves the current edits. Resolves true when nothing is left unsaved. */
  const runAutosave = (): Promise<boolean> => {
    if (!autosaveEnabled) return Promise.resolve(true);
    const content = buildDraftContent();
    const snap = JSON.stringify(content);
    const job = queueRef.current.then(async () => {
      if (snap === lastSavedRef.current) return true;
      setSaveStatus("saving");
      try {
        await persistAutosave(content);
        lastSavedRef.current = snap;
        setSavedAt(new Date());
        setSaveStatus("saved");
        return true;
      } catch {
        setSaveStatus("error");
        if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
        retryTimerRef.current = setTimeout(() => setRetryTick(n => n + 1), 5000);
        return false;
      }
    });
    queueRef.current = job;
    return job;
  };
  const runAutosaveRef = useRef(runAutosave);
  runAutosaveRef.current = runAutosave;

  // Debounced: save shortly after the last edit (and again after a failure).
  useEffect(() => {
    if (!hasUnsavedEdits) return;
    setSaveStatus(prev => (prev === "error" ? prev : "saving"));
    const timer = setTimeout(() => { void runAutosaveRef.current(); }, 1000);
    return () => clearTimeout(timer);
  }, [contentSnapshot, retryTick, hasUnsavedEdits]);

  useEffect(() => () => { if (retryTimerRef.current) clearTimeout(retryTimerRef.current); }, []);

  // Any pointer/keyboard/change inside the form counts as the user editing.
  // (Effects that tidy state on load, e.g. dropping stale departments, don't.)
  // The first interaction fixes the baseline: whatever the form looks like once
  // it has settled is "unchanged", so opening a checklist and clicking around
  // never creates a draft.
  const markTouched = () => {
    if (touchedRef.current) return;
    touchedRef.current = true;
    initialContentRef.current = latestSnapshotRef.current;
    lastSavedRef.current = latestSnapshotRef.current;
  };

  // Intercept Exit/X: autosave first; only warn when the latest edits couldn't be saved
  const handleRequestClose = async () => {
    if (autosaveEnabled) {
      const ok = await runAutosave();
      if (!ok) { setExitSaveFailed(true); setShowDiscardConfirm(true); return; }
      if (touchedRef.current && JSON.stringify(buildDraftContent()) !== initialContentRef.current) {
        setExitSaveFailed(false);
        setShowDiscardConfirm(true);
        return;
      }
      onClose();
      return;
    }
    const warnForNew = !savedId && hasContent;
    const warnForEdit = !!savedId && (
      title !== initialTitleRef.current ||
      description !== initialDescriptionRef.current ||
      JSON.stringify(sections) !== initialSectionsRef.current ||
      settingsSnapshot() !== initialSettingsRef.current
    );
    if (warnForNew || warnForEdit) {
      setShowDiscardConfirm(true);
    } else {
      onClose();
    }
  };

  // Autosave draft to sessionStorage while editing a new checklist
  useEffect(() => {
    if (!isNewChecklist) return;
    try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ title, description, sections })); } catch { /* ignore */ }
  }, [title, description, sections, isNewChecklist]);

  // Hide the top Publish button when the footer Publish button scrolls into view
  useEffect(() => {
    if (!asPage || !('IntersectionObserver' in window)) return;
    const el = footerPublishRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setFooterPublishVisible(entry.isIntersecting),
      { threshold: 0.1 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [asPage]);

  useEffect(() => {
    if (!onDirtyChange) return;
    const dirty = autosaveEnabled
      ? changedSinceOpen
      : !savedId
      ? hasContent
      : (title !== initialTitleRef.current ||
         description !== initialDescriptionRef.current ||
         JSON.stringify(sections) !== initialSectionsRef.current ||
         settingsSnapshot() !== initialSettingsRef.current);
    onDirtyChange(dirty);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, description, sections, startDate, schedule, customRecurrence,
      visibilityWindowEnabled, visibilityFrom, visibilityUntil,
      locationMode, selectedLocationIds, allLocationsConceptId, departmentMode, selectedDepartmentIds,
      savedId, onDirtyChange, changedSinceOpen]);

  useEffect(() => {
    if (insertDropdown === null) return;
    const handleClick = (e: MouseEvent) => {
      if (insertDropdownRef.current && !insertDropdownRef.current.contains(e.target as Node)) {
        setInsertDropdown(null);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [insertDropdown]);

  const [showResponsePicker, setShowResponsePicker] = useState<
    | { scope: "main"; sectionIdx: number; questionIdx: number }
    | { scope: "followup"; sectionIdx: number; questionIdx: number; ruleIdx: number; triggerIdx: number }
    | null
  >(null);
  const [requiredError, setRequiredError] = useState("");
  const [instructionResourceSearch, setInstructionResourceSearch] = useState("");
  const [instructionResourceSection, setInstructionResourceSection] = useState<"all" | "library" | "training">("all");
  const [instructionPickerQuestionId, setInstructionPickerQuestionId] = useState<string | null>(null);

  const SCHEDULE_OPTIONS: { key: ScheduleType; label: string }[] = [
    { key: "none", label: t("schedule.none") },
    { key: "daily", label: t("schedule.daily") },
    { key: "weekday", label: t("schedule.weekday") },
    { key: "weekly", label: t("schedule.weekly") },
    { key: "monthly", label: t("schedule.monthly") },
    { key: "yearly", label: t("schedule.yearly") },
    { key: "custom", label: t("builder.schedule.customOption") },
  ];

  const addQuestion = (sectionIdx: number) => {
    setSections(prev => prev.map((s, i) => i === sectionIdx ? {
      ...s,
      questions: [...s.questions, { id: `q-${Date.now()}`, text: "", responseType: "checkbox", required: true }],
    } : s));
  };

  const addSection = () => {
    setSections(prev => [...prev, {
      id: `sec-${Date.now()}`, name: "", questions: [],
    }]);
  };

  const addQuestionAt = (sectionIdx: number, afterIdx: number) => {
    setSections(prev => prev.map((s, i) => {
      if (i !== sectionIdx) return s;
      const newQ: QuestionDef = { id: `q-${Date.now()}`, text: "", responseType: "checkbox", required: true, config: {} };
      const qs = [...s.questions];
      qs.splice(afterIdx + 1, 0, newQ);
      return { ...s, questions: qs };
    }));
  };

  const addSectionAfter = (afterSectionIdx: number) => {
    setSections(prev => {
      const next = [...prev];
      next.splice(afterSectionIdx + 1, 0, {
        id: `sec-${Date.now()}`, name: "", questions: [],
      });
      return next;
    });
  };

  const performRemoveSection = (sectionIdx: number) => {
    setSections(prev => prev.length > 1 ? prev.filter((_, i) => i !== sectionIdx) : prev);
  };

  const removeSection = (sectionIdx: number) => {
    const target = sections[sectionIdx];
    if (target && target.questions.length > 0) { setSectionToDelete(sectionIdx); return; }
    performRemoveSection(sectionIdx);
  };

  const updateQuestion = (sectionIdx: number, questionIdx: number, update: Partial<QuestionDef>) => {
    setSections(prev => prev.map((s, si) => si === sectionIdx ? {
      ...s,
      questions: s.questions.map((q, qi) => qi === questionIdx ? { ...q, ...update } : q),
    } : s));
  };

  const removeQuestion = (sectionIdx: number, questionIdx: number) => {
    setSections(prev => prev.map((s, si) => si === sectionIdx ? {
      ...s,
      questions: s.questions.filter((_, qi) => qi !== questionIdx),
    } : s));
  };

  const moveQuestion = (fromSectionIdx: number, fromIdx: number, toSectionIdx: number, toIdx: number) => {
    if (fromSectionIdx === toSectionIdx && fromIdx === toIdx) return;
    setSections(prev => {
      const next = prev.map(s => ({ ...s, questions: [...s.questions] }));
      const [moved] = next[fromSectionIdx].questions.splice(fromIdx, 1);
      next[toSectionIdx].questions.splice(toIdx, 0, moved);
      return next;
    });
  };

  const totalQuestions = sections.reduce((sum, s) => sum + s.questions.length, 0);

  // Resolved against the full org list (not the concept-narrowed picker list)
  // so a checklist edited under a concept filter still shows/keeps any
  // out-of-concept locations it was already assigned to.
  const selectedLocations = allDbLocations.filter(loc => selectedLocationIds.includes(loc.id));

  // Offer the departments that apply to the targeted locations (#838):
  // "all locations" mode offers every department assigned anywhere in scope,
  // "specific" mode narrows to the chosen locations.
  // The chosen concept's locations (or every location) — the Locations picker's
  // options, and what "all locations" covers.
  const allModeLocations = allLocationsConceptId ? dbLocations.filter(loc => loc.concept_id === allLocationsConceptId) : dbLocations;
  const changeConcept = (conceptId: string | null) => {
    setAllLocationsConceptId(conceptId);
    // Drop picked locations that aren't in the new concept.
    if (conceptId) setSelectedLocationIds(prev => prev.filter(id => dbLocations.some(l => l.id === id && l.concept_id === conceptId)));
  };
  const departmentLocationIds = locationMode === "all" ? allModeLocations.map(loc => loc.id) : selectedLocationIds;
  const { data: availableDepartments = [], isLoading: departmentsLoading } = useDepartmentsForLocations(departmentLocationIds);
  const selectedDepartments = availableDepartments.filter(dep => selectedDepartmentIds.includes(dep.id));

  // Drop stale picks once a department no longer belongs to the currently
  // targeted location(s) — e.g. a location was deselected. Gated on
  // !departmentsLoading so the initial (pre-fetch) empty array doesn't wipe
  // out an existing checklist's saved department_ids before they've loaded.
  useEffect(() => {
    if (departmentsLoading) return;
    setSelectedDepartmentIds(prev => {
      const next = prev.filter(id => availableDepartments.some(dep => dep.id === id));
      return next.length === prev.length ? prev : next;
    });
  }, [availableDepartments, departmentsLoading]);

  const filteredInstructionResources = linkableInfohubResources.filter((resource) => {
    const matchesSection = instructionResourceSection === "all" || resource.section === instructionResourceSection;
    const query = instructionResourceSearch.trim().toLowerCase();
    const matchesQuery = !query
      || resource.title.toLowerCase().includes(query)
      || resource.subtitle.toLowerCase().includes(query);
    return matchesSection && matchesQuery;
  });

  // Staff available for person-type questions and notify triggers, scoped to
  // selected locations. "all" mode uses the chosen concept's locations (or every location).
  const availableStaff = staffProfiles.filter(s =>
    s.status !== "archived" &&
    (locationMode === "all"
      ? allModeLocations.some(l => l.id === s.location_id)
      : (selectedLocationIds.length === 0 || selectedLocationIds.includes(s.location_id)))
  );

  // Notification recipients — team members (admins) + staff profiles with emails.
  // Always include the authenticated owner as a fallback so their email
  // appears even if the team_members query hasn't loaded yet.
  const notifyRecipients = (() => {
    // Admin / team member emails
    const fromTeam = teamMembers.filter(m => m.email && m.email.trim().length > 0);
    const ownerEmail = authTeamMember?.email ?? user?.email ?? "";
    const ownerAlreadyIncluded = fromTeam.some(m => m.id === (authTeamMember?.id ?? user?.id));
    const teamList = ownerEmail && !ownerAlreadyIncluded
      ? [
          {
            id: authTeamMember?.id ?? user?.id ?? "owner",
            name: authTeamMember?.name ?? user?.email ?? "Owner",
            email: ownerEmail,
            role: "Owner",
          },
          ...fromTeam.map(m => ({ id: m.id, name: m.name, email: m.email, role: m.role })),
        ]
      : fromTeam.map(m => ({ id: m.id, name: m.name, email: m.email, role: m.role }));

    // Kiosk staff members with an email set
    const fromStaff = staffProfiles
      .filter(s => s.email && s.email.trim().length > 0 && s.status === "active")
      .map(s => ({
        id: s.id,
        name: [s.first_name, s.last_name].filter(Boolean).join(" "),
        email: s.email as string,
        role: s.role || "Staff",
      }));

    // Merge, de-duplicating by email address
    const seen = new Set<string>();
    return [...teamList, ...fromStaff].filter(r => {
      if (seen.has(r.email)) return false;
      seen.add(r.email);
      return true;
    });
  })();

  const handleCreate = async () => {
    if (!title.trim()) return;
    const savedSchedule = schedule === "none" ? null
      : schedule === "custom" ? `Every ${customRecurrence.interval} ${customRecurrence.unit}(s)`
      : schedule;

    // No legacy "person" type baking needed — type removed from builder.
    // Existing saved checklists with person type render as multiple_choice in the runner.
    const sectionsWithPersonChoices: SectionDef[] = sections;

    const allLocationIds = allDbLocations.map(loc => loc.id);
    const selectedIds = locationMode === "all" ? [] : selectedLocationIds.filter(id => allLocationIds.includes(id));
    if (locationMode === "specific" && selectedIds.length === 0) return;
    const isAllLocations = locationMode === "all";
    const allDepartmentIds = availableDepartments.map(dep => dep.id);
    const selectedDeptIds = departmentMode === "all" ? [] : selectedDepartmentIds.filter(id => allDepartmentIds.includes(id));
    if (departmentMode === "specific" && selectedDeptIds.length === 0) return;
    const payload: Partial<ChecklistItem> = {
      title: title.trim(),
      description: description.trim() || null,
      questionsCount: totalQuestions,
      schedule: savedSchedule,
      start_date: startDate ? format(startDate, "yyyy-MM-dd") : null,
      sections: sectionsWithPersonChoices,
      time_of_day: "anytime",         // visibility is handled with the explicit window below
      due_time: null,
      visibility_from: visibilityWindowEnabled ? visibilityFrom : null,
      visibility_until: visibilityWindowEnabled ? visibilityUntil : null,
      allow_late_completion: allowLateCompletion,
      location_id: isAllLocations ? null : (selectedIds.length === 1 ? selectedIds[0] : null),
      location_ids: isAllLocations ? null : selectedIds,
      concept_id: isAllLocations ? allLocationsConceptId : null,
      department_ids: departmentMode === "all" ? null : selectedDeptIds,
      is_published: isPublished,
    };

    const toastRlsError = (err: unknown) => {
      const msg: string = err instanceof Error ? err.message : (err as any)?.message ?? "";
      if (msg.toLowerCase().includes("row-level security") || msg.toLowerCase().includes("rls")) {
        toast.error(t("builder.toast.planLimitError"));
      } else {
        toast.error(msg || t("builder.toast.genericSaveError"));
      }
    };

    setIsSaving(true);
    try {
      // Let any in-flight autosave land first so it can't write a stale draft after we publish.
      const publishedSnapshot = autosaveEnabled ? JSON.stringify(buildDraftContent()) : "";
      if (autosaveEnabled) await queueRef.current;
      const currentId = savedIdRef.current ?? savedId;
      const wasLive = liveInDbRef.current;
      const isFirstPublish = autosaveEnabled ? !wasLive : !currentId;
      if (currentId && onUpdate) {
        await onUpdate(currentId, payload);
      } else {
        const result = await onAdd({
          id: `cl-${Date.now()}`,
          ...payload,
          type: "checklist",
          folderId: null,
          createdAt: new Date().toISOString().slice(0, 10),
        } as any);
        if (result) { savedIdRef.current = result as string; setSavedId(result as string); }
      }
      if (autosaveEnabled) {
        const publishedId = savedIdRef.current ?? currentId;
        if (publishedId && (hasDraftRef.current || wasLive)) {
          try { await onClearDraft?.(publishedId); } catch { /* published; a leftover draft is retried on next publish */ }
        }
        hasDraftRef.current = false;
        setHasDraft(false);
        liveInDbRef.current = isPublished;
        lastSavedRef.current = publishedSnapshot;
        setSavedAt(new Date());
        setSaveStatus("saved");
      }
      clearChecklistDraft();
      initialTitleRef.current = title;
      initialDescriptionRef.current = description;
      initialSectionsRef.current = JSON.stringify(sections);
      initialSettingsRef.current = settingsSnapshot();
      onDirtyChange?.(false);
      setLastPublishedAt(new Date());
      toast.success(
        !isPublished
          ? t("builder.toast.savedAsDraft")
          : isFirstPublish ? t("builder.toast.published") : t("builder.toast.changesSaved"),
      );
    } catch (err) {
      toastRlsError(err);
    } finally {
      setIsSaving(false);
    }
  };

  // Primary action label: "Publish" only makes sense once the checklist will actually
  // go live on the kiosk. While it's staying in Draft, this button just saves it.
  const primaryActionLabel = isSaving
    ? (isPublished ? t("builder.footer.publishing") : t("builder.footer.saving"))
    : (isPublished ? t("builder.footer.publish") : t("builder.footer.save"));

  // ── Form content (shared between page and modal modes) ────────────────────

  const renderInsertButton = (si: number, qi: number) => {
    const isOpen = insertDropdown?.si === si && insertDropdown?.qi === qi;
    return (
      <div className="relative flex justify-center py-0.5">
        <button
          type="button"
          aria-label={t("builder.insert.ariaLabel")}
          onClick={() => setInsertDropdown(isOpen ? null : { si, qi })}
          className="w-5 h-5 flex items-center justify-center rounded-full border border-dashed border-border text-muted-foreground hover:border-sage/60 hover:text-sage transition-colors"
        >
          <Plus size={10} />
        </button>
        {isOpen && (
          <div
            ref={insertDropdownRef}
            className="absolute top-full mt-1 z-20 bg-card border border-border rounded-lg shadow-lg py-1 min-w-[140px] left-1/2 -translate-x-1/2"
          >
            <button
              type="button"
              onClick={() => { addQuestionAt(si, qi); setInsertDropdown(null); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/50 transition-colors"
            >
              <Plus size={11} className="text-sage shrink-0" />
              <span className="text-xs text-foreground">{t("builder.insert.questionOption")}</span>
            </button>
            <button
              type="button"
              onClick={() => { addSectionAfter(si); setInsertDropdown(null); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/50 transition-colors"
            >
              <Plus size={11} className="text-sage shrink-0" />
              <span className="text-xs text-foreground">{t("builder.insert.sectionOption")}</span>
            </button>
          </div>
        )}
      </div>
    );
  };

  const formContent = (
    <>
      {/* Page-mode action bar — sticks to the top of the scroll area so Publish
          never floats over the form controls underneath it */}
      {asPage && (
        <div
          data-testid="builder-action-bar"
          className="sticky -top-5 z-30 flex items-center justify-between gap-3 bg-background px-5 py-3"
        >
          <button onClick={handleRequestClose} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft size={16} /> {t("builder.exit")}
          </button>
          <div className="flex flex-row items-center gap-3">
            {autosaveEnabled ? (
              (saveStatus !== "idle" || hasDraft) && (
                <span
                  data-testid="builder-save-status"
                  role="status"
                  className={cn(
                    "text-xs whitespace-nowrap",
                    saveStatus === "error" ? "text-status-error" : "text-muted-foreground",
                    saveStatus === "idle" && "italic",
                  )}
                >
                  {saveStatus === "saving" ? t("builder.saveStatus.saving")
                    : saveStatus === "error" ? t("builder.saveStatus.error")
                    : saveStatus === "saved" && savedAt ? t("builder.saveStatus.savedAt", { time: format(savedAt, "h:mmaaa") })
                    : t("checklist.unpublishedChanges")}
                </span>
              )
            ) : lastPublishedAt && (
              <span className="text-[10px] text-muted-foreground px-2.5 py-1 rounded-full border border-border/50 whitespace-nowrap">
                {t("builder.footer.savedAt", { time: format(lastPublishedAt, "h:mm a") })}
              </span>
            )}
            <div className={cn(
              "transition-all duration-150",
              footerPublishVisible ? "opacity-0 pointer-events-none" : "opacity-100",
            )}>
            <button
              data-testid="checklist-save-button"
              disabled={isSaving || !title.trim() || (locationMode === "specific" && selectedLocationIds.length === 0)}
              onClick={handleCreate}
              className={cn(
                "px-4 py-2 rounded-xl text-sm font-medium transition-colors",
                !isSaving && title.trim() && (locationMode === "all" || selectedLocationIds.length > 0)
                  ? "bg-sage text-primary-foreground hover:bg-sage-deep"
                  : "bg-muted text-muted-foreground cursor-not-allowed"
              )}
            >
              {primaryActionLabel}
            </button>
            </div>
          </div>
        </div>
      )}
      {/* Form body — no inner scroll; outer overlay handles all scrolling */}
      <div
        className="px-5 pb-5 pt-2 space-y-5"
        onPointerDownCapture={markTouched}
        onKeyDownCapture={markTouched}
        onChangeCapture={markTouched}
      >
        {/* Kiosk visibility (Draft/Live) */}
        <div className="flex items-center justify-between rounded-2xl border border-border bg-muted/40 p-3">
          <div>
            <p className="text-sm font-medium text-foreground">{t("builder.kioskVisibility.heading")}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isPublished ? t("builder.kioskVisibility.liveDesc") : t("builder.kioskVisibility.draftDesc")}
            </p>
          </div>
          <Switch
            data-testid="checklist-published-toggle"
            checked={isPublished}
            onCheckedChange={setIsPublished}
          />
        </div>

        {/* Applies to: concept → locations → departments */}
        <div className="space-y-3">
          <label className="text-xs text-muted-foreground block font-semibold">{t("builder.appliesTo.heading")}</label>
          <div data-testid="builder-applies-to" className="rounded-[20px] border border-border bg-card p-4 space-y-3">
            <div className="grid gap-2 md:grid-cols-3">
              <FilterField label={t("builder.appliesTo.concept")}>
                <div className="relative">
                  <Building2 size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                  <select
                    data-testid="builder-concept-select"
                    value={allLocationsConceptId ?? ""}
                    onChange={e => changeConcept(e.target.value || null)}
                    className="w-full appearance-none rounded-xl border border-border bg-background py-2.5 pl-9 pr-8 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value="">{t("builder.appliesTo.allConcepts")}</option>
                    {concepts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                </div>
              </FilterField>
              <FilterField label={t("builder.appliesTo.locations")}>
                <FilterMultiSelect
                  testId="builder-location-filter"
                  icon={<MapPin size={14} className="text-muted-foreground shrink-0" />}
                  options={allModeLocations.map(loc => ({ id: loc.id, label: loc.name, sublabel: loc.address || undefined }))}
                  selected={selectedLocationIds}
                  onChange={setSelectedLocationIds}
                  allLabel={t("locations.all")}
                />
              </FilterField>
              <FilterField label={t("builder.appliesTo.departments")}>
                <FilterMultiSelect
                  testId="builder-department-filter"
                  icon={<Layers size={14} className="text-muted-foreground shrink-0" />}
                  options={availableDepartments.map(dep => ({ id: dep.id, label: dep.name }))}
                  selected={selectedDepartmentIds}
                  onChange={setSelectedDepartmentIds}
                  allLabel={t("builder.departments.all")}
                  noOptionsLabel={departmentsLoading ? t("builder.departments.loading") : t("builder.departments.noneAvailable")}
                />
              </FilterField>
            </div>
            <p data-testid="builder-applies-to-summary" className="text-xs text-muted-foreground">
              {t("builder.appliesTo.summary", {
                where: locationMode === "specific"
                  ? (selectedLocations.length === 1 ? selectedLocations[0].name : t("builder.appliesTo.locationCount", { count: selectedLocations.length }))
                  : allLocationsConceptId
                    ? t("builder.appliesTo.everyLocationIn", { name: concepts.find(c => c.id === allLocationsConceptId)?.name ?? "" })
                    : t("builder.appliesTo.everyLocation"),
                who: departmentMode === "specific"
                  ? (selectedDepartments.length === 1 ? selectedDepartments[0].name : t("builder.appliesTo.departmentCount", { count: selectedDepartments.length }))
                  : t("builder.appliesTo.everyDepartment"),
              })}
            </p>
          </div>
        </div>

        {/* Title */}
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">{t("builder.title.label")} <span className="text-status-error">*</span></label>
          <input type="text" placeholder={t("builder.title.placeholder")} value={title}
            onChange={e => setTitle(e.target.value)}
            className="w-full border border-border rounded-xl px-4 py-3 text-sm bg-muted focus:outline-none focus:ring-1 focus:ring-ring" />
        </div>

        {/* Description */}
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">{t("builder.description.label")}</label>
          <textarea placeholder={t("builder.description.placeholder")} value={description} onChange={e => setDescription(e.target.value)}
            rows={2} className="w-full border border-border rounded-xl px-4 py-3 text-sm bg-muted resize-none focus:outline-none focus:ring-1 focus:ring-ring" />
        </div>

        {/* Schedule */}
        <div className="space-y-4">
          <label className="text-xs text-muted-foreground block font-semibold">{t("builder.schedule.heading")}</label>

          {/* Start date */}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">{t("builder.schedule.startDate")}</label>
            <Popover open={startDateOpen} onOpenChange={setStartDateOpen}>
              <PopoverTrigger asChild>
                <button className="w-full flex items-center gap-2 px-4 py-3 rounded-xl border border-border bg-muted text-sm text-foreground hover:bg-muted/80 transition-colors">
                  <CalendarIcon size={14} className="text-muted-foreground shrink-0" />
                  <span className="flex-1 text-left">{startDate ? format(startDate, "PPP") : t("builder.schedule.selectStartDate")}</span>
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 z-[70]" align="start">
                <CalendarPicker
                  mode="single"
                  selected={startDate}
                  onSelect={(date) => {
                    setStartDate(date ?? undefined);
                    if (date) setStartDateOpen(false);
                  }}
                  initialFocus
                  className="p-3 pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Visibility window */}
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-muted/40 p-3">
              <div>
                <p className="text-sm font-medium text-foreground">{t("builder.schedule.visibilityWindow")}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {t("builder.schedule.visibilityOptional")}
                </p>
              </div>
              <Switch
                data-testid="checklist-visibility-window-toggle"
                aria-label={t("builder.schedule.visibilityWindow")}
                checked={visibilityWindowEnabled}
                onCheckedChange={setVisibilityWindowEnabled}
              />
            </div>

            {visibilityWindowEnabled && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">{t("builder.schedule.from")}</label>
                  <div className="flex items-center gap-2 px-4 py-3 rounded-xl border border-border bg-muted">
                    <Clock size={14} className="text-muted-foreground shrink-0" />
                    <input
                      type="time"
                      value={visibilityFrom}
                      onChange={e => setVisibilityFrom(e.target.value)}
                      className="flex-1 text-sm bg-transparent focus:outline-none text-foreground"
                    />
              </div>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">{t("builder.schedule.until")}</label>
                  <div className="flex items-center gap-2 px-4 py-3 rounded-xl border border-border bg-muted">
                    <Clock size={14} className="text-muted-foreground shrink-0" />
                    <input
                      type="time"
                      value={visibilityUntil}
                      onChange={e => setVisibilityUntil(e.target.value)}
                      className="flex-1 text-sm bg-transparent focus:outline-none text-foreground"
                    />
                  </div>
                </div>
              </div>
            )}

            {visibilityWindowEnabled && (
              <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-muted/40 p-3">
                <div>
                  <p className="text-sm font-medium text-foreground">{t("builder.schedule.allowLate")}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {allowLateCompletion ? t("builder.schedule.allowLateOnHint") : t("builder.schedule.allowLateOffHint")}
                  </p>
                </div>
                <Switch
                  data-testid="checklist-allow-late-toggle"
                  aria-label={t("builder.schedule.allowLate")}
                  checked={allowLateCompletion}
                  onCheckedChange={setAllowLateCompletion}
                />
              </div>
            )}

            {!visibilityWindowEnabled && (
              <p className="text-sm italic text-muted-foreground">{t("builder.schedule.noWindowNotice")}</p>
            )}
          </div>

          {/* Repeat */}
          <div>
            <label className="text-xs text-muted-foreground mb-2 block">{t("builder.schedule.repeat")}</label>
            <div className="flex flex-wrap gap-2">
              {SCHEDULE_OPTIONS.map(opt => (
                <button key={opt.key} onClick={() => {
                  setSchedule(opt.key);
                  if (opt.key === "custom") setShowCustomRecurrence(true);
                }}
                  className={cn("text-xs px-3 py-1.5 rounded-full border transition-colors",
                    schedule === opt.key ? "bg-sage text-primary-foreground border-sage" : "border-border text-muted-foreground hover:border-sage/40"
                  )}>
                  {opt.label}
                </button>
              ))}
            </div>
            {schedule === "custom" && (
              <button onClick={() => setShowCustomRecurrence(true)}
                className="mt-2 text-xs text-sage hover:underline">
                {t("builder.schedule.editCustomRecurrence")}
              </button>
            )}
          </div>

          {/* Schedule summary */}
          {startDate && schedule === "none" && (
            <p className="text-sm italic text-muted-foreground">
              {t("builder.schedule.scheduledOnce", { date: format(startDate, "dd/MM/yyyy") })}
            </p>
          )}

        </div>

        {/* Sections & Questions */}
        {sections.map((section, si) => (
          <div key={section.id} className="space-y-3">
            {(sections.length > 1 || si > 0) && (
              <div className="pt-2">
                <div className="flex items-center gap-2 mb-2">
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-xs text-muted-foreground">{t("builder.insert.sectionOption")}</span>
                  <div className="flex-1 h-px bg-border" />
                </div>
                <div className="flex items-center gap-2">
                  <input type="text" placeholder={t("builder.question.sectionNamePlaceholder")} value={section.name}
                    onChange={e => setSections(prev => prev.map((s, i) => i === si ? { ...s, name: e.target.value } : s))}
                    className="flex-1 min-w-0 border border-border rounded-xl px-4 py-2.5 text-sm bg-muted focus:outline-none focus:ring-1 focus:ring-ring font-medium" />
                  {sections.length > 1 && (
                    <button type="button" onClick={() => removeSection(si)}
                      aria-label={t("builder.section.delete")}
                      className="p-1.5 text-muted-foreground hover:text-status-error transition-colors">
                      <X size={16} />
                    </button>
                  )}
                </div>
              </div>
            )}

            {section.questions.length === 0 && (
              <div
                onDragOver={e => { if (dragQuestionKey) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setDragOverKey(`${si}-empty`); } }}
                onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverKey(null); }}
                onDrop={() => {
                  if (dragQuestionKey) {
                    const [fromSi, fromQi] = dragQuestionKey.split("-").map(Number);
                    moveQuestion(fromSi, fromQi, si, 0);
                  }
                  setDragQuestionKey(null);
                  setDragOverKey(null);
                }}
                className={cn("rounded-xl transition-colors", dragOverKey === `${si}-empty` && "bg-sage/10 ring-1 ring-sage/40")}
              >
                {renderInsertButton(si, -1)}
              </div>
            )}

            {section.questions.map((q, qi) => {
              const cfg = q.config || {};
              const mcSet = q.mcSetId ? multipleChoiceSets.find(m => m.id === q.mcSetId) : null;
              const questionChoices = getQuestionChoices(q);
              const questionChoiceColors = q.choiceColors ?? [];
              const qKey = `${si}-${qi}`;
              const isDropTarget = dragOverKey === qKey && dragQuestionKey !== qKey;
              return (
                <React.Fragment key={q.id}>
                <div className="relative">
                  {isDropTarget && (
                    <div className="absolute -top-1 left-0 right-0 h-0.5 bg-sage rounded-full z-10 pointer-events-none" />
                  )}
                  <div
                    draggable
                    onMouseDown={e => {
                      const tag = (e.target as HTMLElement).tagName;
                      suppressQuestionDragRef.current = tag === "INPUT" || tag === "TEXTAREA";
                    }}
                    onDragStart={e => {
                      if (suppressQuestionDragRef.current) { e.preventDefault(); return; }
                      e.dataTransfer.effectAllowed = "move"; setDragQuestionKey(qKey);
                    }}
                    onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setDragOverKey(qKey); }}
                    onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverKey(null); }}
                    onDrop={() => {
                      if (dragQuestionKey && dragQuestionKey !== qKey) {
                        const [fromSi, fromQi] = dragQuestionKey.split("-").map(Number);
                        moveQuestion(fromSi, fromQi, si, qi);
                      }
                      setDragQuestionKey(null);
                      setDragOverKey(null);
                    }}
                    onDragEnd={() => { setDragQuestionKey(null); setDragOverKey(null); }}
                    className={cn("card-surface p-4 space-y-3 transition-opacity", dragQuestionKey === qKey && "opacity-40")}
                  >
                  <div className="flex items-start gap-2">
                    {section.questions.length > 1 && (
                      <GripVertical size={14} className="mt-2.5 shrink-0 text-muted-foreground/50 cursor-grab active:cursor-grabbing" />
                    )}
                    <span className="text-xs text-muted-foreground mt-2.5 shrink-0">{t("builder.question.label", { n: qi + 1 })}</span>
                    <textarea rows={1} placeholder={q.responseType === "instruction" ? t("builder.question.instructionTitlePlaceholder") : t("builder.question.textPlaceholder")} value={q.text}
                      ref={el => { if (el) { el.style.height = "auto"; el.style.height = `${el.scrollHeight}px`; } }}
                      onChange={e => updateQuestion(si, qi, { text: e.target.value.replace(/\n/g, " ") })}
                      onKeyDown={e => { if (e.key === "Enter") e.preventDefault(); }}
                      className="flex-1 min-w-0 resize-none overflow-hidden border border-border rounded-xl px-3 py-2 text-sm bg-muted focus:outline-none focus:ring-1 focus:ring-ring" />
                    <button onClick={() => removeQuestion(si, qi)} className="p-1 mt-1 text-muted-foreground hover:text-status-error transition-colors">
                      <X size={14} />
                    </button>
                  </div>

                  {(q.uncertain || q.warning) && (
                    <div className="flex items-start gap-2 rounded-lg border border-status-warn/40 bg-status-warn/10 px-3 py-2 text-xs text-status-warn">
                      <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                      <span className="flex-1">{q.warning ?? t("builder.question.uncertainWarningDefault")}</span>
                      <button
                        type="button"
                        onClick={() => updateQuestion(si, qi, { uncertain: undefined, warning: undefined })}
                        className="shrink-0 p-0.5 rounded hover:bg-status-warn/20 transition-colors"
                        aria-label={t("builder.question.dismissWarning")}
                      >
                        <X size={12} />
                      </button>
                    </div>
                  )}

                  <div className="flex items-center justify-between">
                    <button
                      onClick={() => setShowResponsePicker({
                        scope: "main",
                        sectionIdx: si,
                        questionIdx: qi,
                      })}
                      className="text-xs px-3 py-1.5 rounded-full border border-border text-muted-foreground hover:border-sage/40 transition-colors flex items-center gap-1">
                      {responseTypeLabel(q.responseType)}
                      <ChevronDown size={10} />
                    </button>
                    {/* Required toggle — Issue 4: use right-[3px] for ON state */}
                    <label className="flex items-center gap-2 cursor-pointer">
                      <span className="text-xs text-muted-foreground">{t("preview.required")}</span>
                      <button
                        type="button"
                        onClick={() => updateQuestion(si, qi, { required: !q.required })}
                        className={cn("w-8 h-5 rounded-full transition-colors relative shrink-0",
                          q.required ? "bg-sage" : "bg-border")}>
                        <div className={cn(
                          "w-3.5 h-3.5 rounded-full bg-white absolute top-[3px] transition-all shadow-sm",
                          q.required ? "right-[3px]" : "left-[3px]"
                        )} />
                      </button>
                    </label>
                  </div>

                  {/* Response type config panels */}

                  {q.responseType === "number" && (
                    <div className="bg-muted/50 rounded-lg p-3 space-y-2">
                      <div className="flex items-center gap-1.5">
                        <Thermometer size={14} className="text-sage shrink-0" />
                        <p className="text-xs font-medium text-muted-foreground">{t("builder.number.heading")}</p>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {t("builder.number.description")}
                      </p>
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            onWheel={blurOnWheel}
                            placeholder={t("builder.number.min")}
                            value={cfg.numberMin ?? ""}
                            onChange={e => updateQuestion(si, qi, {
                              config: {
                                ...cfg,
                                numberMode: "temperature",
                                numberMin: e.target.value ? Number(e.target.value) : undefined,
                              },
                            })}
                            className="flex-1 border border-border rounded-lg px-3 py-1.5 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                          />
                          <span className="text-xs text-muted-foreground">{t("builder.number.to")}</span>
                          <input
                            type="number"
                            onWheel={blurOnWheel}
                            placeholder={t("builder.number.max")}
                            value={cfg.numberMax ?? ""}
                            onChange={e => updateQuestion(si, qi, {
                              config: {
                                ...cfg,
                                numberMode: "temperature",
                                numberMax: e.target.value ? Number(e.target.value) : undefined,
                              },
                            })}
                            className="flex-1 border border-border rounded-lg px-3 py-1.5 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground shrink-0">{t("builder.number.unit")}</span>
                          <div className="flex gap-1 rounded-full bg-background p-1 border border-border">
                            {(["C", "F"] as const).map(unit => (
                              <button
                                key={unit}
                                type="button"
                                onClick={() => updateQuestion(si, qi, {
                                  config: { ...cfg, numberMode: "temperature", temperatureUnit: unit },
                                })}
                                className={cn(
                                  "px-3 py-1 text-[11px] rounded-full transition-colors",
                                  (cfg.temperatureUnit ?? "C") === unit
                                    ? "bg-sage text-primary-foreground"
                                    : "text-muted-foreground hover:text-foreground",
                                )}
                              >
                                {unit === "C" ? t("preview.celsius") : t("preview.fahrenheit")}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {q.responseType === "text" && (
                    <div className="bg-muted/50 rounded-lg p-3 space-y-2">
                      <p className="text-xs font-medium text-muted-foreground">{t("followUpEditor.text.heading")}</p>
                      <div className="relative">
                        <input type="text" placeholder={t("followUpEditor.text.placeholder")} maxLength={160} disabled
                          className="w-full border border-border rounded-lg px-3 py-1.5 text-sm bg-background text-muted-foreground" />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{t("followUpEditor.text.maxChars")}</span>
                      </div>
                    </div>
                  )}

                  {q.responseType === "media" && (
                    <div className="bg-muted/50 rounded-lg p-3 space-y-2">
                      <p className="text-xs font-medium text-muted-foreground">{t("followUpEditor.media.heading")}</p>
                      <button className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-sage text-primary-foreground text-sm font-medium hover:bg-sage-deep transition-colors">
                        <Camera size={16} />
                        {t("preview.takePhoto")}
                      </button>
                      <p className="text-xs text-muted-foreground">{t("followUpEditor.media.notice")}</p>
                    </div>
                  )}

                  {q.responseType === "multiple_choice" && (
                    <div className="bg-muted/50 rounded-lg p-3 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-medium text-muted-foreground">{t("followUpEditor.multipleChoice.heading")}</p>
                        {mcSet && (
                          <span className="text-xs text-muted-foreground">{getMcSetName(mcSet)}</span>
                        )}
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] text-muted-foreground">{t("builder.multipleChoice.selectionMode")}</span>
                        <div className="flex gap-1 rounded-full bg-background p-1 border border-border">
                          {(["single", "multiple"] as const).map(mode => (
                            <button
                              key={mode}
                              type="button"
                              onClick={() => updateQuestion(si, qi, { selectionMode: mode })}
                              className={cn(
                                "px-3 py-1 text-[11px] rounded-full transition-colors",
                                (q.selectionMode ?? "single") === mode
                                  ? "bg-sage text-primary-foreground"
                                  : "text-muted-foreground hover:text-foreground",
                              )}
                            >
                              {mode === "single" ? t("followUpEditor.multipleChoice.modeSingle") : t("followUpEditor.multipleChoice.modeMultiple")}
                            </button>
                          ))}
                        </div>
                      </div>
                      {questionChoices.length > 0 ? (
                        <div className="space-y-2">
                          {questionChoices.map((choice, choiceIdx) => (
                            <div key={`${q.id}-${choiceIdx}`} className="flex items-center gap-2">
                              <input
                                type="text"
                                value={choice}
                                onChange={e => {
                                  const nextChoices = [...questionChoices];
                                  nextChoices[choiceIdx] = e.target.value;
                                  updateQuestion(si, qi, { choices: nextChoices });
                                }}
                                className="flex-1 border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                              />
                              <div className="flex flex-wrap justify-end gap-1.5 min-w-[220px]">
                                {MC_COLOR_OPTIONS.map(option => {
                                  const selectedColor = questionChoiceColors[choiceIdx] ?? DEFAULT_MC_COLOR;
                                  const isSelected = selectedColor === option.value;
                                  return (
                                    <button
                                      key={option.label}
                                      type="button"
                                      aria-pressed={isSelected}
                                      onClick={() => {
                                        const nextColors = [...questionChoiceColors];
                                        nextColors[choiceIdx] = option.value;
                                        updateQuestion(si, qi, { choiceColors: nextColors });
                                      }}
                                      className={cn(
                                        "px-2.5 py-1 rounded-full border text-[11px] font-medium transition-all whitespace-nowrap",
                                        option.value,
                                        isSelected
                                          ? "ring-2 ring-ring ring-offset-2 ring-offset-background shadow-sm"
                                          : "opacity-75 hover:opacity-100",
                                      )}
                                    >
                                      {option.label}
                                    </button>
                                  );
                                })}
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  const nextChoices = questionChoices.filter((_, idx) => idx !== choiceIdx);
                                  const nextColors = questionChoiceColors.filter((_, idx) => idx !== choiceIdx);
                                  updateQuestion(si, qi, {
                                    choices: nextChoices,
                                    choiceColors: nextColors,
                                  });
                                }}
                                className="p-2 text-muted-foreground hover:text-status-error transition-colors"
                                aria-label={t("followUpEditor.multipleChoice.deleteOption", { choice })}
                              >
                                <X size={14} />
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          {t("followUpEditor.multipleChoice.choosePreset")}
                        </p>
                      )}
                              <button
                                type="button"
                                onClick={() => updateQuestion(si, qi, {
                                  choices: [...questionChoices, t("followUpEditor.multipleChoice.newOptionLabel", { n: questionChoices.length + 1 })],
                                  choiceColors: [...questionChoiceColors, DEFAULT_MC_COLOR],
                                })}
                                className="text-xs text-sage hover:text-sage-deep transition-colors flex items-center gap-1"
                              >
                        <Plus size={11} /> {t("followUpEditor.multipleChoice.addOption")}
                      </button>
                    </div>
                  )}

                  {/* "person" type removed from builder — block intentionally omitted */}

                  {/* Issue 7: Instruction buttons — working image upload, remove dead "Link document" */}
                  {q.responseType === "instruction" && (
                    <div className="bg-muted/50 rounded-lg p-3 space-y-3">
                      <p className="text-xs font-medium text-muted-foreground">{t("followUpEditor.instruction.heading")}</p>
                      <textarea placeholder={t("followUpEditor.instruction.placeholder")} rows={3}
                        value={cfg.instructionText || ""}
                        onChange={e => updateQuestion(si, qi, { config: { ...cfg, instructionText: e.target.value } })}
                        className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background resize-none focus:outline-none focus:ring-1 focus:ring-ring" />

                      {/* Uploaded image preview */}
                      {cfg.instructionImageUrl && (() => {
                        const safePreviewUrl = sanitizeImageUrl(cfg.instructionImageUrl);
                        return safePreviewUrl ? (
                          <div className="relative group">
                            <img src={safePreviewUrl} alt={t("followUpEditor.instruction.imageAlt")} className="w-full max-h-48 object-contain rounded-lg border border-border bg-muted" />
                            <button
                              onClick={() => updateQuestion(si, qi, { config: { ...cfg, instructionImageUrl: undefined } })}
                              className="absolute top-1 right-1 p-1 bg-background/90 rounded-full text-muted-foreground hover:text-status-error transition-colors opacity-0 group-hover:opacity-100">
                              <X size={12} />
                            </button>
                          </div>
                        ) : (
                          <div className="rounded-lg border border-status-error/40 bg-status-error/10 px-3 py-2 flex items-start justify-between gap-3">
                            <p className="text-xs text-status-error">
                              {t("builder.instruction.invalidImageUrl")}
                            </p>
                            <button
                              type="button"
                              onClick={() => updateQuestion(si, qi, { config: { ...cfg, instructionImageUrl: undefined } })}
                              className="p-0.5 text-status-error hover:text-status-error/70 transition-colors shrink-0"
                              aria-label={t("builder.instruction.removeInvalidImageUrl")}
                            >
                              <X size={12} />
                            </button>
                          </div>
                        );
                      })()}

                      <div className="flex gap-2 flex-wrap">
                        {/* Working image upload via hidden file input */}
                        <input
                          ref={el => { imgInputRef.current[q.id] = el; }}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={e => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            const reader = new FileReader();
                            reader.onload = evt => {
                              updateQuestion(si, qi, { config: { ...cfg, instructionImageUrl: evt.target?.result as string } });
                            };
                            reader.readAsDataURL(file);
                            e.target.value = "";
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => imgInputRef.current[q.id]?.click()}
                          className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-border text-muted-foreground hover:border-sage/40 hover:text-foreground transition-colors">
                          <Upload size={13} />
                          {cfg.instructionImageUrl ? t("followUpEditor.instruction.replaceImage") : t("followUpEditor.instruction.uploadImage")}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setInstructionPickerQuestionId(prev => prev === q.id ? null : q.id);
                            setInstructionResourceSearch("");
                            setInstructionResourceSection("all");
                          }}
                          className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-border text-muted-foreground hover:border-sage/40 hover:text-foreground transition-colors"
                        >
                          <Link2 size={13} />
                          {cfg.instructionLinkId ? t("builder.instruction.changeInfohubLink") : t("builder.instruction.linkInfohubContent")}
                        </button>
                      </div>

                      {cfg.instructionLinkId && (
                        <div className="rounded-xl border border-sage/25 bg-sage/5 px-3 py-2 flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-foreground">{cfg.instructionLinkTitle}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => updateQuestion(si, qi, {
                              config: {
                                ...cfg,
                                instructionLinkId: undefined,
                                instructionLinkTitle: undefined,
                                instructionLinkSection: undefined,
                              },
                            })}
                            className="p-1.5 rounded-full text-muted-foreground hover:text-status-error transition-colors"
                            aria-label={t("builder.instruction.removeLinkedContent")}
                          >
                            <X size={12} />
                          </button>
                        </div>
                      )}

                      {instructionPickerQuestionId === q.id && (
                        <div className="rounded-xl border border-border bg-background p-3 space-y-3">
                          <div className="flex items-center gap-2 border border-border rounded-lg px-3 py-2">
                            <Search size={14} className="text-muted-foreground shrink-0" />
                            <input
                              type="text"
                              value={instructionResourceSearch}
                              onChange={e => setInstructionResourceSearch(e.target.value)}
                              placeholder={t("builder.instruction.searchLibraryTraining")}
                              className="flex-1 bg-transparent text-sm outline-none"
                            />
                          </div>
                          <div className="flex gap-2 flex-wrap">
                            {[
                              { key: "all", label: t("builder.instruction.filterAll") },
                              { key: "library", label: t("builder.instruction.filterLibrary") },
                              { key: "training", label: t("builder.instruction.filterTraining") },
                            ].map(option => (
                              <button
                                key={option.key}
                                type="button"
                                onClick={() => setInstructionResourceSection(option.key as "all" | "library" | "training")}
                                className={cn(
                                  "px-3 py-1.5 rounded-full border text-xs transition-colors",
                                  instructionResourceSection === option.key
                                    ? "bg-sage text-primary-foreground border-sage"
                                    : "border-border text-muted-foreground hover:border-sage/40",
                                )}
                              >
                                {option.label}
                              </button>
                            ))}
                          </div>
                          <div className="max-h-56 overflow-y-auto space-y-2">
                            {filteredInstructionResources.length === 0 ? (
                              <p className="text-xs text-muted-foreground py-4 text-center">{t("builder.instruction.noInfohubMatch")}</p>
                            ) : filteredInstructionResources.map(resource => (
                              <button
                                key={resource.id}
                                type="button"
                                onClick={() => {
                                  updateQuestion(si, qi, {
                                    config: {
                                      ...cfg,
                                      instructionLinkId: resource.id,
                                      instructionLinkTitle: resource.title,
                                      instructionLinkSection: resource.section,
                                    },
                                  });
                                  setInstructionPickerQuestionId(null);
                                }}
                                className="w-full rounded-xl border border-border px-3 py-3 text-left hover:border-sage/40 hover:bg-muted/30 transition-colors"
                              >
                                <div className="flex items-center gap-2">
                                  {resource.section === "library" ? (
                                    <BookOpen size={14} className="text-sage shrink-0" />
                                  ) : (
                                    <GraduationCap size={14} className="text-sage shrink-0" />
                                  )}
                                  <div className="min-w-0">
                                    <p className="text-sm font-medium text-foreground">{resource.title}</p>
                                  </div>
                                </div>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Logic rules */}
                  {q.responseType !== "instruction" && (
                    <LogicRulesEditor
                      rules={cfg.logicRules || []}
                      onRulesChange={rules => updateQuestion(si, qi, { config: { ...cfg, logicRules: rules } })}
                      responseType={q.responseType}
                      config={cfg}
                      choiceColors={questionChoiceColors}
                      choices={questionChoices.length > 0 ? questionChoices : [t("preview.yes"), t("preview.no"), t("preview.notApplicable")]}
                      questionText={q.text || ""}
                      questionIndex={qi}
                      notifyRecipients={notifyRecipients}
                    />
                  )}
                </div>
                </div>
                {renderInsertButton(si, qi)}
                </React.Fragment>
              );
            })}
          </div>
        ))}

      </div>

      {/* Footer */}
      <div className="px-5 pb-6 pt-4 border-t border-border">
        {requiredError && (
          <p className="text-xs text-status-error mb-2 text-center">{requiredError}</p>
        )}
        {locationMode === "specific" && selectedLocationIds.length > 0 && (
          <p className="text-xs text-muted-foreground mb-2 text-center">
            {selectedLocationIds.length === 1
              ? t("builder.locations.oneSpecificSelectedFooter")
              : t("builder.locations.specificSelectedCountFooter", { count: selectedLocationIds.length })}
          </p>
        )}
        <button
          ref={footerPublishRef}
          data-testid="checklist-save-button"
          disabled={isSaving || !title.trim() || (locationMode === "specific" && selectedLocationIds.length === 0)}
          onClick={handleCreate}
          className={cn("w-full py-3 rounded-xl text-sm font-medium transition-colors",
            !isSaving && title.trim() && (locationMode === "all" || selectedLocationIds.length > 0) ? "bg-sage text-primary-foreground hover:bg-sage-deep" : "bg-muted text-muted-foreground cursor-not-allowed"
          )}>
          {primaryActionLabel}
        </button>
        {lastPublishedAt && (
          <p className="text-xs text-center text-muted-foreground mt-2">
            {isPublished
              ? t("builder.footer.lastPublishedAt", { time: format(lastPublishedAt, "h:mm a") })
              : t("builder.footer.lastSavedAt", { time: format(lastPublishedAt, "h:mm a") })}
          </p>
        )}
      </div>
    </>
  );

  // ── Render: page mode (no overlay) vs modal mode ──────────────────────────

  // Sub-modals used in both page and modal modes
  const subModals = (
    <>
      {showCustomRecurrence && (
        <CustomRecurrencePicker value={customRecurrence} onChange={setCustomRecurrence}
          onClose={() => setShowCustomRecurrence(false)} />
      )}
      {showResponsePicker && (
        <ResponseTypePicker
          onSelect={(type, mcSetId) => {
            const mcSet = mcSetId ? multipleChoiceSets.find(m => m.id === mcSetId) : null;
            if (showResponsePicker.scope === "main") {
              const mainQ = sections[showResponsePicker.sectionIdx].questions[showResponsePicker.questionIdx];
              const mainCfg = withTemperatureDefaults(type, mainQ.responseType, mainQ.config);
              const mainRules = rulesForResponseTypeChange(mainCfg?.logicRules, mainQ, { responseType: type, config: mainCfg });
              updateQuestion(showResponsePicker.sectionIdx, showResponsePicker.questionIdx, {
                responseType: type,
                mcSetId: mcSetId ?? undefined,
                choices: type === "multiple_choice" ? (mcSet?.choices ?? []) : undefined,
                choiceColors: type === "multiple_choice" ? (mcSet?.colors ?? []) : undefined,
                selectionMode: type === "multiple_choice" ? "single" : undefined,
                ...(mainCfg !== mainQ.config || mainRules !== mainCfg?.logicRules ? { config: { ...(mainCfg || {}), logicRules: mainRules } } : {}),
                uncertain: undefined,
                warning: undefined,
              });
            } else {
              const { sectionIdx, questionIdx, ruleIdx, triggerIdx } = showResponsePicker;
              const section = sections[sectionIdx];
              const question = section.questions[questionIdx];
              const rules = question.config?.logicRules || [];
              const nextRules = rules.map((rule, ri) => {
                if (ri !== ruleIdx) return rule;
                return {
                  ...rule,
                  triggers: rule.triggers.map((trigger, ti) => {
                    if (ti !== triggerIdx) return trigger;
                    const nextFollowUp = trigger.config?.followUpQuestion ?? createDefaultFollowUpQuestion();
                    const fuCfg = withTemperatureDefaults(type, nextFollowUp.responseType, nextFollowUp.config);
                    const fuRules = rulesForResponseTypeChange(fuCfg?.logicRules, nextFollowUp, { responseType: type, config: fuCfg });
                    return {
                      ...trigger,
                      config: {
                        ...trigger.config,
                        followUpQuestion: {
                          ...nextFollowUp,
                          responseType: type,
                          mcSetId: mcSetId ?? undefined,
                          choices: type === "multiple_choice" ? (mcSet?.choices ?? []) : undefined,
                          choiceColors: type === "multiple_choice" ? (mcSet?.colors ?? []) : undefined,
                          selectionMode: type === "multiple_choice" ? ("single" as const) : undefined,
                          config: { ...(fuCfg || {}), logicRules: fuRules },
                        },
                      },
                    };
                  }),
                };
              });
              updateQuestion(sectionIdx, questionIdx, {
                config: {
                  ...(question.config || {}),
                  logicRules: nextRules,
                },
              });
            }
            setShowResponsePicker(null);
          }}
          onClose={() => setShowResponsePicker(null)}
        />
      )}
    </>
  );

  // Rendered via portal so it always appears at viewport centre, even inside scrollable/transformed containers
  const discardConfirmDialog = showDiscardConfirm ? createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-foreground/30 backdrop-blur-sm p-4">
      <div className="bg-card rounded-2xl p-6 max-w-sm w-full shadow-xl space-y-4">
        <h3 className="font-display text-lg text-foreground">{autosaveEnabled && !exitSaveFailed ? t("unsavedExit.headingDraft") : t("unsavedExit.heading")}</h3>
        <p className="text-sm text-muted-foreground">
          {!autosaveEnabled ? t("unsavedExit.body") : exitSaveFailed ? t("unsavedExit.bodyAutosave") : t("unsavedExit.bodyDraft")}
        </p>
        <div className="flex gap-3">
          <button
            onClick={() => setShowDiscardConfirm(false)}
            className="flex-1 py-2.5 rounded-xl border border-border text-sm font-medium text-foreground hover:bg-muted transition-colors"
          >
            {t("unsavedExit.keepEditing")}
          </button>
          <button
            onClick={() => { clearChecklistDraft(); onClose(); }}
            className="flex-1 py-2.5 rounded-xl bg-status-error text-white text-sm font-medium hover:opacity-90 transition-opacity"
          >
            {t("builder.discardConfirm.leave")}
          </button>
        </div>
      </div>
    </div>,
    document.body
  ) : null;

  const deleteSectionCount = sectionToDelete !== null ? sections[sectionToDelete]?.questions.length ?? 0 : 0;
  const deleteSectionDialog = sectionToDelete !== null ? createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-foreground/30 backdrop-blur-sm p-4">
      <div role="alertdialog" aria-modal="true" className="bg-card rounded-2xl p-6 max-w-sm w-full shadow-xl space-y-4">
        <h3 className="font-display text-lg text-foreground">{t("builder.section.deleteHeading")}</h3>
        <p className="text-sm text-muted-foreground">{t("builder.section.deleteBody", { count: deleteSectionCount })}</p>
        <div className="flex gap-3">
          <button
            onClick={() => setSectionToDelete(null)}
            className="flex-1 py-2.5 rounded-xl border border-border text-sm font-medium text-foreground hover:bg-muted transition-colors"
          >
            {t("builder.section.deleteCancel")}
          </button>
          <button
            onClick={() => { performRemoveSection(sectionToDelete); setSectionToDelete(null); toast.success(t("builder.section.deleted", { count: deleteSectionCount })); }}
            className="flex-1 py-2.5 rounded-xl bg-status-error text-white text-sm font-medium hover:opacity-90 transition-opacity"
          >
            {t("builder.section.delete")}
          </button>
        </div>
      </div>
    </div>,
    document.body
  ) : null;

  if (asPage) {
    return (
      <>
        <div className="-mx-4 -mt-5">
          {formContent}
        </div>
        {subModals}
        {discardConfirmDialog}
        {deleteSectionDialog}
      </>
    );
  }

  // Modal mode — single scroll container is the outer overlay; card grows naturally
  return createPortal(
    <>
      <div className="fixed inset-0 z-[60] bg-foreground/20 backdrop-blur-sm overflow-y-auto">
        <div className="flex min-h-full items-end sm:items-center justify-center sm:py-8 px-0 sm:px-4 pb-20">
          <div className="relative bg-card w-full max-w-3xl rounded-t-2xl sm:rounded-2xl flex flex-col shadow-xl">
            <button onClick={handleRequestClose} className="absolute top-3 right-3 z-10 btn-icon" aria-label={t("close")}>
              <X size={18} className="text-muted-foreground" />
            </button>
            {formContent}
          </div>
        </div>
      </div>
      {subModals}
      {discardConfirmDialog}
      {deleteSectionDialog}
    </>,
    document.body
  );
}
