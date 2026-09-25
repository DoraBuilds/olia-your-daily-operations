/**
 * Info Hub Filters popovers — separate Library/Training filters that keep the
 * folder structure: folder counts shrink, a folder lists only matching docs,
 * and the applied filters stay visible as chips inside folders.
 */
import { screen, fireEvent } from "@testing-library/react";
import Infohub from "@/pages/Infohub";
import { renderWithProviders } from "../test-utils";
import { DEFAULT_INFOHUB_ACCESS } from "@/lib/infohub-access";

vi.mock("@/hooks/useConcepts", () => ({
  useConcepts: () => ({ data: [{ id: "c1", name: "Bistro" }, { id: "c2", name: "Beach" }] }),
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
  useTeamMembers: () => ({ data: [
    { id: "u1", name: "Sarah", role: "Owner", is_owner: true, location_ids: [] },
    { id: "m1", name: "Maria", role: "Chef", is_owner: false, location_ids: ["loc-1"] },
    { id: "m2", name: "Jordi", role: "Waiter", is_owner: false, location_ids: ["loc-2"] },
  ] }),
}));

vi.mock("@/hooks/useLocations", () => ({
  useLocations: () => ({
    data: [
      { id: "loc-1", name: "Main Branch", concept_id: "c1" },
      { id: "loc-2", name: "Terrace", concept_id: "c2" },
    ],
  }),
}));

const org = DEFAULT_INFOHUB_ACCESS;
const restricted = (patch: object) => ({ ...DEFAULT_INFOHUB_ACCESS, accessScope: "restricted" as const, ...patch });

const LIB_FOLDERS = [
  { id: "f1", name: "Kitchen", parentId: null, sortOrder: 0, access: org },
  { id: "f2", name: "Terrace Only Folder", parentId: null, sortOrder: 1, access: restricted({ allowedLocationIds: ["loc-2"] }) },
];
const LIB_DOCS = [
  { id: "d1", title: "Allergen guide", summary: "", content: "", tags: ["safety"], lastUpdated: "1 Sep", folderId: "f1", access: org },
  { id: "d2", title: "Main Branch fridge rota", summary: "", content: "", tags: ["rota"], lastUpdated: "1 Sep", folderId: "f1", access: restricted({ allowedLocationIds: ["loc-1"] }) },
  { id: "d3", title: "Chef knife policy", summary: "", content: "", tags: [], lastUpdated: "1 Sep", folderId: "f1", access: restricted({ allowedRoles: ["Chef"] }), filePath: "x.pdf", fileType: "application/pdf" },
  { id: "d4", title: "Terrace opening", summary: "", content: "", tags: [], lastUpdated: "1 Sep", folderId: "f2", access: org },
];
const TRAIN_FOLDERS = [{ id: "t1", name: "Onboarding", parentId: null, sortOrder: 0, access: org }];
const TRAIN_DOCS = [
  { id: "m-a", title: "Welcome module", duration: "5 min", completed: false, folderId: "t1", steps: ["a"], access: org },
  { id: "m-b", title: "Bar safety module", duration: "5 min", completed: false, folderId: "t1", steps: ["a"], access: restricted({ allowedLocationIds: ["loc-2"] }) },
];

vi.mock("@/hooks/useInfohubContent", () => ({
  useInfohubContent: () => ({
    data: {
      libraryFolders: LIB_FOLDERS,
      libraryDocs: LIB_DOCS,
      archivedLibraryDocs: [],
      trainingFolders: TRAIN_FOLDERS,
      trainingDocs: TRAIN_DOCS,
    },
    createFolder: { mutate: vi.fn() },
    createDocument: { mutate: vi.fn() },
    updateFolder: { mutate: vi.fn() },
    updateDocument: { mutate: vi.fn() },
    deleteFolder: { mutate: vi.fn() },
    archiveDocument: { mutate: vi.fn() },
    restoreDocument: { mutate: vi.fn() },
    deleteArchivedDocument: { mutate: vi.fn() },
    reorderFolders: { mutate: vi.fn() },
  }),
}));

vi.mock("@/hooks/useTrainingProgress", () => ({
  useTrainingProgress: () => ({ data: [{ module_id: "m-a", is_completed: true }], saveProgress: { mutate: vi.fn() } }),
}));

const openFilters = () => fireEvent.click(screen.getByTestId("infohub-filters-toggle"));
const applyFilters = () => fireEvent.click(screen.getByTestId("infohub-apply-filters"));
const pick = (filter: string, option: string) => {
  fireEvent.click(screen.getByTestId(`infohub-${filter}-filter-trigger`));
  fireEvent.click(screen.getByTestId(`infohub-${filter}-filter-option-${option}`));
};

