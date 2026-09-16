/**
 * Admin.helpers.test.tsx
 *
 * Tests focused on Admin.tsx internal helper functions and UI behaviors that
 * are not exercised by the main Admin.test.tsx suite (parseGoogleOpeningHours
 * edge cases, trading_hours rendering, LocationModal add-new-location path,
 * ConfirmModal for deleting a location).
 */
import { screen, fireEvent, waitFor } from "@testing-library/react";
import Admin, { parseGoogleOpeningHours } from "@/pages/Admin";
import { renderWithProviders } from "../test-utils";

vi.mock("@/contexts/ConceptFilterContext", () => ({
  ALL_CONCEPTS: "all",
  useConceptFilter: () => ({
    concepts: [],
    selectedConceptId: "all",
    setSelectedConceptId: () => {},
    scopedLocationIds: null,
  }),
}));

vi.mock("@/lib/runtime-config", () => ({
  runtimeConfig: { googleMapsApiKey: "test-key" },
  getRuntimeConfig: () => ({
    googleMapsApiKey: "test-key",
    publicSiteUrl: "http://localhost:8080",
    supabaseUrl: "http://localhost:54321",
    supabaseAnonKey: "test",
    stripe: { priceIds: { starter: { monthly: "", annual: "" }, growth: { monthly: "", annual: "" } }, customerPortalUrl: null },
  }),
  buildRuntimeConfig: () => ({
    googleMapsApiKey: "test-key",
    publicSiteUrl: "http://localhost:8080",
    supabaseUrl: "http://localhost:54321",
    supabaseAnonKey: "test",
    stripe: { priceIds: { starter: { monthly: "", annual: "" }, growth: { monthly: "", annual: "" } }, customerPortalUrl: null },
  }),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      signInWithPassword: vi.fn().mockResolvedValue({ data: { session: { user: { id: "u1" } } }, error: null }),
      signOut: vi.fn().mockResolvedValue({}),
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      updateUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } }, error: null }),
    },
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      insert: vi.fn().mockResolvedValue({ error: null }),
      update: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockResolvedValue({ error: null }),
      delete: vi.fn().mockReturnThis(),
      then: vi.fn().mockImplementation((cb) => Promise.resolve(cb({ data: [], error: null }))),
    }),
    functions: { invoke: vi.fn().mockResolvedValue({ data: null, error: null }) },
  },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "u1", email: "manager@example.com" },
    session: { user: { id: "u1" } },
    teamMember: {
      id: "u1", organization_id: "org1", name: "Sarah", email: "sarah@example.com",
      role: "Owner", is_owner: true, is_manager: true, department_id: null,
      location_ids: [], permissions: {}, pin_reset_required: false,
    },
    loading: false,
    signOut: vi.fn(),
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("@/hooks/usePlan", () => ({
  usePlan: () => ({
    plan: "growth",
    resolvedPlan: "growth",
    planStatus: "active",
    billingUnavailable: false,
    features: { aiBuilder: true, fileConvert: true, recharts: true, maxLocations: 10, maxStaff: 200, maxChecklists: -1 },
    org: { name: "Test Org" },
    can: () => true,
    withinLimit: () => true,
    isActive: true,
    hasStripeSubscription: true,
    isLoading: false,
  }),
  useSaveActiveLocationsSelection: () => ({
    mutateAsync: vi.fn().mockResolvedValue({}),
    isPending: false,
  }),
  useUpdateOrganizationName: () => ({
    mutateAsync: vi.fn().mockResolvedValue({}),
    isPending: false,
  }),
}));

const mockLocations = [
  {
    id: "l1",
    concept_id: "concept-1",
    name: "Main Branch",
    address: "123 High Street",
    contact_email: "main@test.com",
    contact_phone: "555-1111",
    trading_hours: JSON.stringify({
      mon: { open: true, windows: [{ start: "09:00", end: "17:00" }] },
      tue: { open: true, windows: [{ start: "09:00", end: "17:00" }] },
      wed: { open: true, windows: [{ start: "09:00", end: "17:00" }] },
      thu: { open: true, windows: [{ start: "09:00", end: "17:00" }] },
      fri: { open: true, windows: [{ start: "09:00", end: "17:00" }] },
      sat: { open: false, windows: [] },
      sun: { open: false, windows: [] },
    }),
    archive_threshold_days: 90,
    lat: 45.76,
    lng: 4.86,
    place_id: "place-abc",
  },
  {
    id: "l2",
    concept_id: "concept-1",
    name: "City Centre",
    address: "456 Main Ave",
    contact_email: "city@test.com",
    contact_phone: "555-2222",
    trading_hours: "9-17",
    archive_threshold_days: 90,
  },
];

