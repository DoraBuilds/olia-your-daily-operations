import { describe, it, expect } from "vitest";
import {
  DEFAULT_INFOHUB_ACCESS,
  canAccessInfohubContent,
  canManageInfohubAccess,
  conceptIdsForLocations,
  infohubPrincipalForMember,
  type InfohubAccessControl,
  type InfohubPrincipal,
} from "@/lib/infohub-access";

const restricted = (patch: Partial<InfohubAccessControl>): InfohubAccessControl => ({ ...DEFAULT_INFOHUB_ACCESS, accessScope: "restricted", ...patch });
const staff = (patch: Partial<InfohubPrincipal> = {}): InfohubPrincipal => ({
  teamMemberId: "tm-1", locationIds: ["loc-1"], conceptIds: ["c-1"], departmentIds: ["dep-kitchen"], permissions: {}, isOwner: false, ...patch,
});

describe("infohub access helpers", () => {
  it("allows company-wide content for anyone", () => {
    expect(canAccessInfohubContent(DEFAULT_INFOHUB_ACCESS, staff())).toBe(true);
  });

  it("keeps restricted content with nothing picked to owners", () => {
    expect(canAccessInfohubContent(restricted({}), staff())).toBe(false);
    expect(canAccessInfohubContent(restricted({}), staff({ isOwner: true }))).toBe(true);
  });

  it("shares by location", () => {
    const access = restricted({ allowedLocationIds: ["loc-1"] });
    expect(canAccessInfohubContent(access, staff())).toBe(true);
    expect(canAccessInfohubContent(access, staff({ locationIds: ["loc-2"], conceptIds: ["c-1"] }))).toBe(false);
  });

  it("shares a whole concept with everyone at any of its locations", () => {
    const access = restricted({ allowedConceptIds: ["c-1"] });
    expect(canAccessInfohubContent(access, staff())).toBe(true);
    expect(canAccessInfohubContent(access, staff({ locationIds: ["loc-9"], conceptIds: ["c-2"] }))).toBe(false);
  });

  it("shares by department across every location when no place is picked", () => {
    const access = restricted({ allowedDepartmentIds: ["dep-kitchen"] });
    expect(canAccessInfohubContent(access, staff({ locationIds: ["loc-9"], conceptIds: [] }))).toBe(true);
    expect(canAccessInfohubContent(access, staff({ departmentIds: ["dep-floor"] }))).toBe(false);
  });

  it("requires both the place and the department when both are picked", () => {
    const access = restricted({ allowedLocationIds: ["loc-1"], allowedDepartmentIds: ["dep-kitchen"] });
    expect(canAccessInfohubContent(access, staff())).toBe(true);
    expect(canAccessInfohubContent(access, staff({ departmentIds: ["dep-floor"] }))).toBe(false);
    expect(canAccessInfohubContent(access, staff({ locationIds: ["loc-2"], conceptIds: [] }))).toBe(false);
  });

  it("always lets a named team member in", () => {
    const access = restricted({ allowedTeamMemberIds: ["tm-1"], allowedLocationIds: ["loc-9"], allowedDepartmentIds: ["dep-floor"] });
    expect(canAccessInfohubContent(access, staff())).toBe(true);
    expect(canAccessInfohubContent(access, staff({ teamMemberId: "tm-2" }))).toBe(false);
  });

  it("lets an every-location member (no specific locations) match any place, but not other departments or people", () => {
    const everywhere = staff({ locationIds: [], conceptIds: [] });
    expect(canAccessInfohubContent(restricted({ allowedLocationIds: ["loc-9"] }), everywhere)).toBe(true);
    expect(canAccessInfohubContent(restricted({ allowedConceptIds: ["c-9"] }), everywhere)).toBe(true);
    expect(canAccessInfohubContent(restricted({ allowedConceptIds: ["c-9"], allowedDepartmentIds: ["dep-floor"] }), everywhere)).toBe(false);
    expect(canAccessInfohubContent(restricted({ allowedTeamMemberIds: ["tm-2"] }), everywhere)).toBe(false);
  });

  it("resolves a member's concepts from their locations", () => {
    const locations = [{ id: "loc-1", concept_id: "c-1" }, { id: "loc-2", concept_id: "c-2" }, { id: "loc-3", concept_id: null }];
    expect(conceptIdsForLocations(["loc-1", "loc-3"], locations)).toEqual(["c-1"]);
    expect(infohubPrincipalForMember({ id: "m", location_ids: ["loc-2"], department_ids: ["d"], is_owner: false }, locations)).toEqual({
      teamMemberId: "m", locationIds: ["loc-2"], conceptIds: ["c-2"], departmentIds: ["d"], isOwner: false,
    });
  });

  it("treats owners and content managers as able to manage access", () => {
    expect(canManageInfohubAccess(staff({ isOwner: true }))).toBe(true);
    expect(canManageInfohubAccess(staff({ permissions: { create_edit_checklists: true } }))).toBe(true);
    expect(canManageInfohubAccess(staff())).toBe(false);
  });
});
