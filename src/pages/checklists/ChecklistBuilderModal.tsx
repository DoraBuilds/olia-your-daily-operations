import { useState, useRef } from "react";
import {
  Camera, Plus, X, CalendarIcon, ChevronDown, Clock,
  MessageSquare, Bell, FileText, Image, AlertTriangle, User,
  GitBranch, Upload, MapPin, Mail, ArrowLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useCreateAlert } from "@/hooks/useAlerts";
import { useLocations } from "@/hooks/useLocations";
import { useStaffProfiles } from "@/hooks/useStaffProfiles";
import { useTeamMembers } from "@/hooks/useTeamMembers";
import type {
  ChecklistItem, SectionDef, ScheduleType, CustomRecurrence,
  QuestionDef, LogicComparator, LogicTrigger, LogicTriggerType, LogicRule, ResponseType
} from "./types";
import { RESPONSE_TYPES, multipleChoiceSets } from "./data";
import { ResponseTypePicker } from "./ResponseTypePicker";
import { CustomRecurrencePicker } from "./CustomRecurrencePicker";

const responseTypeLabel = (type: ResponseType) => RESPONSE_TYPES.find(r => r.key === type)?.label || "Multiple choice";

interface ChecklistBuilderModalProps {
  onClose: () => void;
  onAdd: (item: ChecklistItem) => void;
  onUpdate?: (id: string, item: Partial<ChecklistItem>) => void;
  initialTitle?: string;
  initialSections?: SectionDef[];
  editId?: string;
  /** When true, renders as a full-page editor (no overlay).
   *  The parent is responsible for showing/hiding it. */
  asPage?: boolean;
}

