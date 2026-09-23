/**
 * Concept-scoping coverage for ChecklistsTab — verifies the sidebar's concept
 * dropdown (ConceptFilterContext.scopedLocationIds) narrows:
 *  - the Filters popover's concept/location options
 *  - which checklists are listed (org-wide/unassigned checklists always stay visible)
 * plus the Filters popover itself (concept/location/department/status, Apply/Clear).
 */
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactNode } from "react";
import { ChecklistsTab } from "@/pages/checklists/ChecklistsTab";
import { routerFutureFlags } from "@/lib/router-future-flags";

const conceptFilterState: { scopedLocationIds: string[] | null; selectedConceptId: string } = {
  scopedLocationIds: null,
  selectedConceptId: "all",
};

vi.mock("@/contexts/ConceptFilterContext", () => ({
  ALL_CONCEPTS: "all",
  useConceptFilter: () => ({
    concepts: [
      { id: "concept-1", name: "Concept One" },
      { id: "concept-2", name: "Concept Two" },
    ],
    selectedConceptId: conceptFilterState.selectedConceptId,
    setSelectedConceptId: () => {},
    scopedLocationIds: conceptFilterState.scopedLocationIds,
  }),
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useBlocker: () => ({ state: "unblocked", proceed: vi.fn(), reset: vi.fn() }),
  };
});

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
      in: vi.fn().mockReturnThis(),
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
      { id: "loc-1", name: "Main Branch", concept_id: "concept-1" },
      { id: "loc-2", name: "Terrace", concept_id: "concept-2" },
    ],
    isLoading: false,
  }),
  useSaveLocation: () => ({ mutate: vi.fn() }),
  useDeleteLocation: () => ({ mutate: vi.fn() }),
}));

