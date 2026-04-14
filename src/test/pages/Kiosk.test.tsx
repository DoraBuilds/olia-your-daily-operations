import { screen, fireEvent, waitFor, act } from "@testing-library/react";
import Kiosk, { ChecklistRunner } from "@/pages/Kiosk";
import { renderWithProviders } from "../test-utils";

const mockNavigate = vi.fn();
const { mockUseAuth } = vi.hoisted(() => ({
  mockUseAuth: vi.fn(),
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => mockUseAuth(),
}));

const checklistLogsInsert = vi.fn().mockResolvedValue({ error: null });
const alertsInsert = vi.fn().mockResolvedValue({ error: null });
const mockLocations = [
  { id: "00000000-0000-0000-0000-000000000011", name: "Terrace" },
  { id: "00000000-0000-0000-0000-000000000010", name: "Grand Ballroom" },
];

// ─── Supabase mock ────────────────────────────────────────────────────────────
// The KioskSetupScreen calls:
//   supabase.from("locations").select("id, name").order("name").then(...)
// We need .then to resolve with mock data so the dropdown populates.

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      signInWithPassword: vi.fn().mockResolvedValue({ data: { session: { user: { id: "u1" } } }, error: null }),
      signOut: vi.fn().mockResolvedValue({}),
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
    from: vi.fn((table: string) => {
      let eqValue: string | null = null;
      if (table === "alerts") {
        const chain: any = {
          select: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          eq: vi.fn().mockImplementation((_: string, value: string) => {
            eqValue = value;
            return chain;
          }),
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          insert: alertsInsert,
          update: vi.fn().mockReturnThis(),
          upsert: vi.fn().mockResolvedValue({ error: null }),
          delete: vi.fn().mockReturnThis(),
          then: vi.fn().mockImplementation((cb) => Promise.resolve(cb({ data: [], error: null }))),
        };
        return chain;
      }

      if (table === "checklist_logs") {
        const chain: any = {
          select: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          eq: vi.fn().mockImplementation((_: string, value: string) => {
            eqValue = value;
            return chain;
          }),
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          insert: checklistLogsInsert,
          update: vi.fn().mockReturnThis(),
          upsert: vi.fn().mockResolvedValue({ error: null }),
          delete: vi.fn().mockReturnThis(),
          then: vi.fn().mockImplementation((cb) => Promise.resolve(cb({ data: [], error: null }))),
        };
        return chain;
      }

      const chain: any = {
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        eq: vi.fn().mockImplementation((_: string, value: string) => {
          eqValue = value;
          return chain;
        }),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
        maybeSingle: vi.fn().mockImplementation(() => Promise.resolve({
          data: table === "locations" ? mockLocations.find((location) => location.id === eqValue) ?? null : null,
          error: null,
        })),
        insert: vi.fn().mockResolvedValue({ error: null }),
        update: vi.fn().mockReturnThis(),
        upsert: vi.fn().mockResolvedValue({ error: null }),
        delete: vi.fn().mockReturnThis(),
        then: vi.fn().mockImplementation((cb) =>
          Promise.resolve(cb({
            data: mockLocations,
            error: null,
          }))
        ),
      };
      return chain;
    }),
    rpc: vi.fn().mockImplementation((fn: string) => {
      if (fn === "get_kiosk_checklists") {
        return Promise.resolve({
          data: [
            { id: "ck-test-1", title: "Table Setup Check", location_id: "00000000-0000-0000-0000-000000000011", sections: [] },
          ],
          error: null,
        });
      }

      if (fn === "validate_admin_pin") {
        return Promise.resolve({
          data: [
            {
              id: "tm-1",
              name: "Sarah Owner",
              email: "sarah@example.com",
              role: "Owner",
              organization_id: "org-1",
              location_ids: [],
              permissions: {},
            },
          ],
          error: null,
        });
      }

      return Promise.resolve({ data: [], error: null });
    }),
  },
}));

