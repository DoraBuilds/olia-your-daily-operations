import { screen, fireEvent } from "@testing-library/react";
import SOPs from "@/pages/SOPs";
import { renderWithProviders } from "../test-utils";

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
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      insert: vi.fn().mockResolvedValue({ error: null }),
      update: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockResolvedValue({ error: null }),
      delete: vi.fn().mockReturnThis(),
      then: vi.fn().mockImplementation(cb => Promise.resolve(cb({ data: [], error: null }))),
    }),
  },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "u1" },
    session: null,
    teamMember: { id: "u1", organization_id: "org1", name: "Sarah", email: "s@test.com", role: "Owner", location_ids: [], permissions: {} },
    loading: false,
    signOut: vi.fn(),
  }),
  AuthProvider: ({ children }: any) => children,
}));

describe("SOPs page", () => {
  it("renders without crashing", () => {
    renderWithProviders(<SOPs />);
    expect(document.body).toBeDefined();
  });

  it("shows the page title 'SOP Library'", () => {
    renderWithProviders(<SOPs />);
    expect(screen.getByText("SOP Library")).toBeInTheDocument();
  });

  it("shows subtitle 'Standard operating procedures'", () => {
    renderWithProviders(<SOPs />);
    expect(screen.getByText("Standard operating procedures")).toBeInTheDocument();
  });

  it("shows 'Add' button in header", () => {
    renderWithProviders(<SOPs />);
    expect(screen.getByText("Add")).toBeInTheDocument();
  });

  it("shows search input with placeholder 'Search procedures...'", () => {
    renderWithProviders(<SOPs />);
    expect(screen.getByPlaceholderText("Search procedures...")).toBeInTheDocument();
  });

  it("shows category filter tabs: All, Food Safety, Opening & Closing, Cleaning, Service", () => {
    renderWithProviders(<SOPs />);
    expect(screen.getByRole("button", { name: /^All$/ })).toBeInTheDocument();
    // Use getAllByText for buttons that may appear multiple times
    expect(screen.getAllByText(/^Food Safety$/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Opening & Closing/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/^Cleaning$/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/^Service$/i).length).toBeGreaterThan(0);
  });

  it("shows SOP items in the list", () => {
    renderWithProviders(<SOPs />);
    expect(screen.getByText("Food Temperature Monitoring")).toBeInTheDocument();
  });

  it("shows 'HACCP Compliance Basics' SOP", () => {
    renderWithProviders(<SOPs />);
    expect(screen.getByText("HACCP Compliance Basics")).toBeInTheDocument();
  });

  it("shows 'Opening Duties — Kitchen' SOP", () => {
    renderWithProviders(<SOPs />);
    expect(screen.getByText("Opening Duties — Kitchen")).toBeInTheDocument();
  });

  it("shows 'Closing Duties — Full Team' SOP", () => {
    renderWithProviders(<SOPs />);
    expect(screen.getByText("Closing Duties — Full Team")).toBeInTheDocument();
  });

  it("shows 'Deep Clean Protocol' SOP", () => {
    renderWithProviders(<SOPs />);
    expect(screen.getByText("Deep Clean Protocol")).toBeInTheDocument();
  });

  it("shows 'Service & Allergen Standards' SOP", () => {
    renderWithProviders(<SOPs />);
    expect(screen.getByText("Service & Allergen Standards")).toBeInTheDocument();
  });

  it("SOP items show category labels", () => {
    renderWithProviders(<SOPs />);
    // Multiple "Food Safety" labels appear (both category filter and inline badges)
    const foodSafetyLabels = screen.getAllByText(/food safety/i);
    expect(foodSafetyLabels.length).toBeGreaterThan(0);
  });

  it("SOP items show 'AI Quiz' indicator when hasQuiz is true", () => {
    renderWithProviders(<SOPs />);
    const quizIndicators = screen.getAllByText("AI Quiz");
    expect(quizIndicators.length).toBeGreaterThan(0);
  });

  it("SOP items show 'Attachment' indicator when hasAttachment is true", () => {
    renderWithProviders(<SOPs />);
    const attachmentIndicators = screen.getAllByText("Attachment");
    expect(attachmentIndicators.length).toBeGreaterThan(0);
  });

  it("clicking a SOP item opens the detail view", () => {
    renderWithProviders(<SOPs />);
    const sopItem = screen.getByText("Food Temperature Monitoring");
    const sopBtn = sopItem.closest("button") as HTMLElement;
    if (sopBtn) {
      fireEvent.click(sopBtn);
      // Detail view shows the title and a Back button
      expect(screen.getByText("Back")).toBeInTheDocument();
    }
  });

  it("SOP detail view shows the SOP title", () => {
    renderWithProviders(<SOPs />);
    const sopItem = screen.getByText("Food Temperature Monitoring");
    const sopBtn = sopItem.closest("button") as HTMLElement;
    if (sopBtn) {
      fireEvent.click(sopBtn);
      expect(screen.getAllByText("Food Temperature Monitoring").length).toBeGreaterThan(0);
    }
  });

  it("SOP detail view shows 'Procedure steps' section", () => {
    renderWithProviders(<SOPs />);
    const sopItem = screen.getByText("Food Temperature Monitoring");
    const sopBtn = sopItem.closest("button") as HTMLElement;
    if (sopBtn) {
      fireEvent.click(sopBtn);
      expect(screen.getByText("Procedure steps")).toBeInTheDocument();
    }
  });

  it("SOP detail view shows attachment when hasAttachment is true", () => {
    renderWithProviders(<SOPs />);
    const sopItem = screen.getByText("Food Temperature Monitoring");
    const sopBtn = sopItem.closest("button") as HTMLElement;
    if (sopBtn) {
      fireEvent.click(sopBtn);
      expect(screen.getByText("Attached document")).toBeInTheDocument();
    }
  });

  it("SOP detail view shows linked checklist when available", () => {
    renderWithProviders(<SOPs />);
    const sopItem = screen.getByText("Food Temperature Monitoring");
    const sopBtn = sopItem.closest("button") as HTMLElement;
    if (sopBtn) {
      fireEvent.click(sopBtn);
      expect(screen.getByText("Linked checklist")).toBeInTheDocument();
      expect(screen.getByText("Opening Checklist")).toBeInTheDocument();
    }
  });

  it("SOP detail view shows 'AI Knowledge Check' when hasQuiz is true", () => {
    renderWithProviders(<SOPs />);
    const sopItem = screen.getByText("Food Temperature Monitoring");
    const sopBtn = sopItem.closest("button") as HTMLElement;
    if (sopBtn) {
      fireEvent.click(sopBtn);
      expect(screen.getByText("AI Knowledge Check")).toBeInTheDocument();
    }
  });

  it("clicking 'Back' in SOP detail returns to the list view", () => {
    renderWithProviders(<SOPs />);
    const sopItem = screen.getByText("Food Temperature Monitoring");
    const sopBtn = sopItem.closest("button") as HTMLElement;
    if (sopBtn) {
      fireEvent.click(sopBtn);
      const backBtn = screen.getByText("Back");
      fireEvent.click(backBtn);
      // Back to the list view
      expect(screen.getByText("SOP Library")).toBeInTheDocument();
    }
  });

  it("filtering by 'Food Safety' category shows only food safety SOPs", () => {
    renderWithProviders(<SOPs />);
    const foodSafetyTab = screen.getByRole("button", { name: /^food safety$/i });
    fireEvent.click(foodSafetyTab);
    expect(screen.getByText("Food Temperature Monitoring")).toBeInTheDocument();
    expect(screen.getByText("HACCP Compliance Basics")).toBeInTheDocument();
    // Opening duties should not be visible
    expect(screen.queryByText("Opening Duties — Kitchen")).toBeNull();
  });

  it("filtering by 'Cleaning' category shows only cleaning SOPs", () => {
    renderWithProviders(<SOPs />);
    const cleaningTab = screen.getByRole("button", { name: /^cleaning$/i });
    fireEvent.click(cleaningTab);
    expect(screen.getByText("Deep Clean Protocol")).toBeInTheDocument();
    expect(screen.queryByText("Food Temperature Monitoring")).toBeNull();
  });

  it("filtering by 'Service' category shows only service SOPs", () => {
    renderWithProviders(<SOPs />);
    const serviceTab = screen.getByRole("button", { name: /^service$/i });
    fireEvent.click(serviceTab);
    expect(screen.getByText("Service & Allergen Standards")).toBeInTheDocument();
    expect(screen.queryByText("HACCP Compliance Basics")).toBeNull();
  });

  it("clicking 'All' category tab shows all SOPs", () => {
    renderWithProviders(<SOPs />);
    const cleaningTab = screen.getByRole("button", { name: /^cleaning$/i });
    fireEvent.click(cleaningTab);
    const allTab = screen.getByRole("button", { name: /^All$/ });
    fireEvent.click(allTab);
    expect(screen.getByText("Food Temperature Monitoring")).toBeInTheDocument();
    expect(screen.getByText("Deep Clean Protocol")).toBeInTheDocument();
  });

  it("searching by title filters the SOP list", () => {
    renderWithProviders(<SOPs />);
    const searchInput = screen.getByPlaceholderText("Search procedures...");
    fireEvent.change(searchInput, { target: { value: "HACCP" } });
    expect(screen.getByText("HACCP Compliance Basics")).toBeInTheDocument();
    expect(screen.queryByText("Food Temperature Monitoring")).toBeNull();
  });

  it("searching for non-existent term shows 'No procedures found.'", () => {
    renderWithProviders(<SOPs />);
    const searchInput = screen.getByPlaceholderText("Search procedures...");
    fireEvent.change(searchInput, { target: { value: "xyznonexistent" } });
    expect(screen.getByText("No procedures found.")).toBeInTheDocument();
  });

  it("SOP detail shows last updated time", () => {
    renderWithProviders(<SOPs />);
    // Open the Food Temperature Monitoring SOP to see its last updated date in detail view
    const sopItem = screen.getByText("Food Temperature Monitoring");
    const sopBtn = sopItem.closest("button") as HTMLElement;
    if (sopBtn) {
      fireEvent.click(sopBtn);
      // Detail view shows "Last updated 2 days ago"
      const allText = document.body.textContent || "";
      expect(allText).toMatch(/Last updated/i);
    }
  });

  it("SOP detail shows category badge", () => {
    renderWithProviders(<SOPs />);
    const sopItem = screen.getByText("Deep Clean Protocol");
    const sopBtn = sopItem.closest("button") as HTMLElement;
    if (sopBtn) {
      fireEvent.click(sopBtn);
      // Category badge should show
      expect(screen.queryByText("Cleaning")).toBeInTheDocument();
    }
  });

  it("filtering by 'Opening & Closing' shows correct SOPs", () => {
    renderWithProviders(<SOPs />);
    // There are multiple "Opening & Closing" elements (tab button + inline badge)
    // Click the filter tab by finding it in the category tabs area
    const allOpeningClosingEls = screen.getAllByText(/Opening & Closing/i);
    // The category tab is the first one (it's a button)
    const openingTab = allOpeningClosingEls.find(el => el.tagName === "BUTTON" || el.closest("button"));
    if (openingTab) {
      const btn = openingTab.tagName === "BUTTON" ? openingTab : openingTab.closest("button");
      if (btn) fireEvent.click(btn);
    }
    expect(screen.getByText("Opening Duties — Kitchen")).toBeInTheDocument();
    expect(screen.getByText("Closing Duties — Full Team")).toBeInTheDocument();
    expect(screen.queryByText("HACCP Compliance Basics")).toBeNull();
  });

  it("searching is case-insensitive", () => {
    renderWithProviders(<SOPs />);
    const searchInput = screen.getByPlaceholderText("Search procedures...");
    fireEvent.change(searchInput, { target: { value: "haccp" } });
    expect(screen.getByText("HACCP Compliance Basics")).toBeInTheDocument();
  });
});
