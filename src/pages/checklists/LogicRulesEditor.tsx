import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
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

function useComparatorOptions(t: (key: string) => string) {
  const NUMERIC_COMPARATORS: { key: LogicComparator; label: string }[] = [
    { key: "lt", label: t("logicRules.comparators.lessThan") },
    { key: "lte", label: t("logicRules.comparators.lessThanOrEqual") },
    { key: "eq", label: t("logicRules.comparators.equalTo") },
    { key: "neq", label: t("logicRules.comparators.notEqualTo") },
    { key: "gte", label: t("logicRules.comparators.greaterThanOrEqual") },
    { key: "gt", label: t("logicRules.comparators.greaterThan") },
    { key: "between", label: t("logicRules.comparators.between") },
    { key: "not_between", label: t("logicRules.comparators.notBetween") },
    { key: "unanswered", label: t("logicRules.comparators.notProvided") },
  ];
  const CHOICE_COMPARATORS: { key: LogicComparator; label: string }[] = [
    { key: "is", label: t("logicRules.comparators.is") },
    { key: "is_not", label: t("logicRules.comparators.isNot") },
    { key: "unanswered", label: t("logicRules.comparators.notProvided") },
  ];
  const TEXT_COMPARATORS = CHOICE_COMPARATORS;
  return { NUMERIC_COMPARATORS, CHOICE_COMPARATORS, TEXT_COMPARATORS };
}

function useTriggerOptions(t: (key: string) => string): { key: LogicTriggerType; label: string; icon: React.ElementType }[] {
  return [
    { key: "ask_question", label: t("logicRules.triggers.askQuestion"), icon: MessageSquare },
    { key: "notify", label: t("logicRules.triggers.notify"), icon: Bell },
    { key: "require_note", label: t("logicRules.triggers.requireNote"), icon: FileText },
    { key: "require_media", label: t("logicRules.triggers.requireMedia"), icon: Image },
  ];
}

