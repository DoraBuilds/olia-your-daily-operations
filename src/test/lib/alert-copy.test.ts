import { describe, expect, it } from "vitest";
import { formatOperationalAlertCopy } from "@/lib/alert-copy";

describe("formatOperationalAlertCopy", () => {
  it("turns unanswered trigger text into friendly follow-up copy", () => {
    const copy = formatOperationalAlertCopy({
      type: "warn",
      message: 'Action required: "Trigger test (n/a is the trigger) - " answered Is N/A',
      area: "Kitchen",
      time: "Now",
      source: "action",
    });

    expect(copy.title).toBe("Left unanswered");
    expect(copy.body).toBe('"Trigger test (n/a is the trigger)" had no answer.');
    expect(copy.helper).toBe("Needs a follow-up · Checklist: Kitchen");
  });

  it("turns out-of-range trigger text into a more readable review prompt", () => {
    const copy = formatOperationalAlertCopy({
      type: "error",
      message: "Question Temperature + logic: recorded 1 — outside the allowed range (min 2, max 6)",
      area: "Kitchen",
      time: "12:32",
      source: "action",
    });

    expect(copy.title).toBe("Reading out of range");
    expect(copy.body).toBe("Question Temperature + logic: recorded 1.");
    expect(copy.helper).toBe("Allowed: min 2, max 6 · Checklist: Kitchen · 12:32");
  });
});