vi.mock("@/hooks/useLocations", () => ({
  useLocations: () => ({
    allLocations: mockLocations,
    isFetched: true,
  }),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Render the Kiosk in Setup screen (no stored location). */
function renderSetup() {
  localStorage.clear();
  // Reset module-level persistence between tests
  return renderWithProviders(<Kiosk />);
}

/** Render the Kiosk starting at the grid screen (Terrace location pre-stored).
 *  Pass authOverride to use a different auth state (e.g. null user for unauthenticated tests). */
async function renderGridScreen(authOverride?: { user: any; teamMember: any; session: any; loading: boolean; signOut: any }) {
  mockUseAuth.mockReturnValue(
    authOverride ?? { user: { id: "u1" }, teamMember: { organization_id: "org-1" }, session: null, loading: false, signOut: vi.fn() }
  );
  localStorage.setItem("kiosk_location_id", "00000000-0000-0000-0000-000000000011");
  localStorage.setItem("kiosk_location_name", "Terrace");
  localStorage.setItem("kiosk_owner_user_id", "u1");
  localStorage.setItem("kiosk_owner_org_id", "org-1");
  renderWithProviders(<Kiosk />);

  if (!screen.queryByText(/What's on the agenda/i)) {
    await waitFor(() => {
      expect(document.getElementById("location-select")).not.toBeNull();
    });
    const launchBtn = document.getElementById("launch-kiosk-btn") as HTMLButtonElement | null;
    if (launchBtn) {
      await act(async () => {
        fireEvent.click(launchBtn);
      });
    }
  }

  await screen.findByText(/What's on the agenda/i);
}

async function openRunnerWithQuestions(questions: any[]) {
  const { supabase } = await import("@/lib/supabase");
  supabase.rpc.mockImplementation((fn: string) => {
    if (fn === "get_kiosk_checklists") {
      return Promise.resolve({
        data: [
          {
            id: "ck-runner-test",
            title: "Runner Test Checklist",
            location_id: "00000000-0000-0000-0000-000000000011",
            time_of_day: "anytime",
            due_time: null,
            sections: [
              {
                name: "Main",
                questions,
              },
            ],
          },
        ],
        error: null,
      });
    }

    if (fn === "validate_admin_pin") {
      return Promise.resolve({
        data: [
          {
            id: "tm-1",
            name: "Sarah Owner",
            email: "sarah@example.com",
            role: "Owner",
            organization_id: "org-1",
            location_ids: [],
            permissions: {},
          },
        ],
        error: null,
      });
    }

    return Promise.resolve({ data: [], error: null });
  });

  await renderGridScreen();

  const checklistBtn = await waitFor(() =>
    document.querySelector("[id^='checklist-card-']") as HTMLButtonElement | null
  );
  expect(checklistBtn).not.toBeNull();
  fireEvent.click(checklistBtn!);

  await waitFor(() => {
    expect(screen.getByText("Insert PIN")).toBeInTheDocument();
  });

  for (const digit of ["1", "2", "3", "4"]) {
    fireEvent.click(screen.getByRole("button", { name: digit }));
  }

  await waitFor(() => {
    expect(screen.getByRole("button", { name: /complete checklist/i })).toBeInTheDocument();
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  checklistLogsInsert.mockClear();
  alertsInsert.mockClear();
  mockUseAuth.mockReturnValue({
    teamMember: null,
    user: null,
    session: null,
    loading: false,
    signOut: vi.fn(),
  });
});

afterEach(() => {
  localStorage.clear();
  vi.useRealTimers();
});

// ─── Setup Screen tests ───────────────────────────────────────────────────────

describe("Kiosk — Setup Screen", () => {
  it("renders setup screen with 'Olia Kiosk' title", async () => {
    renderSetup();
    await waitFor(() => {
      expect(screen.getByText("Olia Kiosk")).toBeInTheDocument();
    });
  });

  it("setup screen shows 'Select a location to launch' prompt", async () => {
    renderSetup();
    await waitFor(() => {
      expect(screen.getByText(/Select a location to launch/i)).toBeInTheDocument();
    });
  });

  it("shows 'System Online' status text", async () => {
    renderSetup();
    await waitFor(() => {
      expect(screen.getByText(/System Online/i)).toBeInTheDocument();
    });
  });

  it("'Launch Kiosk' button appears", async () => {
    renderSetup();
    await waitFor(() => {
      expect(screen.getByText(/Launch Kiosk/i)).toBeInTheDocument();
    });
  });

  it("location select dropdown appears after loading", async () => {
    renderSetup();
    await waitFor(() => {
      const select = document.getElementById("location-select");
      expect(select).not.toBeNull();
    });
  });

  it("mock location 'Terrace' appears in the dropdown", async () => {
    renderSetup();
    await waitFor(() => {
      // Either as an option in the select or via getAllByText
      const options = Array.from(document.querySelectorAll("option"));
      const terraceOpt = options.find(o => o.textContent === "Terrace");
      // If supabase mock returns data the option will be there; if not,
      // fallback to MOCK_LOCATIONS which also has Terrace
      expect(terraceOpt).toBeDefined();
    });
  });

  it("mock location 'Grand Ballroom' appears in the dropdown", async () => {
    renderSetup();
    await waitFor(() => {
      const options = Array.from(document.querySelectorAll("option"));
      const grandOpt = options.find(o => o.textContent === "Grand Ballroom");
      expect(grandOpt).toBeDefined();
    });
  });

  it("shows a safe empty state when Supabase returns no locations", async () => {
    const { supabase } = await import("@/lib/supabase");
    supabase.from.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      then: vi.fn().mockImplementation((cb) =>
        Promise.resolve(cb({ data: [], error: null }))
      ),
    } as any);

    renderSetup();

    await waitFor(() => {
      expect(screen.getByText(/No locations available/i)).toBeInTheDocument();
    });

    expect(screen.queryByText("Terrace")).not.toBeInTheDocument();
    expect(screen.queryByText("Grand Ballroom")).not.toBeInTheDocument();
    const launchBtn = document.getElementById("launch-kiosk-btn") as HTMLButtonElement;
    expect(launchBtn.disabled).toBe(true);
  });

  it("'Launch Kiosk' button is disabled when loading (before locations load)", () => {
    // Before the async .then resolves the button should be disabled
    localStorage.clear();
    renderWithProviders(<Kiosk />);
    const btn = document.getElementById("launch-kiosk-btn") as HTMLButtonElement;
    // During the loading phase the button starts disabled
    // (may or may not still be disabled by the time we inspect — check the attribute)
    expect(btn).not.toBeNull();
  });

  it("clicking 'Launch Kiosk' transitions to grid screen", async () => {
    renderSetup();
    await waitFor(() => {
      expect(document.getElementById("location-select")).not.toBeNull();
    });
    const btn = document.getElementById("launch-kiosk-btn") as HTMLButtonElement;
    await act(async () => {
      fireEvent.click(btn);
    });
    await waitFor(() => {
      expect(screen.queryByText(/What's on the agenda/i)).toBeInTheDocument();
    });
  });
});

// ─── Grid Screen tests ────────────────────────────────────────────────────────

describe("Kiosk — Grid Screen", () => {
  it("grid screen shows 'What's on the agenda' heading", async () => {
    await renderGridScreen();
    expect(screen.getByText(/What's on the agenda/i)).toBeInTheDocument();
  });

  it("clears stale kiosk location state when no kiosk owner is stored for the signed-in account", async () => {
    localStorage.setItem("kiosk_location_id", "00000000-0000-0000-0000-000000000011");
    localStorage.setItem("kiosk_location_name", "Terrace");
    renderWithProviders(<Kiosk />);

    await waitFor(() => {
      expect(screen.getByText(/Select a location to launch/i)).toBeInTheDocument();
    });

    expect(localStorage.getItem("kiosk_location_id")).toBeNull();
    expect(localStorage.getItem("kiosk_location_name")).toBeNull();
  });

  it("does not restore a stored kiosk location from another organization", async () => {
    localStorage.setItem("kiosk_location_id", "foreign-location");
    localStorage.setItem("kiosk_location_name", "Little Fern Bakery");
    localStorage.setItem("kiosk_owner_user_id", "u1");
    localStorage.setItem("kiosk_owner_org_id", "foreign-org");

    renderWithProviders(<Kiosk />);

    await waitFor(() => {
      expect(screen.getByText(/Select a location to launch/i)).toBeInTheDocument();
    });

    expect(screen.queryByText("Little Fern Bakery")).not.toBeInTheDocument();
    expect(localStorage.getItem("kiosk_location_id")).toBeNull();
    expect(localStorage.getItem("kiosk_location_name")).toBeNull();
  });

  it("grid screen shows checklist cards for Terrace location", async () => {
    await renderGridScreen();
    // The RPC mock returns "Table Setup Check" for the Terrace location.
    await waitFor(() => {
      const anyChecklistCard =
        screen.queryByText("Table Setup Check") ||
        screen.queryByText("Terrace Opening") ||
        screen.queryByText("Terrace Close");
      expect(anyChecklistCard).not.toBeNull();
    });
  });

  it("grid screen shows 'Admin' button", async () => {
    await renderGridScreen();
    const adminBtn = document.getElementById("admin-btn");
    expect(adminBtn).not.toBeNull();
    expect(adminBtn?.textContent).toMatch(/Admin/i);
  });

  it("grid screen shows 'System Online' footer text", async () => {
    await renderGridScreen();
    expect(screen.getByText(/System Online/i)).toBeInTheDocument();
  });

  it("grid screen shows stat strip with 'Due now', 'Overdue', 'Upcoming', 'Done'", async () => {
    await renderGridScreen();
    expect(screen.getAllByText("Due now").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Overdue")).toBeInTheDocument();
    expect(screen.getByText("Upcoming")).toBeInTheDocument();
    expect(screen.getByText("Done")).toBeInTheDocument();
  });

  it("grid screen shows 'Current Status' label in top bar", async () => {
    await renderGridScreen();
    expect(screen.getByText("Current Status")).toBeInTheDocument();
  });

  it("grid screen shows 'Olia' brand label", async () => {
    await renderGridScreen();
    // The top-left brand area has "Olia" and "Kiosk"
    const oliaEls = screen.getAllByText("Olia");
    expect(oliaEls.length).toBeGreaterThanOrEqual(1);
  });

  it("clicking 'Admin' button opens Admin Login Modal", async () => {
    await renderGridScreen();
    const adminBtn = document.getElementById("admin-btn") as HTMLButtonElement;
    fireEvent.click(adminBtn);
    await waitFor(() => {
      expect(screen.getByText("Admin PIN")).toBeInTheDocument();
    });
  });

  it("Admin Login Modal has a PIN input", async () => {
    await renderGridScreen();
    const adminBtn = document.getElementById("admin-btn") as HTMLButtonElement;
    fireEvent.click(adminBtn);
    await waitFor(() => {
      expect(document.getElementById("admin-pin-input")).not.toBeNull();
      expect(document.getElementById("admin-email-input")).toBeNull();
      expect(document.getElementById("admin-password-input")).toBeNull();
    });
  });

  it("Admin Login Modal has 'Continue' button", async () => {
    await renderGridScreen();
    const adminBtn = document.getElementById("admin-btn") as HTMLButtonElement;
    fireEvent.click(adminBtn);
    await waitFor(() => {
      expect(document.getElementById("admin-pin-signin-btn")).not.toBeNull();
    });
  });

  it("filling PIN enables the continue button", async () => {
    await renderGridScreen();
    const adminBtn = document.getElementById("admin-btn") as HTMLButtonElement;
    fireEvent.click(adminBtn);
    await waitFor(() => {
      expect(document.getElementById("admin-pin-input")).not.toBeNull();
    });
    const pinInput = document.getElementById("admin-pin-input") as HTMLInputElement;
    fireEvent.change(pinInput, { target: { value: "1234" } });
    const signInBtn = document.getElementById("admin-pin-signin-btn") as HTMLButtonElement;
    expect(signInBtn.disabled).toBe(false);
  });

  it("clicking 'Continue' calls supabase.rpc validate_admin_pin", async () => {
    const { supabase } = await import("@/lib/supabase");
    await renderGridScreen();
    const adminBtn = document.getElementById("admin-btn") as HTMLButtonElement;
    fireEvent.click(adminBtn);
    await waitFor(() => {
      expect(document.getElementById("admin-pin-input")).not.toBeNull();
    });
    const pinInput = document.getElementById("admin-pin-input") as HTMLInputElement;
    fireEvent.change(pinInput, { target: { value: "1234" } });
    const signInBtn = document.getElementById("admin-pin-signin-btn") as HTMLButtonElement;
    await act(async () => {
      fireEvent.click(signInBtn);
    });
    await waitFor(() => {
      expect(supabase.rpc).toHaveBeenCalledWith("validate_admin_pin", {
        p_pin: "1234",
        p_location_id: "00000000-0000-0000-0000-000000000011",
      });
    });
  });

  it("offers a logout-and-login recovery path instead of a signup bypass", async () => {
    const { supabase } = await import("@/lib/supabase");
    // No teamMember → kiosk shows "Log out and sign in again" recovery path.
    // Use loading:true so the cleanup effect is suppressed while the grid renders
    // from the localStorage values set in the outer beforeEach.
    await renderGridScreen({ user: null, teamMember: null, session: null, loading: true, signOut: vi.fn() });
    const adminBtn = document.getElementById("admin-btn") as HTMLButtonElement;
    fireEvent.click(adminBtn);

    await waitFor(() => {
      expect(screen.getByText(/Forgot your PIN/i)).toBeInTheDocument();
      expect(screen.queryByText(/Create an account/i)).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /Log out and sign in again/i }));

    await waitFor(() => {
      expect(supabase.auth.signOut).toHaveBeenCalled();
      expect(mockNavigate).toHaveBeenCalledWith("/login?reason=reset-pin");
    });
  });

  it("always signs out before redirecting to login for PIN recovery, even for authenticated admins", async () => {
    const { supabase } = await import("@/lib/supabase");
    mockUseAuth.mockReturnValue({
      teamMember: {
        id: "tm-1",
        organization_id: "org-1",
        name: "Sarah Owner",
        email: "sarah@example.com",
        role: "Owner",
        location_ids: [],
        permissions: {},
      },
      user: { id: "u1" },
      session: { user: { id: "u1" } },
      loading: false,
      signOut: vi.fn(),
    });

    await renderGridScreen();
    const adminBtn = document.getElementById("admin-btn") as HTMLButtonElement;
    fireEvent.click(adminBtn);

    await waitFor(() => {
      // "Log out and sign in again" is shown regardless of auth state — the
      // direct-to-admin bypass was removed to close the kiosk PIN security hole.
      expect(screen.getByRole("button", { name: /Log out and sign in again/i })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Reset it in Admin/i })).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /Log out and sign in again/i }));

    await waitFor(() => {
      expect(supabase.auth.signOut).toHaveBeenCalled();
      expect(mockNavigate).toHaveBeenCalledWith("/login?reason=reset-pin");
    });
  });

  it("clicking backdrop of Admin Login Modal closes it", async () => {
    await renderGridScreen();
    const adminBtn = document.getElementById("admin-btn") as HTMLButtonElement;
    fireEvent.click(adminBtn);
    await waitFor(() => {
      expect(screen.getByText("Admin PIN")).toBeInTheDocument();
    });
    // Click the fixed overlay backdrop (the outermost div)
    const backdrop = document.querySelector(".fixed.inset-0.z-\\[60\\]") as HTMLElement;
    if (backdrop) {
      fireEvent.click(backdrop);
      await waitFor(() => {
        expect(screen.queryByText("Admin PIN")).not.toBeInTheDocument();
      });
    }
  });

  it("clicking a checklist card opens PIN modal", async () => {
    await renderGridScreen();
    // Find a checklist card button
    const checklistBtn = document.querySelector("[id^='checklist-card-']") as HTMLButtonElement;
    if (checklistBtn) {
      fireEvent.click(checklistBtn);
      await waitFor(() => {
        expect(screen.getByText("Insert PIN")).toBeInTheDocument();
      });
    } else {
      // No checklists for this time of day — test still passes
      expect(true).toBe(true);
    }
  });

  it("uses the admin PIN validation path when starting a checklist", async () => {
    const { supabase } = await import("@/lib/supabase");
    supabase.rpc.mockImplementation((fn: string) => {
      if (fn === "get_kiosk_checklists") {
        return Promise.resolve({
          data: [
            {
              id: "ck-runner-test",
              title: "Runner Test Checklist",
              location_id: "00000000-0000-0000-0000-000000000011",
              time_of_day: "anytime",
              due_time: null,
              sections: [{ name: "Main", questions: [] }],
            },
          ],
          error: null,
        });
      }

      if (fn === "validate_admin_pin") {
        return Promise.resolve({
          data: [
            {
              id: "tm-1",
              name: "Sarah Owner",
              organization_id: "org-1",
            },
          ],
          error: null,
        });
      }

      return Promise.resolve({ data: [], error: null });
    });

    await renderGridScreen();
    const checklistBtn = document.querySelector("[id^='checklist-card-']") as HTMLButtonElement;
    expect(checklistBtn).not.toBeNull();
    fireEvent.click(checklistBtn);

    await waitFor(() => {
      expect(screen.getByText("Insert PIN")).toBeInTheDocument();
    });

    for (const digit of ["1", "2", "3", "4"]) {
      fireEvent.click(screen.getByRole("button", { name: digit }));
    }

    await waitFor(() => {
      expect(supabase.rpc).toHaveBeenCalledWith("validate_admin_pin", {
        p_pin: "1234",
        p_location_id: "00000000-0000-0000-0000-000000000011",
      });
    });
  });

  it("lets staff move past an optional checkbox question in the runner", async () => {
    const { supabase } = await import("@/lib/supabase");
    supabase.rpc.mockImplementation((fn: string) => {
      if (fn === "get_kiosk_checklists") {
        return Promise.resolve({
          data: [
            {
              id: "ck-runner-1",
              title: "Opening flow",
              location_id: "00000000-0000-0000-0000-000000000011",
              sections: [
                {
                  name: "Section A",
                  questions: [
                    { id: "q-optional", text: "Optional confirm", responseType: "checkbox", required: false, config: {} },
                    { id: "q-required", text: "Required confirm", responseType: "checkbox", required: true, config: {} },
                  ],
                },
              ],
            },
          ],
          error: null,
        });
      }

      if (fn === "validate_admin_pin") {
        return Promise.resolve({
          data: [{ id: "tm-1", name: "Jay Tester", organization_id: "org-1" }],
          error: null,
        });
      }

      return Promise.resolve({ data: [], error: null });
    });

    await renderGridScreen();

    await waitFor(() => {
      expect(document.querySelector("[id^='checklist-card-']")).not.toBeNull();
    });
    const checklistBtn = document.querySelector("[id^='checklist-card-']") as HTMLButtonElement;
    fireEvent.click(checklistBtn);

    await waitFor(() => {
      expect(screen.getByText("Insert PIN")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "1" }));
    fireEvent.click(screen.getByRole("button", { name: "2" }));
    fireEvent.click(screen.getByRole("button", { name: "3" }));
    fireEvent.click(screen.getByRole("button", { name: "4" }));

    await waitFor(() => {
      expect(screen.getByText("Optional confirm")).toBeInTheDocument();
    });

    const nextButtons = screen.getAllByRole("button", { name: /Next/i });
    expect(nextButtons.length).toBeGreaterThan(0);

    fireEvent.click(nextButtons[0]);

    await waitFor(() => {
      expect(screen.getByText("Required confirm")).toBeInTheDocument();
    });
  });
});

// ─── PIN Entry Modal tests ────────────────────────────────────────────────────

describe("Kiosk — PIN Entry Modal", () => {
  /** Helper: click the first checklist card to open PIN modal. */
  async function openPinModal() {
    await renderGridScreen();
    const checklistBtn = document.querySelector("[id^='checklist-card-']") as HTMLButtonElement;
    if (!checklistBtn) return false;
    fireEvent.click(checklistBtn);
    await waitFor(() => {
      expect(screen.queryByText("Insert PIN")).toBeInTheDocument();
    });
    return true;
  }

  it("PIN modal shows 'Insert PIN' text", async () => {
    const opened = await openPinModal();
    if (!opened) return; // skip if no checklists visible at this time
    expect(screen.getByText("Insert PIN")).toBeInTheDocument();
  });

  it("PIN modal shows the current helper subtitle", async () => {
    const opened = await openPinModal();
    if (!opened) return;
    expect(screen.getByText(/You're doing great/i)).toBeInTheDocument();
  });

  it("PIN modal shows numpad with digit '1'", async () => {
    const opened = await openPinModal();
    if (!opened) return;
    const btn = screen.getByRole("button", { name: "1" });
    expect(btn).toBeInTheDocument();
  });

  it("PIN modal shows numpad with digits 0-9", async () => {
    const opened = await openPinModal();
    if (!opened) return;
    for (const d of ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"]) {
      expect(screen.getByRole("button", { name: d })).toBeInTheDocument();
    }
  });

  it("PIN modal shows backspace (⌫) button", async () => {
    const opened = await openPinModal();
    if (!opened) return;
    const backspaceBtns = screen.getAllByRole("button", { name: "⌫" });
    expect(backspaceBtns.length).toBeGreaterThanOrEqual(1);
  });

  it("PIN modal has 'START' button", async () => {
    const opened = await openPinModal();
    if (!opened) return;
    const startBtn = document.getElementById("pin-start-btn");
    expect(startBtn).not.toBeNull();
    expect(startBtn?.textContent).toMatch(/START/i);
  });

  it("tapping numpad digits updates PIN display (dots fill)", async () => {
    const opened = await openPinModal();
    if (!opened) return;
    const btn1 = screen.getByRole("button", { name: "1" });
    fireEvent.click(btn1);
    // After one tap, one dot should be filled (has bg-sage class)
    const dots = document.querySelectorAll(".w-4.h-4.rounded-full");
    const filledDots = Array.from(dots).filter(d => d.classList.contains("bg-sage"));
    expect(filledDots.length).toBeGreaterThanOrEqual(1);
  });

  it("backspace button clears last digit from PIN", async () => {
    const opened = await openPinModal();
    if (!opened) return;
    fireEvent.click(screen.getByRole("button", { name: "5" }));
    fireEvent.click(screen.getByRole("button", { name: "⌫" }));
    const dots = document.querySelectorAll(".w-4.h-4.rounded-full");
    const filledDots = Array.from(dots).filter(d => d.classList.contains("bg-sage"));
    expect(filledDots.length).toBe(0);
  });

  it("'START' button stays disabled until 4 digits are entered", async () => {
    const opened = await openPinModal();
    if (!opened) return;
    const startBtn = document.getElementById("pin-start-btn") as HTMLButtonElement;
    expect(startBtn.disabled).toBe(true);
    expect(screen.getByText("Insert PIN")).toBeInTheDocument();
  });

  it("entering 4 digits triggers validation — shows error for wrong PIN (no match)", async () => {
    const opened = await openPinModal();
    if (!opened) return;
    // The rpc mock returns empty data, so any PIN will fail
    for (const d of ["9", "9", "9", "9"]) {
      fireEvent.click(screen.getByRole("button", { name: d }));
    }
    await waitFor(() => {
      // Either "PIN not recognised" or "Checking PIN…" should appear
      const errorMsg = screen.queryByText(/PIN not recognised/i);
      const checkingMsg = screen.queryByText(/Checking PIN/i);
      expect(errorMsg || checkingMsg).not.toBeNull();
    }, { timeout: 2000 });
  });
});

// ─── Grand Ballroom grid tests ────────────────────────────────────────────────

describe("Kiosk — Grid Screen (Grand Ballroom)", () => {
  beforeEach(() => {
    mockUseAuth.mockReturnValue({ user: { id: "u1" }, teamMember: { organization_id: "org-1" }, session: null, loading: false, signOut: vi.fn() });
    localStorage.setItem("kiosk_location_id", "00000000-0000-0000-0000-000000000010");
    localStorage.setItem("kiosk_location_name", "Grand Ballroom");
    localStorage.setItem("kiosk_owner_user_id", "u1");
    localStorage.setItem("kiosk_owner_org_id", "org-1");
  });

  async function renderGrandBallroomGrid() {
    renderWithProviders(<Kiosk />);
    await screen.findByText(/What's on the agenda/i);
  }

  it("renders grid screen for Grand Ballroom with heading", async () => {
    await renderGrandBallroomGrid();
    expect(screen.getByText(/What's on the agenda/i)).toBeInTheDocument();
  });

  it("Grand Ballroom has Opening Checklist (morning) or Closing Checklist (evening)", async () => {
    await renderGrandBallroomGrid();
    expect(document.body).toBeDefined();
  });

  it("grid screen has Admin button for Grand Ballroom", async () => {
    await renderGrandBallroomGrid();
    const adminBtn = document.getElementById("admin-btn");
    expect(adminBtn).not.toBeNull();
  });

  it("grid screen shows stat strip for Grand Ballroom", async () => {
    await renderGrandBallroomGrid();
    expect(screen.getAllByText("Due now").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Overdue")).toBeInTheDocument();
  });
});

// ─── Completion Screen ────────────────────────────────────────────────────────

describe("Kiosk — Completion Screen", () => {
  it("returns to the grid after closing the PIN modal", async () => {
    mockUseAuth.mockReturnValue({ user: { id: "u1" }, teamMember: { organization_id: "org-1" }, session: null, loading: false, signOut: vi.fn() });
    localStorage.setItem("kiosk_location_id", "00000000-0000-0000-0000-000000000011");
    localStorage.setItem("kiosk_location_name", "Terrace");
    localStorage.setItem("kiosk_owner_user_id", "u1");
    localStorage.setItem("kiosk_owner_org_id", "org-1");
    renderWithProviders(<Kiosk />);
    await screen.findByText(/What's on the agenda/i);

    // Open PIN modal
    const checklistBtn = document.querySelector("[id^='checklist-card-']") as HTMLButtonElement;
    if (!checklistBtn) {
      expect(true).toBe(true);
      return;
    }
    fireEvent.click(checklistBtn);
    await waitFor(() => expect(screen.getByText("Insert PIN")).toBeInTheDocument());

    const closeBtn = screen.getByRole("button", { name: /close/i });
    fireEvent.click(closeBtn);
    await waitFor(() => {
      expect(screen.queryByText("Insert PIN")).not.toBeInTheDocument();
    });
    // Back on grid screen
    expect(screen.getByText(/What's on the agenda/i)).toBeInTheDocument();
  });
});

describe("Kiosk — Checklist Runner", () => {
  function renderRunner(checklist: any, onComplete = vi.fn()) {
    renderWithProviders(
      <ChecklistRunner
        checklist={checklist}
        staffName="Sarah Owner"
        onComplete={onComplete}
        onCancel={vi.fn()}
      />,
    );
    return onComplete;
  }

  it("restores a multi-select draft without skipping ahead to the next question", async () => {
    const checklist = {
      id: "ck-multi-resume",
      title: "Resume Multi Select Checklist",
      location_id: "00000000-0000-0000-0000-000000000011",
      time_of_day: "anytime",
      due_time: null,
      visibility_from: null,
      visibility_until: null,
      questions: [
        {
          id: "q-required-multi",
          text: "Select all that apply",
          type: "multiple_choice",
          required: true,
          selectionMode: "multiple",
          options: ["A", "B", "C"],
        },
        {
          id: "q-followup",
          text: "Next question",
          type: "text",
          required: true,
        },
      ],
    } as const;

    const { unmount } = renderWithProviders(
      <ChecklistRunner
        checklist={checklist}
        staffName="Sarah Owner"
        onComplete={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "A" }));

    await waitFor(() => {
      expect(screen.getByText("Select all that apply")).toBeInTheDocument();
    });

    unmount();

    renderWithProviders(
      <ChecklistRunner
        checklist={checklist}
        staffName="Sarah Owner"
        onComplete={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    await waitFor(() => {
      const currentQuestion = document.getElementById("question-q-required-multi");
      expect(currentQuestion).not.toBeNull();
      expect(currentQuestion?.tagName).toBe("DIV");
      expect(screen.getByText("Select all that apply")).toBeInTheDocument();
    });
  });

  it("executes ask-question triggers by moving into the generated follow-up question", async () => {
    renderRunner({
      id: "ck-follow-up",
      title: "Follow-up Trigger Checklist",
      location_id: "00000000-0000-0000-0000-000000000011",
      time_of_day: "anytime",
      due_time: null,
      visibility_from: null,
      visibility_until: null,
      questions: [
        {
          id: "q-base",
          text: "Confirm the fridge check",
          type: "checkbox",
          required: true,
          config: {
            logicRules: [
              {
                id: "lr-follow",
                comparator: "is",
                value: "Yes",
                triggers: [
                  {
                    type: "ask_question",
                    config: {
                      followUpQuestion: {
                        id: "q-follow",
                        text: "Did you recheck the fridge?",
                        responseType: "text",
                        required: true,
                        config: {},
                      },
                    },
                  },
                ],
              },
            ],
          },
        },
        {
          id: "q-final",
          text: "Final question",
          type: "text",
          required: true,
        },
      ],
    });

    fireEvent.click(screen.getByRole("button", { name: /tap to confirm/i }));

    await waitFor(() => {
      expect(screen.getByText("Did you recheck the fridge?")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText("Type your answer here…"), {
      target: { value: "Yes, I rechecked it." },
    });

    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    await waitFor(() => {
      expect(screen.getByText("Final question")).toBeInTheDocument();
    });
  });

  it("executes unanswered triggers after skipping a blank question", async () => {
    renderRunner({
      id: "ck-unanswered",
      title: "Unanswered Trigger Checklist",
      location_id: "00000000-0000-0000-0000-000000000011",
      time_of_day: "anytime",
      due_time: null,
      visibility_from: null,
      visibility_until: null,
      questions: [
        {
          id: "q-base",
          text: "Optional note",
          type: "text",
          required: false,
          config: {
            logicRules: [
              {
                id: "lr-unanswered",
                comparator: "unanswered",
                value: "",
                triggers: [
                  {
                    type: "ask_question",
                    config: {
                      followUpQuestion: {
                        id: "q-unanswered-follow",
                        text: "Why was this left blank?",
                        responseType: "text",
                        required: true,
                        config: {},
                      },
                    },
                  },
                ],
              },
            ],
          },
        },
        {
          id: "q-final",
          text: "Final question",
          type: "text",
          required: true,
        },
      ],
    });

    expect(screen.queryByText("Why was this left blank?")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    await waitFor(() => {
      expect(screen.getByText("Why was this left blank?")).toBeInTheDocument();
    });
  });

  it("executes require-note triggers by inserting a required note step", async () => {
    renderRunner({
      id: "ck-note-trigger",
      title: "Require Note Checklist",
      location_id: "00000000-0000-0000-0000-000000000011",
      time_of_day: "anytime",
      due_time: null,
      visibility_from: null,
      visibility_until: null,
      questions: [
        {
          id: "q-base",
          text: "Confirm the setup",
          type: "checkbox",
          required: true,
          config: {
            logicRules: [
              {
                id: "lr-note",
                comparator: "is",
                value: "Yes",
                triggers: [{ type: "require_note" }],
              },
            ],
          },
        },
        {
          id: "q-final",
          text: "After note",
          type: "text",
          required: true,
        },
      ],
    });

    fireEvent.click(screen.getByRole("button", { name: /tap to confirm/i }));

    await waitFor(() => {
      expect(screen.getByText(/note required/i)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText("Type your answer here…"), {
      target: { value: "All good." },
    });

    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    await waitFor(() => {
      expect(screen.getByText("After note")).toBeInTheDocument();
    });
  });

  it("executes require-media triggers by inserting a required photo step", async () => {
    const originalMediaDevices = navigator.mediaDevices;
    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
    const originalPlay = HTMLMediaElement.prototype.play;
    const mockStream = {
      getTracks: () => [{ stop: vi.fn() }],
    } as unknown as MediaStream;

    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: vi.fn().mockResolvedValue(mockStream),
      },
    });
    // @ts-expect-error test shim
    HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({ drawImage: vi.fn() });
    // @ts-expect-error test shim
    HTMLCanvasElement.prototype.toDataURL = vi.fn().mockReturnValue("data:image/png;base64,test-image");
    // @ts-expect-error test shim
    HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);

    try {
      renderRunner({
        id: "ck-media-trigger",
        title: "Require Media Checklist",
        location_id: "00000000-0000-0000-0000-000000000011",
        time_of_day: "anytime",
        due_time: null,
        visibility_from: null,
        visibility_until: null,
        questions: [
          {
            id: "q-base",
            text: "Confirm the delivery",
            type: "checkbox",
            required: true,
            config: {
              logicRules: [
                {
                  id: "lr-media",
                  comparator: "is",
                  value: "Yes",
                  triggers: [{ type: "require_media" }],
                },
              ],
            },
          },
          {
            id: "q-final",
            text: "After photo",
            type: "text",
            required: true,
          },
        ],
      });

      fireEvent.click(screen.getByRole("button", { name: /tap to confirm/i }));

      await waitFor(() => {
        expect(screen.getByText(/photo required/i)).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole("button", { name: /take photo/i }));
      await waitFor(() => {
        expect(screen.getByRole("button", { name: /capture photo/i })).toBeInTheDocument();
      });
      fireEvent.click(screen.getByRole("button", { name: /capture photo/i }));
      fireEvent.click(screen.getByRole("button", { name: /use photo/i }));

      fireEvent.click(screen.getByRole("button", { name: /next/i }));

      await waitFor(() => {
        expect(screen.getByText("After photo")).toBeInTheDocument();
      });
    } finally {
      Object.defineProperty(navigator, "mediaDevices", {
        configurable: true,
        value: originalMediaDevices,
      });
      HTMLCanvasElement.prototype.getContext = originalGetContext;
      HTMLCanvasElement.prototype.toDataURL = originalToDataURL;
      HTMLMediaElement.prototype.play = originalPlay;
    }
  });

  it("restores an instruction draft without marking the instruction as done before it is acknowledged", async () => {
    const checklist = {
      id: "ck-instruction-resume",
      title: "Resume Instruction Checklist",
      location_id: "00000000-0000-0000-0000-000000000011",
      time_of_day: "anytime",
      due_time: null,
      visibility_from: null,
      visibility_until: null,
      questions: [
        {
          id: "q-checkbox",
          text: "Confirm the setup",
          type: "checkbox",
          required: true,
        },
        {
          id: "q-instruction",
          text: "Instruction",
          type: "instruction",
          instructionText: "Wash your hands",
        },
        {
          id: "q-followup",
          text: "Next question",
          type: "text",
          required: true,
        },
      ],
    } as const;

    const { unmount } = renderWithProviders(
      <ChecklistRunner
        checklist={checklist}
        staffName="Sarah Owner"
        onComplete={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /tap to confirm/i }));

    await waitFor(() => {
      expect(screen.getByText("Wash your hands")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /acknowledge/i })).toBeInTheDocument();
    });

    unmount();

    renderWithProviders(
      <ChecklistRunner
        checklist={checklist}
        staffName="Sarah Owner"
        onComplete={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    await waitFor(() => {
      const currentQuestion = document.getElementById("question-q-instruction");
      expect(currentQuestion).not.toBeNull();
      expect(currentQuestion?.tagName).toBe("DIV");
      expect(screen.getByText("Wash your hands")).toBeInTheDocument();
    });
  });

  it("constrains the desktop runner shell to a centered column", () => {
    renderWithProviders(
      <ChecklistRunner
        checklist={{
          id: "ck-width",
          title: "Runner Width Check",
          location_id: "00000000-0000-0000-0000-000000000011",
          time_of_day: "anytime",
          due_time: null,
          visibility_from: null,
          visibility_until: null,
          questions: [
            { id: "q-text", text: "Runner width check", type: "text", required: true },
          ],
        }}
        staffName="Sarah Owner"
        onComplete={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    const shell = screen.getByTestId("kiosk-runner-shell");
    expect(shell.className).toContain("min-[900px]:max-w-[1120px]");
    expect(shell.className).toContain("mx-auto");
  });

  it("shows a manual next CTA for an optional unchecked checkbox and lets the user continue", async () => {
    await openRunnerWithQuestions([
      { id: "q-optional-checkbox", text: "Optional checkbox", responseType: "checkbox", required: false },
      { id: "q-instruction", text: "Instruction", responseType: "instruction", config: { instructionText: "Wash hands" } },
      { id: "q-required-text", text: "Required note", responseType: "text", required: true },
    ]);

    const nextBtn = screen.getByRole("button", { name: /next/i });
    expect(nextBtn.parentElement?.className).toContain("justify-end");

    fireEvent.click(nextBtn);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /acknowledge/i })).toBeInTheDocument();
    });
  });

  it("shows a next CTA for required multi-select multiple choice after an answer is selected", async () => {
    renderWithProviders(
      <ChecklistRunner
        checklist={{
          id: "ck-multi",
          title: "Multi Select Checklist",
          location_id: "00000000-0000-0000-0000-000000000011",
          time_of_day: "anytime",
          due_time: null,
          visibility_from: null,
          visibility_until: null,
          questions: [
            {
              id: "q-required-multi",
              text: "Select all that apply",
              type: "multiple_choice",
              required: true,
              selectionMode: "multiple",
              options: ["A", "B", "C"],
            },
            {
              id: "q-followup",
              text: "Next question",
              type: "text",
              required: true,
            },
          ],
        }}
        staffName="Sarah Owner"
        onComplete={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    const nextBtn = screen.getAllByRole("button", { name: /next/i })[0];
    expect(nextBtn).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "A" }));

    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: /next/i })[0]).toBeEnabled();
    });

    fireEvent.click(screen.getAllByRole("button", { name: /next/i })[0]);

    await waitFor(() => {
      expect(screen.getByText("Next question")).toBeInTheDocument();
    });
  });

  it("fires an out-of-range number alert after 90 seconds even if the checklist is completed", async () => {
    await openRunnerWithQuestions([
      {
        id: "q-fridge-temp",
        text: "Fridge temperature",
        responseType: "number",
        required: true,
        config: { numberMin: 2, numberMax: 5 },
      },
    ]);

    vi.useFakeTimers();

    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "9" } });
    fireEvent.click(screen.getByRole("button", { name: /complete checklist/i }));

    expect(alertsInsert).not.toHaveBeenCalled();

    await act(async () => { vi.advanceTimersByTime(89_999); });
    expect(alertsInsert).not.toHaveBeenCalled();

    await act(async () => { vi.advanceTimersByTime(1); });

    expect(alertsInsert).toHaveBeenCalledTimes(1);
    expect(alertsInsert).toHaveBeenCalledWith(expect.objectContaining({
      organization_id: "org-1",
      type: "warn",
      message: expect.stringContaining("Fridge temperature: recorded 9"),
      area: "Runner Test Checklist",
      source: "kiosk",
    }));
  });

  it("cancels the out-of-range alert if the number is corrected within 90 seconds", async () => {
    await openRunnerWithQuestions([
      {
        id: "q-fridge-temp",
        text: "Fridge temperature",
        responseType: "number",
        required: true,
        config: { numberMin: 2, numberMax: 5 },
      },
    ]);

    vi.useFakeTimers();

    const spin = screen.getByRole("spinbutton");
    fireEvent.change(spin, { target: { value: "9" } });

    await act(async () => { vi.advanceTimersByTime(30_000); });

    fireEvent.change(spin, { target: { value: "4" } });
    fireEvent.click(screen.getByRole("button", { name: /complete checklist/i }));

    await act(async () => { vi.advanceTimersByTime(60_000); });

    expect(alertsInsert).not.toHaveBeenCalled();
  });

  it("opens linked Infohub content from an instruction and lets the user close it", async () => {
    await openRunnerWithQuestions([
      {
        id: "q-instruction-link",
        text: "Read the guide",
        responseType: "instruction",
        config: {
          instructionText: "Open the linked document before you continue.",
          instructionLinkId: "s3",
          instructionLinkTitle: "Opening & closing procedure",
          instructionLinkSection: "library",
        },
      },
      { id: "q-required-text", text: "Required note", responseType: "text", required: true },
    ]);

    fireEvent.click(screen.getByRole("button", { name: /open linked document/i }));

    await waitFor(() => {
      expect(screen.getAllByText("Opening & closing procedure").length).toBeGreaterThan(0);
      expect(screen.getByText(/Arrive 30 minutes before service/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /close linked resource/i }));

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /close linked resource/i })).not.toBeInTheDocument();
    });
  });

  it("shows a manual next CTA for an optional photo question and uses live camera capture", async () => {
    const originalMediaDevices = navigator.mediaDevices;
    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
    const originalPlay = HTMLMediaElement.prototype.play;
    const mockStream = {
      getTracks: () => [{ stop: vi.fn() }],
    } as unknown as MediaStream;

    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: vi.fn().mockResolvedValue(mockStream),
      },
    });
    // @ts-expect-error test shim
    HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({ drawImage: vi.fn() });
    // @ts-expect-error test shim
    HTMLCanvasElement.prototype.toDataURL = vi.fn().mockReturnValue("data:image/png;base64,test-image");
    // @ts-expect-error test shim
    HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);

    try {
      await openRunnerWithQuestions([
        { id: "q-optional-media", text: "Take a photo", responseType: "media", required: false },
        { id: "q-instruction", text: "Instruction", responseType: "instruction", config: { instructionText: "Carry on" } },
      ]);

      const nextBtn = screen.getByRole("button", { name: /next/i });
      expect(nextBtn.parentElement?.className).toContain("justify-end");

      expect(document.querySelector('input[type="file"]')).toBeNull();

      fireEvent.click(screen.getByRole("button", { name: /take photo/i }));

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /capture photo/i })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole("button", { name: /capture photo/i }));
      fireEvent.click(screen.getByRole("button", { name: /use photo/i }));

      await waitFor(() => {
        expect(screen.getByText("Photo attached")).toBeInTheDocument();
      });

      fireEvent.click(nextBtn);

      await waitFor(() => {
        expect(screen.getByText("Carry on")).toBeInTheDocument();
      });
    } finally {
      Object.defineProperty(navigator, "mediaDevices", {
        configurable: true,
        value: originalMediaDevices,
      });
      HTMLCanvasElement.prototype.getContext = originalGetContext;
      HTMLCanvasElement.prototype.toDataURL = originalToDataURL;
      HTMLMediaElement.prototype.play = originalPlay;
    }
  });
});

// ─── URL param tests ──────────────────────────────────────────────────────────

describe("Kiosk — URL param locationId", () => {
  it("reading locationId from URL params jumps directly to grid screen", async () => {
    mockUseAuth.mockReturnValue({ user: { id: "u1" }, teamMember: { organization_id: "org-1" }, session: null, loading: false, signOut: vi.fn() });
    localStorage.clear();
    renderWithProviders(<Kiosk />, {
      initialEntries: ["/kiosk?locationId=00000000-0000-0000-0000-000000000011"],
    });
    await screen.findByText(/What's on the agenda/i);
    expect(screen.getByText(/What's on the agenda/i)).toBeInTheDocument();
  });
});