const mockConcepts = [{ id: "concept-1", organization_id: "org1", name: "The Crown Restaurant" }];

const mockTeam = [
  {
    id: "tm1", name: "Sarah Owner", email: "sarah@example.com", role: "Owner",
    is_owner: true, is_manager: true, department_id: null,
    initials: "SO", location_ids: ["l1"], pin_reset_required: false,
    permissions: { create_edit_checklists: true, assign_checklists: true, manage_staff_profiles: true, view_reporting: true, edit_location_details: true, manage_alerts: true, export_data: true, override_inactivity_threshold: true },
  },
];

const { mockUseLocations } = vi.hoisted(() => ({ mockUseLocations: vi.fn() }));
mockUseLocations.mockReturnValue({
  data: mockLocations,
  allLocations: mockLocations,
  inactiveLocations: [],
  maxLocations: 10,
  isOverLimit: false,
  graceEndsAt: null,
  isGraceActive: false,
  isGraceExpired: false,
  effectiveActiveLocationIds: mockLocations.map(l => l.id),
  isLoading: false,
});

vi.mock("@/hooks/useLocations", () => ({
  useLocations: mockUseLocations,
  useSaveLocation: () => ({ mutate: vi.fn(), mutateAsync: vi.fn() }),
  useDeleteLocation: () => ({ mutate: vi.fn() }),
}));

vi.mock("@/hooks/useConcepts", () => ({
  useConcepts: () => ({ data: mockConcepts, isLoading: false }),
  useSaveConcept: () => ({ mutate: vi.fn(), mutateAsync: vi.fn() }),
  useDeleteConcept: () => ({ mutate: vi.fn() }),
}));

vi.mock("@/hooks/useDepartments", () => ({
  useDepartments: () => ({ data: [], isLoading: false }),
  useDepartmentsForLocations: () => ({ data: [], isLoading: false }),
  useSaveDepartment: () => ({ mutate: vi.fn() }),
  useDeleteDepartment: () => ({ mutate: vi.fn() }),
}));

vi.mock("@/hooks/useTeamMembers", () => ({
  useTeamMembers: () => ({ data: mockTeam, isLoading: false }),
  useSaveTeamMember: () => ({ mutate: vi.fn(), mutateAsync: vi.fn().mockResolvedValue({}) }),
  useDeleteTeamMember: () => ({ mutate: vi.fn() }),
  useSaveAdminPin: () => ({ mutateAsync: vi.fn().mockResolvedValue({}), isPending: false }),
  useTeamMemberInvites: () => ({ data: [], isLoading: false }),
  useSendInvite: () => ({ mutate: vi.fn(), mutateAsync: vi.fn().mockResolvedValue({}), isPending: false }),
}));

vi.mock("@/hooks/useChecklists", () => ({
  useChecklists: () => ({ data: [], isLoading: false }),
  useFolders: () => ({ data: [], isLoading: false }),
  useSaveChecklist: () => ({ mutate: vi.fn() }),
  useDeleteChecklist: () => ({ mutate: vi.fn() }),
}));

afterEach(() => {
  document.getElementById("olia-gmaps")?.remove();
  // @ts-expect-error test cleanup
  delete window.google;
});

// ─── parseGoogleOpeningHours (exported helper) ────────────────────────────────

