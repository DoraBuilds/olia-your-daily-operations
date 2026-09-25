import { describe, it, expect } from "vitest";
import { buildTrainingReport, type ReportDoc, type ReportFolder } from "@/pages/reporting/training-report";
import { DEFAULT_PERMISSIONS, type TeamMember } from "@/lib/admin-repository";
import type { TrainingProgressRow } from "@/hooks/useTrainingProgress";

const open = { accessScope: "org" as const, allowedTeamMemberIds: [], allowedRoles: [], allowedLocationIds: [] };
const restricted = (patch: Partial<typeof open>) => ({ ...open, accessScope: "restricted" as const, ...patch });

const member = (id: string, patch: Partial<TeamMember> = {}): TeamMember => ({
  id, name: id.toUpperCase(), email: null, role: "Staff", is_owner: false, is_manager: false,
  location_ids: ["L1"], department_ids: [], initials: "", permissions: DEFAULT_PERMISSIONS, ...patch,
});
const done = (memberId: string, moduleId: string, completed = true): TrainingProgressRow => ({
  id: `${memberId}-${moduleId}`, organization_id: "o", user_id: null, team_member_id: memberId, module_id: moduleId,
  completed_step_indices: [], is_completed: completed, completed_at: completed ? "2026-09-20T10:00:00Z" : null,
  created_at: "", updated_at: "",
});

const folders: ReportFolder[] = [
  { id: "f-open", name: "Onboarding", parentId: null, access: open },
  { id: "f-l2", name: "Bar (L2 only)", parentId: null, access: restricted({ allowedLocationIds: ["L2"] }) },
  { id: "f-child", name: "Nested", parentId: "f-l2", access: open },
];
const docs: ReportDoc[] = [
  { id: "d-open", title: "Welcome", folderId: "f-open", access: open },
  { id: "d-bar", title: "Opening the bar", folderId: "f-child", access: open },
  { id: "d-anna", title: "Anna only", folderId: "f-open", access: restricted({ allowedTeamMemberIds: ["anna"] }) },
];
const members = [
  member("anna"),
  member("ben", { location_ids: ["L2"], department_ids: ["kitchen"] }),
  member("cara", { location_ids: [] }), // every location
  member("owner", { is_owner: true, location_ids: [] }),
];
const all = { locationIds: null, departmentIds: null, search: "" };
const rowFor = (rows: ReturnType<typeof buildTrainingReport>, id: string) => rows.find(r => r.doc.id === id)!;

describe("buildTrainingReport", () => {
  it("counts everyone a training is shared with, except owners", () => {
    const rows = buildTrainingReport(docs, folders, members, [done("anna", "d-open"), done("ben", "d-open", false)], all);
    const welcome = rowFor(rows, "d-open");
    expect(welcome.total).toBe(3);
    expect(welcome.completed.map(c => c.member.id)).toEqual(["anna"]);
    expect(welcome.completed[0].completedAt).toBe("2026-09-20T10:00:00Z");
    expect(welcome.notCompleted.map(m => m.id)).toEqual(["ben", "cara"]);
    expect(welcome.pct).toBe(33);
  });

  it("follows folder sharing through parent folders, and counts every-location members for location shares", () => {
    const bar = rowFor(buildTrainingReport(docs, folders, members, [], all), "d-bar");
    expect([...bar.notCompleted].map(m => m.id)).toEqual(["ben", "cara"]);
  });

  it("respects person-level sharing on the doc", () => {
    const anna = rowFor(buildTrainingReport(docs, folders, members, [done("anna", "d-anna")], all), "d-anna");
    expect(anna.total).toBe(1);
    expect(anna.pct).toBe(100);
  });

  it("narrows people by location (keeping every-location members) and by department", () => {
    const byLocation = rowFor(buildTrainingReport(docs, folders, members, [], { ...all, locationIds: ["L2"] }), "d-open");
    expect(byLocation.notCompleted.map(m => m.id)).toEqual(["ben", "cara"]);
    const byDept = rowFor(buildTrainingReport(docs, folders, members, [], { ...all, departmentIds: ["kitchen"] }), "d-open");
    expect(byDept.notCompleted.map(m => m.id)).toEqual(["ben"]);
  });

  it("sorts lowest completion first, puts trainings shared with nobody last, and filters by search", () => {
    const rows = buildTrainingReport(docs, folders, members, [done("anna", "d-open"), done("anna", "d-anna")], { ...all, departmentIds: ["kitchen"] });
    expect(rows.map(r => [r.doc.id, r.pct])).toEqual([["d-bar", 0], ["d-open", 0], ["d-anna", null]]);
    expect(buildTrainingReport(docs, folders, members, [], { ...all, search: "BAR" }).map(r => r.doc.id)).toEqual(["d-bar"]);
  });
});
