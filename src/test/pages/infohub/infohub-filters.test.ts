import { accessMatchesFilters, activeInfohubFilterCount, DEFAULT_INFOHUB_FILTERS, reachableFolderIds, type AccessFilterContext } from "@/pages/infohub/infohub-filters";
import { DEFAULT_INFOHUB_ACCESS, type InfohubAccessControl } from "@/lib/infohub-access";

const restricted = (patch: Partial<InfohubAccessControl>): InfohubAccessControl => ({ ...DEFAULT_INFOHUB_ACCESS, accessScope: "restricted", ...patch });
const ctx = (patch: Partial<AccessFilterContext> = {}): AccessFilterContext => ({ locationIds: null, conceptIds: [], departmentIds: [], members: [], ...patch });
const maria = { teamMemberId: "m1", locationIds: ["loc-1"], conceptIds: ["c1"], departmentIds: ["kitchen"] };
const jordi = { teamMemberId: "m2", locationIds: ["loc-2"], conceptIds: ["c2"], departmentIds: ["floor"] };

describe("accessMatchesFilters", () => {
  it("always matches content visible to everyone", () => {
    expect(accessMatchesFilters(DEFAULT_INFOHUB_ACCESS, ctx({ locationIds: ["loc-9"], departmentIds: ["nobody"], members: [jordi] }))).toBe(true);
  });

  it("matches restricted content when no filters are set", () => {
    expect(accessMatchesFilters(restricted({ allowedDepartmentIds: ["kitchen"] }), ctx())).toBe(true);
  });

  it("matches a location-restricted doc only for overlapping locations", () => {
    const access = restricted({ allowedLocationIds: ["loc-1"] });
    expect(accessMatchesFilters(access, ctx({ locationIds: ["loc-1"], conceptIds: ["c1"] }))).toBe(true);
    expect(accessMatchesFilters(access, ctx({ locationIds: ["loc-2"], conceptIds: ["c2"] }))).toBe(false);
  });

  it("matches a concept-restricted doc for any location of that concept", () => {
    const access = restricted({ allowedConceptIds: ["c1"] });
    expect(accessMatchesFilters(access, ctx({ locationIds: ["loc-1"], conceptIds: ["c1"] }))).toBe(true);
    expect(accessMatchesFilters(access, ctx({ locationIds: ["loc-2"], conceptIds: ["c2"] }))).toBe(false);
  });

  it("matches a department-restricted doc for any location, since that department may work there", () => {
    expect(accessMatchesFilters(restricted({ allowedDepartmentIds: ["kitchen"] }), ctx({ locationIds: ["loc-2"], conceptIds: ["c2"] }))).toBe(true);
  });

  it("matches a department-restricted doc only for that department", () => {
    const access = restricted({ allowedDepartmentIds: ["kitchen"] });
    expect(accessMatchesFilters(access, ctx({ departmentIds: ["kitchen"] }))).toBe(true);
    expect(accessMatchesFilters(access, ctx({ departmentIds: ["floor"] }))).toBe(false);
  });

  it("matches a location-restricted doc for any department at that location", () => {
    expect(accessMatchesFilters(restricted({ allowedLocationIds: ["loc-1"] }), ctx({ departmentIds: ["floor"] }))).toBe(true);
  });

  it("needs both the place and the department to fit when both are set", () => {
    const access = restricted({ allowedLocationIds: ["loc-1"], allowedDepartmentIds: ["kitchen"] });
    expect(accessMatchesFilters(access, ctx({ locationIds: ["loc-1"], conceptIds: ["c1"], departmentIds: ["kitchen"] }))).toBe(true);
    expect(accessMatchesFilters(access, ctx({ locationIds: ["loc-1"], conceptIds: ["c1"], departmentIds: ["floor"] }))).toBe(false);
  });

  it("matches a person-restricted doc only when a selected member can see it", () => {
    const access = restricted({ allowedTeamMemberIds: ["m1"] });
    expect(accessMatchesFilters(access, ctx({ members: [maria] }))).toBe(true);
    expect(accessMatchesFilters(access, ctx({ members: [jordi] }))).toBe(false);
  });

  it("uses a member's department and locations for the Team member filter", () => {
    expect(accessMatchesFilters(restricted({ allowedLocationIds: ["loc-2"] }), ctx({ members: [jordi] }))).toBe(true);
    expect(accessMatchesFilters(restricted({ allowedDepartmentIds: ["kitchen"] }), ctx({ members: [jordi] }))).toBe(false);
  });

  it("treats owners as seeing everything", () => {
    expect(accessMatchesFilters(restricted({ allowedDepartmentIds: ["kitchen"] }), ctx({ members: [{ teamMemberId: "o", locationIds: [], isOwner: true }] }))).toBe(true);
  });

  it("counts a named person only if they fit the location filter", () => {
    const access = restricted({ allowedTeamMemberIds: ["m1"] });
    expect(accessMatchesFilters(access, ctx({ locationIds: ["loc-1"], conceptIds: ["c1"], members: [maria] }))).toBe(true);
    expect(accessMatchesFilters(access, ctx({ locationIds: ["loc-2"], conceptIds: ["c2"], members: [maria] }))).toBe(false);
  });
});

describe("reachableFolderIds", () => {
  const folders = [
    { id: "a", parentId: null, access: restricted({ allowedLocationIds: ["loc-1"] }) },
    { id: "b", parentId: "a", access: DEFAULT_INFOHUB_ACCESS },
    { id: "c", parentId: null, access: DEFAULT_INFOHUB_ACCESS },
  ];

  it("excludes folders whose ancestor doesn't match", () => {
    const ids = reachableFolderIds(folders, access => accessMatchesFilters(access, ctx({ locationIds: ["loc-2"] })));
    expect([...ids].sort()).toEqual(["c"]);
  });

  it("includes everything when nothing is filtered", () => {
    expect(reachableFolderIds(folders, () => true).size).toBe(3);
  });

  it("does not loop on a parent cycle", () => {
    const cyclic = [{ id: "x", parentId: "y", access: DEFAULT_INFOHUB_ACCESS }, { id: "y", parentId: "x", access: DEFAULT_INFOHUB_ACCESS }];
    expect(reachableFolderIds(cyclic, () => true).size).toBe(2);
  });
});

describe("activeInfohubFilterCount", () => {
  it("counts each active dimension once", () => {
    expect(activeInfohubFilterCount(DEFAULT_INFOHUB_FILTERS)).toBe(0);
    expect(activeInfohubFilterCount({ ...DEFAULT_INFOHUB_FILTERS, locationIds: ["a", "b"], kind: "file", progress: "completed" })).toBe(3);
  });
});