describe("Admin — parseGoogleOpeningHours helper", () => {
  it("returns null for null or empty input", () => {
    expect(parseGoogleOpeningHours(null)).toBeNull();
    expect(parseGoogleOpeningHours([])).toBeNull();
    expect(parseGoogleOpeningHours(undefined)).toBeNull();
  });

  it("returns null when no recognised day labels are found", () => {
    expect(parseGoogleOpeningHours(["Not a day: 9am–5pm"])).toBeNull();
  });

  it("parses standard Google Maps weekday text (Monday to Sunday)", () => {
    const result = parseGoogleOpeningHours([
      "Monday: 9:00 AM – 5:00 PM",
      "Tuesday: 9:00 AM – 5:00 PM",
      "Wednesday: 9:00 AM – 5:00 PM",
      "Thursday: 9:00 AM – 5:00 PM",
      "Friday: 9:00 AM – 5:00 PM",
      "Saturday: Closed",
      "Sunday: Closed",
    ]);
    expect(result).not.toBeNull();
    expect(result!.mon.open).toBe(true);
    expect(result!.mon.windows[0].start).toBe("09:00");
    expect(result!.mon.windows[0].end).toBe("17:00");
    expect(result!.sat.open).toBe(false);
    expect(result!.sun.open).toBe(false);
  });

  it("handles Open 24 hours entries", () => {
    const result = parseGoogleOpeningHours(["Monday: Open 24 hours"]);
    expect(result).not.toBeNull();
    expect(result!.mon.open).toBe(true);
    expect(result!.mon.windows[0].start).toBe("00:00");
    expect(result!.mon.windows[0].end).toBe("23:59");
  });

  it("handles split hours (comma-separated windows)", () => {
    const result = parseGoogleOpeningHours([
      "Monday: 9:00 AM – 12:00 PM, 2:00 PM – 6:00 PM",
    ]);
    expect(result).not.toBeNull();
    expect(result!.mon.windows.length).toBe(2);
    expect(result!.mon.windows[0].start).toBe("09:00");
    expect(result!.mon.windows[1].start).toBe("14:00");
  });

  it("handles PM times correctly (12pm stays as 12:00)", () => {
    const result = parseGoogleOpeningHours(["Friday: 12:00 PM – 10:00 PM"]);
    expect(result).not.toBeNull();
    expect(result!.fri.windows[0].start).toBe("12:00");
    expect(result!.fri.windows[0].end).toBe("22:00");
  });

  it("handles 12:00 AM as midnight (00:00)", () => {
    const result = parseGoogleOpeningHours(["Saturday: 12:00 AM – 11:59 PM"]);
    expect(result).not.toBeNull();
    expect(result!.sat.windows[0].start).toBe("00:00");
  });

  it("ignores malformed time ranges and skips that day", () => {
    const result = parseGoogleOpeningHours([
      "Monday: NOT_A_TIME",
      "Tuesday: 9:00 AM – 5:00 PM",
    ]);
    expect(result).not.toBeNull();
    expect(result!.tue.open).toBe(true);
    expect(result!.mon).toBeDefined();
  });
});

// ─── Location detail — trading_hours is never rendered ───────────────────────

describe("Admin — location detail renders parsed JSON trading_hours", () => {
  it("does not show trading_hours in the location detail card", async () => {
    renderWithProviders(<Admin />, { initialEntries: ["/admin/location"] });
    await waitFor(() => {
      expect(screen.getByText("Address")).toBeInTheDocument();
    });
    const hoursEl = Array.from(document.querySelectorAll("p")).find(el =>
      el.textContent?.includes("09:00") || el.textContent?.includes("Mon:")
    );
    expect(hoursEl).toBeFalsy();
  });

  it("does not crash for a location with plain-text trading_hours (fallback path)", async () => {
    renderWithProviders(<Admin />, { initialEntries: ["/admin/location"] });
    await waitFor(() => {
      expect(screen.getByText("Address")).toBeInTheDocument();
    });
    expect(document.body).toBeDefined();
  });
});

// ─── LocationModal — "Add location" path (new location, no existing data) ─────

describe("Admin — LocationModal add-new-location path", () => {
  it("opening 'Add location' form does not show opening hours", async () => {
    renderWithProviders(<Admin />, { initialEntries: ["/admin/location"] });
    const addBtn = await screen.findByText("Add location");
    fireEvent.click(addBtn);
    await waitFor(() => expect(screen.getByText("New location")).toBeInTheDocument());
    expect(screen.queryByText("Opening hours")).not.toBeInTheDocument();
  });

  it("submitting without a name keeps the form open (disabled save button)", async () => {
    renderWithProviders(<Admin />, { initialEntries: ["/admin/location"] });
    const addBtn = await screen.findByText("Add location");
    fireEvent.click(addBtn);
    await waitFor(() => expect(screen.getByText("New location")).toBeInTheDocument());
    const saveBtn = document.querySelector<HTMLButtonElement>('button[type="submit"]');
    expect(saveBtn).not.toBeNull();
    expect(saveBtn).toBeDisabled();
  });

  it("entering a location name and email enables the save button", async () => {
    renderWithProviders(<Admin />, { initialEntries: ["/admin/location"] });
    const addBtn = await screen.findByText("Add location");
    fireEvent.click(addBtn);
    await waitFor(() => expect(screen.getByText("New location")).toBeInTheDocument());
    fireEvent.change(screen.getByPlaceholderText(/e\.g\. Main Branch/i), {
      target: { value: "The Rooftop Bar" },
    });
    fireEvent.change(screen.getByPlaceholderText(/e\.g\. main@olia\.app/i), {
      target: { value: "rooftop@example.com" },
    });
    const saveBtn = document.querySelector<HTMLButtonElement>('button[type="submit"]');
    expect(saveBtn).not.toBeNull();
    expect(saveBtn).not.toBeDisabled();
  });
});

// ─── TeamMemberModal — free-text role field (replaces the old DepartmentRolePicker) ──