describe("Infohub Library filters", () => {
  it("shows full folder counts and no chips before filtering", () => {
    renderWithProviders(<Infohub />, { initialEntries: ["/infohub/library"] });
    expect(screen.getByText("3 documents")).toBeInTheDocument();
    expect(screen.queryByTestId("infohub-active-filters")).not.toBeInTheDocument();
  });

  it("shrinks folder counts by location, keeps everyone-docs, and shows only matches inside the folder", () => {
    renderWithProviders(<Infohub />, { initialEntries: ["/infohub/library"] });
    openFilters();
    pick("location", "loc-2");
    applyFilters();

    // Kitchen: allergen guide (everyone) + chef policy (Chefs may work at Terrace); not the Main Branch rota.
    expect(screen.getByText("2 documents")).toBeInTheDocument();
    expect(screen.getByText("Terrace Only Folder")).toBeInTheDocument();
    expect(screen.getByTestId("infohub-filters-count")).toHaveTextContent("1");

    fireEvent.click(screen.getByText("Kitchen"));
    expect(screen.getByText("Allergen guide")).toBeInTheDocument();
    expect(screen.getByText("Chef knife policy")).toBeInTheDocument();
    expect(screen.queryByText("Main Branch fridge rota")).not.toBeInTheDocument();
    expect(screen.getByTestId("infohub-active-filters")).toHaveTextContent("Terrace");
  });

  it("shows 0 for a folder whose own access excludes the filtered location", () => {
    renderWithProviders(<Infohub />, { initialEntries: ["/infohub/library"] });
    openFilters();
    pick("location", "loc-1");
    applyFilters();
    expect(screen.getByText("Terrace Only Folder")).toBeInTheDocument();
    expect(screen.getByText("0 documents")).toBeInTheDocument();
  });

  it("filters by concept via its locations", () => {
    renderWithProviders(<Infohub />, { initialEntries: ["/infohub/library"] });
    openFilters();
    pick("concept", "c1");
    applyFilters();
    fireEvent.click(screen.getByText("Kitchen"));
    expect(screen.getByText("Main Branch fridge rota")).toBeInTheDocument();
    expect(screen.getByTestId("infohub-active-filters")).toHaveTextContent("Bistro");
  });

  it("filters by team member using what they can actually see", () => {
    renderWithProviders(<Infohub />, { initialEntries: ["/infohub/library"] });
    openFilters();
    pick("member", "m2");
    applyFilters();
    fireEvent.click(screen.getByText("Kitchen"));
    expect(screen.getByText("Allergen guide")).toBeInTheDocument();
    expect(screen.queryByText("Chef knife policy")).not.toBeInTheDocument();
    expect(screen.queryByText("Main Branch fridge rota")).not.toBeInTheDocument();
  });

  it("filters by role, tag and type", () => {
    renderWithProviders(<Infohub />, { initialEntries: ["/infohub/library"] });
    openFilters();
    pick("role", "Waiter");
    applyFilters();
    fireEvent.click(screen.getByText("Kitchen"));
    expect(screen.queryByText("Chef knife policy")).not.toBeInTheDocument();
    expect(screen.getByText("Main Branch fridge rota")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("infohub-clear-all-filters"));
    openFilters();
    pick("tag", "safety");
    applyFilters();
    expect(screen.getByText("Allergen guide")).toBeInTheDocument();
    expect(screen.queryByText("Main Branch fridge rota")).not.toBeInTheDocument();
    expect(screen.getByTestId("infohub-active-filters")).toHaveTextContent("#safety");

    fireEvent.click(screen.getByLabelText("Remove filter: #safety"));
    openFilters();
    fireEvent.change(screen.getByTestId("infohub-type-filter"), { target: { value: "file" } });
    applyFilters();
    expect(screen.getByText("Chef knife policy")).toBeInTheDocument();
    expect(screen.queryByText("Allergen guide")).not.toBeInTheDocument();
  });

  it("discards staged edits when the popover is dismissed", () => {
    renderWithProviders(<Infohub />, { initialEntries: ["/infohub/library"] });
    openFilters();
    pick("location", "loc-1");
    fireEvent.keyDown(screen.getByTestId("infohub-filters-panel"), { key: "Escape" });
    expect(screen.getByText("3 documents")).toBeInTheDocument();
  });
});

describe("Infohub Training filters", () => {
  it("has its own fields and filters by progress and location", () => {
    renderWithProviders(<Infohub />, { initialEntries: ["/infohub/training"] });
    expect(screen.getByText("2 modules")).toBeInTheDocument();
    openFilters();
    expect(screen.queryByTestId("infohub-tag-filter-trigger")).not.toBeInTheDocument();
    fireEvent.change(screen.getByTestId("infohub-progress-filter"), { target: { value: "incomplete" } });
    applyFilters();
    expect(screen.getByText("1 module")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Onboarding"));
    expect(screen.getByText("Bar safety module")).toBeInTheDocument();
    expect(screen.queryByText("Welcome module")).not.toBeInTheDocument();
    expect(screen.getByTestId("infohub-active-filters")).toHaveTextContent("Not completed");
  });
});
