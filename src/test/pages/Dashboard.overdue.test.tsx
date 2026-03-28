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

const LOCATION_A = { id: "loc-a", name: "Alpha" };
const LOCATION_B = { id: "loc-b", name: "Bravo" };

const OVERDUE_CHECKLIST = {
  id: "ck-overdue",
  title: "Morning Kitchen Check",
  due_time: "09:00",
  folder_id: null,
  location_id: "loc-a",
  location_ids: ["loc-a"],
  schedule: null,
  sections: [],
  time_of_day: "morning" as const,
  created_at: "",
  updated_at: "",
};

const FUTURE_CHECKLIST = {
  id: "ck-future",
  title: "Evening Closing Check",
  due_time: "22:00",
  folder_id: null,
  location_id: "loc-b",
  location_ids: ["loc-b"],
  schedule: null,
  sections: [],
  time_of_day: "evening" as const,
  created_at: "",
  updated_at: "",
};

const SECOND_ALPHA_CHECKLIST = {
  id: "ck-alpha-2",
  title: "Fridge Check",
  due_time: "11:00",
  folder_id: null,
  location_id: "loc-a",
  location_ids: ["loc-a"],
  schedule: null,
  sections: [],
  time_of_day: "morning" as const,
  created_at: "",
  updated_at: "",
};

const LOG_TODAY = {
  id: "log-1",
  checklist_id: "ck-overdue",
  checklist_title: "Morning Kitchen Check",
  completed_by: "Ana",
  score: 100,
  answers: [],
  created_at: `${TODAY_STR}T10:00:00+00:00`,
  location_id: "loc-a",
  started_at: null,
};

describe("Dashboard - compliance tabs", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(`${TODAY_STR}T14:00:00`));
    mockNavigate.mockReset();

    mockUseChecklistLogs.mockReturnValue({ data: [] });
    mockUseChecklists.mockReturnValue({ data: [] });
    mockUseLocations.mockReturnValue({ data: [] });
    mockUseActions.mockReturnValue({ data: [] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function clickComplianceTab(tab: "today" | "week" | "month") {
    fireEvent.click(screen.getByTestId(`compliance-tab-${tab}`));
  }

  it("shows today, week, and month tabs", () => {
    renderWithProviders(<Dashboard />);
    expect(screen.getByTestId("compliance-tab-today")).toBeInTheDocument();
    expect(screen.getByTestId("compliance-tab-week")).toBeInTheDocument();
    expect(screen.getByTestId("compliance-tab-month")).toBeInTheDocument();
  });

  it("shows the empty state when there are no locations", () => {
    renderWithProviders(<Dashboard />);
    expect(screen.getByText("No locations yet")).toBeInTheDocument();
  });

  it("sorts worse-performing locations first in the today view", () => {
    mockUseLocations.mockReturnValue({ data: [LOCATION_A, LOCATION_B] });
    mockUseChecklists.mockReturnValue({ data: [OVERDUE_CHECKLIST, SECOND_ALPHA_CHECKLIST, FUTURE_CHECKLIST] });
    mockUseChecklistLogs.mockReturnValue({ data: [LOG_TODAY] });

    renderWithProviders(<Dashboard />);

    const cards = screen.getAllByTestId("location-card");
    expect(cards[0]).toHaveTextContent("Bravo");
    expect(cards[1]).toHaveTextContent("Alpha");
  });

  it("lets the user switch between today, week, and month tabs", () => {
    mockUseLocations.mockReturnValue({ data: [LOCATION_A] });
    mockUseChecklists.mockReturnValue({ data: [OVERDUE_CHECKLIST] });

    renderWithProviders(<Dashboard />);
    clickComplianceTab("week");
    expect(screen.getByTestId("compliance-tab-week")).toHaveClass("bg-card");
    clickComplianceTab("month");
    expect(screen.getByTestId("compliance-tab-month")).toHaveClass("bg-card");
  });

  it("shows location completion counts in the today view", () => {
    mockUseLocations.mockReturnValue({ data: [LOCATION_A] });
    mockUseChecklists.mockReturnValue({ data: [OVERDUE_CHECKLIST, SECOND_ALPHA_CHECKLIST] });
    mockUseChecklistLogs.mockReturnValue({ data: [LOG_TODAY] });

    renderWithProviders(<Dashboard />);
    expect(screen.getByText("1/2 checklists completed")).toBeInTheDocument();
  });
});

describe("Dashboard - location compliance cards", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(`${TODAY_STR}T14:00:00`));
    mockNavigate.mockReset();

    mockUseChecklistLogs.mockReturnValue({ data: [] });
    mockUseChecklists.mockReturnValue({ data: [] });
    mockUseLocations.mockReturnValue({ data: [] });
    mockUseActions.mockReturnValue({ data: [] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows a location card when logs exist for today", () => {
    mockUseLocations.mockReturnValue({
      data: [{ id: "loc-1", name: "Main Kitchen" }],
    });
    mockUseChecklistLogs.mockReturnValue({
      data: [
        {
          id: "log-1",
          checklist_id: "ck-1",
          checklist_title: "Opening Check",
          completed_by: "Ana",
          score: 88,
          answers: [],
          created_at: `${TODAY_STR}T08:00:00+00:00`,
          location_id: "loc-1",
          started_at: null,
        },
      ],
    });

    renderWithProviders(<Dashboard />);
    expect(screen.getByText("Main Kitchen")).toBeInTheDocument();
    expect(screen.getByText("Tap to review reporting →")).toBeInTheDocument();
  });

  it("shows 'No locations yet' when there are no locations configured", () => {
    renderWithProviders(<Dashboard />);
    expect(screen.getByText("No locations yet")).toBeInTheDocument();
  });

  it("navigates to reporting filtered to the location when a card is tapped", () => {
    mockUseLocations.mockReturnValue({
      data: [{ id: "loc-1", name: "Main Kitchen" }],
    });
    mockUseChecklistLogs.mockReturnValue({
      data: [
        {
          id: "log-1",
          checklist_id: "ck-1",
          checklist_title: "Opening Check",
          completed_by: "Ana",
          score: 88,
          answers: [],
          created_at: `${TODAY_STR}T08:00:00+00:00`,
          location_id: "loc-1",
          started_at: null,
        },
      ],
    });

    renderWithProviders(<Dashboard />);
    fireEvent.click(screen.getByTestId("location-card"));
    expect(mockNavigate).toHaveBeenCalledWith("/checklists?tab=reporting&location=loc-1");
  });

  it("shows no checklists assigned when a location has no checklist coverage", () => {
    mockUseLocations.mockReturnValue({
      data: [{ id: "loc-1", name: "Main Kitchen" }],
    });

    renderWithProviders(<Dashboard />);
    expect(screen.getByText("No checklists assigned")).toBeInTheDocument();
  });
});