vi.mock("@/hooks/useDepartments", () => ({
  useDepartmentsForLocations: (locationIds: string[]) => ({
    data: [
      { id: "dept-kitchen", location_id: "loc-1", name: "Kitchen" },
      { id: "dept-bar", location_id: "loc-2", name: "Bar" },
    ].filter(d => locationIds.includes(d.location_id)),
    isLoading: false,
    isFetching: false,
  }),
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
  const FOLDERS: any[] = [{ id: "folder-1", name: "Bar Folder", parent_id: null, sort_order: 0 }];
  const CHECKLISTS = [{
    id: "cl-1", title: "Main Branch Only", folder_id: null,
    location_id: "loc-1", location_ids: null, schedule: "daily", sections: [],
    is_published: true,
    created_at: "2026-01-01", updated_at: "2026-01-01",
  }, {
    id: "cl-2", title: "Terrace Only", folder_id: null,
    location_id: "loc-2", location_ids: null, schedule: "daily", sections: [],
    department_ids: ["dept-bar"],
    is_published: false,
    created_at: "2026-01-02", updated_at: "2026-01-02",
  }, {
    id: "cl-3", title: "Org Wide Checklist", folder_id: null,
    location_id: null, location_ids: null, concept_id: null, schedule: null, sections: [],
    is_published: true,
    created_at: "2026-01-03", updated_at: "2026-01-03",
  }, {
    id: "cl-4", title: "Concept 1 Wide Checklist", folder_id: null,
    location_id: null, location_ids: null, concept_id: "concept-1", schedule: null, sections: [],
    is_published: true,
    created_at: "2026-01-04", updated_at: "2026-01-04",
  }, {
    id: "cl-5", title: "Kitchen Close In Folder", folder_id: "folder-1",
    location_id: null, location_ids: ["loc-1"], concept_id: "concept-1", schedule: null, sections: [],
    department_ids: ["dept-kitchen"],
    is_published: true,
    created_at: "2026-01-05", updated_at: "2026-01-05",
  }];
  return {
    useFolders: () => ({ data: FOLDERS, isLoading: false }),
    useChecklists: () => ({ data: CHECKLISTS, isLoading: false }),
    useSaveFolder: () => ({ mutate: vi.fn(), mutateAsync: vi.fn().mockResolvedValue({}) }),
    useDeleteFolder: () => ({ mutate: vi.fn() }),
    useReorderFolders: () => ({ mutate: vi.fn() }),
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

function openFilters() {
  fireEvent.click(screen.getByTestId("checklists-filters-toggle"));
}

function applyFilters() {
  fireEvent.click(screen.getByTestId("checklists-apply-filters"));
}

describe("ChecklistsTab concept scoping", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    conceptFilterState.scopedLocationIds = null;
    conceptFilterState.selectedConceptId = "all";
  });

  it("lists every checklist and location when no concept is selected", () => {
    render(<ChecklistsTab />, { wrapper });
    expect(screen.getByText("Main Branch Only")).toBeInTheDocument();
    expect(screen.getByText("Terrace Only")).toBeInTheDocument();
    expect(screen.getByText("Org Wide Checklist")).toBeInTheDocument();
  });

  it("narrows the Filters popover's concept and location options to the selected concept", () => {
    conceptFilterState.scopedLocationIds = ["loc-1"];
    conceptFilterState.selectedConceptId = "concept-1";
    render(<ChecklistsTab />, { wrapper });
    openFilters();
    fireEvent.click(screen.getByTestId("checklists-location-filter-trigger"));
    expect(screen.getByTestId("checklists-location-filter-option-loc-1")).toBeInTheDocument();
    expect(screen.queryByTestId("checklists-location-filter-option-loc-2")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("checklists-concept-filter-trigger"));
    expect(screen.getByTestId("checklists-concept-filter-option-concept-1")).toBeInTheDocument();
    expect(screen.queryByTestId("checklists-concept-filter-option-concept-2")).not.toBeInTheDocument();
  });

  it("hides checklists assigned to a location outside the selected concept", () => {
    conceptFilterState.scopedLocationIds = ["loc-1"];
    render(<ChecklistsTab />, { wrapper });
    expect(screen.getByText("Main Branch Only")).toBeInTheDocument();
    expect(screen.queryByText("Terrace Only")).not.toBeInTheDocument();
  });

  it("keeps an org-wide (unassigned) checklist visible even when a concept is selected", () => {
    conceptFilterState.scopedLocationIds = ["loc-1"];
    render(<ChecklistsTab />, { wrapper });
    expect(screen.getByText("Org Wide Checklist")).toBeInTheDocument();
  });

  it("shows a concept-scoped 'all locations' checklist under its own concept", () => {
    conceptFilterState.scopedLocationIds = ["loc-1"];
    conceptFilterState.selectedConceptId = "concept-1";
    render(<ChecklistsTab />, { wrapper });
    expect(screen.getByText("Concept 1 Wide Checklist")).toBeInTheDocument();
  });

  it("hides a concept-scoped 'all locations' checklist under a different concept", () => {
    conceptFilterState.scopedLocationIds = ["loc-2"];
    conceptFilterState.selectedConceptId = "concept-2";
    render(<ChecklistsTab />, { wrapper });
    expect(screen.queryByText("Concept 1 Wide Checklist")).not.toBeInTheDocument();
  });
});

describe("ChecklistsTab Filters popover", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    conceptFilterState.scopedLocationIds = null;
    conceptFilterState.selectedConceptId = "all";
  });

  it("keeps the folder view and no badge when no filters are applied", () => {
    render(<ChecklistsTab />, { wrapper });
    expect(screen.getByText("Bar Folder")).toBeInTheDocument();
    expect(screen.queryByText("Kitchen Close In Folder")).not.toBeInTheDocument();
    expect(screen.queryByTestId("checklists-filters-count")).not.toBeInTheDocument();
  });

  it("filters by concept across folders, keeping org-wide checklists", () => {
    render(<ChecklistsTab />, { wrapper });
    openFilters();
    fireEvent.click(screen.getByTestId("checklists-concept-filter-trigger"));
    fireEvent.click(screen.getByTestId("checklists-concept-filter-option-concept-1"));
    applyFilters();

    expect(screen.getByText("Main Branch Only")).toBeInTheDocument();
    expect(screen.getByText("Concept 1 Wide Checklist")).toBeInTheDocument();
    expect(screen.getByText("Org Wide Checklist")).toBeInTheDocument();
    expect(screen.getByText("Kitchen Close In Folder")).toBeInTheDocument();
    expect(screen.queryByText("Terrace Only")).not.toBeInTheDocument();
    expect(screen.queryByText("Bar Folder")).not.toBeInTheDocument();
    expect(screen.getByTestId("checklists-filters-count")).toHaveTextContent("1");
  });

  it("filters by location", () => {
    render(<ChecklistsTab />, { wrapper });
    openFilters();
    fireEvent.click(screen.getByTestId("checklists-location-filter-trigger"));
    fireEvent.click(screen.getByTestId("checklists-location-filter-option-loc-2"));
    applyFilters();

    expect(screen.getByText("Terrace Only")).toBeInTheDocument();
    expect(screen.getByText("Org Wide Checklist")).toBeInTheDocument();
    expect(screen.queryByText("Main Branch Only")).not.toBeInTheDocument();
    expect(screen.queryByText("Concept 1 Wide Checklist")).not.toBeInTheDocument();
  });

  it("filters by department, keeping checklists with no departments set", () => {
    render(<ChecklistsTab />, { wrapper });
    openFilters();
    fireEvent.click(screen.getByTestId("checklists-department-filter-trigger"));
    fireEvent.click(screen.getByTestId("checklists-department-filter-option-dept-kitchen"));
    applyFilters();

    expect(screen.getByText("Kitchen Close In Folder")).toBeInTheDocument();
    expect(screen.getByText("Main Branch Only")).toBeInTheDocument();
    expect(screen.queryByText("Terrace Only")).not.toBeInTheDocument();
  });

  it("filters by published / draft status", () => {
    render(<ChecklistsTab />, { wrapper });
    openFilters();
    fireEvent.change(screen.getByTestId("checklists-status-filter"), { target: { value: "draft" } });
    applyFilters();
    expect(screen.getByText("Terrace Only")).toBeInTheDocument();
    expect(screen.queryByText("Main Branch Only")).not.toBeInTheDocument();

    openFilters();
    fireEvent.change(screen.getByTestId("checklists-status-filter"), { target: { value: "published" } });
    applyFilters();
    expect(screen.queryByText("Terrace Only")).not.toBeInTheDocument();
    expect(screen.getByText("Main Branch Only")).toBeInTheDocument();
  });

  it("discards staged edits when the popover is dismissed without Apply", () => {
    render(<ChecklistsTab />, { wrapper });
    openFilters();
    fireEvent.change(screen.getByTestId("checklists-status-filter"), { target: { value: "draft" } });
    fireEvent.keyDown(screen.getByTestId("checklists-filters-panel"), { key: "Escape" });

    expect(screen.getByText("Main Branch Only")).toBeInTheDocument();
    expect(screen.queryByTestId("checklists-filters-count")).not.toBeInTheDocument();
  });

  it("Clear filters resets the draft, restoring the folder view on Apply", () => {
    render(<ChecklistsTab />, { wrapper });
    openFilters();
    fireEvent.change(screen.getByTestId("checklists-status-filter"), { target: { value: "draft" } });
    applyFilters();
    expect(screen.queryByText("Bar Folder")).not.toBeInTheDocument();

    openFilters();
    fireEvent.click(screen.getByTestId("checklists-clear-filters"));
    applyFilters();
    expect(screen.getByText("Bar Folder")).toBeInTheDocument();
    expect(screen.getByText("Main Branch Only")).toBeInTheDocument();
  });

  it("shows a no-results message when nothing matches", () => {
    render(<ChecklistsTab />, { wrapper });
    openFilters();
    fireEvent.click(screen.getByTestId("checklists-location-filter-trigger"));
    fireEvent.click(screen.getByTestId("checklists-location-filter-option-loc-1"));
    fireEvent.change(screen.getByTestId("checklists-status-filter"), { target: { value: "draft" } });
    applyFilters();

    expect(screen.getByTestId("checklists-no-results")).toHaveTextContent("No checklists match your filters.");
  });
});
