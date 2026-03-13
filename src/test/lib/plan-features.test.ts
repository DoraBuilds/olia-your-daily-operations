import { describe, it, expect } from "vitest";
import {
  PLAN_FEATURES,
  PLAN_LABELS,
  PLAN_PRICES,
  limitLabel,
} from "@/lib/plan-features";

// ─── limitLabel ───────────────────────────────────────────────────────────────

describe("limitLabel", () => {
  it("returns 'Unlimited' for -1", () => {
    expect(limitLabel(-1)).toBe("Unlimited");
  });

  it("returns string representation of a positive number", () => {
    expect(limitLabel(5)).toBe("5");
    expect(limitLabel(100)).toBe("100");
  });

  it("returns '0' for zero", () => {
    expect(limitLabel(0)).toBe("0");
  });
});

// ─── PLAN_FEATURES ────────────────────────────────────────────────────────────

describe("PLAN_FEATURES", () => {
  it("defines all three plans", () => {
    expect(PLAN_FEATURES.starter).toBeDefined();
    expect(PLAN_FEATURES.growth).toBeDefined();
    expect(PLAN_FEATURES.enterprise).toBeDefined();
  });

  describe("starter plan", () => {
    const starter = PLAN_FEATURES.starter;
    it("has limited locations and staff", () => {
      expect(starter.maxLocations).toBe(1);
      expect(starter.maxStaff).toBeLessThanOrEqual(25);
    });
    it("does not include AI or multi-location features", () => {
      expect(starter.aiBuilder).toBe(false);
      expect(starter.multiLocation).toBe(false);
    });
    it("includes PDF export", () => {
      expect(starter.exportPdf).toBe(true);
    });
  });

  describe("growth plan", () => {
    const growth = PLAN_FEATURES.growth;
    it("has unlimited checklists", () => {
      expect(growth.maxChecklists).toBe(-1);
    });
    it("includes AI builder and advanced reporting", () => {
      expect(growth.aiBuilder).toBe(true);
      expect(growth.advancedReporting).toBe(true);
    });
    it("includes multi-location support", () => {
      expect(growth.multiLocation).toBe(true);
    });
    it("does not include priority support", () => {
      expect(growth.prioritySupport).toBe(false);
    });
  });

  describe("enterprise plan", () => {
    const ent = PLAN_FEATURES.enterprise;
    it("has unlimited locations, staff, and checklists", () => {
      expect(ent.maxLocations).toBe(-1);
      expect(ent.maxStaff).toBe(-1);
      expect(ent.maxChecklists).toBe(-1);
    });
    it("includes all premium features", () => {
      expect(ent.aiBuilder).toBe(true);
      expect(ent.fileConvert).toBe(true);
      expect(ent.advancedReporting).toBe(true);
      expect(ent.exportPdf).toBe(true);
      expect(ent.exportCsv).toBe(true);
      expect(ent.multiLocation).toBe(true);
      expect(ent.prioritySupport).toBe(true);
    });
  });

  it("enterprise has more or equal features than growth", () => {
    const growth = PLAN_FEATURES.growth;
    const ent = PLAN_FEATURES.enterprise;
    // Any boolean feature in growth must also be in enterprise
    (Object.keys(growth) as (keyof typeof growth)[]).forEach(key => {
      if (typeof growth[key] === "boolean" && growth[key] === true) {
        expect(ent[key]).toBe(true);
      }
    });
  });
});

// ─── PLAN_LABELS ──────────────────────────────────────────────────────────────

describe("PLAN_LABELS", () => {
  it("has a label for every plan", () => {
    expect(PLAN_LABELS.starter).toBeTruthy();
    expect(PLAN_LABELS.growth).toBeTruthy();
    expect(PLAN_LABELS.enterprise).toBeTruthy();
  });

  it("labels are non-empty strings", () => {
    Object.values(PLAN_LABELS).forEach(label => {
      expect(typeof label).toBe("string");
      expect(label.length).toBeGreaterThan(0);
    });
  });
});

// ─── PLAN_PRICES ──────────────────────────────────────────────────────────────

describe("PLAN_PRICES", () => {
  it("all plans have positive prices", () => {
    expect(PLAN_PRICES.starter.monthly).toBeGreaterThan(0);
    expect(PLAN_PRICES.starter.annual).toBeGreaterThan(0);
    expect(PLAN_PRICES.growth.monthly).toBeGreaterThan(0);
    expect(PLAN_PRICES.enterprise.monthly).toBeGreaterThan(0);
  });

  it("enterprise costs more than growth", () => {
    expect(PLAN_PRICES.enterprise.monthly).toBeGreaterThan(PLAN_PRICES.growth.monthly);
  });

  it("annual price is less than 12x monthly (discount applied)", () => {
    const growth = PLAN_PRICES.growth;
    expect(growth.annual).toBeLessThan(growth.monthly * 12);
  });

  it("each plan has a currency symbol", () => {
    Object.values(PLAN_PRICES).forEach(p => {
      expect(p.currency).toBeTruthy();
    });
  });
});
