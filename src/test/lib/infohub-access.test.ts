import { describe, it, expect } from "vitest";
import {
  DEFAULT_INFOHUB_ACCESS,
  canAccessInfohubContent,
  canManageInfohubAccess,
} from "@/lib/infohub-access";

describe("infohub access helpers", () => {
  it("allows org-scoped content for the current principal", () => {
    expect(canAccessInfohubContent(DEFAULT_INFOHUB_ACCESS, {
      teamMemberId: "tm-1",
      role: "Manager",
      locationIds: ["loc-1"],
      permissions: {},
      isOwner: false,
    })).toBe(true);
  });

  it("allows restricted content when a team member or location is explicitly shared", () => {
    const access = {
      accessScope: "restricted" as const,
      allowedTeamMemberIds: ["tm-2"],
      allowedRoles: ["Manager"],
      allowedLocationIds: ["loc-9"],
    };

    expect(canAccessInfohubContent(access, {
      teamMemberId: "tm-1",
      role: "Manager",
      locationIds: ["loc-1", "loc-9"],
      permissions: {},
      isOwner: false,
    })).toBe(true);
  });

  it("blocks restricted content when no share matches", () => {
    const access = {
      accessScope: "restricted" as const,
      allowedTeamMemberIds: ["tm-2"],
      allowedRoles: ["Owner"],
      allowedLocationIds: ["loc-9"],
    };

    expect(canAccessInfohubContent(access, {
      teamMemberId: "tm-1",
      role: "Manager",
      locationIds: ["loc-1"],
      permissions: {},
      isOwner: false,
    })).toBe(false);
  });

  it("treats owners and content managers as able to manage access", () => {
    expect(canManageInfohubAccess({
      teamMemberId: "tm-1",
      role: "Owner",
      locationIds: [],
      permissions: {},
      isOwner: true,
    })).toBe(true);

    expect(canManageInfohubAccess({
      teamMemberId: "tm-2",
      role: "Manager",
      locationIds: [],
      permissions: {
        create_edit_checklists: true,
      },
      isOwner: false,
    })).toBe(true);
  });
});
