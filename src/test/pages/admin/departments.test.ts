import {
  assignmentsToSelection, departmentUnassignImpact, resolveDepartmentLocationIds, selectionToAssignments,
} from "@/pages/admin/departments";

const locations = [
  { id: "a1", concept_id: "A" },
  { id: "a2", concept_id: "A" },
  { id: "b1", concept_id: "B" },
];

describe("resolveDepartmentLocationIds", () => {
  it("expands a whole-concept assignment to the concept's locations and keeps specific ones", () => {
    const ids = resolveDepartmentLocationIds(
      [{ concept_id: "A", location_id: null }, { concept_id: "B", location_id: "b1" }],
      locations,
    );
    expect([...ids].sort()).toEqual(["a1", "a2", "b1"]);
  });

  it("covers every location for a company-wide assignment", () => {
    expect(resolveDepartmentLocationIds([{ concept_id: null, location_id: null }], locations).size).toBe(3);
  });

  it("is empty with no assignments", () => {
    expect(resolveDepartmentLocationIds([], locations).size).toBe(0);
  });
});

describe("departmentUnassignImpact", () => {
  const members = [
    { location_ids: ["a1"], department_ids: ["dep"] },
    { location_ids: ["b1"], department_ids: ["dep"] },
    { location_ids: [], department_ids: ["dep"] },         // all locations
    { location_ids: ["b1"], department_ids: ["other"] },    // not using it
  ];
  const checklists = [
    { location_id: null, location_ids: ["a2"], concept_id: null, department_ids: ["dep"] },
    { location_id: null, location_ids: null, concept_id: "B", department_ids: ["dep"] },
    { location_id: null, location_ids: null, concept_id: null, department_ids: ["dep"] }, // all locations
    { location_id: "b1", location_ids: null, concept_id: null, department_ids: null },
  ];

  it("counts only staff/checklists left with no location the department still covers", () => {
    // Keep concept A only → B-only member and the concept-B checklist lose it.
    expect(departmentUnassignImpact("dep", [{ concept_id: "A", location_id: null }], locations, members, checklists))
      .toEqual({ staff: 1, checklists: 1 });
  });

  it("counts every user of the department on delete", () => {
    expect(departmentUnassignImpact("dep", [], locations, members, checklists)).toEqual({ staff: 3, checklists: 3 });
  });

  it("reports nothing when coverage is unchanged", () => {
    const all = [{ concept_id: "A", location_id: null }, { concept_id: "B", location_id: null }];
    expect(departmentUnassignImpact("dep", all, locations, members, checklists)).toEqual({ staff: 0, checklists: 0 });
  });
});

describe("selectionToAssignments", () => {
  it("maps All concepts + All locations to one company-wide assignment", () => {
    expect(selectionToAssignments([], [], locations)).toEqual([{ concept_id: null, location_id: null }]);
  });

  it("maps picked concepts with All locations to whole-concept assignments", () => {
    expect(selectionToAssignments(["A", "B"], [], locations)).toEqual([
      { concept_id: "A", location_id: null },
      { concept_id: "B", location_id: null },
    ]);
  });

  it("maps picked locations to exactly those locations, whatever the concept pick", () => {
    expect(selectionToAssignments(["A", "B"], ["a2"], locations)).toEqual([{ concept_id: "A", location_id: "a2" }]);
    expect(selectionToAssignments([], ["b1"], locations)).toEqual([{ concept_id: "B", location_id: "b1" }]);
  });
});

describe("assignmentsToSelection", () => {
  it("round-trips each shape", () => {
    for (const [c, l] of [[[], []], [["A"], []], [["A"], ["a1"]], [["A", "B"], ["a2", "b1"]]] as [string[], string[]][]) {
      const back = assignmentsToSelection(selectionToAssignments(c, l, locations), locations);
      expect(back.conceptIds.sort()).toEqual([...c].sort());
      expect(back.locationIds.sort()).toEqual([...l].sort());
    }
  });

  it("treats a department with no assignments as All / All", () => {
    expect(assignmentsToSelection([], locations)).toEqual({ conceptIds: [], locationIds: [] });
  });

  it("expands a mixed whole-concept + specific-location set into explicit locations", () => {
    const sel = assignmentsToSelection(
      [{ concept_id: "A", location_id: null }, { concept_id: "B", location_id: "b1" }],
      locations,
    );
    expect(sel.locationIds.sort()).toEqual(["a1", "a2", "b1"]);
    expect(sel.conceptIds.sort()).toEqual(["A", "B"]);
  });
});
