import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  getInitials,
  daysAgo,
  staffDisplayName,
  formatTimestamp,
  generatePin,
  initialLocations,
  initialStaffProfiles,
  initialTeamMembers,
  initialAuditLog,
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
  it("concatenates first and last name", () => {
    const profile = initialStaffProfiles[0];
    expect(staffDisplayName(profile)).toBe(`${profile.first_name} ${profile.last_name}`);
  });

  it("trims result", () => {
    const profile = { ...initialStaffProfiles[0], last_name: "" };
    expect(staffDisplayName(profile)).toBe(profile.first_name);
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

// ─── Mock Data ────────────────────────────────────────────────────────────────

describe("initialLocations", () => {
  it("contains at least one location", () => {
    expect(initialLocations.length).toBeGreaterThan(0);
  });

  it("each location has required fields", () => {
    initialLocations.forEach(loc => {
      expect(loc.id).toBeTruthy();
      expect(loc.name).toBeTruthy();
      expect(typeof loc.archive_threshold_days).toBe("number");
    });
  });
});

describe("initialStaffProfiles", () => {
  it("contains active and archived profiles", () => {
    const active = initialStaffProfiles.filter(p => p.status === "active");
    const archived = initialStaffProfiles.filter(p => p.status === "archived");
    expect(active.length).toBeGreaterThan(0);
    expect(archived.length).toBeGreaterThan(0);
  });

  it("each profile has a 4-digit PIN", () => {
    initialStaffProfiles.forEach(p => {
      expect(p.pin).toHaveLength(4);
      expect(Number(p.pin)).toBeGreaterThanOrEqual(1000);
    });
  });
});

describe("initialTeamMembers", () => {
  it("contains an Owner", () => {
    const owners = initialTeamMembers.filter(m => m.role === "Owner");
    expect(owners.length).toBeGreaterThan(0);
  });

  it("each member has initials", () => {
    initialTeamMembers.forEach(m => {
      expect(m.initials.length).toBeGreaterThanOrEqual(1);
    });
  });
});

describe("initialAuditLog", () => {
  it("has audit entries with required fields", () => {
    expect(initialAuditLog.length).toBeGreaterThan(0);
    initialAuditLog.forEach(entry => {
      expect(entry.id).toBeTruthy();
      expect(entry.user).toBeTruthy();
      expect(entry.action).toBeTruthy();
      expect(entry.timestamp).toBeTruthy();
    });
  });

  it("allows null location for account-level actions", () => {
    const noLocation = initialAuditLog.find(e => e.location_id === null);
    expect(noLocation).toBeDefined();
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
  it("contains the default department hierarchy and sub-roles", () => {
    expect(DEFAULT_STAFF_DEPARTMENTS.map(d => d.name)).toEqual([
      "Front of House",
      "Back of House",
      "Management",
      "Cleaning Crew",
    ]);
    expect(DEFAULT_STAFF_ROLES).toContain("Front of House");
    expect(DEFAULT_STAFF_ROLES).toContain("Front of House / Bartender");
    expect(DEFAULT_STAFF_ROLES).toContain("Back of House / Chef");
    expect(DEFAULT_STAFF_ROLES).toContain("Cleaning Crew / Cleaner");
  });
});
