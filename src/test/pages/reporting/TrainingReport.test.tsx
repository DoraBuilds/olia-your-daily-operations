import { screen, fireEvent, within } from "@testing-library/react";
import Reporting from "@/pages/Reporting";
import { renderWithProviders } from "../../test-utils";
import { exportTrainingCsv } from "@/lib/export-utils";

const auth = vi.hoisted(() => ({
  teamMember: { id: "u1", organization_id: "org1", name: "Sarah", email: "s@test.com", role: "Owner", is_owner: true, is_manager: true, location_ids: [] as string[], department_ids: [] as string[], permissions: {} as Record<string, boolean> },
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      signOut: vi.fn().mockResolvedValue({}),
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
  },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "u1" }, session: null, teamMember: auth.teamMember, loading: false, signOut: vi.fn() }),
  AuthProvider: ({ children }: any) => children,
}));

vi.mock("@/pages/checklists/ReportingTab", () => ({ ReportingTab: () => <div>Checklist report</div> }));

const open = { accessScope: "org", allowedTeamMemberIds: [], allowedRoles: [], allowedLocationIds: [] };
vi.mock("@/hooks/useInfohubContent", () => ({
  useInfohubContent: () => ({
    isLoading: false,
    isPlaceholderData: false,
    data: {
      libraryFolders: [], libraryDocs: [], archivedLibraryDocs: [],
      trainingFolders: [{ id: "f1", name: "Bar Training", parentId: null, sortOrder: 0, access: open }],
      trainingDocs: [
        { id: "d1", title: "Opening the bar", duration: "10 min", completed: false, folderId: "f1", steps: [], access: open },
        { id: "d2", title: "Cocktail basics", duration: "15 min", completed: false, folderId: "f1", steps: [], access: open },
      ],
    },
  }),
}));

vi.mock("@/hooks/useTrainingProgress", () => ({
  useTeamTrainingProgress: () => ({
    isLoading: false,
    data: [{ id: "p1", organization_id: "org1", user_id: null, team_member_id: "m-ana", module_id: "d1", completed_step_indices: [], is_completed: true, completed_at: "2026-09-20T10:00:00Z", created_at: "", updated_at: "" }],
  }),
}));

const member = (id: string, name: string, location_ids: string[], extra = {}) => ({
  id, name, email: null, role: "Staff", is_owner: false, is_manager: false, location_ids, department_ids: [], initials: "", permissions: {}, ...extra,
});
vi.mock("@/hooks/useTeamMembers", () => ({
  useTeamMembers: () => ({
    isLoading: false,
    data: [member("m-ana", "Ana", ["L1"]), member("m-ben", "Ben", ["L2"]), member("u1", "Sarah", [], { is_owner: true })],
  }),
}));
vi.mock("@/hooks/useLocations", () => ({
  useLocations: () => ({ data: [{ id: "L1", name: "Soho", concept_id: "c1" }, { id: "L2", name: "Shoreditch", concept_id: "c1" }] }),
}));
vi.mock("@/hooks/useConcepts", () => ({ useConcepts: () => ({ data: [{ id: "c1", name: "Olia Bar" }] }) }));
vi.mock("@/hooks/useDepartments", () => ({ useCompanyDepartments: () => ({ data: [] }) }));
vi.mock("@/hooks/usePlan", () => ({ usePlan: () => ({ plan: "growth", can: () => true, withinLimit: () => true, isActive: true, features: {} }) }));
vi.mock("@/lib/export-utils", () => ({ exportTrainingCsv: vi.fn() }));

beforeEach(() => {
  auth.teamMember = { ...auth.teamMember, is_owner: true, is_manager: true, permissions: {} };
  vi.mocked(exportTrainingCsv).mockClear();
});

describe("Reporting → Training", () => {
  it("shows the Checklists | Training switch to owners, defaulting to checklists", () => {
    renderWithProviders(<Reporting />, { initialEntries: ["/reporting"] });
    expect(screen.getByTestId("reporting-view-checklists")).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Checklist report")).toBeInTheDocument();
  });

  it("shows it to managers with View reporting, but not without it", () => {
    auth.teamMember = { ...auth.teamMember, is_owner: false, is_manager: true, permissions: { view_reporting: true } };
    const { unmount } = renderWithProviders(<Reporting />, { initialEntries: ["/reporting"] });
    expect(screen.getByTestId("reporting-view-training")).toBeInTheDocument();
    unmount();

    auth.teamMember = { ...auth.teamMember, permissions: { view_reporting: false } };
    renderWithProviders(<Reporting />, { initialEntries: ["/reporting?view=training"] });
    expect(screen.queryByTestId("reporting-view-training")).not.toBeInTheDocument();
    expect(screen.getByText("Checklist report")).toBeInTheDocument();
  });

  it("lists trainings lowest-completion first with x of y completed (owners not counted)", () => {
    renderWithProviders(<Reporting />, { initialEntries: ["/reporting"] });
    fireEvent.click(screen.getByTestId("reporting-view-training"));
    const rows = screen.getAllByTestId(/^training-report-row-/);
    expect(rows.map(r => r.getAttribute("data-testid"))).toEqual(["training-report-row-d2", "training-report-row-d1"]);
    expect(within(rows[1]).getByText("1 of 2 completed")).toBeInTheDocument();
    expect(within(rows[1]).getByText("50%")).toBeInTheDocument();
    expect(screen.getByText("2 trainings")).toBeInTheDocument();
  });

  it("expands a training into completed and not-completed people", () => {
    renderWithProviders(<Reporting />, { initialEntries: ["/reporting?view=training"] });
    const row = screen.getByTestId("training-report-row-d1");
    fireEvent.click(within(row).getByRole("button"));
    expect(within(row).getByText("Completed (1)")).toBeInTheDocument();
    expect(within(row).getByText("Ana")).toBeInTheDocument();
    expect(within(row).getByText("20 Sep 2026")).toBeInTheDocument();
    expect(within(row).getByText("Not completed (1)")).toBeInTheDocument();
    expect(within(row).getByText("Ben")).toBeInTheDocument();
  });

  it("searches by training name and exports one CSV row per person", () => {
    renderWithProviders(<Reporting />, { initialEntries: ["/reporting?view=training"] });
    fireEvent.change(screen.getByTestId("training-report-search"), { target: { value: "cocktail" } });
    expect(screen.getAllByTestId(/^training-report-row-/)).toHaveLength(1);

    fireEvent.click(screen.getByTestId("training-export-csv"));
    expect(exportTrainingCsv).toHaveBeenCalledWith([
      expect.objectContaining({ training: "Cocktail basics", person: "Ana", locations: "Soho", completed: false }),
      expect.objectContaining({ training: "Cocktail basics", person: "Ben", locations: "Shoreditch", completed: false }),
    ]);
  });
});
