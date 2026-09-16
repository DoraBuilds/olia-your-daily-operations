import { describe, expect, it } from "vitest";

import {
  buildDigestEmail,
  computeUnfinished,
  computeUnstarted,
} from "../../../supabase/functions/check-checklist-alerts/digest";

describe("check-checklist-alerts digest helpers", () => {
  describe("computeUnfinished", () => {
    it("returns titles of logs submitted with a null score", () => {
      const result = computeUnfinished([
        { checklist_id: "a", checklist_title: "Opening checks", score: null },
        { checklist_id: "b", checklist_title: "Closing checks", score: 92 },
      ]);
      expect(result).toEqual(["Opening checks"]);
    });

    it("returns an empty list when nothing is unfinished", () => {
      expect(computeUnfinished([{ checklist_id: "a", checklist_title: "Opening checks", score: 100 }])).toEqual([]);
    });
  });

  describe("computeUnstarted", () => {
    const asOf = new Date("2026-09-16T23:59:59Z");

    it("excludes checklists that already have a log entry today", () => {
      const result = computeUnstarted(
        [{ id: "1", title: "Opening checks", start_date: null }],
        [{ checklist_id: "1", checklist_title: "Opening checks", score: null }],
        asOf,
      );
      expect(result).toEqual([]);
    });

    it("excludes checklists whose start_date is still in the future", () => {
      const result = computeUnstarted(
        [{ id: "1", title: "New Year checklist", start_date: "2027-01-01T00:00:00Z" }],
        [],
        asOf,
      );
      expect(result).toEqual([]);
    });

    it("includes active checklists with no log entry today", () => {
      const result = computeUnstarted(
        [{ id: "1", title: "Opening checks", start_date: null }],
        [],
        asOf,
      );
      expect(result).toEqual(["Opening checks"]);
    });
  });

  describe("buildDigestEmail", () => {
    it("lists unstarted and unfinished sections when both are present", () => {
      const email = buildDigestEmail({
        dateStr: "16 September 2026",
        unstarted: ["Opening checks"],
        unfinished: ["Closing checks"],
        isTest: false,
      });
      expect(email.subject).toBe("[Olia] Incomplete checklists for 16 September 2026");
      expect(email.textBody).toContain("NOT STARTED (1)");
      expect(email.textBody).toContain("Opening checks");
      expect(email.textBody).toContain("UNFINISHED (1)");
      expect(email.htmlBody).toContain("Not started (1)");
      expect(email.htmlBody).toContain("Unfinished (1)");
    });

    it("marks the subject as a test send", () => {
      const email = buildDigestEmail({
        dateStr: "16 September 2026",
        unstarted: [],
        unfinished: [],
        isTest: true,
      });
      expect(email.subject).toBe("[Olia] Checklist notification test — 16 September 2026");
      expect(email.textBody).toContain("All checklists are on track today");
      expect(email.htmlBody).toContain("All checklists are on track today");
    });

    it("escapes HTML in checklist titles so a title can't inject markup", () => {
      const email = buildDigestEmail({
        dateStr: "16 September 2026",
        unstarted: ["<img src=x onerror=alert(1)>"],
        unfinished: [],
        isTest: false,
      });
      expect(email.htmlBody).not.toContain("<img src=x onerror=alert(1)>");
      expect(email.htmlBody).toContain("&lt;img src=x onerror=alert(1)&gt;");
    });

    it("omits the nothing-pending note on a real (non-test) send", () => {
      const email = buildDigestEmail({
        dateStr: "16 September 2026",
        unstarted: [],
        unfinished: [],
        isTest: false,
      });
      expect(email.textBody).not.toContain("All checklists are on track today");
      expect(email.htmlBody).not.toContain("All checklists are on track today");
    });
  });
});
