import { describe, it, expect } from "vitest";
import {
  getInitials,
  daysAgo,
  staffDisplayName,
  formatTimestamp,
  generatePin,
  DEFAULT_PERMISSIONS,
  DEFAULT_STAFF_DEPARTMENTS,
  DEFAULT_STAFF_ROLES,
} from "@/lib/admin-repository";

// ─── getInitials ─────────────────────────────────────────────────────────────

describe("getInitials", () => {
  it("returns two uppercase initials for a full name", () => {
    expect(getInitials("Elena Rossi")).toBe("ER");
  });

  it("returns one initial for a single word name", () => {
    expect(getInitials("Madonna")).toBe("M");
  });

  it("handles names with extra spaces", () => {
    expect(getInitials("  Marc  Devaux  ")).toBe("MD");
  });

  it("caps at 2 characters for multi-word names", () => {
    expect(getInitials("Jean Pierre Dupont")).toBe("JP");
  });

  it("uppercases lowercase input", () => {
    expect(getInitials("alice bob")).toBe("AB");
  });
});

// ─── daysAgo ─────────────────────────────────────────────────────────────────

describe("daysAgo", () => {
  it("returns 'Never used' for null", () => {
    expect(daysAgo(null)).toBe("Never used");
  });

  // daysAgo now returns an exact datetime string like "Last used: 23 Mar, 14:39"
  // (updated from relative format — tests verify structure, not exact time)
  it("returns 'Last used: ...' with date and time for today", () => {
    const result = daysAgo(new Date().toISOString());
    expect(result).toMatch(/^Last used: \d+ \w+, \d{2}:\d{2}$/);
  });

  it("returns 'Last used: ...' with date and time for yesterday", () => {
    const yesterday = new Date(Date.now() - 86400000).toISOString();
    const result = daysAgo(yesterday);
    expect(result).toMatch(/^Last used: \d+ \w+, \d{2}:\d{2}$/);
  });

  it("returns 'Last used: ...' with date and time for older dates", () => {
    const fiveDaysAgo = new Date(Date.now() - 86400000 * 5).toISOString();
    const result = daysAgo(fiveDaysAgo);
    expect(result).toMatch(/^Last used: \d+ \w+, \d{2}:\d{2}$/);
  });
});

// ─── staffDisplayName ─────────────────────────────────────────────────────────

describe("staffDisplayName", () => {
  const baseProfile = {
    id: "sp1", location_id: "l1", role: "Front of House", status: "active" as const,
    pin: "1234", last_used_at: null, archived_at: null, created_at: new Date().toISOString(),
    first_name: "Maria", last_name: "Garcia",
  };

  it("concatenates first and last name", () => {
    expect(staffDisplayName(baseProfile)).toBe("Maria Garcia");
  });

  it("trims result", () => {
    expect(staffDisplayName({ ...baseProfile, last_name: "" })).toBe("Maria");
  });
});

// ─── formatTimestamp ──────────────────────────────────────────────────────────

describe("formatTimestamp", () => {
  it("returns a string with date and time parts", () => {
    const iso = "2024-03-15T14:30:00.000Z";
    const result = formatTimestamp(iso);
    expect(result).toContain("·");
    expect(result).toMatch(/\d{4}/); // year present
    expect(result).toMatch(/\d{2}:\d{2}/); // time present
  });
});

// ─── generatePin ─────────────────────────────────────────────────────────────

describe("generatePin", () => {
  it("returns a 4-digit string", () => {
    const pin = generatePin();
    expect(pin).toHaveLength(4);
    expect(Number(pin)).toBeGreaterThanOrEqual(1000);
    expect(Number(pin)).toBeLessThanOrEqual(9999);
  });

  it("generates different PINs across calls", () => {
    const pins = new Set(Array.from({ length: 20 }, () => generatePin()));
    expect(pins.size).toBeGreaterThan(1);
  });
});

describe("DEFAULT_PERMISSIONS", () => {
  it("has all permission keys set to true by default", () => {
    Object.values(DEFAULT_PERMISSIONS).forEach(val => {
      expect(val).toBe(true);
    });
  });
});

describe("DEFAULT_STAFF_ROLES", () => {
  it("contains the default department roles", () => {
    expect(DEFAULT_STAFF_DEPARTMENTS.map(d => d.name)).toEqual([
      "Front of House",
      "Back of House",
      "Management",
      "Cleaning Crew",
    ]);
    expect(DEFAULT_STAFF_ROLES).toEqual([
      "Front of House",
      "Back of House",
      "Management",
      "Cleaning Crew",
    ]);
  });
});
