import { describe, it, expect, beforeEach } from "vitest";
import { loadKioskDraftSnapshot } from "@/pages/kiosk/utils";

const KEY = "kiosk_draft_test";
const save = (date?: string) =>
  localStorage.setItem(KEY, JSON.stringify({ answers: { q1: "yes" }, ...(date ? { date } : {}) }));

describe("loadKioskDraftSnapshot operating date", () => {
  beforeEach(() => localStorage.clear());

  it("restores a draft saved on the same operating day", () => {
    save("2026-10-15");
    const snap = loadKioskDraftSnapshot(KEY, [], "2026-10-15");
    expect(snap.hasSavedDraft).toBe(true);
    expect(snap.answers.q1).toBe("yes");
  });

  it("discards and removes a draft from an earlier day", () => {
    save("2026-10-14");
    const snap = loadKioskDraftSnapshot(KEY, [], "2026-10-15");
    expect(snap.hasSavedDraft).toBe(false);
    expect(snap.answers.q1).toBeUndefined();
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("keeps an undated legacy draft", () => {
    save();
    expect(loadKioskDraftSnapshot(KEY, [], "2026-10-15").hasSavedDraft).toBe(true);
  });
});
