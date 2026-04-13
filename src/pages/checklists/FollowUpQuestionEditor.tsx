import { useRef, useState } from "react";
import {
  AlertTriangle,
  Bell,
  Camera,
  ChevronDown,
  FileText,
  GitBranch,
  Image,
  Mail,
  MessageSquare,
  Plus,
  Square,
  User,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  LogicComparator,
  LogicRule,
  LogicTrigger,
  LogicTriggerType,
  QuestionConfig,
  QuestionDef,
  ResponseType,
} from "./types";
import { RESPONSE_TYPES, multipleChoiceSets } from "./data";
import { ResponseTypePicker, type ResponseTypePickerAnchorRect } from "./ResponseTypePicker";

const MC_COLOR_OPTIONS = [
  { label: "Green", value: "bg-status-ok/10 border-status-ok/40 text-status-ok" },
  { label: "Yellow", value: "bg-status-warn/10 border-status-warn/40 text-status-warn" },
  { label: "Red", value: "bg-status-error/10 border-status-error/40 text-status-error" },
  { label: "Neutral", value: "bg-muted text-muted-foreground border-border" },
];

const responseTypeLabel = (type: ResponseType) => RESPONSE_TYPES.find(r => r.key === type)?.label || "Response type";
const getQuestionChoices = (q: QuestionDef) => q.choices?.length
  ? q.choices
  : (q.mcSetId ? multipleChoiceSets.find(m => m.id === q.mcSetId)?.choices ?? [] : []);