export function ChecklistBuilderModal({
  onClose, onAdd, onUpdate, initialTitle, initialSections, editId, asPage = false,
}: ChecklistBuilderModalProps) {
  const createAlert = useCreateAlert();
  const { data: dbLocations = [] } = useLocations();
  const { data: staffProfiles = [] } = useStaffProfiles();
  const { data: teamMembers = [] } = useTeamMembers();
  const imgInputRef = useRef<Record<string, HTMLInputElement | null>>({});

  const [title, setTitle] = useState(initialTitle || "");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [scheduleTime, setScheduleTime] = useState("09:00");
  const [schedule, setSchedule] = useState<ScheduleType>("none");
  const [customRecurrence, setCustomRecurrence] = useState<CustomRecurrence>({
    interval: 1, unit: "week", weekDays: ["tue"], ends: "never", occurrences: 13,
  });
  const [showCustomRecurrence, setShowCustomRecurrence] = useState(false);
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [sections, setSections] = useState<SectionDef[]>(initialSections || [{
    id: "sec-default", name: "", questions: [{ id: "q-1", text: "", responseType: "checkbox", required: true, config: {} }],
  }]);
  const [showResponsePicker, setShowResponsePicker] = useState<{ sectionIdx: number; questionIdx: number } | null>(null);
  const [requiredError, setRequiredError] = useState("");

  const SCHEDULE_OPTIONS: { key: ScheduleType; label: string }[] = [
    { key: "none", label: "Once" },
    { key: "daily", label: "Every day" },
    { key: "weekday", label: "Every weekday" },
    { key: "weekly", label: "Every week" },
    { key: "monthly", label: "Every month" },
    { key: "yearly", label: "Every year" },
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

  // Staff available for person-type questions and notify triggers, scoped to selected location
  const availableStaff = staffProfiles.filter(s =>
    s.status !== "archived" &&
    (selectedLocationId === null || s.location_id === selectedLocationId)
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
    const schedLabel = schedule === "none" ? undefined
      : schedule === "custom" ? `Every ${customRecurrence.interval} ${customRecurrence.unit}(s)`
      : SCHEDULE_OPTIONS.find(s => s.key === schedule)?.label;

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

    // For person-type questions, bake current staff choices into the config
    // so the kiosk can render them as a multiple-choice list
    const sectionsWithPersonChoices: SectionDef[] = sections.map(sec => ({
      ...sec,
      questions: sec.questions.map(q => {
        if (q.responseType === "person") {
          const choices = availableStaff.map(s => `${s.first_name} ${s.last_name}`);
          return { ...q, choices, config: { ...(q.config || {}), personChoices: choices } };
        }
        return q;
      }),
    }));

    const payload: Partial<ChecklistItem> = {
      title: title.trim(),
      description: description.trim() || undefined,
      questionsCount: totalQuestions,
      schedule: schedLabel,
      sections: sectionsWithPersonChoices,
      time_of_day: "anytime",         // always anytime — kiosk uses due_time for visibility
      due_time: scheduleTime,          // HH:MM — kiosk shows 1 hour before this time
      location_id: selectedLocationId,
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
        {/* Title */}
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Title <span className="text-status-error">*</span></label>
          <input autoFocus type="text" placeholder="e.g. Morning Opening Checklist" value={title}
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
            <Popover>
              <PopoverTrigger asChild>
                <button className="w-full flex items-center gap-2 px-4 py-3 rounded-xl border border-border bg-muted text-sm text-foreground hover:bg-muted/80 transition-colors">
                  <CalendarIcon size={14} className="text-muted-foreground shrink-0" />
                  <span className="flex-1 text-left">{startDate ? format(startDate, "PPP") : "Select start date"}</span>
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 z-[70]" align="start">
                <CalendarPicker mode="single" selected={startDate} onSelect={setStartDate} initialFocus className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
          </div>

          {/* Schedule time (= due time for kiosk) */}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Due time</label>
            <div className="flex items-center gap-2 px-4 py-3 rounded-xl border border-border bg-muted">
              <Clock size={14} className="text-muted-foreground shrink-0" />
              <input type="time" value={scheduleTime} onChange={e => setScheduleTime(e.target.value)}
                className="flex-1 text-sm bg-transparent focus:outline-none text-foreground" />
            </div>
            <p className="text-sm italic text-muted-foreground mt-1.5">
              This checklist will appear in the kiosk 1 hour before it is due.
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
                const timeStr = formatTime12h(scheduleTime);
                if (schedule === "none") return `Scheduled once on ${dateStr} at ${timeStr}.`;
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
                return `First schedule starts on ${dateStr} at ${timeStr}, and will ${repeatLabel}.`;
              })()}
            </p>
          )}

        </div>

        {/* Location */}
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Location</label>
          <button onClick={() => setShowLocationPicker(v => !v)}
            className="w-full flex items-center gap-2 px-4 py-3 rounded-xl border border-border bg-muted text-sm text-foreground hover:bg-muted/80 transition-colors">
            <MapPin size={14} className="text-muted-foreground shrink-0" />
            <span className="flex-1 text-left truncate">
              {selectedLocationId
                ? dbLocations.find(l => l.id === selectedLocationId)?.name ?? "Unknown location"
                : "All locations"}
            </span>
            <ChevronDown size={14} className={cn("text-muted-foreground transition-transform", showLocationPicker && "rotate-180")} />
          </button>
          {showLocationPicker && (
            <div className="mt-1 border border-border rounded-xl bg-card overflow-hidden shadow-md">
              <button onClick={() => { setSelectedLocationId(null); setShowLocationPicker(false); }}
                className={cn("w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors text-left border-b border-border",
                  selectedLocationId === null && "text-sage font-medium")}>
                <MapPin size={14} className="text-muted-foreground shrink-0" />
                <span className="text-sm">All locations</span>
              </button>
              {dbLocations.length === 0 && (
                <p className="px-4 py-3 text-sm text-muted-foreground">No locations set up yet.</p>
              )}
              {dbLocations.map(loc => (
                <button key={loc.id} onClick={() => { setSelectedLocationId(loc.id); setShowLocationPicker(false); }}
                  className={cn("w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors text-left",
                    selectedLocationId === loc.id && "text-sage font-medium")}>
                  <MapPin size={14} className="text-muted-foreground shrink-0" />
                  <span className="text-sm">{loc.name}</span>
                </button>
              ))}
            </div>
          )}
          {selectedLocationId && (
            <p className="text-[10px] text-muted-foreground mt-1 pl-1">
              Only appears in the kiosk at the selected location.
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
                    <button onClick={() => setShowResponsePicker({ sectionIdx: si, questionIdx: qi })}
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
                      <p className="text-xs font-medium text-muted-foreground">Acceptable range</p>
                      <div className="flex items-center gap-2">
                        <input type="number" placeholder="Min" value={cfg.numberMin ?? ""}
                          onChange={e => updateQuestion(si, qi, { config: { ...cfg, numberMin: e.target.value ? Number(e.target.value) : undefined } })}
                          className="flex-1 border border-border rounded-lg px-3 py-1.5 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-ring" />
                        <span className="text-xs text-muted-foreground">to</span>
                        <input type="number" placeholder="Max" value={cfg.numberMax ?? ""}
                          onChange={e => updateQuestion(si, qi, { config: { ...cfg, numberMax: e.target.value ? Number(e.target.value) : undefined } })}
                          className="flex-1 border border-border rounded-lg px-3 py-1.5 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-ring" />
                      </div>
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

                  {/* Person type → real staff from selected location */}
                  {q.responseType === "person" && (
                    <div className="bg-muted/50 rounded-lg p-3 space-y-2">
                      <p className="text-xs font-medium text-muted-foreground">Person selector preview</p>
                      {availableStaff.length === 0 ? (
                        <p className="text-xs text-muted-foreground italic">
                          {selectedLocationId
                            ? "No active staff assigned to this location."
                            : "No active staff profiles found."}
                        </p>
                      ) : (
                        <div className="relative">
                          <select
                            value={cfg.defaultPerson || ""}
                            onChange={e => updateQuestion(si, qi, { config: { ...cfg, defaultPerson: e.target.value } })}
                            className="w-full border border-border rounded-lg px-3 py-1.5 text-sm bg-background text-foreground appearance-none pr-8 focus:outline-none focus:ring-1 focus:ring-ring"
                          >
                            <option value="">No default — staff selects at kiosk</option>
                            {availableStaff.map(s => (
                              <option key={s.id} value={`${s.first_name} ${s.last_name}`}>
                                {s.first_name} {s.last_name}{s.role ? ` — ${s.role}` : ""}
                              </option>
                            ))}
                          </select>
                          <ChevronDown size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                        </div>
                      )}
                      <p className="text-[10px] text-muted-foreground">
                        Optionally pre-select a default. Staff can change it at the kiosk.
                      </p>
                    </div>
                  )}

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
                        <p className="text-[10px] text-muted-foreground self-center italic">
                          Link to Infohub document — coming soon
                        </p>
                      </div>
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

                    const mcChoices = mcSet ? mcSet.choices : ["Yes", "No", "N/A"];

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
                                          <input type="text" placeholder="Follow-up question text"
                                            value={trigger.config?.questionText || ""}
                                            onChange={e => updateTriggerConfig(ri, ti, { questionText: e.target.value })}
                                            className="w-full text-xs border border-border rounded-lg px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-ring" />
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
        <button
          disabled={!title.trim()}
          onClick={handleCreate}
          className={cn("w-full py-3 rounded-xl text-sm font-medium transition-colors",
            title.trim() ? "bg-sage text-primary-foreground hover:bg-sage-deep" : "bg-muted text-muted-foreground cursor-not-allowed"
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
            updateQuestion(showResponsePicker.sectionIdx, showResponsePicker.questionIdx, {
              responseType: type, mcSetId: mcSetId ?? undefined,
            });
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
