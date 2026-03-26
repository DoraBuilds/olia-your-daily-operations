import { fireEvent, screen } from "@testing-library/react";
import Dashboard from "@/pages/Dashboard";
import { renderWithProviders } from "../test-utils";

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

const OVERDUE_CHECKLIST = {
  id: "ck-overdue",
  title: "Morning Kitchen Check",
  due_time: "09:00",
  folder_id: null,
  location_id: null,
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
  location_id: null,
  schedule: null,
  sections: [],
  time_of_day: "evening" as const,
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
  location_id: null,
  started_at: null,
};

describe("Dashboard - overdue tab", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(`${TODAY_STR}T14:00:00`));

    mockUseChecklistLogs.mockReturnValue({ data: [] });
    mockUseChecklists.mockReturnValue({ data: [] });
    mockUseLocations.mockReturnValue({ data: [] });
    mockUseActions.mockReturnValue({ data: [] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function clickOverdueTab() {
    const button = screen.getByTestId("compliance-tab-overdue");
    fireEvent.click(button);
  }

  it("shows 'All caught up' when no missed checklists and no overdue actions", () => {
    renderWithProviders(<Dashboard />);
    clickOverdueTab();
    expect(screen.getByText("All caught up")).toBeInTheDocument();
  });

  it("shows a missed checklist when due_time passed and no log exists today", () => {
    mockUseChecklists.mockReturnValue({ data: [OVERDUE_CHECKLIST] });

    renderWithProviders(<Dashboard />);
    clickOverdueTab();

    expect(screen.getByText("Morning Kitchen Check")).toBeInTheDocument();
    expect(screen.getByText(/Due by 09:00/)).toBeInTheDocument();
    expect(screen.getByText(/not completed/)).toBeInTheDocument();
  });

  it("does not show a missed checklist when a log exists for today", () => {
    mockUseChecklists.mockReturnValue({ data: [OVERDUE_CHECKLIST] });
    mockUseChecklistLogs.mockReturnValue({ data: [LOG_TODAY] });

    renderWithProviders(<Dashboard />);
    clickOverdueTab();

    expect(screen.queryByText("Morning Kitchen Check")).not.toBeInTheDocument();
    expect(screen.getByText("All caught up")).toBeInTheDocument();
  });

  it("does not show a checklist whose due_time has not passed yet", () => {
    mockUseChecklists.mockReturnValue({ data: [FUTURE_CHECKLIST] });

    renderWithProviders(<Dashboard />);
    clickOverdueTab();

    expect(screen.queryByText("Evening Closing Check")).not.toBeInTheDocument();
    expect(screen.getByText("All caught up")).toBeInTheDocument();
  });

  it("shows a combined badge count for missed checklists and overdue actions", () => {
    mockUseChecklists.mockReturnValue({ data: [OVERDUE_CHECKLIST, FUTURE_CHECKLIST] });
    mockUseActions.mockReturnValue({
      data: [
        {
          id: "a1",
          title: "Fix fridge",
          status: "open",
          due: "2026-03-25",
          checklist_title: null,
          assigned_to: null,
        },
        {
          id: "a2",
          title: "Done task",
          status: "resolved",
          due: "2026-03-25",
          checklist_title: null,
          assigned_to: null,
        },
      ],
    });

    renderWithProviders(<Dashboard />);

    const badge = document.querySelector(".bg-status-error.text-white");
    expect(badge?.textContent?.trim()).toBe("2");
  });
});

describe("Dashboard - location compliance cards", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(`${TODAY_STR}T14:00:00`));

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
    expect(screen.getByText("Tap to drill in →")).toBeInTheDocument();
  });

  it("shows 'No submissions yet' when no logs exist for today", () => {
    renderWithProviders(<Dashboard />);
    expect(screen.getByText("No submissions yet")).toBeInTheDocument();
  });

  it("drills into a location to show its checklists", () => {
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
    expect(screen.getByText("Opening Check")).toBeInTheDocument();
    expect(screen.getByText("Main Kitchen")).toBeInTheDocument();
  });

  it("returns from drill-down to location cards", () => {
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
    fireEvent.click(screen.getByRole("button", { name: /back to locations/i }));

    expect(screen.getByText("Daily compliance")).toBeInTheDocument();
    expect(screen.getByText("Tap to drill in →")).toBeInTheDocument();
  });
});
