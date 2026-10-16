import type { LogicComparator, QuestionConfig, ResponseType } from "./types";

/** Which family of "If answer ..." options a question's logic rules offer. */
export type LogicRuleKind = "refrigeration" | "number" | "text" | "checkbox" | "choice";

export function logicRuleKind(responseType: ResponseType, config?: QuestionConfig): LogicRuleKind {
  if (responseType === "number") return config?.numberMode === "temperature" ? "refrigeration" : "number";
  if (responseType === "checkbox") return "checkbox";
  if (responseType === "multiple_choice") return "choice";
  return "text";
}

const KIND_COMPARATORS: Record<LogicRuleKind, LogicComparator[]> = {
  refrigeration: ["passes", "fails"],
  number: ["lt", "lte", "eq", "neq", "gte", "gt", "between", "not_between"],
  text: ["is", "is_not", "is_blank", "is_not_blank"],
  checkbox: ["checked", "not_checked"],
  choice: ["is", "is_not", "is_selected", "is_not_selected", "is_one_of", "is_not_one_of"],
};

/** i18n key (under logicRules.comparators) for each comparator. */
export const COMPARATOR_LABEL_KEYS: Record<LogicComparator, string> = {
  lt: "lessThan",
  lte: "lessThanOrEqual",
  eq: "equalTo",
  neq: "notEqualTo",
  gte: "greaterThanOrEqual",
  gt: "greaterThan",
  between: "between",
  not_between: "notBetween",
  unanswered: "notProvided",
  is: "is",
  is_not: "isNot",
  is_selected: "isSelected",
  is_not_selected: "isNotSelected",
  is_one_of: "isOneOf",
  is_not_one_of: "isNotOneOf",
  is_blank: "isBlank",
  is_not_blank: "isNotBlank",
  checked: "checked",
  not_checked: "notChecked",
  passes: "passes",
  fails: "fails",
};

/**
 * Comparators offered for a kind. A rule saved before these per-type lists
 * existed may use a comparator that is no longer offered ("not provided", say);
 * it stays in the list while the rule uses it so it still displays correctly.
 */
export function comparatorKeysFor(kind: LogicRuleKind, current?: LogicComparator): LogicComparator[] {
  const keys = KIND_COMPARATORS[kind];
  return current && !keys.includes(current) ? [...keys, current] : keys;
}

/** Comparators whose condition needs no value to compare against. */
const VALUELESS = new Set<LogicComparator>(["unanswered", "is_blank", "is_not_blank", "checked", "not_checked", "passes", "fails"]);
export const isValuelessComparator = (c: LogicComparator) => VALUELESS.has(c);

export const isBetweenComparator = (c: LogicComparator) => c === "between" || c === "not_between";
export const isOneOfComparator = (c: LogicComparator) => c === "is_one_of" || c === "is_not_one_of";

/** Comparator to pre-select when a rule is added. */
export const defaultComparatorFor = (kind: LogicRuleKind): LogicComparator => KIND_COMPARATORS[kind][0];

/** Whether a value-less rule is still the same sentence after a comparator change. */
export function rulePatchForComparator(
  next: LogicComparator,
  rule: { value: string; valueTo?: string; values?: string[] },
) {
  const valueless = isValuelessComparator(next);
  return {
    comparator: next,
    value: valueless ? "" : rule.value,
    valueTo: valueless || !isBetweenComparator(next) ? undefined : rule.valueTo,
    values: isOneOfComparator(next) ? (rule.values ?? []) : undefined,
  };
}

/**
 * Logic rules written for one answer type make no sense for another ("is checked"
 * on a text answer). When the type's rule family changes, each rule goes back to
 * that family's default condition; its "then" actions are kept.
 */
export function rulesForResponseTypeChange<R extends { comparator: LogicComparator; value: string; valueTo?: string; values?: string[] }>(
  rules: R[] | undefined,
  prev: { responseType: ResponseType; config?: QuestionConfig },
  next: { responseType: ResponseType; config?: QuestionConfig },
): R[] | undefined {
  if (!rules?.length) return rules;
  const nextKind = logicRuleKind(next.responseType, next.config);
  if (logicRuleKind(prev.responseType, prev.config) === nextKind) return rules;
  return rules.map(r => ({ ...r, comparator: defaultComparatorFor(nextKind), value: "", valueTo: undefined, values: undefined }));
}

/** "Number" is now only the temperature answer: picking it switches temperature mode on. */
export function withTemperatureDefaults(next: ResponseType, prev: ResponseType, config?: QuestionConfig): QuestionConfig | undefined {
  if (next !== "number" || prev === "number") return config;
  return { ...config, numberMode: "temperature", temperatureUnit: config?.temperatureUnit ?? "C" };
}
