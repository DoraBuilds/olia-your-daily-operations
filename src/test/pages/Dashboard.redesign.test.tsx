import { fireEvent, screen } from "@testing-library/react";
import Dashboard from "@/pages/Dashboard";
import { renderWithProviders } from "../test-utils";

const mockNavigate = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const {
  mockUseChecklistLogs,
  mockUseChecklists,
  mockUseLocations,
  mockUseActions,
} = vi.hoisted(() => ({
  mockUseChecklistLogs: vi.fn(),
  mockUseChecklists: vi.fn(),
  mockUseLocations: vi.fn(),
  mockUseActions: vi.fn(),
}));

vi.mock("@/hooks/useChecklistLogs", () => ({ useChecklistLogs: mockUseChecklistLogs }));
vi.mock("@/hooks/useChecklists", () => ({
  useChecklists: mockUseChecklists,
  useFolders: () => ({ data: [] }),
  useSaveFolder: () => ({ mutate: vi.fn() }),
  useDeleteFolder: () => ({ mutate: vi.fn() }),
}));
vi.mock("@/hooks/useLocations", () => ({ useLocations: mockUseLocations }));
vi.mock("@/hooks/useActions", () => ({
  useActions: mockUseActions,
  useSaveAction: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/useAlerts", () => ({
  useAlerts: () => ({ data: [] }),
  useCreateAlert: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "u1" },
    session: null,
    teamMember: {
      id: "u1",
      name: "Test User",
      organization_id: "org1",
      role: "Owner",
      location_ids: [],
      permissions: {},
    },
    loading: false,
    signOut: vi.fn(),
  }),
}));
vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn().mockReturnValue({
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      then: vi.fn().mockImplementation((cb) => Promise.resolve(cb({ data: [], error: null }))),
    }),
  },
}));

const TODAY_STR = "2026-03-26";

function makeChecklist(id: string, locationId: string) {
  return {
    id,
    title: `Checklist ${id}`,
    location_id: locationId,
    location_ids: null,
    schedule: null,
    sections: [],
    time_of_day: "anytime",
    due_time: null,
    visibility_from: null,
    visibility_until: null,
    created_at: "2026-01-01",
    updated_at: "2026-01-01",
  };
}

function makeLog(id: string, checklistId: string, locationId: string, score: number) {
  return {
    id,
    checklist_id: checklistId,
    checklist_title: `Checklist ${checklistId}`,
    completed_by: "Tester",
    staff_profile_id: "sp1",
    score,
    type: "opening",
    answers: [],
    created_at: `${TODAY_STR}T10:00:00Z`,
    location_id: locationId,
    started_at: `${TODAY_STR}T09:45:00Z`,
  };
}

describe("Dashboard redesign — shift completion gauge", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(`${TODAY_STR}T14:00:00`));
    mockNavigate.mockReset();
    mockUseActions.mockReturnValue({ data: [] });
  });

  afterEach(() => vi.useRealTimers());

  it("shows the aggregate completion percentage across all locations", () => {
    mockUseLocations.mockReturnValue({
      data: [{ id: "loc-1", name: "Main Kitchen" }, { id: "loc-2", name: "Riverside" }],
    });
    mockUseChecklists.mockReturnValue({
      data: [makeChecklist("ck-1", "loc-1"), makeChecklist("ck-2", "loc-1"), makeChecklist("ck-3", "loc-2")],
    });
    mockUseChecklistLogs.mockReturnValue({
      data: [makeLog("log-1", "ck-1", "loc-1", 100), makeLog("log-2", "ck-2", "loc-1", 100)],
    });

    renderWithProviders(<Dashboard />);

    expect(screen.getByText("Shift completion")).toBeInTheDocument();
    // 2 of 3 checklists completed today = 67%
    expect(screen.getByText("67%")).toBeInTheDocument();
    expect(screen.getByText("2/3 checklists done today")).toBeInTheDocument();
  });

  it("does not render the gauge when no checklists are assigned today", () => {
    mockUseLocations.mockReturnValue({ data: [{ id: "loc-1", name: "Main Kitchen" }] });
    mockUseChecklists.mockReturnValue({ data: [] });
    mockUseChecklistLogs.mockReturnValue({ data: [] });

    renderWithProviders(<Dashboard />);

    expect(screen.queryByText("Shift completion")).not.toBeInTheDocument();
  });
});

describe("Dashboard redesign — needs attention banner", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(`${TODAY_STR}T14:00:00`));
    mockNavigate.mockReset();
    mockUseActions.mockReturnValue({ data: [] });
  });

  afterEach(() => vi.useRealTimers());

  it("shows the banner for the worst-performing location when below 85%", () => {
    mockUseLocations.mockReturnValue({ data: [{ id: "loc-low", name: "City Centre" }] });
    mockUseChecklists.mockReturnValue({ data: [makeChecklist("ck-1", "loc-low"), makeChecklist("ck-2", "loc-low")] });
    mockUseChecklistLogs.mockReturnValue({ data: [makeLog("log-1", "ck-1", "loc-low", 40)] });

    renderWithProviders(<Dashboard />);

    expect(screen.getByText("Needs attention")).toBeInTheDocument();
    expect(screen.getByText(/City Centre is at 20% today/)).toBeInTheDocument();

    fireEvent.click(screen.getByText("Needs attention"));
    expect(mockNavigate).toHaveBeenCalledWith("/reporting?location=loc-low");
  });

  it("hides the banner when every location is at or above 85%", () => {
    mockUseLocations.mockReturnValue({ data: [{ id: "loc-good", name: "Main Kitchen" }] });
    mockUseChecklists.mockReturnValue({ data: [makeChecklist("ck-1", "loc-good")] });
    mockUseChecklistLogs.mockReturnValue({ data: [makeLog("log-1", "ck-1", "loc-good", 90)] });

    renderWithProviders(<Dashboard />);

    expect(screen.queryByText("Needs attention")).not.toBeInTheDocument();
  });

  it("hides the banner when the worst location has no checklists assigned", () => {
    mockUseLocations.mockReturnValue({ data: [{ id: "loc-empty", name: "No Checklists" }] });
    mockUseChecklists.mockReturnValue({ data: [] });
    mockUseChecklistLogs.mockReturnValue({ data: [] });

    renderWithProviders(<Dashboard />);

    expect(screen.queryByText("Needs attention")).not.toBeInTheDocument();
  });
});
