/**
 * Concept-scoping coverage for Infohub — verifies the sidebar's concept
 * dropdown (ConceptFilterContext.scopedLocationIds) narrows folders/docs:
 *  - a folder restricted to a specific location outside the scope is hidden
 *  - a folder restricted to a location inside the scope stays visible
 *  - an "org" scoped folder stays visible regardless of concept
 *  - a folder restricted by role only (no allowedLocationIds) isn't tied to
 *    any concept, so it stays visible regardless of scope
 *
 * The team member here is an owner, so the pre-existing
 * canAccessInfohubContent() permission gate always passes — isolating the
 * new concept-scoping filter (inConceptScope) as the only thing under test.
 */
import { screen } from "@testing-library/react";
import Infohub from "@/pages/Infohub";
import { renderWithProviders } from "../test-utils";
import { DEFAULT_INFOHUB_ACCESS } from "@/lib/infohub-access";

const conceptFilterState: { scopedLocationIds: string[] | null } = { scopedLocationIds: null };

vi.mock("@/contexts/ConceptFilterContext", () => ({
  ALL_CONCEPTS: "all",
  useConceptFilter: () => ({
    concepts: [],
    selectedConceptId: "all",
    setSelectedConceptId: () => {},
    scopedLocationIds: conceptFilterState.scopedLocationIds,
  }),
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => vi.fn() };
});

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    }),
    functions: { invoke: vi.fn() },
  },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "u1" },
    session: null,
    // is_owner: true short-circuits canAccessInfohubContent to always allow,
    // so only the new concept-scope filter determines visibility below.
    teamMember: { id: "u1", organization_id: "org1", name: "Sarah", email: "s@test.com", role: "Owner", is_owner: true, location_ids: [], permissions: {} },
    loading: false,
    signOut: vi.fn(),
  }),
  AuthProvider: ({ children }: any) => children,
}));

vi.mock("@/hooks/useTeamMembers", () => ({
  useTeamMembers: () => ({ data: [{ id: "u1", name: "Sarah", role: "Owner" }] }),
}));

vi.mock("@/hooks/useLocations", () => ({
  useLocations: () => ({
    data: [
      { id: "loc-1", name: "Main Branch" },
      { id: "loc-2", name: "Terrace" },
    ],
  }),
}));

const MOCK_FOLDERS = [
  { id: "f1", name: "Main Branch Docs", parentId: null, sortOrder: 0, access: { ...DEFAULT_INFOHUB_ACCESS, accessScope: "restricted" as const, allowedLocationIds: ["loc-1"] } },
  { id: "f2", name: "Terrace Docs", parentId: null, sortOrder: 1, access: { ...DEFAULT_INFOHUB_ACCESS, accessScope: "restricted" as const, allowedLocationIds: ["loc-2"] } },
  { id: "f3", name: "Company Wide Docs", parentId: null, sortOrder: 2, access: { ...DEFAULT_INFOHUB_ACCESS, accessScope: "org" as const } },
  { id: "f4", name: "Manager Only Docs", parentId: null, sortOrder: 3, access: { ...DEFAULT_INFOHUB_ACCESS, accessScope: "restricted" as const, allowedRoles: ["Manager"] } },
];

vi.mock("@/hooks/useInfohubContent", () => ({
  useInfohubContent: () => ({
    data: {
      libraryFolders: MOCK_FOLDERS,
      libraryDocs: [],
      archivedLibraryDocs: [],
      trainingFolders: [],
      trainingDocs: [],
    },
    createFolder: { mutate: vi.fn() },
    createDocument: { mutate: vi.fn() },
    updateFolder: { mutate: vi.fn() },
    updateDocument: { mutate: vi.fn() },
    deleteFolder: { mutate: vi.fn() },
    archiveDocument: { mutate: vi.fn() },
    restoreDocument: { mutate: vi.fn() },
    reorderFolders: { mutate: vi.fn() },
  }),
}));

vi.mock("@/hooks/useTrainingProgress", () => ({
  useTrainingProgress: () => ({ data: [], saveProgress: { mutate: vi.fn() } }),
}));

describe("Infohub concept scoping", () => {
  beforeEach(() => {
    conceptFilterState.scopedLocationIds = null;
  });

  it("shows every folder when no concept is selected", () => {
    renderWithProviders(<Infohub />, { initialEntries: ["/infohub/library"] });
    expect(screen.getByText("Main Branch Docs")).toBeInTheDocument();
    expect(screen.getByText("Terrace Docs")).toBeInTheDocument();
    expect(screen.getByText("Company Wide Docs")).toBeInTheDocument();
    expect(screen.getByText("Manager Only Docs")).toBeInTheDocument();
  });

  it("hides a folder restricted to a location outside the selected concept", () => {
    conceptFilterState.scopedLocationIds = ["loc-1"];
    renderWithProviders(<Infohub />, { initialEntries: ["/infohub/library"] });
    expect(screen.queryByText("Terrace Docs")).not.toBeInTheDocument();
  });

  it("keeps a folder restricted to a location inside the selected concept", () => {
    conceptFilterState.scopedLocationIds = ["loc-1"];
    renderWithProviders(<Infohub />, { initialEntries: ["/infohub/library"] });
    expect(screen.getByText("Main Branch Docs")).toBeInTheDocument();
  });

  it("keeps an org-wide folder visible regardless of the selected concept", () => {
    conceptFilterState.scopedLocationIds = ["loc-1"];
    renderWithProviders(<Infohub />, { initialEntries: ["/infohub/library"] });
    expect(screen.getByText("Company Wide Docs")).toBeInTheDocument();
  });

  it("keeps a role-restricted (not location-restricted) folder visible regardless of the selected concept", () => {
    conceptFilterState.scopedLocationIds = ["loc-1"];
    renderWithProviders(<Infohub />, { initialEntries: ["/infohub/library"] });
    expect(screen.getByText("Manager Only Docs")).toBeInTheDocument();
  });
});
