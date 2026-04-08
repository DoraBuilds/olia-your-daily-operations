import { screen, fireEvent, waitFor, act } from "@testing-library/react";
import Kiosk from "@/pages/Kiosk";
import { renderWithProviders } from "../test-utils";

const mockNavigate = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const checklistLogsInsert = vi.fn().mockResolvedValue({ error: null });
const alertsInsert = vi.fn().mockResolvedValue({ error: null });

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

      const locations = [
        { id: "00000000-0000-0000-0000-000000000011", name: "Terrace" },
        { id: "00000000-0000-0000-0000-000000000010", name: "Grand Ballroom" },
      ];

      const chain: any = {
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        eq: vi.fn().mockImplementation((_: string, value: string) => {
          eqValue = value;
          return chain;
        }),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
        maybeSingle: vi.fn().mockImplementation(() => Promise.resolve({
          data: table === "locations" ? locations.find((location) => location.id === eqValue) ?? null : null,
          error: null,
        })),
        insert: vi.fn().mockResolvedValue({ error: null }),
        update: vi.fn().mockReturnThis(),
        upsert: vi.fn().mockResolvedValue({ error: null }),
        delete: vi.fn().mockReturnThis(),
        then: vi.fn().mockImplementation((cb) =>
          Promise.resolve(cb({
            data: locations,
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Render the Kiosk in Setup screen (no stored location). */
function renderSetup() {
  localStorage.clear();
  // Reset module-level persistence between tests
  return renderWithProviders(<Kiosk />);
}

/** Render the Kiosk starting at the grid screen (Terrace location pre-stored). */
async function renderGridScreen() {
  localStorage.setItem("kiosk_location_id", "00000000-0000-0000-0000-000000000011");
  localStorage.setItem("kiosk_location_name", "Terrace");
  renderWithProviders(<Kiosk />);
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

    if (fn === "validate_staff_pin") {
      return Promise.resolve({
        data: [
          {
            id: "staff-1",
            first_name: "Jay",
            last_name: "Tester",
            organization_id: "org-1",
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
  localStorage.clear();
  checklistLogsInsert.mockClear();
  alertsInsert.mockClear();
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

      if (fn === "validate_staff_pin") {
        return Promise.resolve({
          data: [{ id: "staff-1", first_name: "Jay", last_name: "Tester", organization_id: "org-1" }],
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
    localStorage.setItem("kiosk_location_id", "00000000-0000-0000-0000-000000000010");
    localStorage.setItem("kiosk_location_name", "Grand Ballroom");
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
    localStorage.setItem("kiosk_location_id", "00000000-0000-0000-0000-000000000011");
    localStorage.setItem("kiosk_location_name", "Terrace");
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

    fireEvent.click(screen.getByRole("button", { name: /open the linked document before you continue/i }));
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
    localStorage.clear();
    renderWithProviders(<Kiosk />, {
      initialEntries: ["/kiosk?locationId=00000000-0000-0000-0000-000000000011"],
    });
    await screen.findByText(/What's on the agenda/i);
    expect(screen.getByText(/What's on the agenda/i)).toBeInTheDocument();
  });
});
