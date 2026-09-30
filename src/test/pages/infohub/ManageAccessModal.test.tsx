import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import "@/lib/i18n";
import { ManageAccessModal } from "@/pages/infohub/InfohubShared";
import { DEFAULT_INFOHUB_ACCESS, type InfohubAccessControl } from "@/lib/infohub-access";

vi.mock("@/lib/supabase", () => ({ supabase: { from: vi.fn(), functions: { invoke: vi.fn() } } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ teamMember: null }) }));

const concepts = [{ id: "c1", name: "Bistro" }, { id: "c2", name: "Beach" }];
const locations = [
  { id: "loc-1", name: "Main Branch", concept_id: "c1" },
  { id: "loc-2", name: "Old Town", concept_id: "c1" },
  { id: "loc-3", name: "Terrace", concept_id: "c2" },
];
const departments = [{ id: "dep-kitchen", name: "Kitchen" }, { id: "dep-floor", name: "Floor" }];
const teamMembers = [{ id: "m1", name: "Maria" }];

const open = (access: Partial<InfohubAccessControl> = {}) => {
  const onSave = vi.fn();
  render(
    <ManageAccessModal
      target={{ id: "f1", type: "folder", section: "library", name: "Recipes", access: { ...DEFAULT_INFOHUB_ACCESS, ...access } }}
      teamMembers={teamMembers}
      concepts={concepts}
      locations={locations}
      departments={departments}
      onClose={vi.fn()}
      onSave={onSave}
    />,
  );
  return onSave;
};
const pick = (field: string, option: string) => {
  fireEvent.click(screen.getByTestId(`access-${field}-select-trigger`));
  fireEvent.click(screen.getByTestId(`access-${field}-select-option-${option}`));
};
const save = () => fireEvent.click(screen.getByTestId("access-save"));

describe("ManageAccessModal", () => {
  it("shares a whole concept and a department", () => {
    const onSave = open();
    fireEvent.click(screen.getByTestId("access-scope-restricted"));
    pick("concept", "c1");
    pick("department", "dep-kitchen");
    expect(screen.getByTestId("access-summary")).toHaveTextContent("Visible to: Kitchen at Bistro.");
    save();
    expect(onSave).toHaveBeenCalledWith({
      accessScope: "restricted",
      allowedTeamMemberIds: [],
      allowedConceptIds: ["c1"],
      allowedLocationIds: [],
      allowedDepartmentIds: ["dep-kitchen"],
    });
  });

  it("saves picked locations instead of their concept, and only offers that concept's locations", () => {
    const onSave = open();
    fireEvent.click(screen.getByTestId("access-scope-restricted"));
    pick("concept", "c1");
    fireEvent.click(screen.getByTestId("access-location-select-trigger"));
    expect(screen.queryByTestId("access-location-select-option-loc-3")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("access-location-select-option-loc-2"));
    save();
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ allowedConceptIds: [], allowedLocationIds: ["loc-2"] }));
  });

  it("reopens location shares with their concept shown", () => {
    const onSave = open({ accessScope: "restricted", allowedLocationIds: ["loc-3"], allowedTeamMemberIds: ["m1"] });
    expect(screen.getByTestId("access-concept-select-trigger")).toHaveTextContent("Beach");
    expect(screen.getByTestId("access-summary")).toHaveTextContent("Visible to: Every department at Terrace. Also shared with 1 team member.");
    save();
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ allowedConceptIds: [], allowedLocationIds: ["loc-3"], allowedTeamMemberIds: ["m1"] }));
  });

  it("has no role picker", () => {
    open({ accessScope: "restricted" });
    expect(screen.queryByText("Roles")).not.toBeInTheDocument();
  });
});
