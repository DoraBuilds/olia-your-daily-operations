import { describe, it, expect } from "vitest";
import {
  logicRuleKind, comparatorKeysFor, isValuelessComparator, rulePatchForComparator, defaultComparatorFor,
} from "@/pages/checklists/logic-comparators";

describe("logicRuleKind", () => {
  it("separates refrigeration from plain numbers", () => {
    expect(logicRuleKind("number", { numberMode: "temperature" })).toBe("refrigeration");
    expect(logicRuleKind("number", { numberMode: "single" })).toBe("number");
    expect(logicRuleKind("number")).toBe("number");
  });
  it("maps the other response types", () => {
    expect(logicRuleKind("checkbox")).toBe("checkbox");
    expect(logicRuleKind("multiple_choice")).toBe("choice");
    expect(logicRuleKind("text")).toBe("text");
  });
});

describe("comparatorKeysFor", () => {
  it("offers exactly the options for each type", () => {
    expect(comparatorKeysFor("refrigeration")).toEqual(["passes", "fails"]);
    expect(comparatorKeysFor("number")).toEqual(["lt", "lte", "eq", "neq", "gte", "gt", "between", "not_between"]);
    expect(comparatorKeysFor("text")).toEqual(["is", "is_not", "is_blank", "is_not_blank"]);
    expect(comparatorKeysFor("checkbox")).toEqual(["checked", "not_checked"]);
    expect(comparatorKeysFor("choice")).toEqual(["is", "is_not", "is_selected", "is_not_selected", "is_one_of", "is_not_one_of"]);
  });
  it("keeps a legacy comparator visible while a rule still uses it", () => {
    expect(comparatorKeysFor("number", "unanswered")).toContain("unanswered");
    expect(comparatorKeysFor("number", "lt")).not.toContain("unanswered");
  });
  it("defaults to the first option", () => {
    expect(defaultComparatorFor("checkbox")).toBe("checked");
  });
});

describe("rulePatchForComparator", () => {
  it("clears values for value-less comparators", () => {
    expect(isValuelessComparator("is_blank")).toBe(true);
    expect(rulePatchForComparator("is_blank", { value: "x", valueTo: "3" })).toMatchObject({ value: "", valueTo: undefined });
  });
  it("keeps valueTo only for between", () => {
    expect(rulePatchForComparator("between", { value: "1", valueTo: "3" }).valueTo).toBe("3");
    expect(rulePatchForComparator("lt", { value: "1", valueTo: "3" }).valueTo).toBeUndefined();
  });
});