export function LogicRulesEditor({
  rules, onRulesChange, responseType, choices, questionText, questionIndex, notifyRecipients,
}: LogicRulesEditorProps) {
  const { t } = useTranslation("checklists");
  const { NUMERIC_COMPARATORS, CHOICE_COMPARATORS, TEXT_COMPARATORS } = useComparatorOptions(t);
  const TRIGGER_OPTIONS = useTriggerOptions(t);
  const showLogic = rules.length > 0;
  // openDropdown tracks which rule's "add trigger" dropdown is open.
  // group-focus-within doesn't fire on button click in Safari, so we use state.
  const [openDropdown, setOpenDropdown] = useState<number | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (openDropdown === null) return;
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpenDropdown(null);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [openDropdown]);
  const isNumericType = responseType === "number";
  const isMcType = responseType === "multiple_choice" || responseType === "checkbox";
  const comparators = isNumericType ? NUMERIC_COMPARATORS : isMcType ? CHOICE_COMPARATORS : TEXT_COMPARATORS;

  const describeCondition = (rule: LogicRule) => {
    if (rule.comparator === "unanswered") return t("logicRules.leftUnanswered");
    const label = comparators.find(c => c.key === rule.comparator)?.label || rule.comparator;
    if ((rule.comparator === "between" || rule.comparator === "not_between") && rule.valueTo) {
      return t("logicRules.answeredBetween", { comparator: label.toLowerCase(), value: rule.value, valueTo: rule.valueTo });
    }
    return t("logicRules.answeredSimple", { comparator: label.toLowerCase(), value: rule.value });
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
      const qLabel = questionText || t("preview.questionFallback", { n: questionIndex + 1 });
      triggerConfig.actionTitle = t("logicRules.actionRequiredTitle", { question: qLabel, condition: describeCondition(rule) });
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
          <span>{t("logicRules.addLogic")}</span>
        </button>
      )}
      {showLogic && (
        <div className="bg-muted/50 rounded-lg p-3 space-y-3">
          <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
            <GitBranch size={12} /> {t("logicRules.heading")}
          </p>
          {rules.map((rule, ri) => (
            <div key={rule.id} className="border border-border rounded-lg p-3 space-y-3 bg-background">
              {/* Condition row */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs text-muted-foreground">{t("logicRules.ifAnswer")}</span>
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
                    {t("logicRules.noResponseProvided")}
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
                      placeholder={isNumericType ? t("logicRules.valuePlaceholder") : t("logicRules.textPlaceholder")}
                      className="w-20 text-xs border border-border rounded-lg px-2 py-1.5 bg-muted focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                    {(rule.comparator === "between" || rule.comparator === "not_between") && (
                      <>
                        <span className="text-xs text-muted-foreground">{t("logicRules.and")}</span>
                        <input
                          type="number"
                          value={rule.valueTo ?? ""}
                          onChange={e => updateRule(ri, { valueTo: e.target.value })}
                          placeholder={t("logicRules.valuePlaceholder")}
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
                <span className="text-xs text-muted-foreground">{t("logicRules.then")}</span>
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
                          {trigger.config?.followUpQuestion ? (
                            <FollowUpQuestionEditor
                              question={trigger.config.followUpQuestion}
                              onChange={next => updateTriggerConfig(ri, ti, {
                                questionText: next.text,
                                followUpQuestion: next,
                              })}
                              notifyRecipients={notifyRecipients}
                              label={t("logicRules.followUpLabel")}
                              depth={1}
                            />
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                const followUpText = t("logicRules.followUpPrefix", {
                                  question: questionText || t("preview.questionFallback", { n: questionIndex + 1 }),
                                });
                                updateTriggerConfig(ri, ti, {
                                  questionText: followUpText,
                                  followUpQuestion: createDefaultFollowUpQuestion(followUpText),
                                });
                              }}
                              className="text-xs text-sage hover:text-sage-deep transition-colors flex items-center gap-1"
                            >
                              <Plus size={11} /> {t("logicRules.buildFollowUp")}
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
                                {t("logicRules.noRecipients")}
                              </span>
                            ) : (
                              <select
                                value={trigger.config?.notifyUser || ""}
                                onChange={e => updateTriggerConfig(ri, ti, { notifyUser: e.target.value })}
                                className="flex-1 text-xs border border-border rounded-lg px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                              >
                                <option value="">{t("logicRules.selectRecipient")}</option>
                                {notifyRecipients.map(m => (
                                  <option key={m.id} value={m.email}>
                                    {m.name}{m.role ? ` — ${m.role}` : ""} ({m.email})
                                  </option>
                                ))}
                              </select>
                            )}
                          </div>
                          <input
                            type="text"
                            placeholder={t("logicRules.emailSubjectPlaceholder", { question: questionText || t("logicRules.genericQuestionFallback") })}
                            value={trigger.config?.notifyMessage || ""}
                            onChange={e => updateTriggerConfig(ri, ti, { notifyMessage: e.target.value })}
                            className="w-full text-xs border border-border rounded-lg px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                          />
                        </div>
                      )}

                      {trigger.type === "require_action" && (
                        <div className="space-y-2">
                          <input
                            type="text"
                            placeholder={t("logicRules.actionTitlePlaceholder")}
                            value={trigger.config?.actionTitle || ""}
                            onChange={e => updateTriggerConfig(ri, ti, { actionTitle: e.target.value })}
                            className="w-full text-xs border border-border rounded-lg px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                          />
                          <div className="flex items-center gap-1.5">
                            <User size={11} className="text-muted-foreground shrink-0" />
                            <input
                              type="text"
                              placeholder={t("logicRules.assignTo")}
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
                                <p className="text-xs text-muted-foreground mt-0.5">{t("logicRules.actionAlertNote")}</p>
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
                <div className="relative inline-block" ref={openDropdown === ri ? dropdownRef : undefined}>
                  <button
                    type="button"
                    onClick={() => setOpenDropdown(openDropdown === ri ? null : ri)}
                    className="text-xs text-sage hover:text-sage-deep transition-colors flex items-center gap-1"
                  >
                    <Plus size={11} /> {t("logicRules.addTrigger")}
                  </button>
                  {openDropdown === ri && (
                    <div className="absolute left-0 top-full mt-1 bg-card border border-border rounded-lg shadow-lg z-10 py-1 min-w-[160px]">
                      {TRIGGER_OPTIONS
                        .filter(t => t.key !== "require_action" && !rule.triggers.some(rt => rt.type === t.key))
                        .map(t => (
                          <button
                            key={t.key}
                            type="button"
                            onClick={() => { addTrigger(ri, t.key); setOpenDropdown(null); }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/50 transition-colors"
                          >
                            <t.icon size={13} className="text-sage shrink-0" />
                            <span className="text-xs text-foreground">{t.label}</span>
                          </button>
                        ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
          <button
            onClick={addRule}
            className="text-xs text-sage hover:text-sage-deep transition-colors flex items-center gap-1"
          >
            <Plus size={11} /> {t("logicRules.addAnotherRule")}
          </button>
        </div>
      )}
    </>
  );
}
