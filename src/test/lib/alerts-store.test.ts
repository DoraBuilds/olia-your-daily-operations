import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  getAlerts,
  addAlert,
  removeAlert,
  clearAllAlerts,
  subscribe,
} from "@/lib/alerts-store";

// Reset store to a clean baseline before every test
beforeEach(() => {
  clearAllAlerts();
});

const makeAlert = (id: string) => ({
  id,
  type: "error" as const,
  message: `Test alert ${id}`,
  area: "Kitchen",
  time: "09:00",
  source: "system" as const,
});

// ─── getAlerts ────────────────────────────────────────────────────────────────

describe("getAlerts", () => {
  it("returns an empty array after clearing", () => {
    expect(getAlerts()).toEqual([]);
  });

  it("returns added alerts", () => {
    addAlert(makeAlert("a1"));
    expect(getAlerts()).toHaveLength(1);
    expect(getAlerts()[0].id).toBe("a1");
  });
});

// ─── addAlert ─────────────────────────────────────────────────────────────────

describe("addAlert", () => {
  it("prepends the new alert to the front", () => {
    addAlert(makeAlert("first"));
    addAlert(makeAlert("second"));
    expect(getAlerts()[0].id).toBe("second");
    expect(getAlerts()[1].id).toBe("first");
  });

  it("notifies all subscribers", () => {
    const listener = vi.fn();
    const unsub = subscribe(listener);
    addAlert(makeAlert("x"));
    expect(listener).toHaveBeenCalledTimes(1);
    unsub();
  });

  it("supports warn type alerts", () => {
    const warn = { ...makeAlert("w1"), type: "warn" as const };
    addAlert(warn);
    expect(getAlerts()[0].type).toBe("warn");
  });
});

// ─── removeAlert ──────────────────────────────────────────────────────────────

describe("removeAlert", () => {
  it("removes the alert with the given id", () => {
    addAlert(makeAlert("r1"));
    addAlert(makeAlert("r2"));
    removeAlert("r1");
    const ids = getAlerts().map(a => a.id);
    expect(ids).not.toContain("r1");
    expect(ids).toContain("r2");
  });

  it("is a no-op for a non-existent id", () => {
    addAlert(makeAlert("r3"));
    removeAlert("doesnt-exist");
    expect(getAlerts()).toHaveLength(1);
  });

  it("notifies subscribers on removal", () => {
    const listener = vi.fn();
    addAlert(makeAlert("r4"));
    const unsub = subscribe(listener);
    removeAlert("r4");
    expect(listener).toHaveBeenCalledTimes(1);
    unsub();
  });
});

// ─── clearAllAlerts ───────────────────────────────────────────────────────────

describe("clearAllAlerts", () => {
  it("empties the alerts list", () => {
    addAlert(makeAlert("c1"));
    addAlert(makeAlert("c2"));
    clearAllAlerts();
    expect(getAlerts()).toHaveLength(0);
  });

  it("notifies subscribers on clear", () => {
    const listener = vi.fn();
    const unsub = subscribe(listener);
    clearAllAlerts();
    expect(listener).toHaveBeenCalledTimes(1);
    unsub();
  });
});

// ─── subscribe ────────────────────────────────────────────────────────────────

describe("subscribe", () => {
  it("calls listener on every state change", () => {
    const listener = vi.fn();
    const unsub = subscribe(listener);

    addAlert(makeAlert("s1"));
    removeAlert("s1");
    clearAllAlerts();

    expect(listener).toHaveBeenCalledTimes(3);
    unsub();
  });

  it("stops calling listener after unsubscribe", () => {
    const listener = vi.fn();
    const unsub = subscribe(listener);
    unsub();
    addAlert(makeAlert("s2"));
    expect(listener).not.toHaveBeenCalled();
  });

  it("supports multiple independent subscribers", () => {
    const l1 = vi.fn();
    const l2 = vi.fn();
    const u1 = subscribe(l1);
    const u2 = subscribe(l2);

    addAlert(makeAlert("s3"));
    expect(l1).toHaveBeenCalledTimes(1);
    expect(l2).toHaveBeenCalledTimes(1);

    u1();
    addAlert(makeAlert("s4"));
    expect(l1).toHaveBeenCalledTimes(1); // stopped
    expect(l2).toHaveBeenCalledTimes(2); // still active

    u2();
  });
});
