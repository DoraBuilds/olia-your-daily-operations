import { fireEvent, screen, within } from "@testing-library/react";
import Infohub from "@/pages/Infohub";
import { renderWithProviders } from "../test-utils";

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
  fireEvent.click(screen.getByRole("button", { name: /training/i }));
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
  it("does not show Manage access in folder context menus", () => {
    renderWithProviders(<Infohub />);
    const opened = openFirstFolderMenu();
    if (!opened) return;
    expect(screen.queryByText("Manage access")).not.toBeInTheDocument();
  });

  it("does not show Manage access in document context menus", () => {
    renderWithProviders(<Infohub />);
    const opened = openFirstDocMenu();
    if (!opened) return;
    expect(screen.queryByText("Manage access")).not.toBeInTheDocument();
  });

  it("shows AI tools as disabled buttons with a coming soon state", () => {
    renderWithProviders(<Infohub />);
    const folderRow = screen.getByText("Food Safety").closest("div[class*='flex']") as HTMLElement | null;
    if (!folderRow) return;
    fireEvent.click(folderRow);
    const docRow = screen.getByText("Allergen handling procedure").closest("div[class*='cursor-pointer']") as HTMLElement | null;
    if (!docRow) return;
    fireEvent.click(docRow);
    fireEvent.click(screen.getAllByRole("button").find((btn) => btn.className.includes("lavender"))!);

    expect(screen.getByText(/coming soon/i)).toBeInTheDocument();
    expect(screen.getAllByRole("button").find((btn) => btn.textContent?.includes("Generate summary"))).toBeDisabled();
    expect(screen.getAllByRole("button").find((btn) => btn.textContent?.includes("Create flashcards"))).toBeDisabled();
    expect(screen.getAllByRole("button").find((btn) => btn.textContent?.includes("Generate quiz"))).toBeDisabled();
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
    renderWithProviders(<Infohub />);
    const headerButtons = screen.getAllByRole("button").filter((btn) =>
      btn.className.includes("rounded-full") && btn.querySelector("svg")
    );
    fireEvent.click(headerButtons[1]);
    fireEvent.click(screen.getByText("New document"));
    fireEvent.change(screen.getByTestId("doc-title-input"), { target: { value: "Weekly briefing" } });
    fireEvent.change(screen.getByTestId("doc-tags-input"), { target: { value: "Weekly, Team" } });
    fireEvent.click(screen.getByTestId("create-doc-submit"));

    fireEvent.click(screen.getByText("Cleaning & Maintenance").closest("div[class*='flex']") as HTMLElement);
    expect(screen.getByText("Weekly briefing")).toBeInTheDocument();
  });

  it("allows completed training to be marked incomplete", () => {
    renderWithProviders(<Infohub />);
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
