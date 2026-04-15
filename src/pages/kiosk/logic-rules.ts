/**
 * Client-side evaluation of checklist logic rules.
 *
 * When a checklist is completed in the kiosk, each question's `config.logicRules`
 * are evaluated against the submitted answers. Any matching rule with a `notify`
 * trigger causes an alert row to be inserted, which fires the DB trigger
 * → Edge Function → Resend email pipeline.
 */

import type { LogicComparator, LogicRule } from "@/pages/checklists/types";

// ─── Rule evaluation ──────────────────────────────────────────────────────────

/**
 * Returns true if the submitted answer satisfies the rule's comparator + value.
 */
export function evaluateRule(
  answer: any,
  comparator: LogicComparator,
  ruleValue: string,
  ruleValueTo?: string,
): boolean {
  // "unanswered" does not depend on the value at all
  if (comparator === "unanswered") {
    return answer === undefined || answer === null || answer === "" || answer === false;
  }

  const strAnswer = answer === undefined || answer === null ? "" : String(answer).trim();
  const numAnswer = Number(strAnswer);
  const numValue  = Number(ruleValue);
  const numValueTo = Number(ruleValueTo ?? "0");

  switch (comparator) {
    case "is":
      // Case-insensitive string match (works for multiple_choice, checkbox, text)
      return strAnswer.toLowerCase() === ruleValue.toLowerCase();

    case "is_not":
      return strAnswer.toLowerCase() !== ruleValue.toLowerCase();

    case "eq":
      return !Number.isNaN(numAnswer) && numAnswer === numValue;

    case "neq":
      return !Number.isNaN(numAnswer) && numAnswer !== numValue;

    case "lt":
      return !Number.isNaN(numAnswer) && numAnswer < numValue;

    case "lte":
      return !Number.isNaN(numAnswer) && numAnswer <= numValue;

    case "gt":
      return !Number.isNaN(numAnswer) && numAnswer > numValue;

    case "gte":
      return !Number.isNaN(numAnswer) && numAnswer >= numValue;

    case "between":
      return !Number.isNaN(numAnswer) && numAnswer >= numValue && numAnswer <= numValueTo;

    case "not_between":
      return !Number.isNaN(numAnswer) && !(numAnswer >= numValue && numAnswer <= numValueTo);

    default:
      return false;
  }
}

// ─── Notify-trigger extraction ────────────────────────────────────────────────

export interface NotifyAlert {
  /** Email address from the rule's notify trigger config */
  recipientEmail: string;
  /** Human-readable description of what triggered the alert */
  message: string;
  /** Question text (used as the "area" field on the alert row) */
  questionText: string;
}

/**
 * Scans all questions' logic rules and returns one NotifyAlert per matching
 * "notify" trigger. Duplicate recipient emails for the same question are
 * de-duplicated.
 */
export function collectNotifyAlerts(
  questions: Array<{
    id: string;
    text: string;
    config?: { logicRules?: LogicRule[] };
  }>,
  answers: Record<string, any>,
): NotifyAlert[] {
  const alerts: NotifyAlert[] = [];

  for (const question of questions) {
    const rules = question.config?.logicRules;
    if (!rules || rules.length === 0) continue;

    const answer = answers[question.id];

    for (const rule of rules) {
      const matched = evaluateRule(answer, rule.comparator, rule.value, rule.valueTo);
      if (!matched) continue;

      for (const trigger of rule.triggers) {
        if (trigger.type !== "notify") continue;

        const recipientEmail = trigger.config?.notifyUser?.trim();
        if (!recipientEmail) continue;

        // Avoid duplicate alerts for the same recipient + question
        const alreadyAdded = alerts.some(
          a => a.recipientEmail === recipientEmail && a.questionText === question.text,
        );
        if (alreadyAdded) continue;

        const answerStr =
          answer === undefined || answer === null || answer === "" || answer === false
            ? "unanswered"
            : String(answer);
        alerts.push({
          recipientEmail,
          questionText: question.text,
          message: `"${question.text}" answered: ${answerStr} — notify rule triggered`,
        });
      }
    }
  }

  return alerts;
}