function createQuestionId() {
  return `q-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function createDefaultFollowUpQuestion(text = ""): QuestionDef {
  return {
    id: createQuestionId(),
    text,
    responseType: "checkbox",
    required: true,
    config: {},
  };
}

export function FollowUpQuestionEditor({
  question,
  onChange,
  notifyRecipients,
  label = "Follow-up question",
  depth = 0,
}: {
  question: QuestionDef;
  onChange: (next: QuestionDef) => void;
  notifyRecipients: { id: string; name: string; role: string | null; email: string }[];
  label?: string;
  depth?: number;
}) {
  const [showResponsePicker, setShowResponsePicker] = useState<ResponseTypePickerAnchorRect | null>(null);
  const imgInputRef = useRef<HTMLInputElement | null>(null);

  const cfg = question.config || {};
  const questionChoices = getQuestionChoices(question);
  const questionChoiceColors = question.choiceColors ?? [];
  const mcSet = question.mcSetId ? multipleChoiceSets.find(m => m.id === question.mcSetId) : null;
  const indentCls = depth > 0 ? "ml-4 pl-4 border-l border-border" : "";

  const updateQuestion = (update: Partial<QuestionDef>) => {
    onChange({ ...question, ...update });
  };

  const updateConfig = (config: Partial<QuestionConfig>) => {
    updateQuestion({ config: { ...cfg, ...config } });
  };

  const setResponseType = (type: ResponseType, mcSetId?: string) => {
    const next: Partial<QuestionDef> = { responseType: type };
    if (type === "multiple_choice") {
      const preset = mcSetId ? multipleChoiceSets.find(m => m.id === mcSetId) : null;
      const choices = preset?.choices ?? question.choices ?? [];
      next.mcSetId = mcSetId ?? question.mcSetId;
      next.choices = choices.length > 0 ? choices : (question.choices ?? []);
      next.choiceColors = preset?.colors ?? question.choiceColors ?? [];
      next.selectionMode = question.selectionMode ?? "single";
    }
    if (type !== "multiple_choice") {
      next.mcSetId = undefined;
    }
    updateQuestion(next);
  };

  const renderResponseConfig = () => {
    if (question.responseType === "number") {
      return (
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
                  onClick={() => updateConfig({
                    numberMode: mode,
                    numberMin: mode === "temperature" ? cfg.numberMin : undefined,
                    numberMax: mode === "temperature" ? cfg.numberMax : undefined,
                    temperatureUnit: mode === "temperature" ? (cfg.temperatureUnit ?? "C") : undefined,
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
                <input
                  type="number"
                  placeholder="Min"
                  value={cfg.numberMin ?? ""}
                  onChange={e => updateConfig({
                    numberMode: "temperature",
                    numberMin: e.target.value ? Number(e.target.value) : undefined,
                  })}
                  className="flex-1 border border-border rounded-lg px-3 py-1.5 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                />
                <span className="text-xs text-muted-foreground">to</span>
                <input
                  type="number"
                  placeholder="Max"
                  value={cfg.numberMax ?? ""}
                  onChange={e => updateConfig({
                    numberMode: "temperature",
                    numberMax: e.target.value ? Number(e.target.value) : undefined,
                  })}
                  className="flex-1 border border-border rounded-lg px-3 py-1.5 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground shrink-0">Unit</span>
                <div className="flex gap-1 rounded-full bg-background p-1 border border-border">
                  {(["C", "F"] as const).map(unit => (
                    <button
                      key={unit}
                      type="button"
                      onClick={() => updateConfig({ numberMode: "temperature", temperatureUnit: unit })}
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
      );
    }

  if (question.responseType === "text") {
    return (
      <div className="bg-muted/50 rounded-lg p-3 space-y-2">
        <p className="text-xs font-medium text-muted-foreground">Text answer preview</p>
          <div className="relative">
            <input
              type="text"
              placeholder="Respondent types here…"
              maxLength={160}
              disabled
              className="w-full border border-border rounded-lg px-3 py-1.5 text-sm bg-background text-muted-foreground"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">max 160 chars</span>
          </div>
        </div>
      );
    }

    if (question.responseType === "checkbox") {
      return (
        <div className="bg-muted/50 rounded-lg p-3 space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Checkbox answer preview</p>
          <div className="flex gap-2 flex-wrap">
            {["Yes", "No", "N/A"].map(opt => (
              <div key={opt} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-muted/50 text-xs text-muted-foreground">
                <Square size={11} /> {opt}
              </div>
            ))}
          </div>
        </div>
      );
    }

    if (question.responseType === "media") {
      return (
        <div className="bg-muted/50 rounded-lg p-3 space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Media capture</p>
          <button className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-sage text-primary-foreground text-sm font-medium hover:bg-sage-deep transition-colors">
            <Camera size={16} />
            Take photo
          </button>
          <p className="text-[10px] text-muted-foreground">Tapping will open the device camera on the kiosk.</p>
        </div>
      );
    }

    if (question.responseType === "multiple_choice") {
      return (
        <div className="bg-muted/50 rounded-lg p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs font-medium text-muted-foreground">Multiple choice options</p>
              {mcSet && <p className="text-[10px] text-muted-foreground mt-0.5">{mcSet.name}</p>}
            </div>
            <div className="flex gap-1 rounded-full bg-background p-1 border border-border shrink-0">
              {(["single", "multiple"] as const).map(mode => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => updateQuestion({ selectionMode: mode })}
                  className={cn(
                    "px-3 py-1 text-[11px] rounded-full transition-colors",
                    (question.selectionMode ?? "single") === mode
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
                <div key={`${question.id}-${choiceIdx}`} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={choice}
                    onChange={e => {
                      const nextChoices = [...questionChoices];
                      nextChoices[choiceIdx] = e.target.value;
                      updateQuestion({ choices: nextChoices });
                    }}
                    className="flex-1 border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                  <select
                    value={questionChoiceColors[choiceIdx] ?? MC_COLOR_OPTIONS[3].value}
                    onChange={e => {
                      const nextColors = [...questionChoiceColors];
                      nextColors[choiceIdx] = e.target.value;
                      updateQuestion({ choiceColors: nextColors });
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
                      updateQuestion({
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
            onClick={() => updateQuestion({
              choices: [...questionChoices, `Option ${questionChoices.length + 1}`],
              choiceColors: [...questionChoiceColors, MC_COLOR_OPTIONS[3].value],
            })}
            className="text-xs text-sage hover:text-sage-deep transition-colors flex items-center gap-1"
          >
            <Plus size={11} /> Add option
          </button>
        </div>
      );
    }

    if (question.responseType === "instruction") {
      return (
        <div className="bg-muted/50 rounded-lg p-3 space-y-3">
          <p className="text-xs font-medium text-muted-foreground">Instruction content</p>
          <textarea
            placeholder="Write your instruction text here…"
            rows={3}
            value={cfg.instructionText || ""}
            onChange={e => updateConfig({ instructionText: e.target.value })}
            className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background resize-none focus:outline-none focus:ring-1 focus:ring-ring"
          />
          {cfg.instructionImageUrl && (
            <div className="relative group">
              <img src={cfg.instructionImageUrl} alt="Instruction" className="w-full max-h-40 object-cover rounded-lg border border-border" />
              <button
                type="button"
                onClick={() => updateConfig({ instructionImageUrl: undefined })}
                className="absolute top-1 right-1 p-1 bg-background/90 rounded-full text-muted-foreground hover:text-status-error transition-colors opacity-0 group-hover:opacity-100"
              >
                <X size={12} />
              </button>
            </div>
          )}
          <div className="flex gap-2 flex-wrap">
            <input
              ref={imgInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={e => {
                const file = e.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = evt => {
                  updateConfig({ instructionImageUrl: evt.target?.result as string });
                };
                reader.readAsDataURL(file);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => imgInputRef.current?.click()}
              className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-border text-muted-foreground hover:border-sage/40 hover:text-foreground transition-colors"
            >
              <Image size={13} />
              {cfg.instructionImageUrl ? "Replace image" : "Upload image"}
            </button>
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <div
      className={cn("rounded-2xl border border-border bg-muted/20 p-3 space-y-3", indentCls)}
      data-testid="followup-question-editor"
      data-depth={depth}
    >
      <div className="flex items-start gap-2">
        <span className="text-xs text-muted-foreground mt-2.5 shrink-0">{label}</span>
        <input
          type="text"
          placeholder="Follow-up question text"
          value={question.text}
          onChange={e => updateQuestion({ text: e.target.value })}
          className="flex-1 border border-border rounded-xl px-3 py-2 text-sm bg-muted focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <button
          type="button"
          onClick={e => setShowResponsePicker(e.currentTarget.getBoundingClientRect())}
          className="text-xs px-3 py-1.5 rounded-full border border-border text-muted-foreground hover:border-sage/40 transition-colors flex items-center gap-1"
        >
          {responseTypeLabel(question.responseType)}
          <ChevronDown size={10} />
        </button>
        <label className="flex items-center gap-2 cursor-pointer">
          <span className="text-xs text-muted-foreground">Required</span>
          <button
            type="button"
            onClick={() => updateQuestion({ required: !question.required })}
            className={cn("w-8 h-5 rounded-full transition-colors relative shrink-0",
              question.required ? "bg-sage" : "bg-border")}
          >
            <div
              className={cn(
                "w-3.5 h-3.5 rounded-full bg-white absolute top-[3px] transition-all shadow-sm",
                question.required ? "right-[3px]" : "left-[3px]",
              )}
            />
          </button>
        </label>
      </div>

      {renderResponseConfig()}
      <LogicRulesEditor
        question={question}
        onChange={onChange}
        notifyRecipients={notifyRecipients}
        depth={depth}
      />

      {showResponsePicker && (
        <ResponseTypePicker
          anchorRect={showResponsePicker}
          onSelect={(type, mcSetId) => {
            setResponseType(type, mcSetId);
            setShowResponsePicker(null);
          }}
          onClose={() => setShowResponsePicker(null)}
        />
      )}
    </div>
  );
}

function LogicRulesEditor({
  question,
  onChange,
  notifyRecipients,
  depth = 0,
}: {
  question: QuestionDef;
  onChange: (next: QuestionDef) => void;
  notifyRecipients: { id: string; name: string; role: string | null; email: string }[];
  depth?: number;
}) {
  const cfg = question.config || {};
  const rules = cfg.logicRules || [];
  const showLogic = rules.length > 0;
  const isNumericType = question.responseType === "number";
  const isMcType = question.responseType === "multiple_choice" || question.responseType === "checkbox";

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
  const mcChoices = getQuestionChoices(question).length > 0 ? getQuestionChoices(question) : ["Yes", "No", "N/A"];

  const updateQuestion = (update: Partial<QuestionDef>) => onChange({ ...question, ...update });
  const updateRule = (ri: number, update: Partial<LogicRule>) => {
    const next = rules.map((r, i) => i === ri ? { ...r, ...update } : r);
    updateQuestion({ config: { ...cfg, logicRules: next } });
  };
  const addRule = () => {
    const newRule: LogicRule = {
      id: `lr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      comparator: comparators[0].key,
      value: isMcType ? mcChoices[0] : "",
      triggers: [],
    };
    updateQuestion({ config: { ...cfg, logicRules: [...rules, newRule] } });
  };
  const removeRule = (ri: number) => updateQuestion({ config: { ...cfg, logicRules: rules.filter((_, i) => i !== ri) } });
  const updateTriggerConfig = (ri: number, ti: number, config: LogicTrigger["config"]) => {
    const next = rules[ri].triggers.map((t, i) => i === ti ? { ...t, config: { ...t.config, ...config } } : t);
    updateRule(ri, { triggers: next });
  };
  const addTrigger = (ri: number, triggerType: LogicTriggerType) => {
    const rule = rules[ri];
    if (rule.triggers.some(t => t.type === triggerType)) return;
    const triggerConfig: LogicTrigger["config"] = {};
    if (triggerType === "require_action") {
      const qLabel = question.text || "Follow-up question";
      const cLabel = `${comparators.find(c => c.key === rule.comparator)?.label || rule.comparator} ${rule.value}${rule.valueTo ? ` – ${rule.valueTo}` : ""}`;
      triggerConfig.actionTitle = `Action required: "${qLabel}" answered ${cLabel}`;
    }
    if (triggerType === "ask_question") {
      triggerConfig.questionText = `Follow-up: ${question.text || "Question"}`;
      triggerConfig.followUpQuestion = createDefaultFollowUpQuestion(triggerConfig.questionText);
    }
    updateRule(ri, { triggers: [...rule.triggers, { type: triggerType, config: triggerConfig }] });
  };
  const removeTrigger = (ri: number, ti: number) => updateRule(ri, { triggers: rules[ri].triggers.filter((_, i) => i !== ti) });

  const TRIGGER_OPTIONS: { key: LogicTriggerType; label: string; icon: React.ElementType }[] = [
    { key: "ask_question", label: "Ask question", icon: MessageSquare },
    { key: "notify", label: "Notify (email)", icon: Bell },
    { key: "require_note", label: "Require note", icon: FileText },
    { key: "require_media", label: "Require media", icon: Image },
    { key: "require_action", label: "Create action", icon: AlertTriangle },
  ];

  return (
    <>
      {!showLogic && (
        <button onClick={addRule} className="flex items-center gap-1.5 text-xs text-sage hover:text-sage-deep transition-colors">
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
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs text-muted-foreground">If answer</span>
                <select
                  value={rule.comparator}
                  onChange={e => updateRule(ri, { comparator: e.target.value as LogicComparator })}
                  className="text-xs border border-border rounded-lg px-2 py-1.5 bg-muted focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  {comparators.map(c => (
                    <option key={c.key} value={c.key}>{c.label.toLowerCase()}</option>
                  ))}
                </select>
                {isMcType ? (
                  <select
                    value={rule.value}
                    onChange={e => updateRule(ri, { value: e.target.value })}
                    className="text-xs border border-border rounded-lg px-2 py-1.5 bg-muted focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    {mcChoices.map(c => (<option key={c} value={c}>{c}</option>))}
                  </select>
                ) : (
                  <>
                    <input
                      type={isNumericType ? "number" : "text"}
                      value={rule.value}
                      onChange={e => updateRule(ri, { value: e.target.value })}
                      placeholder={isNumericType ? "Value" : "Text"}
                      className="w-20 text-xs border border-border rounded-lg px-2 py-1.5 bg-muted focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                    {(rule.comparator === "between" || rule.comparator === "not_between") && (
                      <>
                        <span className="text-xs text-muted-foreground">and</span>
                        <input
                          type="number"
                          value={rule.valueTo ?? ""}
                          onChange={e => updateRule(ri, { valueTo: e.target.value })}
                          placeholder="Value"
                          className="w-20 text-xs border border-border rounded-lg px-2 py-1.5 bg-muted focus:outline-none focus:ring-1 focus:ring-ring"
                        />
                      </>
                    )}
                  </>
                )}
                <button onClick={() => removeRule(ri)} className="ml-auto p-1 text-muted-foreground hover:text-destructive transition-colors">
                  <X size={12} />
                </button>
              </div>

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
                          {!trigger.config?.followUpQuestion ? (
                            <button
                              type="button"
                              onClick={() => updateTriggerConfig(ri, ti, {
                                followUpQuestion: createDefaultFollowUpQuestion(trigger.config?.questionText || `Follow-up: ${question.text || "Question"}`),
                              })}
                              className="text-xs text-sage hover:text-sage-deep transition-colors flex items-center gap-1"
                            >
                              <Plus size={11} /> Build follow-up question
                            </button>
                          ) : (
                            <FollowUpQuestionEditor
                              question={trigger.config.followUpQuestion}
                              onChange={next => updateTriggerConfig(ri, ti, {
                                questionText: next.text,
                                followUpQuestion: next,
                              })}
                              notifyRecipients={notifyRecipients}
                              label="Follow-up"
                              depth={depth + 1}
                            />
                          )}
                        </div>
                      )}

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
                                className="flex-1 text-xs border border-border rounded-lg px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                              >
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
                          <input
                            type="text"
                            placeholder="Action / task title"
                            value={trigger.config?.actionTitle || ""}
                            onChange={e => updateTriggerConfig(ri, ti, { actionTitle: e.target.value })}
                            className="w-full text-xs border border-border rounded-lg px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                          />
                          <div className="flex items-center gap-1.5">
                            <User size={11} className="text-muted-foreground shrink-0" />
                            <input
                              type="text"
                              placeholder="Assign to"
                              value={trigger.config?.actionAssignee || ""}
                              onChange={e => updateTriggerConfig(ri, ti, { actionAssignee: e.target.value })}
                              className="flex-1 text-xs border border-border rounded-lg px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                            />
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
                    <button onClick={() => removeTrigger(ri, ti)} className="p-0.5 text-muted-foreground hover:text-destructive transition-colors mt-0.5">
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
                      <button
                        key={t.key}
                        onClick={() => addTrigger(ri, t.key)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/50 transition-colors"
                        type="button"
                      >
                        <t.icon size={13} className="text-sage shrink-0" />
                        <span className="text-xs text-foreground">{t.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))}
          <button onClick={addRule} className="text-xs text-sage hover:text-sage-deep transition-colors flex items-center gap-1">
            <Plus size={11} /> Add another rule
          </button>
        </div>
      )}
    </>
  );
}
