import { describe, it, expect } from "vitest";
import { evaluateRule, collectNotifyAlerts } from "@/pages/kiosk/logic-rules";
import type { LogicRule } from "@/pages/checklists/types";

// ─── evaluateRule ─────────────────────────────────────────────────────────────

describe("evaluateRule", () => {
  describe("unanswered", () => {
    it("matches empty string", () => expect(evaluateRule("", "unanswered", "")).toBe(true));
    it("matches undefined", () => expect(evaluateRule(undefined, "unanswered", "")).toBe(true));
    it("matches null", () => expect(evaluateRule(null, "unanswered", "")).toBe(true));
    it("matches false", () => expect(evaluateRule(false, "unanswered", "")).toBe(true));
    it("does not match a real answer", () => expect(evaluateRule("yes", "unanswered", "")).toBe(false));
    it("does not match zero", () => expect(evaluateRule("0", "unanswered", "")).toBe(false));
  });

  describe("is / is_not", () => {
    it("is: matches case-insensitively", () => expect(evaluateRule("Yes", "is", "yes")).toBe(true));
    it("is: does not match different value", () => expect(evaluateRule("No", "is", "yes")).toBe(false));
    it("is_not: matches when different", () => expect(evaluateRule("No", "is_not", "yes")).toBe(true));
    it("is_not: does not match same value", () => expect(evaluateRule("Yes", "is_not", "yes")).toBe(false));
  });

  describe("numeric comparators", () => {
    it("eq: matches equal numbers", () => expect(evaluateRule("5", "eq", "5")).toBe(true));
    it("eq: does not match different", () => expect(evaluateRule("4", "eq", "5")).toBe(false));
    it("neq: matches when not equal", () => expect(evaluateRule("4", "neq", "5")).toBe(true));
    it("lt: matches when less than", () => expect(evaluateRule("3", "lt", "5")).toBe(true));
    it("lt: does not match equal", () => expect(evaluateRule("5", "lt", "5")).toBe(false));
    it("lte: matches equal", () => expect(evaluateRule("5", "lte", "5")).toBe(true));
    it("lte: matches less than", () => expect(evaluateRule("4", "lte", "5")).toBe(true));
    it("gt: matches when greater", () => expect(evaluateRule("6", "gt", "5")).toBe(true));
    it("gt: does not match equal", () => expect(evaluateRule("5", "gt", "5")).toBe(false));
    it("gte: matches equal", () => expect(evaluateRule("5", "gte", "5")).toBe(true));
    it("gte: matches greater than", () => expect(evaluateRule("6", "gte", "5")).toBe(true));
    it("returns false for NaN answer on numeric comparator", () =>
      expect(evaluateRule("abc", "eq", "5")).toBe(false));
  });

  describe("between / not_between", () => {
    it("between: matches inside range", () =>
      expect(evaluateRule("5", "between", "1", "10")).toBe(true));
    it("between: matches on lower bound", () =>
      expect(evaluateRule("1", "between", "1", "10")).toBe(true));
    it("between: matches on upper bound", () =>
      expect(evaluateRule("10", "between", "1", "10")).toBe(true));
    it("between: does not match outside range", () =>
      expect(evaluateRule("11", "between", "1", "10")).toBe(false));
    it("not_between: matches outside range", () =>
      expect(evaluateRule("0", "not_between", "1", "10")).toBe(true));
    it("not_between: does not match inside range", () =>
      expect(evaluateRule("5", "not_between", "1", "10")).toBe(false));
  });

  describe("unknown comparator", () => {
    it("returns false for an unrecognised comparator", () =>
      expect(evaluateRule("x", "unknown" as any, "x")).toBe(false));
  });
});

// ─── collectNotifyAlerts ──────────────────────────────────────────────────────

function makeRule(overrides: Partial<LogicRule> = {}): LogicRule {
  return {
    id: "r1",
    comparator: "is",
    value: "Yes",
    triggers: [
      { type: "notify", config: { notifyUser: "manager@example.com" } },
    ],
    ...overrides,
  };
}

describe("collectNotifyAlerts", () => {
  it("returns empty array when no questions have logic rules", () => {
    const questions = [{ id: "q1", text: "Clean?", config: {} }];
    expect(collectNotifyAlerts(questions, { q1: "Yes" })).toHaveLength(0);
  });

  it("returns empty array when no rules match", () => {
    const questions = [{ id: "q1", text: "Clean?", config: { logicRules: [makeRule()] } }];
    expect(collectNotifyAlerts(questions, { q1: "No" })).toHaveLength(0);
  });

  it("returns a notify alert when a rule matches", () => {
    const questions = [{ id: "q1", text: "Clean?", config: { logicRules: [makeRule()] } }];
    const alerts = collectNotifyAlerts(questions, { q1: "Yes" });
    expect(alerts).toHaveLength(1);
    expect(alerts[0].recipientEmail).toBe("manager@example.com");
    expect(alerts[0].questionText).toBe("Clean?");
    expect(alerts[0].message).toContain("Clean?");
    expect(alerts[0].message).toContain("Yes");
  });

  it("ignores non-notify triggers", () => {
    const questions = [{
      id: "q1", text: "Q",
      config: {
        logicRules: [makeRule({
          triggers: [{ type: "require_note" }],
        })],
      },
    }];
    expect(collectNotifyAlerts(questions, { q1: "Yes" })).toHaveLength(0);
  });

  it("ignores notify triggers with no email", () => {
    const questions = [{
      id: "q1", text: "Q",
      config: {
        logicRules: [makeRule({
          triggers: [{ type: "notify", config: { notifyUser: "" } }],
        })],
      },
    }];
    expect(collectNotifyAlerts(questions, { q1: "Yes" })).toHaveLength(0);
  });

  it("de-duplicates same recipient + question", () => {
    const rule1 = makeRule({ id: "r1" });
    const rule2 = makeRule({ id: "r2", value: "Yes" });
    const questions = [{ id: "q1", text: "Clean?", config: { logicRules: [rule1, rule2] } }];
    const alerts = collectNotifyAlerts(questions, { q1: "Yes" });
    expect(alerts).toHaveLength(1);
  });

  it("collects alerts from multiple questions", () => {
    const questions = [
      { id: "q1", text: "Clean?", config: { logicRules: [makeRule()] } },
      { id: "q2", text: "Safe?", config: {
        logicRules: [makeRule({ triggers: [{ type: "notify", config: { notifyUser: "safety@example.com" } }] })],
      }},
    ];
    const alerts = collectNotifyAlerts(questions, { q1: "Yes", q2: "Yes" });
    expect(alerts).toHaveLength(2);
    expect(alerts.map(a => a.recipientEmail)).toContain("manager@example.com");
    expect(alerts.map(a => a.recipientEmail)).toContain("safety@example.com");
  });

  it("shows 'unanswered' in the message for an empty answer", () => {
    const questions = [{
      id: "q1", text: "Clean?",
      config: {
        logicRules: [makeRule({ comparator: "unanswered", value: "" })],
      },
    }];
    const alerts = collectNotifyAlerts(questions, { q1: "" });
    expect(alerts[0].message).toContain("unanswered");
  });
});
