import { useState, useRef } from "react";
import {
  Camera, Plus, X, CalendarIcon, ChevronDown, Clock, Search, Square, CheckSquare,
  MessageSquare, Bell, FileText, Image, AlertTriangle, User,
  GitBranch, Upload, Mail, ArrowLeft, BookOpen, GraduationCap, Link2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useCreateAlert } from "@/hooks/useAlerts";
import { useLocations } from "@/hooks/useLocations";
import { useStaffProfiles } from "@/hooks/useStaffProfiles";
import { useTeamMembers } from "@/hooks/useTeamMembers";
import { FollowUpQuestionEditor, createDefaultFollowUpQuestion } from "./FollowUpQuestionEditor";
import type {
  ChecklistItem, SectionDef, ScheduleType, CustomRecurrence,
  QuestionDef, LogicComparator, LogicTrigger, LogicTriggerType, LogicRule, ResponseType
} from "./types";
import { parseScheduleType, SCHEDULE_LABELS } from "./types";
import { RESPONSE_TYPES, multipleChoiceSets } from "./data";
import { ResponseTypePicker } from "./ResponseTypePicker";
import { CustomRecurrencePicker } from "./CustomRecurrencePicker";
import { linkableInfohubResources } from "@/lib/infohub-catalog";

const responseTypeLabel = (type: ResponseType) => RESPONSE_TYPES.find(r => r.key === type)?.label || "Multiple choice";
const getQuestionChoices = (q: QuestionDef) => q.choices?.length
  ? q.choices
  : (q.mcSetId ? multipleChoiceSets.find(m => m.id === q.mcSetId)?.choices ?? [] : []);
const MC_COLOR_OPTIONS = [
  { label: "Green", value: "bg-status-ok/10 border-status-ok/40 text-status-ok" },
  { label: "Yellow", value: "bg-status-warn/10 border-status-warn/40 text-status-warn" },
  { label: "Red", value: "bg-status-error/10 border-status-error/40 text-status-error" },
  { label: "Neutral", value: "bg-muted text-muted-foreground border-border" },
];

interface ChecklistBuilderModalProps {
  onClose: () => void;
  onAdd: (item: ChecklistItem) => void;
  onUpdate?: (id: string, item: Partial<ChecklistItem>) => void;
  initialTitle?: string;
  initialSections?: SectionDef[];
  initialLocationIds?: string[] | null;
  initialSchedule?: string | null;
  initialStartDate?: string | null;
  initialVisibilityFrom?: string | null;
  initialVisibilityUntil?: string | null;
  editId?: string;
  /** When true, renders as a full-page editor (no overlay).
   *  The parent is responsible for showing/hiding it. */
  asPage?: boolean;
}

