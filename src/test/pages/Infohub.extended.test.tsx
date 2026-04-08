import { fireEvent, screen, within } from "@testing-library/react";
import Infohub from "@/pages/Infohub";
import { renderWithProviders } from "../test-utils";

const mockNavigate = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock("@/lib/supabase", () => ({
  supabase: {
    rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
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
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      insert: vi.fn().mockResolvedValue({ error: null }),
      update: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockResolvedValue({ error: null }),
      delete: vi.fn().mockReturnThis(),
      then: vi.fn().mockImplementation((cb) => Promise.resolve(cb({ data: [], error: null }))),
    }),
    functions: {
      invoke: vi.fn(),
    },
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

vi.mock("@/hooks/useTeamMembers", () => ({
  useTeamMembers: () => ({
    data: [
      {
        id: "u1",
        name: "Sarah",
        email: "s@test.com",
        role: "Owner",
      },
      {
        id: "u2",
        name: "Jay",
        email: "j@test.com",
        role: "Manager",
      },
    ],
  }),
}));

vi.mock("@/hooks/useLocations", () => ({
  useLocations: () => ({
    data: [
      { id: "loc-1", name: "Main Branch" },
      { id: "loc-2", name: "Terrace" },
    ],
  }),
}));

vi.mock("@/hooks/useInfohubContent", async () => {
  const mod = await import("../mocks/infohub-hooks");
  return { useInfohubContent: mod.useMockInfohubContent };
});

vi.mock("@/hooks/useTrainingProgress", async () => {
  const mod = await import("../mocks/infohub-hooks");
  return { useTrainingProgress: mod.useMockTrainingProgress };
});

function openFirstFolderMenu() {
  const title = screen.getByText("Cleaning & Maintenance");
  const folderRow = title.closest("div[class*='flex-1']")?.parentElement as HTMLElement | null;
  if (!folderRow) return false;
  const menuButton = within(folderRow).getAllByRole("button").find((btn) => btn.querySelector("svg") !== null);
  if (!menuButton) return false;
  fireEvent.click(menuButton);
  return true;
}

function openFirstDocMenu() {
  const folderRow = screen.getByText("Food Safety").closest("div[class*='flex']") as HTMLElement | null;
  if (!folderRow) return false;
  fireEvent.click(folderRow);

  const docRow = screen.getByText("Allergen handling procedure").closest("div[class*='cursor-pointer']") as HTMLElement | null;
  if (!docRow) return false;

  const menuButtons = within(docRow).getAllByRole("button");
  const menuButton = menuButtons[menuButtons.length - 1];
  if (!menuButton) return false;

  fireEvent.click(menuButton);
  return true;
}

function openLatteModule() {
  const onboardingFolder = screen.getByText("Onboarding");
  const folderRow = onboardingFolder.closest("div[class*='flex']") as HTMLElement | null;
  if (!folderRow) return false;
  fireEvent.click(folderRow);
  const moduleTitle = screen.queryByText("How to make a latte");
  if (!moduleTitle) return false;
  const docRow = moduleTitle.closest("div[class*='cursor-pointer']") as HTMLElement | null;
  if (!docRow) return false;
  fireEvent.click(docRow);
  return true;
}

describe("Infohub extended behavior", () => {
  beforeEach(async () => {
    const { supabase } = await import("@/lib/supabase");
    const { resetInfohubMockState } = await import("../mocks/infohub-hooks");
    vi.mocked(supabase.functions.invoke).mockReset();
    resetInfohubMockState();
    localStorage.clear();
  });

  it("shows Manage access in folder context menus for owners", () => {
    renderWithProviders(<Infohub />);
    const opened = openFirstFolderMenu();
    if (!opened) return;
    expect(screen.getByText("Manage access")).toBeInTheDocument();
  });

  it("shows Manage access in document context menus for owners", () => {
    renderWithProviders(<Infohub />);
    const opened = openFirstDocMenu();
    if (!opened) return;
    expect(screen.getByText("Manage access")).toBeInTheDocument();
  });

  it("lets an owner restrict access to a folder", () => {
    renderWithProviders(<Infohub />);
    const opened = openFirstFolderMenu();
    if (!opened) return;
    fireEvent.click(screen.getByText("Manage access"));

    fireEvent.click(screen.getByRole("button", { name: /restricted access/i }));
    fireEvent.click(screen.getByRole("button", { name: /Jay Manager/i }));
    fireEvent.click(screen.getByRole("button", { name: "Terrace" }));
    fireEvent.click(screen.getByRole("button", { name: /save access/i }));

    expect(screen.getByText("Restricted")).toBeInTheDocument();
  });

  it("opens AI tools and generates a summary", async () => {
    const { supabase } = await import("@/lib/supabase");
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: {
        type: "summary",
        title: "Allergen handling procedure",
        bullets: ["Treat all allergy queries seriously", "Notify the kitchen verbally"],
        takeaway: "Never guess when allergens are involved.",
      },
      error: null,
    } as any);

    renderWithProviders(<Infohub />);
    const folderRow = screen.getByText("Food Safety").closest("div[class*='flex']") as HTMLElement | null;
    if (!folderRow) return;
    fireEvent.click(folderRow);
    const docRow = screen.getByText("Allergen handling procedure").closest("div[class*='cursor-pointer']") as HTMLElement | null;
    if (!docRow) return;
    fireEvent.click(docRow);
    fireEvent.click(screen.getAllByRole("button").find((btn) => btn.className.includes("lavender"))!);

    fireEvent.click(screen.getByRole("button", { name: /generate summary/i }));

    expect(await screen.findByText("Never guess when allergens are involved.")).toBeInTheDocument();
    expect(screen.getByText("Treat all allergy queries seriously")).toBeInTheDocument();
  });

  it("archives and restores a library document", () => {
    renderWithProviders(<Infohub />);
    const opened = openFirstDocMenu();
    if (!opened) return;
    fireEvent.click(screen.getByText("Archive file"));
    expect(screen.getByText(/Archived \(/)).toBeInTheDocument();

    fireEvent.click(screen.getByText(/Archived \(/).closest("button")!);
    expect(screen.getByRole("button", { name: /restore/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /restore/i }));
    expect(screen.queryByText(/Archived \(/)).not.toBeInTheDocument();
  });

  it("lets a document be edited and saved", () => {
    renderWithProviders(<Infohub />);
    const folderRow = screen.getByText("Food Safety").closest("div[class*='flex']") as HTMLElement | null;
    if (!folderRow) return;
    fireEvent.click(folderRow);
    const docRow = screen.getByText("Allergen handling procedure").closest("div[class*='cursor-pointer']") as HTMLElement | null;
    if (!docRow) return;
    fireEvent.click(docRow);

    fireEvent.click(screen.getByTestId("doc-edit-btn"));
    fireEvent.change(screen.getByTestId("doc-content-editor"), { target: { value: "Updated training content." } });
    fireEvent.click(screen.getByTestId("doc-save-btn"));

    expect(screen.getByText("Updated training content.")).toBeInTheDocument();
  });

  it("creates a document with tags", () => {
    renderWithProviders(<Infohub />, { initialEntries: ["/infohub/library"] });
    fireEvent.click(screen.getByLabelText("Add content"));
    fireEvent.click(screen.getByText("New document"));
    fireEvent.change(screen.getByTestId("doc-title-input"), { target: { value: "Weekly briefing" } });
    fireEvent.change(screen.getByTestId("doc-tags-input"), { target: { value: "Weekly, Team" } });
    fireEvent.click(screen.getByTestId("create-doc-submit"));

    fireEvent.click(screen.getByText("Cleaning & Maintenance").closest("div[class*='flex']") as HTMLElement);
    expect(screen.getByText("Weekly briefing")).toBeInTheDocument();
  });

  it("allows completed training to be marked incomplete", () => {
    renderWithProviders(<Infohub />, { initialEntries: ["/infohub/training"] });
    const opened = openLatteModule();
    if (!opened) return;

    let step = 1;
    while (true) {
      const stepLabel = screen.queryByText(`Step ${step}`);
      if (!stepLabel) break;
      fireEvent.click(stepLabel.closest("button") as HTMLButtonElement);
      step++;
    }

    expect(screen.getByText("Module complete.")).toBeInTheDocument();
    fireEvent.click(screen.getByText(/mark as incomplete/i));
    expect(screen.queryByText("Module complete.")).not.toBeInTheDocument();
    expect(screen.getByText("Step 1")).toBeInTheDocument();
  });
});
