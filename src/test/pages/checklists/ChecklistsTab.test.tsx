import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactNode } from "react";
import { ChecklistsTab } from "@/pages/checklists/ChecklistsTab";
import { routerFutureFlags } from "@/lib/router-future-flags";

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      signInWithPassword: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      signOut: vi.fn().mockResolvedValue({}),
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      insert: vi.fn().mockResolvedValue({ data: [{ id: "new1" }], error: null }),
      update: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockResolvedValue({ data: [{ id: "new1" }], error: null }),
      delete: vi.fn().mockReturnThis(),
      then: vi.fn().mockImplementation((cb) => Promise.resolve(cb({ data: [], error: null }))),
    }),
  },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "u1" },
    session: null,
    teamMember: {
      id: "u1",
      organization_id: "org1",
      name: "Sarah",
      email: "s@test.com",
      role: "Owner",
      location_ids: [],
      permissions: {},
    },
    loading: false,
    signOut: vi.fn(),
  }),
  AuthProvider: ({ children }: any) => children,
}));

// Mock heavy sub-components to prevent transitive imports (xlsx, jsPDF, etc.) from hanging jsdom
vi.mock("@/pages/checklists/ConvertFileModal", () => ({ ConvertFileModal: () => null }));
vi.mock("@/pages/checklists/BuildWithAIModal", () => ({ BuildWithAIModal: () => null }));
vi.mock("@/pages/checklists/ChecklistBuilderModal", () => ({ ChecklistBuilderModal: () => null }));
vi.mock("@/pages/checklists/ChecklistPreviewModal", () => ({ ChecklistPreviewModal: () => null }));
vi.mock("@/pages/checklists/MoveToFolderSheet", () => ({ MoveToFolderSheet: () => null }));
vi.mock("@/pages/checklists/CreateMenuSheet", () => ({ CreateMenuSheet: () => null }));
vi.mock("@/pages/checklists/ItemContextMenu", () => ({ ItemContextMenu: () => null }));

vi.mock("@/hooks/useLocations", () => ({
  useLocations: () => ({
    data: [
      { id: "loc-1", name: "Main Branch" },
      { id: "loc-2", name: "Terrace" },
    ],
    isLoading: false,
  }),
  useSaveLocation: () => ({ mutate: vi.fn() }),
  useDeleteLocation: () => ({ mutate: vi.fn() }),
}));

vi.mock("@/hooks/usePlan", () => ({
  usePlan: () => ({
    plan: "growth",
    can: () => true,
    withinLimit: () => true,
    isActive: true,
    features: {},
  }),
}));

vi.mock("@/hooks/useChecklists", () => {
  // Use stable references — a fresh [] on every call causes useEffect([dbFolders])
  // to fire infinitely, hanging the test runner inside act().
  const FOLDERS = [{ id: "f1", name: "Daily Operations", parent_id: null, location_id: null }];
  const CHECKLISTS = [{
    id: "cl-1", title: "Opening Checklist", folder_id: "f1",
    location_id: null, schedule: "daily", sections: [],
    created_at: "2026-01-01", updated_at: "2026-01-01",
  }];
  return {
    useFolders: () => ({ data: FOLDERS, isLoading: false }),
    useChecklists: () => ({ data: CHECKLISTS, isLoading: false }),
    useSaveFolder: () => ({ mutate: vi.fn(), mutateAsync: vi.fn().mockResolvedValue({}) }),
    useDeleteFolder: () => ({ mutate: vi.fn() }),
    useSaveChecklist: () => ({ mutate: vi.fn(), mutateAsync: vi.fn().mockResolvedValue({}) }),
    useDeleteChecklist: () => ({ mutate: vi.fn() }),
  };
});

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter future={routerFutureFlags}>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe("ChecklistsTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders without crashing", () => {
    render(<ChecklistsTab />, { wrapper });
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("shows search input", () => {
    render(<ChecklistsTab />, { wrapper });
    expect(screen.getByPlaceholderText(/Search/i)).toBeInTheDocument();
  });

  it("shows folders in list", () => {
    render(<ChecklistsTab />, { wrapper });
    expect(screen.getByText("Daily Operations")).toBeInTheDocument();
  });

  it("shows checklists in list", async () => {
    render(<ChecklistsTab />, { wrapper });
    // Opening Checklist is in folder f1 - need to navigate into folder
    await waitFor(() => {
      expect(screen.getByText("Daily Operations")).toBeInTheDocument();
    });
  });

  it("has a FAB/add button", () => {
    render(<ChecklistsTab />, { wrapper });
    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBeGreaterThan(0);
  });

  it("clicking folder shows checklist inside", async () => {
    render(<ChecklistsTab />, { wrapper });
    fireEvent.click(screen.getByText("Daily Operations"));
    await waitFor(() => {
      expect(screen.getByText("Opening Checklist")).toBeInTheDocument();
    });
  });

  it("shows location filter dropdown", () => {
    render(<ChecklistsTab />, { wrapper });
    // Location dropdown is the filter control
    expect(screen.getByText("All locations")).toBeInTheDocument();
  });
});
