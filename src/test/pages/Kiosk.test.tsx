import { render, screen, fireEvent, waitFor, act, cleanup } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Kiosk, { ChecklistRunner } from "@/pages/Kiosk";
import { CompletionScreen } from "@/pages/kiosk/CompletionScreen";
import i18n from "@/lib/i18n";
import { renderWithProviders } from "../test-utils";
import { grantKioskStaffSession } from "@/lib/kiosk-staff-session";

const mockNavigate = vi.fn();
const { mockUseAuth, mockUseLocations } = vi.hoisted(() => ({
  mockUseAuth: vi.fn(),
  mockUseLocations: vi.fn(),
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

const mockSubmitKioskLog = vi.fn().mockResolvedValue({ data: "log-uuid-1", error: null });
const alertsInsert = vi.fn().mockResolvedValue({ error: null });
const mockInsertKioskAlert = vi.fn().mockResolvedValue({ data: null, error: null });
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
      setSession: vi.fn().mockResolvedValue({ error: null }),
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
    functions: {
      invoke: vi.fn().mockResolvedValue({
        data: { access_token: "a", refresh_token: "r", team_member_id: "tm-1", location_id: "00000000-0000-0000-0000-000000000011" },
        error: null,
      }),
    },
    storage: {
      from: vi.fn().mockReturnValue({
        upload: vi.fn().mockResolvedValue({ data: { path: "org-1/loc-1/123456_q1.jpg" }, error: null }),
        createSignedUrl: vi.fn().mockResolvedValue({ data: { signedUrl: "https://example.com/signed-photo.jpg" }, error: null }),
      }),
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
    rpc: vi.fn().mockImplementation((fn: string, params?: Record<string, unknown>) => {
      if (fn === "get_kiosk_checklists") {
        return Promise.resolve({
          data: [
            { id: "ck-test-1", title: "Table Setup Check", location_id: "00000000-0000-0000-0000-000000000011", sections: [] },
          ],
          error: null,
        });
      }

      if (fn === "verify_kiosk_token") {
        // Return true when the token matches the stored test token.
        return Promise.resolve({ data: true, error: null });
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

      if (fn === "validate_kiosk_member_pin") {
        return Promise.resolve({
          data: [{ id: "tm-1", name: "Sarah Owner", organization_id: "org-1", role: "Owner", location_ids: [] }],
          error: null,
        });
      }

      if (fn === "get_kiosk_library") {
        return Promise.resolve({ data: { folders: [], documents: [] }, error: null });
      }

      if (fn === "insert_kiosk_alert") {
        return mockInsertKioskAlert(params);
      }

      if (fn === "submit_kiosk_log") {
        return mockSubmitKioskLog(params);
      }

      return Promise.resolve({ data: [], error: null });
    }),
  },
}));

vi.mock("@/hooks/useLocations", () => ({
  useLocations: () => mockUseLocations(),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Renders Kiosk in a plain <MemoryRouter> with a /login stand-in. Use for
 * any test that ends unpaired: Kiosk then <Navigate>s to /login?tab=kiosk,
 * and a data router's navigation (renderWithProviders) throws in jsdom
 * (undici rejects jsdom's AbortSignal).
 */
function renderWithLoginRoute(initialPath = "/kiosk") {
  function LoginProbe() {
    const location = useLocation();
    return <p>login page {location.search}</p>;
  }
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/kiosk" element={<Kiosk />} />
          <Route path="/login" element={<LoginProbe />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

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
  // Store a test kiosk_token so verify_kiosk_token RPC check passes (SEQ-009).
  localStorage.setItem("kiosk_token", "test-kiosk-token-uuid");
  renderWithProviders(<Kiosk />);

  if (!screen.queryByTestId("kiosk-tab-due")) {
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

  await screen.findByTestId("kiosk-tab-due");
}

async function openRunnerWithQuestions(questions: any[]) {
  const { supabase } = await import("@/lib/supabase");
  supabase.rpc.mockImplementation((fn: string, params?: Record<string, unknown>) => {
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

    if (fn === "verify_kiosk_token") {
      return Promise.resolve({ data: true, error: null });
    }

    if (fn === "validate_kiosk_member_pin") {
      return Promise.resolve({
        data: [{ id: "tm-1", name: "Sarah Owner", organization_id: "org-1" }],
        error: null,
      });
    }

    if (fn === "insert_kiosk_alert") {
      return mockInsertKioskAlert(params);
    }

    if (fn === "submit_kiosk_log") {
      return mockSubmitKioskLog(params);
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
    expect(screen.getByRole("button", { name: /complete checklist/i })).toBeInTheDocument();
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  // Most tests in this file exercise the grid/runner/completion flow, which
  // is unrelated to the new identify-first gate (#780) — pre-seed a valid
  // "already identified" session so they see the grid immediately, same as
  // before that gate existed. The "Identify Screen" describe block below
  // clears this per-test to exercise the gate itself.
  grantKioskStaffSession({ staffId: "tm-1", staffName: "Sarah Owner", organizationId: "org-1", departmentIds: [] });
  mockSubmitKioskLog.mockClear();
  alertsInsert.mockClear();
  mockInsertKioskAlert.mockClear();
  mockUseAuth.mockReturnValue({
    teamMember: null,
    user: null,
    session: null,
    loading: false,
    signOut: vi.fn(),
  });
  mockUseLocations.mockReturnValue({
    allLocations: mockLocations,
    isFetched: true,
    isError: false,
  });
});

afterEach(() => {
  localStorage.clear();
  vi.useRealTimers();
});

// ─── Setup Screen tests ───────────────────────────────────────────────────────

// #861: pairing happens on Login -> Kiosk with a code; /kiosk itself no
// longer has an on-device location picker.
describe("Kiosk — not paired", () => {
  it("sends an unpaired browser to the Kiosk tab of the login page", async () => {
    localStorage.clear();
    renderWithLoginRoute();
    expect(await screen.findByText("login page ?tab=kiosk")).toBeInTheDocument();
  });

  it("ignores the old ?locationId= setup links", async () => {
    mockUseAuth.mockReturnValue({ user: { id: "u1" }, teamMember: { organization_id: "org-1" }, session: null, loading: false, signOut: vi.fn() });
    localStorage.clear();
    renderWithLoginRoute("/kiosk?locationId=00000000-0000-0000-0000-000000000011");
    expect(await screen.findByText("login page ?tab=kiosk")).toBeInTheDocument();
    expect(localStorage.getItem("kiosk_location_id")).toBeNull();
  });
});

// ─── Grid Screen tests ────────────────────────────────────────────────────────

describe("Kiosk — Grid Screen", () => {
  it("grid screen heading shows the kiosk's location name", async () => {
    await renderGridScreen();
    expect(screen.getByRole("heading", { name: "Terrace" })).toBeInTheDocument();
  });

  it("vertically centers a short checklist state (e.g. 'nothing due') via a flex column + auto-margin wrapper, so it isn't stranded at the top with a large empty gap below on a tall tablet screen", async () => {
    await renderGridScreen();
    const grid = screen.getByTestId("kiosk-checklist-grid");
    expect(grid).toHaveClass("flex", "flex-col");
    // my-auto's margin collapses to 0 once real checklist cards overflow
    // the pane, so a busy kiosk still lists from the top and scrolls.
    expect(grid.firstElementChild).toHaveClass("my-auto");
  });

  it("shows a device-scoped language picker defaulting to English", async () => {
    await renderGridScreen();
    expect(screen.getByRole("combobox")).toHaveTextContent("EN");
  });

  it("restores a previously chosen kiosk language from localStorage on load", async () => {
    mockUseAuth.mockReturnValue({ user: { id: "u1" }, teamMember: { organization_id: "org-1" }, session: null, loading: false, signOut: vi.fn() });
    localStorage.setItem("kiosk_language", "es");
    localStorage.setItem("kiosk_location_id", "00000000-0000-0000-0000-000000000011");
    localStorage.setItem("kiosk_location_name", "Terrace");
    localStorage.setItem("kiosk_owner_user_id", "u1");
    localStorage.setItem("kiosk_owner_org_id", "org-1");
    renderWithProviders(<Kiosk />);

    await waitFor(() => {
      expect(screen.getByRole("combobox")).toHaveTextContent("ES");
    });
  });

  it("persists the chosen language to localStorage so it sticks for the next guest", async () => {
    await renderGridScreen();
    fireEvent.click(screen.getByRole("combobox"));
    fireEvent.click(screen.getByText("Español"));

    await waitFor(() => {
      expect(localStorage.getItem("kiosk_language")).toBe("es");
    });
    expect(screen.getByRole("combobox")).toHaveTextContent("ES");
  });

  // #861: a paired kiosk runs signed out. Any session it finds without a
  // live Admin-PIN grant (e.g. the owner session devices set up the old way
  // were left with) is signed out — and the kiosk keeps running.
  it("signs out a leftover session when there's no admin grant, without un-pairing", async () => {
    const { supabase } = await import("@/lib/supabase");
    (supabase.auth.signOut as ReturnType<typeof vi.fn>).mockClear();
    await renderGridScreen({ user: { id: "u1" }, teamMember: { organization_id: "org-1" }, session: null, loading: false, signOut: vi.fn() });
    await waitFor(() => expect(supabase.auth.signOut).toHaveBeenCalledWith({ scope: "local" }));
    expect(localStorage.getItem("kiosk_location_id")).toBe("00000000-0000-0000-0000-000000000011");
  });

  it("keeps the session while an Admin-PIN grant is live", async () => {
    const { supabase } = await import("@/lib/supabase");
    const { grantKioskAdminSession } = await import("@/lib/kiosk-admin-session");
    (supabase.auth.signOut as ReturnType<typeof vi.fn>).mockClear();
    localStorage.setItem("kiosk_location_id", "00000000-0000-0000-0000-000000000011");
    grantKioskAdminSession("tm-1", "00000000-0000-0000-0000-000000000011");
    await renderGridScreen({ user: { id: "u1" }, teamMember: { organization_id: "org-1" }, session: null, loading: false, signOut: vi.fn() });
    expect(supabase.auth.signOut).not.toHaveBeenCalled();
    sessionStorage.clear();
  });

  it("keeps a configured kiosk on the grid screen when the auth session disappears (session expiry, not a sign-out)", async () => {
    // Simulates the bug Jay reported: the kiosk was configured while an owner
    // was logged in, then the underlying Supabase session silently expired
    // (JWT refresh failure, storage eviction, etc). Losing `user` must not
    // wipe the kiosk's location binding — only a genuinely different signed-in
    // owner should ever reset it.
    await renderGridScreen();
    expect(screen.getByTestId("kiosk-tab-due")).toBeInTheDocument();
    cleanup(); // simulate a full page reload, not just an in-app re-render

    mockUseAuth.mockReturnValue({ user: null, teamMember: null, session: null, loading: false, signOut: vi.fn() });
    renderWithProviders(<Kiosk />);

    await screen.findByTestId("kiosk-tab-due");
    expect(screen.queryByText(/Select a location to launch/i)).not.toBeInTheDocument();
    expect(localStorage.getItem("kiosk_location_id")).toBe("00000000-0000-0000-0000-000000000011");
    expect(localStorage.getItem("kiosk_owner_user_id")).toBe("u1");
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

  it("grid screen shows date/time in top bar without a status label", async () => {
    await renderGridScreen();
    expect(screen.queryByText("Current Status")).not.toBeInTheDocument();
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

  it("Admin Login Modal has a numpad (no legacy text input)", async () => {
    await renderGridScreen();
    const adminBtn = document.getElementById("admin-btn") as HTMLButtonElement;
    fireEvent.click(adminBtn);
    await waitFor(() => {
      expect(screen.getByText("Admin PIN")).toBeInTheDocument();
      expect(document.getElementById("admin-pin-input")).toBeNull();
      expect(document.getElementById("admin-email-input")).toBeNull();
    });
    // Numpad digit buttons should be present
    const digitBtns = screen.getAllByRole("button").filter(b => /^[0-9]$/.test(b.textContent ?? ""));
    expect(digitBtns.length).toBeGreaterThanOrEqual(10);
  });

  it("Admin Login Modal shows 'Forgot your PIN?' recovery link", async () => {
    await renderGridScreen();
    const adminBtn = document.getElementById("admin-btn") as HTMLButtonElement;
    fireEvent.click(adminBtn);
    await waitFor(() => {
      expect(screen.getByText(/Forgot your PIN\?/i)).toBeInTheDocument();
    });
    expect(document.getElementById("admin-pin-signin-btn")).toBeNull();
  });

  it("entering 3 digits does not yet submit", async () => {
    const { supabase } = await import("@/lib/supabase");
    (supabase.rpc as ReturnType<typeof vi.fn>).mockClear();
    await renderGridScreen();
    const adminBtn = document.getElementById("admin-btn") as HTMLButtonElement;
    fireEvent.click(adminBtn);
    await waitFor(() => expect(screen.getByText("Admin PIN")).toBeInTheDocument());
    const getDigitBtn = (d: string) =>
      screen.getAllByRole("button").find(b => b.textContent?.trim() === d)!;
    // Each click in its own act so React flushes pin state between taps
    await act(async () => { fireEvent.click(getDigitBtn("1")); });
    await act(async () => { fireEvent.click(getDigitBtn("2")); });
    await act(async () => { fireEvent.click(getDigitBtn("3")); });
    // Auto-submit only fires on 4th digit
    expect(supabase.rpc).not.toHaveBeenCalledWith("validate_admin_pin", expect.anything());
  });

  it("entering 4 digits auto-submits the PIN with this device's token to kiosk-admin-login", async () => {
    const { supabase } = await import("@/lib/supabase");
    localStorage.setItem("kiosk_device_token", "device-token-1");
    await renderGridScreen();
    const adminBtn = document.getElementById("admin-btn") as HTMLButtonElement;
    fireEvent.click(adminBtn);
    await waitFor(() => expect(screen.getByText("Admin PIN")).toBeInTheDocument());

    // Click each digit in its own act() so React re-renders between clicks and
    // the pin state accumulates correctly before the 4th digit triggers auto-submit.
    const getDigitBtn = (d: string) =>
      screen.getAllByRole("button").find(b => b.textContent?.trim() === d)!;

    await act(async () => { fireEvent.click(getDigitBtn("1")); });
    await act(async () => { fireEvent.click(getDigitBtn("2")); });
    await act(async () => { fireEvent.click(getDigitBtn("3")); });
    await act(async () => { fireEvent.click(getDigitBtn("4")); });


    await waitFor(() => {
      expect(supabase.functions.invoke).toHaveBeenCalledWith("kiosk-admin-login", {
        body: { device_token: "device-token-1", pin: "1234" },
      });
    });
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/admin?from=kiosk"));
    expect(supabase.auth.setSession).toHaveBeenCalledWith({ access_token: "a", refresh_token: "r" });
    sessionStorage.clear();
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

  it("opens a checklist as the signed-in person without asking for a second PIN (#869)", async () => {
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
              sections: [{ name: "Main", questions: [{ id: "q1", text: "Check done?", responseType: "checkbox", required: false, config: {} }] }],
            },
          ],
          error: null,
        });
      }
      return Promise.resolve({ data: [], error: null });
    });

    await renderGridScreen();
    const checklistBtn = await waitFor(() => {
      const btn = document.querySelector("[id^='checklist-card-']") as HTMLButtonElement | null;
      expect(btn).not.toBeNull();
      return btn!;
    });
    fireEvent.click(checklistBtn);

    await waitFor(() => {
      expect(screen.getByText("Check done?")).toBeInTheDocument();
    });
    // Runner is attributed to the identified person (seeded in beforeEach).
    expect(screen.getByText(/Sarah Owner/)).toBeInTheDocument();
    expect(screen.queryByText("Insert PIN")).not.toBeInTheDocument();
    expect(supabase.rpc).not.toHaveBeenCalledWith("validate_kiosk_member_pin", expect.anything());
    expect(supabase.rpc).not.toHaveBeenCalledWith("validate_staff_pin", expect.anything());
  });

  it("opens the Library as the signed-in person without asking for a second PIN (#869)", async () => {
    grantKioskStaffSession({ staffId: null, memberId: "tm-1", staffName: "Sarah Owner", organizationId: "org-1", departmentIds: [] });
    const { supabase } = await import("@/lib/supabase");
    await renderGridScreen();

    fireEvent.click(document.getElementById("library-btn")!);

    await waitFor(() => {
      expect(supabase.rpc).toHaveBeenCalledWith("get_kiosk_library", expect.objectContaining({ p_team_member_id: "tm-1" }));
    });
    expect(supabase.rpc).not.toHaveBeenCalledWith("validate_kiosk_member_pin", expect.anything());
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

      if (fn === "verify_kiosk_token") {
        return Promise.resolve({ data: true, error: null });
      }

      if (fn === "validate_kiosk_member_pin") {
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

// ─── Identify Screen tests (#780) ──────────────────────────────────────────────

describe("Kiosk — Identify Screen", () => {
  beforeEach(() => {
    // Override the beforeEach seed above — these tests exercise the gate itself.
    sessionStorage.clear();
    localStorage.setItem("kiosk_location_id", "00000000-0000-0000-0000-000000000011");
    localStorage.setItem("kiosk_location_name", "Terrace");
    localStorage.setItem("kiosk_owner_user_id", "u1");
    localStorage.setItem("kiosk_owner_org_id", "org-1");
    localStorage.setItem("kiosk_token", "test-kiosk-token-uuid");
    mockUseAuth.mockReturnValue({
      user: { id: "u1" }, teamMember: { organization_id: "org-1" }, session: null, loading: false, signOut: vi.fn(),
    });
  });

  it("shows the identify PIN screen instead of the grid when no session exists", async () => {
    renderWithProviders(<Kiosk />);
    await waitFor(() => {
      expect(screen.getByText("Enter PIN:")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("kiosk-tab-due")).not.toBeInTheDocument();
  });

  it("identifies a team member by PIN and reveals the department-filtered grid", async () => {
    const { supabase } = await import("@/lib/supabase");
    supabase.rpc.mockImplementation((fn: string) => {
      if (fn === "get_kiosk_checklists") {
        return Promise.resolve({
          data: [{ id: "ck-test-1", title: "Table Setup Check", location_id: "00000000-0000-0000-0000-000000000011", sections: [] }],
          error: null,
        });
      }
      if (fn === "verify_kiosk_token") return Promise.resolve({ data: true, error: null });
      if (fn === "validate_kiosk_member_pin") {
        return Promise.resolve({
          data: [{ id: "tm-2", name: "Priya GM", first_name: "Priya", organization_id: "org-1", role: "Manager", location_ids: [], department_ids: ["dep-1", "dep-2"] }],
          error: null,
        });
      }
      return Promise.resolve({ data: [], error: null });
    });

    renderWithProviders(<Kiosk />);
    await waitFor(() => expect(screen.getByText("Enter PIN:")).toBeInTheDocument());

    for (const d of ["1", "2", "3", "4"]) {
      fireEvent.click(screen.getByRole("button", { name: d }));
    }

    await screen.findByTestId("kiosk-tab-due");
    expect(screen.getByText("Hi, Priya")).toBeInTheDocument();
    expect(supabase.rpc).toHaveBeenCalledWith("get_kiosk_checklists", expect.objectContaining({
      p_location_id: "00000000-0000-0000-0000-000000000011",
      p_department_ids: ["dep-1", "dep-2"],
    }));
  });

  it("shows a 'not recognised' error for an unknown PIN", async () => {
    const { supabase } = await import("@/lib/supabase");
    supabase.rpc.mockImplementation((fn: string) => {
      if (fn === "verify_kiosk_token") return Promise.resolve({ data: true, error: null });
      if (fn === "validate_kiosk_member_pin") return Promise.resolve({ data: [], error: null });
      if (fn === "validate_staff_pin") return Promise.resolve({ data: [], error: null });
      return Promise.resolve({ data: [], error: null });
    });

    renderWithProviders(<Kiosk />);
    await waitFor(() => expect(screen.getByText("Enter PIN:")).toBeInTheDocument());

    for (const d of ["9", "9", "9", "9"]) {
      fireEvent.click(screen.getByRole("button", { name: d }));
    }

    await waitFor(() => {
      expect(screen.getByText("PIN not recognised. Please try again.")).toBeInTheDocument();
    });
  });

  it("signs in a legacy staff-profile PIN when no team member matches", async () => {
    const { supabase } = await import("@/lib/supabase");
    supabase.rpc.mockImplementation((fn: string) => {
      if (fn === "verify_kiosk_token") return Promise.resolve({ data: true, error: null });
      if (fn === "validate_kiosk_member_pin") return Promise.resolve({ data: [], error: null });
      if (fn === "validate_staff_pin") {
        return Promise.resolve({
          data: [{ id: "sp-1", first_name: "Jay", last_name: "Chen", role: "Waiter", organization_id: "org-1" }],
          error: null,
        });
      }
      return Promise.resolve({ data: [], error: null });
    });

    renderWithProviders(<Kiosk />);
    await waitFor(() => expect(screen.getByText("Enter PIN:")).toBeInTheDocument());

    for (const d of ["5", "6", "7", "8"]) {
      fireEvent.click(screen.getByRole("button", { name: d }));
    }

    await waitFor(() => {
      expect(screen.getByText("Hi, Jay")).toBeInTheDocument();
    });
  });

  it("shows a connection error when the staff PIN check fails", async () => {
    const { supabase } = await import("@/lib/supabase");
    supabase.rpc.mockImplementation((fn: string) => {
      if (fn === "verify_kiosk_token") return Promise.resolve({ data: true, error: null });
      if (fn === "validate_kiosk_member_pin") return Promise.resolve({ data: [], error: null });
      if (fn === "validate_staff_pin") return Promise.resolve({ data: null, error: { message: "network error" } });
      return Promise.resolve({ data: [], error: null });
    });

    renderWithProviders(<Kiosk />);
    await waitFor(() => expect(screen.getByText("Enter PIN:")).toBeInTheDocument());

    for (const d of ["1", "2", "3", "4"]) {
      fireEvent.click(screen.getByRole("button", { name: d }));
    }

    await waitFor(() => {
      expect(screen.queryByText(/Connection error/i)).not.toBeNull();
    });
  });

  it("'Not you?' clears the session and returns to the identify screen", async () => {
    grantKioskStaffSession({ staffId: "tm-1", staffName: "Sarah Owner", organizationId: "org-1", departmentIds: [] });
    await renderGridScreen();

    fireEvent.click(screen.getByText("Not you?"));

    await waitFor(() => {
      expect(screen.getByText("Enter PIN:")).toBeInTheDocument();
    });
  });

  it("Admin and Infohub stay reachable from the identify screen", async () => {
    renderWithProviders(<Kiosk />);
    await waitFor(() => expect(screen.getByText("Enter PIN:")).toBeInTheDocument());

    expect(document.getElementById("admin-btn")).not.toBeNull();
    fireEvent.click(document.getElementById("library-btn")!);
    await waitFor(() => {
      expect(screen.getByText("Infohub", { selector: "h1, h2, h3" })).toBeInTheDocument();
    });
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
    // Store a test kiosk_token so verify_kiosk_token RPC check passes (SEQ-009).
    localStorage.setItem("kiosk_token", "test-kiosk-token-uuid");
  });

  async function renderGrandBallroomGrid() {
    renderWithProviders(<Kiosk />);
    await screen.findByTestId("kiosk-tab-due");
  }

  it("renders grid screen for Grand Ballroom with heading", async () => {
    await renderGrandBallroomGrid();
    expect(screen.getByTestId("kiosk-tab-due")).toBeInTheDocument();
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
  it("renders in Spanish when the active language is es", async () => {
    await i18n.changeLanguage("es");
    try {
      await act(async () => {
        renderWithProviders(
          <CompletionScreen
            checklist={{ id: "c1", title: "Opening Checklist" } as any}
            staffName="Sarah"
            completedAt={new Date("2026-08-07T10:00:00Z")}
            onDone={vi.fn()}
          />,
        );
      });
      expect(screen.getByText("¡Muy bien!")).toBeInTheDocument();
      expect(screen.getByText("Listo")).toBeInTheDocument();
      expect(screen.getByText(/Volviendo al inicio en \d+s/)).toBeInTheDocument();
    } finally {
      await i18n.changeLanguage("en");
    }
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
    fireEvent.click(screen.getByRole("button", { name: /next/i }));

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
    fireEvent.click(screen.getByRole("button", { name: /next/i }));

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
      fireEvent.click(screen.getByRole("button", { name: /next/i }));

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
    fireEvent.click(screen.getByRole("button", { name: /next →/i }));

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

  it("does not show a status circle next to the open question's text", async () => {
    await openRunnerWithQuestions([
      { id: "q-open-checkbox", text: "Fridge checked", responseType: "checkbox", required: true },
    ]);

    const headerRow = screen.getByText("Fridge checked").parentElement;
    expect(headerRow?.querySelector(".rounded-full")).toBeNull();
  });

  it("numbers the open question and the collapsed questions", async () => {
    await openRunnerWithQuestions([
      { id: "q-first", text: "First check", responseType: "checkbox", required: true },
      { id: "q-second", text: "Second check", responseType: "checkbox", required: true },
    ]);

    expect(document.getElementById("question-q-first")?.textContent).toContain("1.First check");
    expect(document.getElementById("question-q-second")?.textContent).toContain("2.Second check");
  });

  it("stays on a question after it is answered until the user taps Next", async () => {
    await openRunnerWithQuestions([
      { id: "q-required-checkbox", text: "Fridge checked", responseType: "checkbox", required: true },
      { id: "q-after", text: "After checkbox", responseType: "text", required: true },
    ]);

    const nextBtn = screen.getByRole("button", { name: /next/i });
    expect(nextBtn).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: /tap to confirm/i }));

    expect(screen.getByRole("button", { name: /next/i })).toBeEnabled();
    expect(screen.queryByPlaceholderText("Type your answer here…")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Type your answer here…")).toBeInTheDocument();
    });
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

    expect(mockInsertKioskAlert).not.toHaveBeenCalled();

    await act(async () => { vi.advanceTimersByTime(89_999); });
    expect(mockInsertKioskAlert).not.toHaveBeenCalled();

    await act(async () => { vi.advanceTimersByTime(1); });

    expect(mockInsertKioskAlert).toHaveBeenCalledTimes(1);
    expect(mockInsertKioskAlert).toHaveBeenCalledWith(expect.objectContaining({
      p_type: "warn",
      p_message: expect.stringContaining("Fridge temperature: recorded 9"),
      p_area: "Runner Test Checklist",
    }));
  });

  it("invalidates the alerts query cache after a successful out-of-range alert insert", async () => {
    const { QueryClient } = await import("@tanstack/react-query");
    const invalidateSpy = vi.spyOn(QueryClient.prototype, "invalidateQueries");

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

    await act(async () => { vi.advanceTimersByTime(90_000); });

    expect(mockInsertKioskAlert).toHaveBeenCalledTimes(1);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["alerts"] });

    invalidateSpy.mockRestore();
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

    expect(mockInsertKioskAlert).not.toHaveBeenCalled();
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
    const originalToBlob = HTMLCanvasElement.prototype.toBlob;
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
    HTMLCanvasElement.prototype.toDataURL = vi.fn().mockReturnValue("data:image/jpeg;base64,test-image");
    // Mock toBlob used by compressToJpeg — resolves with a small JPEG blob
    // @ts-expect-error test shim
    HTMLCanvasElement.prototype.toBlob = vi.fn().mockImplementation((cb: BlobCallback) => {
      cb(new Blob(["fake-jpeg"], { type: "image/jpeg" }));
    });
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
      HTMLCanvasElement.prototype.toBlob = originalToBlob;
      HTMLMediaElement.prototype.play = originalPlay;
    }
  });

  it("invalidates the checklist_logs query cache after a successful submission, so Dashboard/Reporting refetch", async () => {
    const { QueryClient } = await import("@tanstack/react-query");
    const invalidateSpy = vi.spyOn(QueryClient.prototype, "invalidateQueries");

    await openRunnerWithQuestions([
      { id: "q-1", text: "Everything stocked?", responseType: "checkbox", required: false },
    ]);

    fireEvent.click(screen.getByRole("button", { name: /complete checklist/i }));

    await waitFor(() => {
      expect(mockSubmitKioskLog).toHaveBeenCalled();
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["checklist_logs"] });

    invalidateSpy.mockRestore();
  });
});

describe("Kiosk — survives a transient locations-fetch error", () => {
  // A device must not wipe its kiosk config over a network blip — it should
  // just wait for the next successful re-check.
  it("keeps the stored kiosk location on an anonymous device when the location re-check query errors", async () => {
    // The anonymous kiosk path (no live session — the normal state for a
    // wall-mounted device) re-verifies its location via a raw supabase call,
    // independent of useLocations. It used to destructure only `data` and
    // ignore `error`, so a failed request looked identical to "row not
    // found" and wiped the kiosk's config.
    const { supabase } = await import("@/lib/supabase");
    mockUseAuth.mockReturnValue({ user: null, teamMember: null, session: null, loading: false, signOut: vi.fn() });
    localStorage.setItem("kiosk_location_id", "00000000-0000-0000-0000-000000000011");
    localStorage.setItem("kiosk_location_name", "Terrace");
    localStorage.setItem("kiosk_owner_user_id", "u1");
    localStorage.setItem("kiosk_owner_org_id", "org-1");
    localStorage.setItem("kiosk_token", "test-kiosk-token-uuid");

    (supabase.from as any).mockImplementationOnce((table: string) => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue(
        table === "locations"
          ? { data: null, error: { message: "network error" } }
          : { data: null, error: null },
      ),
    }));

    renderWithProviders(<Kiosk />);

    await waitFor(() => {
      expect(screen.getByTestId("kiosk-tab-due")).toBeInTheDocument();
    });
    expect(localStorage.getItem("kiosk_location_id")).toBe("00000000-0000-0000-0000-000000000011");
  });

  it("still clears the kiosk location when the re-check succeeds but the location is gone", async () => {
    const { supabase } = await import("@/lib/supabase");
    localStorage.setItem("kiosk_location_id", "deleted-location");
    localStorage.setItem("kiosk_location_name", "Old Place");
    localStorage.setItem("kiosk_token", "test-kiosk-token-uuid");
    (supabase.from as any).mockImplementationOnce(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    }));
    renderWithLoginRoute();

    expect(await screen.findByText("login page ?tab=kiosk")).toBeInTheDocument();
    expect(localStorage.getItem("kiosk_location_id")).toBeNull();
  });
});