export function ChecklistBuilderModal({
  onClose, onAdd, onUpdate, initialTitle, initialSections, initialLocationIds,
  initialSchedule, initialStartDate, initialVisibilityFrom, initialVisibilityUntil, editId, asPage = false,
}: ChecklistBuilderModalProps) {
  const createAlert = useCreateAlert();
  const { data: dbLocations = [] } = useLocations();
  const { data: staffProfiles = [] } = useStaffProfiles();
  const { data: teamMembers = [] } = useTeamMembers();
  const imgInputRef = useRef<Record<string, HTMLInputElement | null>>({});

  const [title, setTitle] = useState(initialTitle || "");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState<Date | undefined>(
    initialStartDate ? new Date(`${initialStartDate}T00:00:00`) : undefined,
  );
  const [startDateOpen, setStartDateOpen] = useState(false);
  const [visibilityWindowEnabled, setVisibilityWindowEnabled] = useState(Boolean(initialVisibilityFrom || initialVisibilityUntil));
  const [visibilityFrom, setVisibilityFrom] = useState(initialVisibilityFrom || "09:00");
  const [visibilityUntil, setVisibilityUntil] = useState(initialVisibilityUntil || "10:00");
  const [schedule, setSchedule] = useState<ScheduleType>(() => parseScheduleType(initialSchedule));
  const [customRecurrence, setCustomRecurrence] = useState<CustomRecurrence>({
    interval: 1, unit: "week", weekDays: ["tue"], ends: "never", occurrences: 13,
  });
  const [showCustomRecurrence, setShowCustomRecurrence] = useState(false);
  const [locationMode, setLocationMode] = useState<"all" | "specific">(
    initialLocationIds && initialLocationIds.length > 0 ? "specific" : "all",
  );
  const [selectedLocationIds, setSelectedLocationIds] = useState<string[]>(
    initialLocationIds?.length ? initialLocationIds : [],
  );
  const [locationSearch, setLocationSearch] = useState("");
  const [sections, setSections] = useState<SectionDef[]>(initialSections || [{
    id: "sec-default", name: "", questions: [{ id: "q-1", text: "", responseType: "checkbox", required: true, config: {} }],
  }]);
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
    { key: "none", label: SCHEDULE_LABELS.none },
    { key: "daily", label: SCHEDULE_LABELS.daily },
    { key: "weekday", label: SCHEDULE_LABELS.weekday },
    { key: "weekly", label: SCHEDULE_LABELS.weekly },
    { key: "monthly", label: SCHEDULE_LABELS.monthly },
    { key: "yearly", label: SCHEDULE_LABELS.yearly },
    { key: "custom", label: "Custom" },
  ];

  const addQuestion = (sectionIdx: number) => {
    setSections(prev => prev.map((s, i) => i === sectionIdx ? {
      ...s,
      questions: [...s.questions, { id: `q-${Date.now()}`, text: "", responseType: "checkbox", required: true }],
    } : s));
  };

  const addSection = () => {
    setSections(prev => [...prev, {
      id: `sec-${Date.now()}`, name: "", questions: [{ id: `q-${Date.now()}`, text: "", responseType: "checkbox", required: true }],
    }]);
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

  const totalQuestions = sections.reduce((sum, s) => sum + s.questions.length, 0);

  const selectedLocations = dbLocations.filter(loc => selectedLocationIds.includes(loc.id));
  const filteredLocations = dbLocations.filter(loc => {
    const q = locationSearch.trim().toLowerCase();
    if (!q) return true;
    return loc.name.toLowerCase().includes(q) || (loc.address || "").toLowerCase().includes(q);
  });

  const filteredInstructionResources = linkableInfohubResources.filter((resource) => {
    const matchesSection = instructionResourceSection === "all" || resource.section === instructionResourceSection;
    const query = instructionResourceSearch.trim().toLowerCase();
    const matchesQuery = !query
      || resource.title.toLowerCase().includes(query)
      || resource.subtitle.toLowerCase().includes(query);
    return matchesSection && matchesQuery;
  });

  // Staff available for person-type questions and notify triggers, scoped to selected locations
  const availableStaff = staffProfiles.filter(s =>
    s.status !== "archived" &&
    (locationMode === "all" || selectedLocationIds.length === 0 || selectedLocationIds.includes(s.location_id))
  );

  // Team members with emails — real notification recipients
  const notifyRecipients = teamMembers.filter(m => m.email && m.email.trim().length > 0);

  const formatTime12h = (time24: string) => {
    const [h, m] = time24.split(":").map(Number);
    const ampm = h >= 12 ? "pm" : "am";
    const h12 = h % 12 || 12;
    return m === 0 ? `${h12}${ampm}` : `${h12}:${m.toString().padStart(2, "0")}${ampm}`;
  };

  const handleCreate = () => {
    if (!title.trim()) return;
    const savedSchedule = schedule === "none" ? null
      : schedule === "custom" ? `Every ${customRecurrence.interval} ${customRecurrence.unit}(s)`
      : schedule;

    // Collect all "require_action" logic triggers → write to alerts table
    sections.forEach(section => {
      section.questions.forEach(question => {
        (question.config?.logicRules || []).forEach(rule => {
          rule.triggers.forEach(trigger => {
            if (trigger.type === "require_action" && trigger.config?.actionTitle) {
              createAlert.mutate({
                type: "warn",
                message: trigger.config.actionTitle,
                area: title.trim(),
                time: "Now",
                source: "action",
              });
            }
          });
        });
      });
    });

    // No legacy "person" type baking needed — type removed from builder.
    // Existing saved checklists with person type render as multiple_choice in the runner.
    const sectionsWithPersonChoices: SectionDef[] = sections;

    const allLocationIds = dbLocations.map(loc => loc.id);
    const selectedIds = locationMode === "all" ? [] : selectedLocationIds.filter(id => allLocationIds.includes(id));
    if (locationMode === "specific" && selectedIds.length === 0) return;
    const isAllLocations = locationMode === "all";
    const payload: Partial<ChecklistItem> = {
      title: title.trim(),
      description: description.trim() || undefined,
      questionsCount: totalQuestions,
      schedule: savedSchedule,
      start_date: startDate ? format(startDate, "yyyy-MM-dd") : null,
      sections: sectionsWithPersonChoices,
      time_of_day: "anytime",         // visibility is handled with the explicit window below
      due_time: null,
      visibility_from: visibilityWindowEnabled ? visibilityFrom : null,
      visibility_until: visibilityWindowEnabled ? visibilityUntil : null,
      location_id: isAllLocations ? null : (selectedIds.length === 1 ? selectedIds[0] : null),
      location_ids: isAllLocations ? null : selectedIds,
    };

    if (editId && onUpdate) {
      onUpdate(editId, payload);
    } else {
      onAdd({
        id: `cl-${Date.now()}`,
        ...payload,
        type: "checklist",
        folderId: null,
        createdAt: new Date().toISOString().slice(0, 10),
      } as any);
    }
    onClose();
  };

  // ── Form content (shared between page and modal modes) ────────────────────

  const formContent = (
    <>
      {/* Header bar */}
      <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-border shrink-0">
        {asPage ? (
          <button onClick={onClose} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft size={16} /> Back
          </button>
        ) : (
          <div />
        )}
        <h2 className="font-display text-lg text-foreground">
          {editId ? "Edit checklist" : "Build checklist"}
        </h2>
        {asPage ? (
          <div className="w-16" />
        ) : (
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-muted transition-colors">
            <X size={18} className="text-muted-foreground" />
          </button>
        )}
      </div>

      {/* Form body — no inner scroll; outer overlay handles all scrolling */}
      <div className="p-5 space-y-5">
        {/* Locations */}
        <div className="space-y-3">
          <label className="text-xs text-muted-foreground block font-semibold uppercase tracking-wide">Locations</label>
          <div className="rounded-2xl border border-border bg-muted/40 p-3 space-y-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setLocationMode("all")}
                className={cn(
                  "px-3 py-1.5 rounded-full border text-xs transition-colors",
                  locationMode === "all"
                    ? "bg-sage text-primary-foreground border-sage"
                    : "border-border text-muted-foreground hover:border-sage/40",
                )}
              >
                All locations
              </button>
              <button
                type="button"
                onClick={() => setLocationMode("specific")}
                className={cn(
                  "px-3 py-1.5 rounded-full border text-xs transition-colors",
                  locationMode === "specific"
                    ? "bg-sage text-primary-foreground border-sage"
                    : "border-border text-muted-foreground hover:border-sage/40",
                )}
              >
                Select specific locations
              </button>
              {locationMode === "specific" && dbLocations.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedLocationIds(dbLocations.map(loc => loc.id))}
                  className="ml-auto text-xs text-sage hover:text-sage-deep transition-colors"
                >
                  Select all
                </button>
              )}
            </div>

            {locationMode === "specific" && (
              <>
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    value={locationSearch}
                    onChange={e => setLocationSearch(e.target.value)}
                    placeholder="Search locations or address"
                    className="w-full border border-border rounded-xl pl-9 pr-4 py-2.5 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {filteredLocations.length === 0 ? (
                    <p className="px-3 py-2 text-sm text-muted-foreground">
                      No locations match your search.
                    </p>
                  ) : filteredLocations.map(loc => {
                    const selected = selectedLocationIds.includes(loc.id);
                    return (
                      <button
                        key={loc.id}
                        type="button"
                        onClick={() => setSelectedLocationIds(prev => (
                          prev.includes(loc.id)
                            ? prev.filter(id => id !== loc.id)
                            : [...prev, loc.id]
                        ))}
                        className={cn(
                          "w-full flex items-start gap-3 rounded-xl border px-3 py-3 text-left transition-colors",
                          selected
                            ? "bg-sage-light border-sage/40 text-sage-deep"
                            : "bg-background border-border hover:border-sage/40",
                        )}
                      >
                        <div className="mt-0.5 shrink-0">
                          {selected ? <CheckSquare size={16} /> : <Square size={16} />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{loc.name}</p>
                          {loc.address && (
                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{loc.address}</p>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs text-muted-foreground">
                {locationMode === "all"
                  ? "This checklist will appear at every location."
                  : selectedLocations.length === 0
                    ? "Choose one or more locations."
                    : selectedLocations.length === 1
                      ? `Selected: ${selectedLocations[0].name}`
                      : `${selectedLocations.length} locations selected`}
              </p>
              {locationMode === "specific" && selectedLocations.length > 0 && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-sage-light text-sage-deep">
                  {selectedLocations.length === 1
                    ? "Specific location selected"
                    : `${selectedLocations.length} specific locations selected`}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Title */}
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Title <span className="text-status-error">*</span></label>
          <input type="text" placeholder="e.g. Morning Opening Checklist" value={title}
            onChange={e => setTitle(e.target.value)}
            className="w-full border border-border rounded-xl px-4 py-3 text-sm bg-muted focus:outline-none focus:ring-1 focus:ring-ring" />
        </div>

        {/* Description */}
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Description</label>
          <textarea placeholder="Optional description" value={description} onChange={e => setDescription(e.target.value)}
            rows={2} className="w-full border border-border rounded-xl px-4 py-3 text-sm bg-muted resize-none focus:outline-none focus:ring-1 focus:ring-ring" />
        </div>

        {/* Schedule */}
        <div className="space-y-4">
          <label className="text-xs text-muted-foreground block font-semibold uppercase tracking-wide">Schedule</label>

          {/* Start date */}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Start date</label>
            <Popover open={startDateOpen} onOpenChange={setStartDateOpen}>
              <PopoverTrigger asChild>
                <button className="w-full flex items-center gap-2 px-4 py-3 rounded-xl border border-border bg-muted text-sm text-foreground hover:bg-muted/80 transition-colors">
                  <CalendarIcon size={14} className="text-muted-foreground shrink-0" />
                  <span className="flex-1 text-left">{startDate ? format(startDate, "PPP") : "Select start date"}</span>
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
            <button
              type="button"
              onClick={() => setVisibilityWindowEnabled(v => !v)}
              className={cn(
                "w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl border text-left transition-colors",
                visibilityWindowEnabled
                  ? "border-sage bg-sage-light/40"
                  : "border-border bg-muted hover:bg-muted/80",
              )}
            >
              <div>
                <p className="text-sm font-medium text-foreground">Visibility window</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Optional. Leave it off and the checklist stays visible all day.
                </p>
              </div>
              <span className={cn(
                "text-xs font-semibold px-2.5 py-1 rounded-full",
                visibilityWindowEnabled ? "bg-sage text-primary-foreground" : "bg-muted text-muted-foreground",
              )}>
                {visibilityWindowEnabled ? "On" : "Off"}
              </span>
            </button>

            {visibilityWindowEnabled && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">From</label>
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
                  <label className="text-xs text-muted-foreground mb-1 block">Until</label>
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

            <p className="text-sm italic text-muted-foreground">
              {visibilityWindowEnabled
                ? `This checklist will only be visible on the kiosk from ${formatTime12h(visibilityFrom)} to ${formatTime12h(visibilityUntil)}.`
                : "No visibility window set. The checklist will be visible for the full scheduled day until completed."}
            </p>
          </div>

          {/* Repeat */}
          <div>
            <label className="text-xs text-muted-foreground mb-2 block">Repeat</label>
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
                Edit custom recurrence →
              </button>
            )}
          </div>

          {/* Schedule summary */}
          {startDate && (
            <p className="text-sm italic text-muted-foreground">
              {(() => {
                const dateStr = format(startDate, "dd/MM/yyyy");
                if (schedule === "none") return `Scheduled once on ${dateStr}.`;
                const repeatLabel = (() => {
                  switch (schedule) {
                    case "daily": return "repeat every day";
                    case "weekday": return "repeat every weekday";
                    case "weekly": return `repeat every following ${format(startDate, "EEEE")}`;
                    case "monthly": return "repeat every month";
                    case "yearly": return "repeat every year";
                    case "custom": {
                      const { interval, unit, weekDays } = customRecurrence;
                      if (unit === "week" && weekDays.length > 0) {
                        const dm: Record<string, string> = { mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday" };
                        const days = weekDays.map(d => dm[d] || d).join(", ");
                        return interval === 1 ? `repeat every week on ${days}` : `repeat every ${interval} weeks on ${days}`;
                      }
                      return interval === 1 ? `repeat every ${unit}` : `repeat every ${interval} ${unit}s`;
                    }
                    default: return "";
                  }
                })();
                return `First schedule starts on ${dateStr}, and will ${repeatLabel}.`;
              })()}
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
                  <span className="text-xs text-muted-foreground uppercase tracking-wide">Section</span>
                  <div className="flex-1 h-px bg-border" />
                </div>
                <input type="text" placeholder="Section name" value={section.name}
                  onChange={e => setSections(prev => prev.map((s, i) => i === si ? { ...s, name: e.target.value } : s))}
                  className="w-full border border-border rounded-xl px-4 py-2.5 text-sm bg-muted focus:outline-none focus:ring-1 focus:ring-ring font-medium" />
              </div>
            )}

            {section.questions.map((q, qi) => {
              const cfg = q.config || {};
              const mcSet = q.mcSetId ? multipleChoiceSets.find(m => m.id === q.mcSetId) : null;
              const questionChoices = getQuestionChoices(q);
              const questionChoiceColors = q.choiceColors ?? [];
              return (
                <div key={q.id} className="card-surface p-4 space-y-3">
                  <div className="flex items-start gap-2">
                    <span className="text-xs text-muted-foreground mt-2.5 shrink-0">Q{qi + 1}</span>
                    <input type="text" placeholder="Write your question here" value={q.text}
                      onChange={e => updateQuestion(si, qi, { text: e.target.value })}
                      className="flex-1 border border-border rounded-xl px-3 py-2 text-sm bg-muted focus:outline-none focus:ring-1 focus:ring-ring" />
                    {section.questions.length > 1 && (
                      <button onClick={() => removeQuestion(si, qi)} className="p-1 mt-1 text-muted-foreground hover:text-status-error transition-colors">
                        <X size={14} />
                      </button>
                    )}
                  </div>

                  <div className="flex items-center justify-between">
                    <button onClick={() => setShowResponsePicker({ scope: "main", sectionIdx: si, questionIdx: qi })}
                      className="text-xs px-3 py-1.5 rounded-full border border-border text-muted-foreground hover:border-sage/40 transition-colors flex items-center gap-1">
                      {responseTypeLabel(q.responseType)}
                      <ChevronDown size={10} />
                    </button>
                    {/* Required toggle — Issue 4: use right-[3px] for ON state */}
                    <label className="flex items-center gap-2 cursor-pointer">
                      <span className="text-xs text-muted-foreground">Required</span>
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
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="text-xs font-medium text-muted-foreground">Number response</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            Default is a single numeric answer. Enable temperature mode only when you need an acceptable range.
                          </p>
                        </div>
                        <div className="flex gap-1 rounded-full bg-background p-1 border border-border shrink-0">
                          {(["single", "temperature"] as const).map(mode => (
                            <button
                              key={mode}
                              type="button"
                              onClick={() => updateQuestion(si, qi, {
                                config: {
                                  ...cfg,
                                  numberMode: mode,
                                  numberMin: mode === "temperature" ? cfg.numberMin : undefined,
                                  numberMax: mode === "temperature" ? cfg.numberMax : undefined,
                                  temperatureUnit: mode === "temperature" ? (cfg.temperatureUnit ?? "C") : undefined,
                                },
                              })}
                              className={cn(
                                "px-3 py-1 text-[11px] rounded-full transition-colors",
                                (cfg.numberMode ?? "single") === mode
                                  ? "bg-sage text-primary-foreground"
                                  : "text-muted-foreground hover:text-foreground",
                              )}
                            >
                              {mode === "single" ? "Number" : "Temperature"}
                            </button>
                          ))}
                        </div>
                      </div>

                      {(cfg.numberMode ?? "single") === "single" ? (
                        <div className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-muted-foreground">
                          Staff will enter one number and see the numeric keypad on supported devices.
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <input type="number" placeholder="Min" value={cfg.numberMin ?? ""}
                              onChange={e => updateQuestion(si, qi, { config: { ...cfg, numberMode: "temperature", numberMin: e.target.value ? Number(e.target.value) : undefined } })}
                              className="flex-1 border border-border rounded-lg px-3 py-1.5 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-ring" />
                            <span className="text-xs text-muted-foreground">to</span>
                            <input type="number" placeholder="Max" value={cfg.numberMax ?? ""}
                              onChange={e => updateQuestion(si, qi, { config: { ...cfg, numberMode: "temperature", numberMax: e.target.value ? Number(e.target.value) : undefined } })}
                              className="flex-1 border border-border rounded-lg px-3 py-1.5 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-ring" />
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground shrink-0">Unit</span>
                            <div className="flex gap-1 rounded-full bg-background p-1 border border-border">
                              {(["C", "F"] as const).map(unit => (
                                <button
                                  key={unit}
                                  type="button"
                                  onClick={() => updateQuestion(si, qi, { config: { ...cfg, numberMode: "temperature", temperatureUnit: unit } })}
                                  className={cn(
                                    "px-3 py-1 text-[11px] rounded-full transition-colors",
                                    (cfg.temperatureUnit ?? "C") === unit
                                      ? "bg-sage text-primary-foreground"
                                      : "text-muted-foreground hover:text-foreground",
                                  )}
                                >
                                  {unit === "C" ? "Celsius" : "Fahrenheit"}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {q.responseType === "text" && (
                    <div className="bg-muted/50 rounded-lg p-3 space-y-2">
                      <p className="text-xs font-medium text-muted-foreground">Text answer preview</p>
                      <div className="relative">
                        <input type="text" placeholder="Respondent types here…" maxLength={160} disabled
                          className="w-full border border-border rounded-lg px-3 py-1.5 text-sm bg-background text-muted-foreground" />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">max 160 chars</span>
                      </div>
                    </div>
                  )}

                  {q.responseType === "media" && (
                    <div className="bg-muted/50 rounded-lg p-3 space-y-2">
                      <p className="text-xs font-medium text-muted-foreground">Media capture</p>
                      <button className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-sage text-primary-foreground text-sm font-medium hover:bg-sage-deep transition-colors">
                        <Camera size={16} />
                        Take photo
                      </button>
                      <p className="text-[10px] text-muted-foreground">Tapping will open the device camera on the kiosk.</p>
                    </div>
                  )}

                  {q.responseType === "multiple_choice" && (
                    <div className="bg-muted/50 rounded-lg p-3 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-medium text-muted-foreground">Multiple choice options</p>
                        {mcSet && (
                          <span className="text-[10px] text-muted-foreground">{mcSet.name}</span>
                        )}
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] text-muted-foreground">Selection mode</span>
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
                              {mode === "single" ? "Single" : "Multiple"}
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
                              <select
                                value={questionChoiceColors[choiceIdx] ?? MC_COLOR_OPTIONS[3].value}
                                onChange={e => {
                                  const nextColors = [...questionChoiceColors];
                                  nextColors[choiceIdx] = e.target.value;
                                  updateQuestion(si, qi, { choiceColors: nextColors });
                                }}
                                className="w-28 text-xs border border-border rounded-lg px-2 py-2 bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                              >
                                {MC_COLOR_OPTIONS.map(option => (
                                  <option key={option.label} value={option.value}>{option.label}</option>
                                ))}
                              </select>
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
                                aria-label={`Delete option ${choice}`}
                              >
                                <X size={14} />
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[10px] text-muted-foreground">
                          Choose a preset to add answer options.
                        </p>
                      )}
                      <button
                        type="button"
                        onClick={() => updateQuestion(si, qi, {
                          choices: [...questionChoices, `Option ${questionChoices.length + 1}`],
                          choiceColors: [...questionChoiceColors, MC_COLOR_OPTIONS[3].value],
                        })}
                        className="text-xs text-sage hover:text-sage-deep transition-colors flex items-center gap-1"
                      >
                        <Plus size={11} /> Add option
                      </button>
                    </div>
                  )}

                  {/* "person" type removed from builder — block intentionally omitted */}

                  {/* Issue 7: Instruction buttons — working image upload, remove dead "Link document" */}
                  {q.responseType === "instruction" && (
                    <div className="bg-muted/50 rounded-lg p-3 space-y-3">
                      <p className="text-xs font-medium text-muted-foreground">Instruction content</p>
                      <textarea placeholder="Write your instruction text here…" rows={3}
                        value={cfg.instructionText || ""}
                        onChange={e => updateQuestion(si, qi, { config: { ...cfg, instructionText: e.target.value } })}
                        className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background resize-none focus:outline-none focus:ring-1 focus:ring-ring" />

                      {/* Uploaded image preview */}
                      {cfg.instructionImageUrl && (
                        <div className="relative group">
                          <img src={cfg.instructionImageUrl} alt="Instruction" className="w-full max-h-40 object-cover rounded-lg border border-border" />
                          <button
                            onClick={() => updateQuestion(si, qi, { config: { ...cfg, instructionImageUrl: undefined } })}
                            className="absolute top-1 right-1 p-1 bg-background/90 rounded-full text-muted-foreground hover:text-status-error transition-colors opacity-0 group-hover:opacity-100">
                            <X size={12} />
                          </button>
                        </div>
                      )}

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
                          {cfg.instructionImageUrl ? "Replace image" : "Upload image"}
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
                          {cfg.instructionLinkId ? "Change Infohub link" : "Link Infohub content"}
                        </button>
                      </div>

                      {cfg.instructionLinkId && (
                        <div className="rounded-xl border border-sage/25 bg-sage/5 px-3 py-2 flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-foreground">{cfg.instructionLinkTitle}</p>
                            <p className="text-[10px] text-muted-foreground capitalize">{cfg.instructionLinkSection}</p>
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
                            aria-label="Remove linked Infohub content"
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
                              placeholder="Search library or training"
                              className="flex-1 bg-transparent text-sm outline-none"
                            />
                          </div>
                          <div className="flex gap-2 flex-wrap">
                            {[
                              { key: "all", label: "All" },
                              { key: "library", label: "Library" },
                              { key: "training", label: "Training" },
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
                              <p className="text-xs text-muted-foreground py-4 text-center">No Infohub content matches that search.</p>
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
                                <div className="flex items-start gap-2">
                                  {resource.section === "library" ? (
                                    <BookOpen size={14} className="text-sage mt-0.5 shrink-0" />
                                  ) : (
                                    <GraduationCap size={14} className="text-sage mt-0.5 shrink-0" />
                                  )}
                                  <div className="min-w-0">
                                    <p className="text-sm font-medium text-foreground">{resource.title}</p>
                                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide mt-0.5">{resource.section}</p>
                                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{resource.subtitle}</p>
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
                  {(() => {
                    const rules = cfg.logicRules || [];
                    const showLogic = rules.length > 0;
                    const isNumericType = q.responseType === "number";
                    const isMcType = q.responseType === "multiple_choice" || q.responseType === "checkbox";

                    const NUMERIC_COMPARATORS: { key: LogicComparator; label: string }[] = [
                      { key: "lt", label: "Less than" },
                      { key: "lte", label: "Less than or equal to" },
                      { key: "eq", label: "Equal to" },
                      { key: "neq", label: "Not equal to" },
                      { key: "gte", label: "Greater than or equal to" },
                      { key: "gt", label: "Greater than" },
                      { key: "between", label: "Between" },
                      { key: "not_between", label: "Not between" },
                    ];
                    const CHOICE_COMPARATORS: { key: LogicComparator; label: string }[] = [
                      { key: "is", label: "Is" }, { key: "is_not", label: "Is not" },
                    ];
                    const TEXT_COMPARATORS: { key: LogicComparator; label: string }[] = [
                      { key: "is", label: "Is" }, { key: "is_not", label: "Is not" },
                    ];
                    const comparators = isNumericType ? NUMERIC_COMPARATORS : isMcType ? CHOICE_COMPARATORS : TEXT_COMPARATORS;

                    const TRIGGER_OPTIONS: { key: LogicTriggerType; label: string; icon: React.ElementType }[] = [
                      { key: "ask_question", label: "Ask question", icon: MessageSquare },
                      { key: "notify", label: "Notify (email)", icon: Bell },
                      { key: "require_note", label: "Require note", icon: FileText },
                      { key: "require_media", label: "Require media", icon: Image },
                      { key: "require_action", label: "Create action", icon: AlertTriangle },
                    ];

                    const mcChoices = questionChoices.length > 0 ? questionChoices : ["Yes", "No", "N/A"];

                    const addRule = () => {
                      const newRule: LogicRule = {
                        id: `lr-${Date.now()}`,
                        comparator: comparators[0].key,
                        value: isMcType ? mcChoices[0] : "",
                        triggers: [],
                      };
                      updateQuestion(si, qi, { config: { ...cfg, logicRules: [...rules, newRule] } });
                    };
                    const updateRule = (ri: number, update: Partial<LogicRule>) => {
                      const next = rules.map((r, i) => i === ri ? { ...r, ...update } : r);
                      updateQuestion(si, qi, { config: { ...cfg, logicRules: next } });
                    };
                    const removeRule = (ri: number) => {
                      updateQuestion(si, qi, { config: { ...cfg, logicRules: rules.filter((_, i) => i !== ri) } });
                    };
                    const addTrigger = (ri: number, triggerType: LogicTriggerType) => {
                      const rule = rules[ri];
                      if (rule.triggers.some(t => t.type === triggerType)) return;
                      const triggerConfig: LogicTrigger["config"] = {};
                      if (triggerType === "ask_question") {
                        const followUpText = `Follow-up: ${q.text || `Question ${qi + 1}`}`;
                        triggerConfig.questionText = followUpText;
                        triggerConfig.followUpQuestion = createDefaultFollowUpQuestion(followUpText);
                      }
                      if (triggerType === "require_action") {
                        const qLabel = q.text || `Question ${qi + 1}`;
                        const cLabel = `${comparators.find(c => c.key === rule.comparator)?.label || rule.comparator} ${rule.value}${rule.valueTo ? ` – ${rule.valueTo}` : ""}`;
                        triggerConfig.actionTitle = `Action required: "${qLabel}" answered ${cLabel}`;
                      }
                      updateRule(ri, { triggers: [...rule.triggers, { type: triggerType, config: triggerConfig }] });
                    };
                    const removeTrigger = (ri: number, ti: number) => {
                      updateRule(ri, { triggers: rules[ri].triggers.filter((_, i) => i !== ti) });
                    };
                    const updateTriggerConfig = (ri: number, ti: number, config: LogicTrigger["config"]) => {
                      const next = rules[ri].triggers.map((t, i) => i === ti ? { ...t, config: { ...t.config, ...config } } : t);
                      updateRule(ri, { triggers: next });
                    };

                    return (
                      <>
                        {!showLogic && (
                          <button onClick={addRule}
                            className="flex items-center gap-1.5 text-xs text-sage hover:text-sage-deep transition-colors">
                            <GitBranch size={12} />
                            <span>Add logic</span>
                          </button>
                        )}
                        {showLogic && (
                          <div className="bg-muted/50 rounded-lg p-3 space-y-3">
                            <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                              <GitBranch size={12} /> Logic rules
                            </p>
                            {rules.map((rule, ri) => (
                              <div key={rule.id} className="border border-border rounded-lg p-3 space-y-3 bg-background">
                                {/* Condition row */}
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-xs text-muted-foreground">If answer</span>
                                  <select value={rule.comparator}
                                    onChange={e => updateRule(ri, { comparator: e.target.value as LogicComparator })}
                                    className="text-xs border border-border rounded-lg px-2 py-1.5 bg-muted focus:outline-none focus:ring-1 focus:ring-ring">
                                    {comparators.map(c => (
                                      <option key={c.key} value={c.key}>{c.label.toLowerCase()}</option>
                                    ))}
                                  </select>
                                  {isMcType ? (
                                    <select value={rule.value}
                                      onChange={e => updateRule(ri, { value: e.target.value })}
                                      className="text-xs border border-border rounded-lg px-2 py-1.5 bg-muted focus:outline-none focus:ring-1 focus:ring-ring">
                                      {mcChoices.map(c => (<option key={c} value={c}>{c}</option>))}
                                    </select>
                                  ) : (
                                    <>
                                      <input type={isNumericType ? "number" : "text"} value={rule.value}
                                        onChange={e => updateRule(ri, { value: e.target.value })}
                                        placeholder={isNumericType ? "Value" : "Text"}
                                        className="w-20 text-xs border border-border rounded-lg px-2 py-1.5 bg-muted focus:outline-none focus:ring-1 focus:ring-ring" />
                                      {(rule.comparator === "between" || rule.comparator === "not_between") && (
                                        <>
                                          <span className="text-xs text-muted-foreground">and</span>
                                          <input type="number" value={rule.valueTo ?? ""}
                                            onChange={e => updateRule(ri, { valueTo: e.target.value })}
                                            placeholder="Value"
                                            className="w-20 text-xs border border-border rounded-lg px-2 py-1.5 bg-muted focus:outline-none focus:ring-1 focus:ring-ring" />
                                        </>
                                      )}
                                    </>
                                  )}
                                  <button onClick={() => removeRule(ri)}
                                    className="ml-auto p-1 text-muted-foreground hover:text-destructive transition-colors">
                                    <X size={12} />
                                  </button>
                                </div>

                                {/* Triggers */}
                                <div className="space-y-2">
                                  <span className="text-xs text-muted-foreground">then</span>
                                  {rule.triggers.map((trigger, ti) => (
                                    <div key={ti} className="flex items-start gap-2 bg-muted/60 rounded-lg px-3 py-2">
                                      <div className="flex-1 space-y-2">
                                        <div className="flex items-center gap-1.5">
                                          {(() => { const opt = TRIGGER_OPTIONS.find(t => t.key === trigger.type); return opt ? <opt.icon size={12} className="text-sage shrink-0" /> : null; })()}
                                          <span className="text-xs font-medium text-foreground">
                                            {TRIGGER_OPTIONS.find(t => t.key === trigger.type)?.label}
                                          </span>
                                        </div>
                                        {trigger.type === "ask_question" && (
                                          <div className="space-y-2">
                                            <input
                                              type="text"
                                              placeholder="Follow-up question text"
                                              value={trigger.config?.questionText || ""}
                                              onChange={e => {
                                                const nextFollowUp = trigger.config?.followUpQuestion
                                                  ? { ...trigger.config.followUpQuestion, text: e.target.value }
                                                  : createDefaultFollowUpQuestion(e.target.value);
                                                updateTriggerConfig(ri, ti, {
                                                  questionText: e.target.value,
                                                  followUpQuestion: nextFollowUp,
                                                });
                                              }}
                                              className="w-full text-xs border border-border rounded-lg px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                                            />
                                            {trigger.config?.followUpQuestion ? (
                                              <FollowUpQuestionEditor
                                                question={trigger.config.followUpQuestion}
                                                onChange={next => updateTriggerConfig(ri, ti, {
                                                  questionText: next.text,
                                                  followUpQuestion: next,
                                                })}
                                                notifyRecipients={notifyRecipients}
                                                label="Follow-up question"
                                                depth={1}
                                              />
                                            ) : (
                                              <button
                                                type="button"
                                                onClick={() => updateTriggerConfig(ri, ti, {
                                                  questionText: `Follow-up: ${q.text || `Question ${qi + 1}`}`,
                                                  followUpQuestion: createDefaultFollowUpQuestion(`Follow-up: ${q.text || `Question ${qi + 1}`}`),
                                                })}
                                                className="text-xs text-sage hover:text-sage-deep transition-colors flex items-center gap-1"
                                              >
                                                <Plus size={11} /> Build follow-up question
                                              </button>
                                            )}
                                          </div>
                                        )}
                                        {/* Issue 3: Notify → real team members with email */}
                                        {trigger.type === "notify" && (
                                          <div className="space-y-1.5">
                                            <div className="flex items-center gap-1.5">
                                              <Mail size={11} className="text-muted-foreground shrink-0" />
                                              {notifyRecipients.length === 0 ? (
                                                <span className="flex-1 text-xs text-muted-foreground italic px-2 py-1.5">
                                                  No team members with email found. Add team members in Admin.
                                                </span>
                                              ) : (
                                                <select
                                                  value={trigger.config?.notifyUser || ""}
                                                  onChange={e => updateTriggerConfig(ri, ti, { notifyUser: e.target.value })}
                                                  className="flex-1 text-xs border border-border rounded-lg px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-ring">
                                                  <option value="">Select recipient…</option>
                                                  {notifyRecipients.map(m => (
                                                    <option key={m.id} value={m.email}>
                                                      {m.name}{m.role ? ` — ${m.role}` : ""} ({m.email})
                                                    </option>
                                                  ))}
                                                </select>
                                              )}
                                            </div>
                                            <p className="text-[10px] text-muted-foreground pl-4">Notification sent by email. SMS/push coming soon.</p>
                                          </div>
                                        )}
                                        {trigger.type === "require_action" && (
                                          <div className="space-y-2">
                                            <input type="text" placeholder="Action / task title"
                                              value={trigger.config?.actionTitle || ""}
                                              onChange={e => updateTriggerConfig(ri, ti, { actionTitle: e.target.value })}
                                              className="w-full text-xs border border-border rounded-lg px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-ring" />
                                            <div className="flex items-center gap-1.5">
                                              <User size={11} className="text-muted-foreground shrink-0" />
                                              <input type="text" placeholder="Assign to"
                                                value={trigger.config?.actionAssignee || ""}
                                                onChange={e => updateTriggerConfig(ri, ti, { actionAssignee: e.target.value })}
                                                className="flex-1 text-xs border border-border rounded-lg px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-ring" />
                                            </div>
                                            {trigger.config?.actionTitle && (
                                              <div className="border-l-2 border-l-status-warn bg-muted/40 rounded-r-lg p-2 flex items-start gap-2">
                                                <AlertTriangle size={11} className="text-status-warn mt-0.5 shrink-0" />
                                                <div>
                                                  <p className="text-[11px] font-medium text-foreground leading-snug">{trigger.config.actionTitle}</p>
                                                  <p className="text-[10px] text-muted-foreground mt-0.5">Appears as an operational alert on the dashboard</p>
                                                </div>
                                              </div>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                      <button onClick={() => removeTrigger(ri, ti)}
                                        className="p-0.5 text-muted-foreground hover:text-destructive transition-colors mt-0.5">
                                        <X size={11} />
                                      </button>
                                    </div>
                                  ))}
                                  <div className="relative group inline-block">
                                    <button className="text-xs text-sage hover:text-sage-deep transition-colors flex items-center gap-1">
                                      <Plus size={11} /> trigger
                                    </button>
                                    <div className="hidden group-focus-within:block absolute left-0 top-full mt-1 bg-card border border-border rounded-lg shadow-lg z-10 py-1 min-w-[160px]">
                                      {TRIGGER_OPTIONS.filter(t => !rule.triggers.some(rt => rt.type === t.key)).map(t => (
                                        <button key={t.key} onClick={() => addTrigger(ri, t.key)}
                                          className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/50 transition-colors">
                                          <t.icon size={13} className="text-sage shrink-0" />
                                          <span className="text-xs text-foreground">{t.label}</span>
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ))}
                            <button onClick={addRule}
                              className="text-xs text-sage hover:text-sage-deep transition-colors flex items-center gap-1">
                              <Plus size={11} /> Add another rule
                            </button>
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              );
            })}

            <button onClick={() => addQuestion(si)}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed border-sage/40 text-xs text-sage hover:bg-sage-light transition-colors">
              <Plus size={13} /> Add another question
            </button>
          </div>
        ))}

        <button onClick={addSection}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed border-border text-xs text-muted-foreground hover:text-foreground hover:border-sage/40 transition-colors">
          <Plus size={13} /> Add a section
        </button>
      </div>

      {/* Footer */}
      <div className="px-5 pb-6 pt-4 border-t border-border">
        {requiredError && (
          <p className="text-xs text-status-error mb-2 text-center">{requiredError}</p>
        )}
        {locationMode === "specific" && selectedLocationIds.length === 0 && (
          <p className="text-xs text-status-error mb-2 text-center">Select at least one location or switch back to all locations.</p>
        )}
        {locationMode === "specific" && selectedLocationIds.length > 0 && (
          <p className="text-xs text-muted-foreground mb-2 text-center">
            {selectedLocationIds.length === 1
              ? "One specific location is selected."
              : `${selectedLocationIds.length} specific locations are selected.`}
          </p>
        )}
        <button
          disabled={!title.trim() || (locationMode === "specific" && selectedLocationIds.length === 0)}
          onClick={handleCreate}
          className={cn("w-full py-3 rounded-xl text-sm font-medium transition-colors",
            title.trim() && (locationMode === "all" || selectedLocationIds.length > 0) ? "bg-sage text-primary-foreground hover:bg-sage-deep" : "bg-muted text-muted-foreground cursor-not-allowed"
          )}>
          {editId ? "Save checklist" : "Create checklist"}
        </button>
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
              updateQuestion(showResponsePicker.sectionIdx, showResponsePicker.questionIdx, {
                responseType: type,
                mcSetId: mcSetId ?? undefined,
                choices: type === "multiple_choice" ? (mcSet?.choices ?? []) : undefined,
                choiceColors: type === "multiple_choice" ? (mcSet?.colors ?? []) : undefined,
                selectionMode: type === "multiple_choice" ? "single" : undefined,
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
                          selectionMode: type === "multiple_choice" ? "single" : undefined,
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

  if (asPage) {
    return (
      <>
        <div className="-mx-4 -mt-5">
          {formContent}
        </div>
        {subModals}
      </>
    );
  }

  // Modal mode — single scroll container is the outer overlay; card grows naturally
  return (
    <>
      <div className="fixed inset-0 z-[60] bg-foreground/20 backdrop-blur-sm overflow-y-auto">
        <div className="flex min-h-full items-end sm:items-center justify-center sm:py-8 px-0 sm:px-4 pb-20">
          <div className="bg-card w-full max-w-3xl rounded-t-2xl sm:rounded-2xl flex flex-col shadow-xl">
            {formContent}
          </div>
        </div>
      </div>
      {subModals}
    </>
  );
}