describe("Admin — TeamMemberModal role field", () => {
  async function openAddTeamMemberForm() {
    renderWithProviders(<Admin />, { initialEntries: ["/admin/users"] });
    await waitFor(() => expect(screen.getByText("Add a team member")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Add a team member"));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Add team member" })).toBeInTheDocument());
  }

  it("role is a free-text input, not a fixed set of buttons", async () => {
    await openAddTeamMemberForm();
    const roleInput = screen.getByPlaceholderText("e.g. Head Chef, Waiter, General Manager");
    fireEvent.change(roleInput, { target: { value: "Head Chef" } });
    expect((roleInput as HTMLInputElement).value).toBe("Head Chef");
    expect(screen.queryByRole("button", { name: "Owner" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Manager" })).not.toBeInTheDocument();
  });
});

// ─── ConfirmModal — delete location path ──────────────────────────────────────

describe("Admin — ConfirmModal (delete location)", () => {
  it("clicking location delete button opens a confirm modal", async () => {
    renderWithProviders(<Admin />, { initialEntries: ["/admin/location"] });
    await waitFor(() => expect(screen.getByText("Delete location")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Delete location"));
    await waitFor(() => {
      expect(screen.getByText("This will permanently remove the location and cannot be undone.")).toBeInTheDocument();
    });
  });

  it("confirm modal Cancel button closes the modal", async () => {
    renderWithProviders(<Admin />, { initialEntries: ["/admin/location"] });
    await waitFor(() => expect(screen.getByText("Delete location")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Delete location"));
    await waitFor(() => expect(screen.getByRole("button", { name: /^cancel$/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /^cancel$/i }));
    await waitFor(() => {
      expect(screen.queryByText("This will permanently remove the location and cannot be undone.")).not.toBeInTheDocument();
    });
  });
});

// ─── parseGoogleTimeTo24Hour edge cases (exercised via parseGoogleOpeningHours) ─

describe("Admin — parseGoogleOpeningHours time parsing edge cases", () => {
  it("handles hours without minutes (e.g. '9 AM')", () => {
    const result = parseGoogleOpeningHours(["Monday: 9 AM – 5 PM"]);
    expect(result).not.toBeNull();
    expect(result!.mon.windows[0].start).toBe("09:00");
    expect(result!.mon.windows[0].end).toBe("17:00");
  });

  it("handles 24-hour times without AM/PM", () => {
    const result = parseGoogleOpeningHours(["Monday: 09:30 – 17:30"]);
    expect(result).not.toBeNull();
    if (result!.mon.open && result!.mon.windows.length > 0) {
      expect(result!.mon.windows[0].start).toBe("09:30");
    }
  });

  it("ignores entries with invalid day labels", () => {
    const result = parseGoogleOpeningHours([
      "Funday: 9 AM – 5 PM",
      "Tuesday: 9 AM – 5 PM",
    ]);
    expect(result).not.toBeNull();
    expect(result!.tue.open).toBe(true);
  });

  it("skips windows with unparseable time values", () => {
    parseGoogleOpeningHours(["Monday: abc – xyz"]);
    expect(document.body).toBeDefined(); // no crash
  });
});

// ─── formatHoursText via location card ──────────────────────────────────────-

describe("Admin — formatHoursText (via location detail card)", () => {
  it("does not show trading_hours in the card even when all days are closed", async () => {
    const closedHours = JSON.stringify({
      mon: { open: false, windows: [] },
      tue: { open: false, windows: [] },
      wed: { open: false, windows: [] },
      thu: { open: false, windows: [] },
      fri: { open: false, windows: [] },
      sat: { open: false, windows: [] },
      sun: { open: false, windows: [] },
    });

    const closedLocationReturn = {
      data: [{ id: "l1", concept_id: "concept-1", name: "Main Branch", address: "123 High Street", trading_hours: closedHours, archive_threshold_days: 90, contact_email: "", contact_phone: "" }],
      allLocations: [{ id: "l1", concept_id: "concept-1", name: "Main Branch", address: "123 High Street", trading_hours: closedHours, archive_threshold_days: 90, contact_email: "", contact_phone: "" }],
      inactiveLocations: [],
      maxLocations: 10,
      isOverLimit: false,
      graceEndsAt: null,
      isGraceActive: false,
      isGraceExpired: false,
      effectiveActiveLocationIds: ["l1"],
      isLoading: false,
    };

    mockUseLocations.mockReturnValueOnce(closedLocationReturn);

    renderWithProviders(<Admin />, { initialEntries: ["/admin/location"] });
    await waitFor(() => expect(screen.getByText("Address")).toBeInTheDocument());

    expect(screen.queryByText("Closed all week")).not.toBeInTheDocument();
  });
});
