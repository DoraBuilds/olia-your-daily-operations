/**
 * Concept-scoping coverage for ChecklistsTab — verifies the sidebar's concept
 * dropdown (ConceptFilterContext.scopedLocationIds) narrows:
 *  - the in-page location filter dropdown's options
 *  - which checklists are listed (org-wide/unassigned checklists always stay visible)
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
    concepts: [],
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
  const FOLDERS: any[] = [];
  const CHECKLISTS = [{
    id: "cl-1", title: "Main Branch Only", folder_id: null,
    location_id: "loc-1", location_ids: null, schedule: "daily", sections: [],
    is_published: true,
    created_at: "2026-01-01", updated_at: "2026-01-01",
  }, {
    id: "cl-2", title: "Terrace Only", folder_id: null,
    location_id: "loc-2", location_ids: null, schedule: "daily", sections: [],
    is_published: true,
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

  it("narrows the location filter dropdown to the selected concept's locations", () => {
    conceptFilterState.scopedLocationIds = ["loc-1"];
    render(<ChecklistsTab />, { wrapper });
    fireEvent.click(screen.getByText("All locations"));
    expect(screen.getByText("Main Branch")).toBeInTheDocument();
    expect(screen.queryByText("Terrace")).not.toBeInTheDocument();
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
