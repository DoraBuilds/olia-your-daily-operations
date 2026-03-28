import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { enqueueLog, pendingCount, drainQueue } from "@/lib/submission-queue";

const STORAGE_KEY = "olia_pending_logs";
let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  localStorage.clear();
  consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  consoleWarnSpy.mockRestore();
});

describe("enqueueLog", () => {
  it("adds an item to the queue", () => {
    enqueueLog({ checklist_title: "Test", completed_by: "Staff" });
    expect(pendingCount()).toBe(1);
  });

  it("accumulates multiple items", () => {
    enqueueLog({ checklist_title: "A" });
    enqueueLog({ checklist_title: "B" });
    expect(pendingCount()).toBe(2);
  });

  it("persists to localStorage", () => {
    enqueueLog({ checklist_title: "Persist" });
    const stored = localStorage.getItem(STORAGE_KEY);
    expect(stored).not.toBeNull();
    const parsed = JSON.parse(stored!);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBe(1);
  });
});

describe("pendingCount", () => {
  it("returns 0 when queue is empty", () => {
    expect(pendingCount()).toBe(0);
  });

  it("returns correct count after enqueueing", () => {
    enqueueLog({ checklist_title: "X" });
    enqueueLog({ checklist_title: "Y" });
    expect(pendingCount()).toBe(2);
  });
});

describe("drainQueue", () => {
  it("calls insertFn for each item in queue", async () => {
    enqueueLog({ checklist_title: "Log A" });
    enqueueLog({ checklist_title: "Log B" });
    const insertFn = vi.fn().mockResolvedValue(undefined);
    await drainQueue(insertFn);
    expect(insertFn).toHaveBeenCalledTimes(2);
  });

  it("clears the queue after successful drain", async () => {
    enqueueLog({ checklist_title: "Clear me" });
    await drainQueue(vi.fn().mockResolvedValue(undefined));
    expect(pendingCount()).toBe(0);
  });

  it("keeps failed items in queue on error", async () => {
    enqueueLog({ checklist_title: "Will fail" });
    const insertFn = vi.fn().mockRejectedValue(new Error("Network error"));
    await drainQueue(insertFn);
    // Failed item stays in queue
    expect(pendingCount()).toBeGreaterThan(0);
  });

  it("is a no-op when queue is empty", async () => {
    const insertFn = vi.fn().mockResolvedValue(undefined);
    await drainQueue(insertFn);
    expect(insertFn).not.toHaveBeenCalled();
  });
});

describe("MAX_ATTEMPTS protection", () => {
  it("drops items that have been attempted 10 or more times", () => {
    consoleWarnSpy.mockClear();
    // Manually write an over-limit item to localStorage
    const overLimit = [{
      id: "stale-1",
      payload: { checklist_title: "Too many tries" },
      enqueuedAt: Date.now(),
      attempts: 10,
    }];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(overLimit));
    // pendingCount calls loadQueue which filters out the over-limit item
    expect(pendingCount()).toBe(0);
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining("submission-queue: dropping log stale-1"),
    );
  });

  it("retains items below the attempt limit", () => {
    const underLimit = [{
      id: "fresh-1",
      payload: { checklist_title: "Still valid" },
      enqueuedAt: Date.now(),
      attempts: 9,
    }];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(underLimit));
    expect(pendingCount()).toBe(1);
    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });
});

describe("TTL_DAYS protection", () => {
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
  });

  it("drops items older than 7 days", () => {
    const eightDaysAgo = Date.now() - 8 * 24 * 60 * 60 * 1000;
    const old = [{
      id: "old-1",
      payload: { checklist_title: "Old log" },
      enqueuedAt: eightDaysAgo,
      attempts: 0,
    }];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(old));
    expect(pendingCount()).toBe(0);
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining("submission-queue: dropping log old-1"),
    );
  });

  it("retains items within the TTL window", () => {
    const sixDaysAgo = Date.now() - 6 * 24 * 60 * 60 * 1000;
    const recent = [{
      id: "recent-1",
      payload: { checklist_title: "Recent log" },
      enqueuedAt: sixDaysAgo,
      attempts: 0,
    }];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(recent));
    expect(pendingCount()).toBe(1);
    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });
});
