import { Plus, X, GitBranch, MessageSquare, Bell, FileText, Image, AlertTriangle, Mail, User } from "lucide-react";
import { FollowUpQuestionEditor, createDefaultFollowUpQuestion } from "./FollowUpQuestionEditor";
import type { LogicRule, LogicComparator, LogicTrigger, LogicTriggerType, ResponseType } from "./types";

interface NotifyRecipient {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface LogicRulesEditorProps {
  rules: LogicRule[];
  onRulesChange: (rules: LogicRule[]) => void;
  responseType: ResponseType;
  /** Pre-resolved choices for the question (MC options, or ["Yes","No","N/A"] fallback) */
  choices: string[];
  questionText: string;
  questionIndex: number;
  notifyRecipients: NotifyRecipient[];
}

const NUMERIC_COMPARATORS: { key: LogicComparator; label: string }[] = [
  { key: "lt", label: "Less than" },
  { key: "lte", label: "Less than or equal to" },
  { key: "eq", label: "Equal to" },
  { key: "neq", label: "Not equal to" },
  { key: "gte", label: "Greater than or equal to" },
  { key: "gt", label: "Greater than" },
  { key: "between", label: "Between" },
  { key: "not_between", label: "Not between" },
  { key: "unanswered", label: "Not provided" },
];
const CHOICE_COMPARATORS: { key: LogicComparator; label: string }[] = [
  { key: "is", label: "Is" }, { key: "is_not", label: "Is not" }, { key: "unanswered", label: "Not provided" },
];
const TEXT_COMPARATORS: { key: LogicComparator; label: string }[] = [
  { key: "is", label: "Is" }, { key: "is_not", label: "Is not" }, { key: "unanswered", label: "Not provided" },
];

const TRIGGER_OPTIONS: { key: LogicTriggerType; label: string; icon: React.ElementType }[] = [
  { key: "ask_question", label: "Ask question", icon: MessageSquare },
  { key: "notify", label: "Notify (email)", icon: Bell },
  { key: "require_note", label: "Require note", icon: FileText },
  { key: "require_media", label: "Require media", icon: Image },
];

export function LogicRulesEditor({
  rules, onRulesChange, responseType, choices, questionText, questionIndex, notifyRecipients,
}: LogicRulesEditorProps) {
  const showLogic = rules.length > 0;
  const isNumericType = responseType === "number";
  const isMcType = responseType === "multiple_choice" || responseType === "checkbox";
  const comparators = isNumericType ? NUMERIC_COMPARATORS : isMcType ? CHOICE_COMPARATORS : TEXT_COMPARATORS;

  const describeCondition = (rule: LogicRule) => {
    if (rule.comparator === "unanswered") return "left unanswered";
    const label = comparators.find(c => c.key === rule.comparator)?.label || rule.comparator;
    if (rule.comparator === "between" || rule.comparator === "not_between") {
      return `answered ${label.toLowerCase()} ${rule.value}${rule.valueTo ? ` and ${rule.valueTo}` : ""}`;
    }
    return `answered ${label.toLowerCase()} ${rule.value}`;
  };

  const addRule = () => {
    const newRule: LogicRule = {
      id: `lr-${Date.now()}`,
      comparator: comparators[0].key,
      value: isMcType ? choices[0] : "",
      triggers: [],
    };
    onRulesChange([...rules, newRule]);
  };

  const updateRule = (ri: number, update: Partial<LogicRule>) => {
    onRulesChange(rules.map((r, i) => i === ri ? { ...r, ...update } : r));
  };

  const removeRule = (ri: number) => {
    onRulesChange(rules.filter((_, i) => i !== ri));
  };

  const addTrigger = (ri: number, triggerType: LogicTriggerType) => {
    const rule = rules[ri];
    if (rule.triggers.some(t => t.type === triggerType)) return;
    const triggerConfig: LogicTrigger["config"] = {};
    if (triggerType === "ask_question") {
      triggerConfig.questionText = "";
      triggerConfig.followUpQuestion = createDefaultFollowUpQuestion("");
    }
    if (triggerType === "require_action") {
      const qLabel = questionText || `Question ${questionIndex + 1}`;
      triggerConfig.actionTitle = `Action required: "${qLabel}" ${describeCondition(rule)}`;
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
        <button
          onClick={addRule}
          className="flex items-center gap-1.5 text-xs text-sage hover:text-sage-deep transition-colors"
        >
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
                <select
                  value={rule.comparator}
                  onChange={e => {
                    const nextComparator = e.target.value as LogicComparator;
                    updateRule(ri, {
                      comparator: nextComparator,
                      value: nextComparator === "unanswered" ? "" : rule.value,
                      valueTo: nextComparator === "unanswered" ? undefined : rule.valueTo,
                    });
                  }}
                  className="text-xs border border-border rounded-lg px-2 py-1.5 bg-muted focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  {comparators.map(c => (
                    <option key={c.key} value={c.key}>{c.label.toLowerCase()}</option>
                  ))}
                </select>
                {rule.comparator === "unanswered" ? (
                  <span className="text-xs border border-border rounded-lg px-2 py-1.5 bg-background text-muted-foreground">
                    No response provided
                  </span>
                ) : isMcType ? (
                  <select
                    value={rule.value}
                    onChange={e => updateRule(ri, { value: e.target.value })}
                    className="text-xs border border-border rounded-lg px-2 py-1.5 bg-muted focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    {choices.map(c => (<option key={c} value={c}>{c}</option>))}
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
                <button
                  onClick={() => removeRule(ri)}
                  className="ml-auto p-1 text-muted-foreground hover:text-destructive transition-colors"
                >
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
                        {(() => {
                          const opt = TRIGGER_OPTIONS.find(t => t.key === trigger.type);
                          return opt ? <opt.icon size={12} className="text-sage shrink-0" /> : null;
                        })()}
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
                                questionText: `Follow-up: ${questionText || `Question ${questionIndex + 1}`}`,
                                followUpQuestion: createDefaultFollowUpQuestion(`Follow-up: ${questionText || `Question ${questionIndex + 1}`}`),
                              })}
                              className="text-xs text-sage hover:text-sage-deep transition-colors flex items-center gap-1"
                            >
                              <Plus size={11} /> Build follow-up question
                            </button>
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
                    <button
                      onClick={() => removeTrigger(ri, ti)}
                      className="p-0.5 text-muted-foreground hover:text-destructive transition-colors mt-0.5"
                    >
                      <X size={11} />
                    </button>
                  </div>
                ))}
                <div className="relative group inline-block">
                  <button className="text-xs text-sage hover:text-sage-deep transition-colors flex items-center gap-1">
                    <Plus size={11} /> trigger
                  </button>
                  <div className="hidden group-focus-within:block absolute left-0 top-full mt-1 bg-card border border-border rounded-lg shadow-lg z-10 py-1 min-w-[160px]">
                    {TRIGGER_OPTIONS
                      .filter(t => t.key !== "require_action" && !rule.triggers.some(rt => rt.type === t.key))
                      .map(t => (
                        <button
                          key={t.key}
                          onClick={() => addTrigger(ri, t.key)}
                          className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/50 transition-colors"
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
          <button
            onClick={addRule}
            className="text-xs text-sage hover:text-sage-deep transition-colors flex items-center gap-1"
          >
            <Plus size={11} /> Add another rule
          </button>
        </div>
      )}
    </>
  );
}
