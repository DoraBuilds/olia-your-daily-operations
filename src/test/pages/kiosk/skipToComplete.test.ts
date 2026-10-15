import { describe, it, expect } from "vitest";
import { buildRuntimeQuestions, shouldSkipToComplete } from "@/pages/kiosk/utils";
import type { Question } from "@/pages/kiosk/types";

const q = (id: string, extra: Partial<Question> = {}): Question =>
  ({ id, text: id, type: "checkbox", required: true, ...extra }) as Question;

const skipOnChecked = (id: string) => q(id, {
  config: { logicRules: [{ id: "r", comparator: "checked", value: "", triggers: [{ type: "skip_to_complete" }] }] },
});

describe("skip to complete", () => {
  it("drops the questions after a matching rule", () => {
    const qs = [q("a"), skipOnChecked("b"), q("c"), q("d")];
    expect(buildRuntimeQuestions(qs, { b: true }).map(x => x.id)).toEqual(["a", "b"]);
    expect(shouldSkipToComplete(qs[1], { b: true })).toBe(true);
  });

  it("keeps every question while the rule does not match or is unanswered", () => {
    const qs = [q("a"), skipOnChecked("b"), q("c")];
    expect(buildRuntimeQuestions(qs, { b: false }).map(x => x.id)).toEqual(["a", "b", "c"]);
    expect(buildRuntimeQuestions(qs, {}).map(x => x.id)).toEqual(["a", "b", "c"]);
  });

  it("stops after follow-ups of the skipping question, not before", () => {
    const withFollowUp = q("b", {
      config: { logicRules: [{
        id: "r", comparator: "checked", value: "",
        triggers: [{ type: "require_note" }, { type: "skip_to_complete" }],
      }] },
    });
    const ids = buildRuntimeQuestions([withFollowUp, q("c")], { b: true }).map(x => x.id);
    expect(ids).toHaveLength(2);
    expect(ids[0]).toBe("b");
    expect(ids).not.toContain("c");
  });
});
