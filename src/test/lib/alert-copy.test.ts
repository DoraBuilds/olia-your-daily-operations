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

    expect(copy.title).toBe("Follow-up needed");
    expect(copy.body).toBe("Trigger test (n/a is the trigger) was left unanswered.");
    expect(copy.helper).toBe("A response was not provided, so this item needs attention.");
  });

  it("turns out-of-range trigger text into a more readable review prompt", () => {
    const copy = formatOperationalAlertCopy({
      type: "error",
      message: "Question Temperature + logic: recorded 1 — outside the allowed range (min 2, max 6)",
      area: "Kitchen",
      time: "12:32",
      source: "action",
    });

    expect(copy.title).toBe("Response needs a review");
    expect(copy.body).toBe("Recorded value: 1.");
    expect(copy.helper).toBe("Allowed range: min 2, max 6.");
  });
});
