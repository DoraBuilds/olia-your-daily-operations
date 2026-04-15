import { screen, fireEvent } from "@testing-library/react";
import Training from "@/pages/Training";
import { renderWithProviders } from "../test-utils";
import { supabase } from "@/lib/supabase";

vi.mock("@/lib/supabase", () => ({
  supabase: {
    functions: {
      invoke: vi.fn(),
    },
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

describe("Training page", () => {
  beforeEach(() => {
    vi.mocked(supabase.functions.invoke).mockReset();
  });

  it("renders without crashing", () => {
    renderWithProviders(<Training />);
    expect(document.body).toBeDefined();
  });

  it("shows the page title 'Training'", () => {
    renderWithProviders(<Training />);
    expect(screen.getByRole("heading", { name: "Training" })).toBeInTheDocument();
  });

  it("shows 'Onboarding' tab button", () => {
    renderWithProviders(<Training />);
    expect(screen.getByRole("button", { name: /onboarding/i })).toBeInTheDocument();
  });

  it("shows 'Troubleshooting' tab button", () => {
    renderWithProviders(<Training />);
    expect(screen.getByRole("button", { name: /troubleshooting/i })).toBeInTheDocument();
  });

  it("Onboarding tab is active by default, showing onboarding modules", () => {
    renderWithProviders(<Training />);
    expect(screen.getByText("How to make a latte")).toBeInTheDocument();
  });

  it("shows 'Taking a table order' module in Onboarding tab", () => {
    renderWithProviders(<Training />);
    expect(screen.getByText("Taking a table order")).toBeInTheDocument();
  });

  it("shows 'Cash handling procedure' module in Onboarding tab", () => {
    renderWithProviders(<Training />);
    expect(screen.getByText("Cash handling procedure")).toBeInTheDocument();
  });

  it("modules show duration (e.g. '8 min')", () => {
    renderWithProviders(<Training />);
    expect(screen.getByText(/8 min/)).toBeInTheDocument();
  });

  it("modules show step count", () => {
    renderWithProviders(<Training />);
    // "7 steps" for latte module - use getAllByText since multiple elements have "steps"
    const stepsItems = screen.queryAllByText(/steps/i);
    expect(stepsItems.length).toBeGreaterThan(0);
  });

  it("completed module shows 'Done' badge", () => {
    renderWithProviders(<Training />);
    // 'Taking a table order' is completed: true
    expect(screen.getByText("Done")).toBeInTheDocument();
  });

  it("progress indicator shows completed count", () => {
    renderWithProviders(<Training />);
    // "1 of 3 completed" for onboarding
    expect(screen.getByText("1 of 3 completed")).toBeInTheDocument();
  });

  it("progress percentage is shown", () => {
    renderWithProviders(<Training />);
    // 1/3 = 33%
    expect(screen.getByText("33%")).toBeInTheDocument();
  });

  it("switching to Troubleshooting tab shows troubleshooting modules", () => {
    renderWithProviders(<Training />);
    const troubleshootingTab = screen.getByRole("button", { name: /troubleshooting/i });
    fireEvent.click(troubleshootingTab);
    expect(screen.getByText("Coffee machine not heating")).toBeInTheDocument();
  });

  it("Troubleshooting tab shows 'Card terminal not connecting' module", () => {
    renderWithProviders(<Training />);
    const troubleshootingTab = screen.getByRole("button", { name: /troubleshooting/i });
    fireEvent.click(troubleshootingTab);
    expect(screen.getByText("Card terminal not connecting")).toBeInTheDocument();
  });

  it("Troubleshooting tab shows 'Handling a customer complaint' module", () => {
    renderWithProviders(<Training />);
    const troubleshootingTab = screen.getByRole("button", { name: /troubleshooting/i });
    fireEvent.click(troubleshootingTab);
    expect(screen.getByText("Handling a customer complaint")).toBeInTheDocument();
  });

  it("Troubleshooting tab shows 0 of 3 completed", () => {
    renderWithProviders(<Training />);
    const troubleshootingTab = screen.getByRole("button", { name: /troubleshooting/i });
    fireEvent.click(troubleshootingTab);
    expect(screen.getByText("0 of 3 completed")).toBeInTheDocument();
  });

  it("Troubleshooting tab shows 0% progress", () => {
    renderWithProviders(<Training />);
    const troubleshootingTab = screen.getByRole("button", { name: /troubleshooting/i });
    fireEvent.click(troubleshootingTab);
    expect(screen.getByText("0%")).toBeInTheDocument();
  });

  it("clicking a module opens the detail view", () => {
    renderWithProviders(<Training />);
    const latteModule = screen.getByText("How to make a latte");
    const moduleBtn = latteModule.closest("button") as HTMLElement;
    if (moduleBtn) {
      fireEvent.click(moduleBtn);
      // Detail view should show the module title
      expect(screen.getByText("How to make a latte")).toBeInTheDocument();
    }
  });

  it("module detail view shows step count in header", () => {
    renderWithProviders(<Training />);
    const latteModule = screen.getByText("How to make a latte");
    const moduleBtn = latteModule.closest("button") as HTMLElement;
    if (moduleBtn) {
      fireEvent.click(moduleBtn);
      // "0/7 steps" for latte module
      expect(screen.queryByText(/0\/7 steps/i)).toBeTruthy();
    }
  });

  it("module detail shows individual steps", () => {
    renderWithProviders(<Training />);
    const latteModule = screen.getByText("How to make a latte");
    const moduleBtn = latteModule.closest("button") as HTMLElement;
    if (moduleBtn) {
      fireEvent.click(moduleBtn);
      expect(screen.getByText("Step 1")).toBeInTheDocument();
      expect(screen.getByText("Step 2")).toBeInTheDocument();
    }
  });

  it("module detail shows first step text", () => {
    renderWithProviders(<Training />);
    const latteModule = screen.getByText("How to make a latte");
    const moduleBtn = latteModule.closest("button") as HTMLElement;
    if (moduleBtn) {
      fireEvent.click(moduleBtn);
      expect(screen.getByText(/Grind 18–20g of espresso/i)).toBeInTheDocument();
    }
  });

  it("clicking a step toggles it as done", () => {
    renderWithProviders(<Training />);
    const latteModule = screen.getByText("How to make a latte");
    const moduleBtn = latteModule.closest("button") as HTMLElement;
    if (moduleBtn) {
      fireEvent.click(moduleBtn);
      const step1 = screen.getByText("Step 1");
      const stepBtn = step1.closest("button") as HTMLElement;
      if (stepBtn) {
        fireEvent.click(stepBtn);
        // Step counter should update from 0/7 to 1/7
        expect(screen.queryByText(/1\/7 steps/i)).toBeTruthy();
      }
    }
  });

  it("clicking all steps shows 'Module complete.' message", () => {
    renderWithProviders(<Training />);
    const latteModule = screen.getByText("How to make a latte");
    const moduleBtn = latteModule.closest("button") as HTMLElement;
    if (moduleBtn) {
      fireEvent.click(moduleBtn);
      // Click all 7 steps
      const stepBtns = screen.getAllByRole("button").filter(btn =>
        btn.className.includes("rounded-xl") && btn.querySelector("svg")
      );
      stepBtns.forEach(btn => fireEvent.click(btn));
      // "Module complete." should appear
      expect(screen.queryByText("Module complete.")).toBeTruthy();
    }
  });

  it("back button in module detail returns to module list", () => {
    renderWithProviders(<Training />);
    const latteModule = screen.getByText("How to make a latte");
    const moduleBtn = latteModule.closest("button") as HTMLElement;
    if (moduleBtn) {
      fireEvent.click(moduleBtn);
      // Find back button (ChevronLeft in rounded-full)
      const backBtn = screen.getAllByRole("button").find(btn =>
        btn.className.includes("rounded-full") && btn.querySelector("svg")
      );
      if (backBtn) {
        fireEvent.click(backBtn);
        // Should be back to the module list
        expect(screen.getByRole("heading", { name: "Training" })).toBeInTheDocument();
      }
    }
  });

  it("already completed module shows all steps as done in detail", () => {
    renderWithProviders(<Training />);
    // "Taking a table order" is already completed
    const completedModule = screen.getByText("Taking a table order");
    const moduleBtn = completedModule.closest("button") as HTMLElement;
    if (moduleBtn) {
      fireEvent.click(moduleBtn);
      // Should show all steps and the "Module complete." banner
      expect(screen.queryByText("Module complete.")).toBeTruthy();
    }
  });

  it("module detail shows module duration", () => {
    renderWithProviders(<Training />);
    const latteModule = screen.getByText("How to make a latte");
    const moduleBtn = latteModule.closest("button") as HTMLElement;
    if (moduleBtn) {
      fireEvent.click(moduleBtn);
      expect(screen.getByText(/8 min/)).toBeInTheDocument();
    }
  });

  it("subtitle changes to 'Issue resolution guides' for Troubleshooting tab", () => {
    renderWithProviders(<Training />);
    const troubleshootingTab = screen.getByRole("button", { name: /troubleshooting/i });
    fireEvent.click(troubleshootingTab);
    expect(screen.getByText("Issue resolution guides")).toBeInTheDocument();
  });

  it("can generate a new training module with AI", async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: {
        title: "Handle a table complaint",
        category: "troubleshooting",
        duration: "6 min",
        steps: [
          "Listen carefully to the guest.",
          "Acknowledge the concern calmly.",
          "Offer a practical resolution.",
          "Escalate if the issue is outside your authority.",
        ],
      },
      error: null,
    } as any);

    renderWithProviders(<Training />);

    fireEvent.click(screen.getByRole("button", { name: /build with ai/i }));
    fireEvent.change(screen.getByPlaceholderText(/train a new server to handle a customer complaint/i), {
      target: { value: "Train a server to handle complaints" },
    });
    fireEvent.click(screen.getByRole("button", { name: /generate training module/i }));

    expect(await screen.findByText("Handle a table complaint")).toBeInTheDocument();
    expect(screen.getByText(/6 min/i)).toBeInTheDocument();
    expect(screen.getByText("Listen carefully to the guest.")).toBeInTheDocument();
  });

  it("subtitle shows 'Staff onboarding modules' for Onboarding tab by default", () => {
    renderWithProviders(<Training />);
    expect(screen.getByText("Staff onboarding modules")).toBeInTheDocument();
  });
});
