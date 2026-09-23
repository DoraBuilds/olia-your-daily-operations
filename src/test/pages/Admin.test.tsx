import { screen, fireEvent, waitFor } from "@testing-library/react";
import Admin, { parseGoogleOpeningHours } from "@/pages/Admin";
import { renderWithProviders } from "../test-utils";

// The delete-location confirm message now bolds the location name via <Trans>,
// splitting it across a <strong> child — match on the containing element's
// full text content instead of a single text node.
const byFullText = (expected: string) => (_content: string, element: Element | null) =>
  element?.textContent === expected;

vi.mock("@/contexts/ConceptFilterContext", () => ({
  ALL_CONCEPTS: "all",
  useConceptFilter: () => ({
    concepts: [],
    selectedConceptId: "all",
    setSelectedConceptId: () => {},
    scopedLocationIds: null,
  }),
}));

const { mockNavigate, mockSignOut } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockSignOut: vi.fn().mockResolvedValue({}),
}));
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock("@/lib/runtime-config", () => ({
  runtimeConfig: {
    googleMapsApiKey: "test-maps-key",
  },
  getRuntimeConfig: () => ({
    googleMapsApiKey: "test-maps-key",
    publicSiteUrl: "http://localhost:8080",
    supabaseUrl: "http://localhost:54321",
    supabaseAnonKey: "test",
    stripe: { priceIds: { starter: { monthly: "", annual: "" }, growth: { monthly: "", annual: "" } }, customerPortalUrl: null },
  }),
  buildRuntimeConfig: () => ({
    googleMapsApiKey: "test-maps-key",
    publicSiteUrl: "http://localhost:8080",
    supabaseUrl: "http://localhost:54321",
    supabaseAnonKey: "test",
    stripe: { priceIds: { starter: { monthly: "", annual: "" }, growth: { monthly: "", annual: "" } }, customerPortalUrl: null },
  }),
}));

// ─── Supabase mock ────────────────────────────────────────────────────────────
vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      signInWithPassword: vi.fn().mockResolvedValue({ data: { session: { user: { id: "u1" } } }, error: null }),
      signOut: vi.fn().mockResolvedValue({}),
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      updateUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } }, error: null }),
    },
    rpc: vi.fn().mockResolvedValue({ data: { success: true }, error: null }),
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

// ─── AuthContext mock ─────────────────────────────────────────────────────────
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "u1", email: "manager@example.com" },
    session: { user: { id: "u1" } },
    teamMember: {
      id: "u1", organization_id: "org1", name: "Sarah", email: "sarah@example.com",
      role: "Owner", is_owner: true, is_manager: true, department_ids: [],
      location_ids: [], permissions: {}, pin_reset_required: true,
    },
    loading: false,
    signOut: mockSignOut,
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// ─── useKioskDevices mock ─────────────────────────────────────────────────────
let mockKioskDevices: unknown[] = [];
vi.mock("@/hooks/useKioskDevices", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/useKioskDevices")>()),
  useKioskDevices: () => ({ data: mockKioskDevices, isLoading: false }),
}));

// ─── useIsNativeApp mock (default: web) ──────────────────────────────────────
const mockUseIsNativeApp = vi.fn().mockReturnValue(false);
vi.mock("@/hooks/useIsNativeApp", () => ({
  useIsNativeApp: () => mockUseIsNativeApp(),
}));

// ─── usePlan mock ─────────────────────────────────────────────────────────────
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

// ─── Data mocks ───────────────────────────────────────────────────────────────
const mockLocations = [
  { id: "l1", concept_id: "concept-1", name: "Main Branch", address: "123 Street", contact_email: "main@test.com", contact_phone: "555-0001", trading_hours: "9-17", archive_threshold_days: 90, lat: 45.7608, lng: 4.8597, place_id: "place-1" },
  { id: "l2", concept_id: "concept-1", name: "City Centre", address: "456 Ave", contact_email: "city@test.com", contact_phone: "555-0002", trading_hours: "8-22", archive_threshold_days: 90 },
];

const mockConcepts = [
  { id: "concept-1", organization_id: "org1", name: "The Crown Restaurant" },
];

const mockTeam = [
  {
    id: "tm1", name: "Sarah Owner", email: "sarah@example.com", role: "Owner",
    is_owner: true, is_manager: true, department_ids: [],
    initials: "SO", location_ids: ["l1"], pin_reset_required: true,
    permissions: { create_edit_checklists: true, assign_checklists: true, manage_staff_profiles: true, view_reporting: true, edit_location_details: true, manage_alerts: true, export_data: true, override_inactivity_threshold: true },
  },
  {
    id: "tm2", name: "Mike Manager", email: "mike@example.com", role: "Assistant Manager",
    is_owner: false, is_manager: true, department_ids: [],
    initials: "MM", location_ids: ["l2"],
    permissions: { create_edit_checklists: true, assign_checklists: true, manage_staff_profiles: false, view_reporting: true, edit_location_details: false, manage_alerts: false, export_data: false, override_inactivity_threshold: false },
  },
  {
    id: "tm3", name: "Alice Smith", email: null, role: "Waiter",
    is_owner: false, is_manager: false, department_ids: [],
    initials: "AS", location_ids: ["l1"],
    permissions: { create_edit_checklists: false, assign_checklists: false, manage_staff_profiles: false, view_reporting: false, edit_location_details: false, manage_alerts: false, export_data: false, override_inactivity_threshold: false },
  },
];

const { mockUseLocations } = vi.hoisted(() => ({
  mockUseLocations: vi.fn(),
}));
const { mockUseConcepts } = vi.hoisted(() => ({
  mockUseConcepts: vi.fn(),
}));
const { mockSaveTeamMember } = vi.hoisted(() => ({
  mockSaveTeamMember: {
    mutate: vi.fn(),
    mutateAsync: vi.fn().mockResolvedValue({}),
  },
}));
const { mockUseTeamMemberInvites } = vi.hoisted(() => ({
  mockUseTeamMemberInvites: vi.fn(() => ({ data: [] as unknown[], isLoading: false })),
}));
const { mockDeleteDepartment } = vi.hoisted(() => ({
  mockDeleteDepartment: { mutate: vi.fn() },
}));
mockUseLocations.mockReturnValue({
  data: mockLocations,
  allLocations: mockLocations,
  inactiveLocations: [],
  maxLocations: 10,
  isOverLimit: false,
  graceEndsAt: null,
  isGraceActive: false,
  isGraceExpired: false,
  effectiveActiveLocationIds: mockLocations.map((location) => location.id),
  isLoading: false,
});
mockUseConcepts.mockReturnValue({ data: mockConcepts, isLoading: false });

vi.mock("@/hooks/useLocations", () => ({
  useLocations: mockUseLocations,
  useSaveLocation: () => ({ mutate: vi.fn(), mutateAsync: vi.fn() }),
  useDeleteLocation: () => ({ mutate: vi.fn() }),
}));

vi.mock("@/hooks/useConcepts", () => ({
  useConcepts: mockUseConcepts,
  useSaveConcept: () => ({ mutate: vi.fn(), mutateAsync: vi.fn() }),
  useDeleteConcept: () => ({ mutate: vi.fn() }),
}));

vi.mock("@/hooks/useDepartments", () => ({
  useDepartments: () => ({ data: [
    { id: "d1", location_id: "l1", name: "Front of House" },
    { id: "d2", location_id: "l1", name: "Back of House" },
  ], isLoading: false }),
  useDepartmentsForLocations: () => ({ data: [
    { id: "d1", location_id: "l1", name: "Front of House" },
    { id: "d2", location_id: "l1", name: "Back of House" },
  ], isLoading: false }),
  useSaveDepartment: () => ({ mutate: vi.fn() }),
  useDeleteDepartment: () => mockDeleteDepartment,
}));

vi.mock("@/hooks/useTeamMembers", () => ({
  useTeamMembers: () => ({ data: mockTeam, isLoading: false }),
  useSaveTeamMember: () => mockSaveTeamMember,
  useDeleteTeamMember: () => ({ mutate: vi.fn() }),
  useSaveAdminPin: () => ({ mutateAsync: vi.fn().mockResolvedValue({}), isPending: false }),
  useTeamMemberInvites: () => mockUseTeamMemberInvites(),
  useSendInvite: () => ({ mutate: vi.fn(), mutateAsync: vi.fn().mockResolvedValue({}), isPending: false }),
}));

const mockChecklists = [
  { id: "c1", title: "Opening Checklist", folder_id: null, location_id: "l1", schedule: null, sections: [], time_of_day: "morning", created_at: "2024-01-01T00:00:00Z", updated_at: "2024-01-01T00:00:00Z" },
  { id: "c2", title: "Closing Checklist", folder_id: null, location_id: "l1", schedule: null, sections: [], time_of_day: "evening", created_at: "2024-01-01T00:00:00Z", updated_at: "2024-01-01T00:00:00Z" },
];

vi.mock("@/hooks/useChecklists", () => ({
  useChecklists: () => ({ data: mockChecklists, isLoading: false }),
  useFolders: () => ({ data: [], isLoading: false }),
  useSaveChecklist: () => ({ mutate: vi.fn() }),
  useDeleteChecklist: () => ({ mutate: vi.fn() }),
}));

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Admin page", () => {
  afterEach(() => {
    document.getElementById("olia-gmaps")?.remove();
    // @ts-expect-error test cleanup shim
    delete window.google;
  });

  it("renders the Admin page without crashing", () => {
    renderWithProviders(<Admin />, { initialEntries: ["/admin/location"] });
    expect(document.body).toBeDefined();
  });

  it("shows 'Concepts', 'Users', 'Account', and 'Billing' tabs", () => {
    renderWithProviders(<Admin />, { initialEntries: ["/admin/location"] });
    expect(screen.getAllByText("Concepts").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Users").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Account").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Billing").length).toBeGreaterThanOrEqual(1);
  });

  it("Concepts tab is active by default and shows the current location's address", () => {
    renderWithProviders(<Admin />, { initialEntries: ["/admin/location"] });
    expect(screen.getByText("Address")).toBeInTheDocument();
  });

  it("account route shows account content", () => {
    renderWithProviders(<Admin />, { initialEntries: ["/admin/account"] });
    expect(screen.getByText("Company details")).toBeInTheDocument();
    expect(screen.getByText("Owner details")).toBeInTheDocument();
  });

  it("still shows the concept picker (and an Add concept affordance) with only one concept, so a second concept can always be added", async () => {
    renderWithProviders(<Admin />, { initialEntries: ["/admin/location"] });
    await waitFor(() => {
      expect(screen.getAllByText("Main Branch").length).toBeGreaterThanOrEqual(1);
    });
    expect(screen.getByText("Concept")).toBeInTheDocument();
    expect(screen.getByText("Add concept")).toBeInTheDocument();
  });

  it("shows a concept picker with multiple concepts selectable", async () => {
    // mockReturnValue (not Once): Admin's concept-default effect triggers a
    // second render, which would consume a "Once" value on the first render
    // and fall back to the single-concept default before the assertion runs.
    mockUseConcepts.mockReturnValue({
      data: [...mockConcepts, { id: "concept-2", organization_id: "org1", name: "Second Brand" }],
      isLoading: false,
    });
    renderWithProviders(<Admin />, { initialEntries: ["/admin/location"] });
    await waitFor(() => {
      expect(screen.getByText("Concept")).toBeInTheDocument();
      expect(screen.getByRole("option", { name: "Second Brand" })).toBeInTheDocument();
    });
    mockUseConcepts.mockReturnValue({ data: mockConcepts, isLoading: false });
  });

  it("opens a concept options menu with Edit concept and Delete concept when the kebab next to Add concept is clicked", async () => {
    mockUseConcepts.mockReturnValue({
      data: [...mockConcepts, { id: "concept-2", organization_id: "org1", name: "Second Brand" }],
      isLoading: false,
    });
    renderWithProviders(<Admin />, { initialEntries: ["/admin/location"] });
    await waitFor(() => {
      expect(screen.getByText("Concept")).toBeInTheDocument();
    });
    expect(screen.queryByText("Edit concept")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Concept options" }));

    expect(screen.getByText("Edit concept")).toBeInTheDocument();
    expect(screen.getByText("Delete concept")).toBeInTheDocument();
    mockUseConcepts.mockReturnValue({ data: mockConcepts, isLoading: false });
  });

  it("hides Delete concept in the kebab menu when there's only one concept", async () => {
    renderWithProviders(<Admin />, { initialEntries: ["/admin/location"] });
    await waitFor(() => {
      expect(screen.getByText("Concept")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Concept options" }));

    expect(screen.getByText("Edit concept")).toBeInTheDocument();
    expect(screen.queryByText("Delete concept")).not.toBeInTheDocument();
  });

  it("location detail card is rendered when location is selected", async () => {
    renderWithProviders(<Admin />, { initialEntries: ["/admin/location"] });
    await waitFor(() => {
      expect(screen.getByText("Address")).toBeInTheDocument();
    });
  });

  it("prompts that Google Maps can autofill address details", async () => {
    renderWithProviders(<Admin />, { initialEntries: ["/admin/location"] });
    const addBtn = await screen.findByText("Add location");
    fireEvent.click(addBtn);

    await waitFor(() => {
      expect(
        screen.getByText(/Pick a real place from Google Maps to autofill the official address and map preview\./i),
      ).toBeInTheDocument();
    });
  });

  it("shows the filtered team members list for the selected location", async () => {
    renderWithProviders(<Admin />, { initialEntries: ["/admin/location"] });
    await waitFor(() => {
      // Main Branch (l1) has Sarah Owner and Alice Smith assigned
      expect(screen.getByText("Sarah Owner")).toBeInTheDocument();
      expect(screen.getByText("Alice Smith")).toBeInTheDocument();
    });
    // Mike Manager is only assigned to l2 (City Centre), not the default l1
    expect(screen.queryByText("Mike Manager")).not.toBeInTheDocument();
  });

  it("shows department names for the selected location", async () => {
    renderWithProviders(<Admin />, { initialEntries: ["/admin/location"] });
    await waitFor(() => {
      expect(screen.getByText("Front of House")).toBeInTheDocument();
      expect(screen.getByText("Back of House")).toBeInTheDocument();
    });
  });

  describe("Delete department confirmation", () => {
    beforeEach(() => {
      mockDeleteDepartment.mutate.mockClear();
    });

    it("does not delete immediately when the department delete button is clicked", async () => {
      renderWithProviders(<Admin />, { initialEntries: ["/admin/location"] });
      await waitFor(() => expect(screen.getByText("Front of House")).toBeInTheDocument());
      fireEvent.click(screen.getAllByTitle("Delete department")[0]);

      expect(mockDeleteDepartment.mutate).not.toHaveBeenCalled();
      await waitFor(() => expect(screen.getByText("Delete department", { selector: "h2" })).toBeInTheDocument());
    });

    it("calls deleteDepartment.mutate only after typing DELETE and confirming", async () => {
      renderWithProviders(<Admin />, { initialEntries: ["/admin/location"] });
      await waitFor(() => expect(screen.getByText("Front of House")).toBeInTheDocument());
      fireEvent.click(screen.getAllByTitle("Delete department")[0]);
      await waitFor(() => screen.getByPlaceholderText(/Type DELETE/i));

      fireEvent.click(screen.getByRole("button", { name: "Delete" }));
      expect(mockDeleteDepartment.mutate).not.toHaveBeenCalled();

      fireEvent.change(screen.getByPlaceholderText(/Type DELETE/i), { target: { value: "DELETE" } });
      fireEvent.click(screen.getByRole("button", { name: "Delete" }));

      expect(mockDeleteDepartment.mutate).toHaveBeenCalledWith({ id: "d1", location_id: "l1" });
    });
  });

  it("clicking a location card switches the current location", async () => {
    renderWithProviders(<Admin />, { initialEntries: ["/admin/location"] });
    await waitFor(() => expect(screen.getByText("Main Branch")).toBeInTheDocument());
    fireEvent.click(screen.getByText("City Centre"));
    await waitFor(() => {
      // City Centre (l2) has Mike Manager assigned, not Sarah/Alice
      expect(screen.getByText("Mike Manager")).toBeInTheDocument();
    });
  });

  it("Users tab shows team members Sarah Owner, Mike Manager, and Alice Smith", async () => {
    renderWithProviders(<Admin />, { initialEntries: ["/admin/users"] });
    await waitFor(() => {
      expect(screen.getAllByText("Sarah Owner").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("Mike Manager").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("Alice Smith").length).toBeGreaterThanOrEqual(1);
    });
  });

  it("Users tab shows 'Owner' badge for the owner and free-text role for other members", async () => {
    renderWithProviders(<Admin />, { initialEntries: ["/admin/users"] });
    await waitFor(() => {
      expect(screen.getAllByText("Owner").length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText("Assistant Manager")).toBeInTheDocument();
      expect(screen.getByText("Waiter")).toBeInTheDocument();
    });
  });

  it("Users tab shows kiosk-only note for a non-manager member with no last-seen data", async () => {
    renderWithProviders(<Admin />, { initialEntries: ["/admin/users"] });
    await waitFor(() => {
      expect(screen.getByText("Kiosk PIN access only")).toBeInTheDocument();
    });
  });

  describe("Users tab — pending vs expired invite status", () => {
    afterEach(() => {
      mockUseTeamMemberInvites.mockReturnValue({ data: [], isLoading: false });
    });

    it("shows 'Invite expired' (not 'pending') for a past-due invite, with resend still available", async () => {
      mockUseTeamMemberInvites.mockReturnValue({
        data: [
          {
            id: "inv-expired",
            team_member_id: "tm2",
            email: "mike@example.com",
            accepted_at: null,
            expires_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
            created_at: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
          },
        ],
        isLoading: false,
      });
      renderWithProviders(<Admin />, { initialEntries: ["/admin/users"] });

      await waitFor(() => {
        expect(screen.getByText("Invite expired")).toBeInTheDocument();
      });
      expect(screen.queryByText("Invite pending")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Resend invite to Mike Manager/i })).toBeInTheDocument();
    });

    it("shows 'Invite pending' for an outstanding, non-expired invite", async () => {
      mockUseTeamMemberInvites.mockReturnValue({
        data: [
          {
            id: "inv-pending",
            team_member_id: "tm2",
            email: "mike@example.com",
            accepted_at: null,
            expires_at: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString(),
            created_at: new Date().toISOString(),
          },
        ],
        isLoading: false,
      });
      renderWithProviders(<Admin />, { initialEntries: ["/admin/users"] });

      await waitFor(() => {
        expect(screen.getByText("Invite pending")).toBeInTheDocument();
      });
      expect(screen.queryByText("Invite expired")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Resend invite to Mike Manager/i })).toBeInTheDocument();
    });
  });

  it("Account tab shows company details and owner account settings", async () => {
    renderWithProviders(<Admin />, { initialEntries: ["/admin/account"] });

    await waitFor(() => {
      expect(screen.getByText("Company details")).toBeInTheDocument();
      expect(screen.getByDisplayValue("Test Org")).toBeInTheDocument();
      expect(screen.getByText("Owner details")).toBeInTheDocument();
      expect(screen.getByText("Security")).toBeInTheDocument();
      expect(screen.getAllByText((_, element) => element?.textContent?.includes("Default PIN is") ?? false).length).toBeGreaterThan(0);
      expect(screen.getByDisplayValue("Sarah")).toBeInTheDocument();
      expect(screen.getByDisplayValue("manager@example.com")).toBeInTheDocument();
      expect(screen.getByPlaceholderText("4 digits")).toBeInTheDocument();
      expect(screen.getByText("Create new PIN")).toBeInTheDocument();
    });
  });

  it("Account tab does not show an activity log", async () => {
    renderWithProviders(<Admin />, { initialEntries: ["/admin/account"] });
    await waitFor(() => expect(screen.getByText("Company details")).toBeInTheDocument());
    expect(screen.queryByText("Activity log")).not.toBeInTheDocument();
  });

  it("Account tab does not show Department management (moved to Concepts tab)", async () => {
    renderWithProviders(<Admin />, { initialEntries: ["/admin/account"] });
    await waitFor(() => expect(screen.getByText("Company details")).toBeInTheDocument());
    expect(screen.queryByText("Department management")).not.toBeInTheDocument();
  });

  it("saving profile calls supabase auth update and account save", async () => {
    const { supabase } = await import("@/lib/supabase");
    const updateUser = vi.mocked(supabase.auth.updateUser);
    mockSaveTeamMember.mutateAsync.mockClear();
    updateUser.mockClear();

    renderWithProviders(<Admin />, { initialEntries: ["/admin/account"] });

    await waitFor(() => expect(screen.getAllByText("Save").length).toBeGreaterThan(0));
    fireEvent.click(screen.getAllByRole("button", { name: "Save" })[1]);

    await waitFor(() => {
      expect(updateUser).toHaveBeenCalled();
      expect(mockSaveTeamMember.mutateAsync).toHaveBeenCalledWith(expect.objectContaining({
        id: "u1",
        name: "Sarah",
        email: "manager@example.com",
      }));
    });
  });

  it("'Add location' button is visible in Concepts tab", async () => {
    renderWithProviders(<Admin />, { initialEntries: ["/admin/location"] });
    await waitFor(() => {
      expect(screen.getByText("Add location")).toBeInTheDocument();
    });
  });

  it("clicking 'Add location' opens location form sheet", async () => {
    renderWithProviders(<Admin />, { initialEntries: ["/admin/location"] });
    await waitFor(() => {
      expect(screen.getByText("Add location")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Add location"));
    await waitFor(() => {
      expect(screen.getByText("New location")).toBeInTheDocument();
    });
  });

  it("location form has 'Location name (required)' field", async () => {
    renderWithProviders(<Admin />, { initialEntries: ["/admin/location"] });
    await waitFor(() => expect(screen.getByText("Add location")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Add location"));
    await waitFor(() => {
      expect(screen.getByText("Location name (required)")).toBeInTheDocument();
    });
  });

  it("location form has Address field", async () => {
    renderWithProviders(<Admin />, { initialEntries: ["/admin/location"] });
    await waitFor(() => expect(screen.getByText("Add location")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Add location"));
    await waitFor(() => {
      // "Address" also appears as the Concepts tab's location-detail section
      // label underneath the modal, so there are two matches.
      expect(screen.getAllByText("Address").length).toBeGreaterThanOrEqual(2);
    });
  });

  it("edit location form shows map preview and confirmation for stored place data", async () => {
    renderWithProviders(<Admin />, { initialEntries: ["/admin/location"] });
    await waitFor(() => expect(screen.getByText("Address")).toBeInTheDocument());
    const editButtons = screen.getAllByText("Edit");
    fireEvent.click(editButtons[0]);

    await waitFor(() => {
      expect(screen.getByTitle("Location map preview")).toBeInTheDocument();
      expect(screen.getByText("Official place selected from maps")).toBeInTheDocument();
    });
  });

  it("parses Google Maps opening hours into weekly hours", () => {
    const parsed = parseGoogleOpeningHours([
      "Monday: 9:00 AM – 6:00 PM",
      "Tuesday: 9:00 AM – 6:00 PM",
      "Wednesday: 9:00 AM – 6:00 PM",
      "Thursday: 9:00 AM – 6:00 PM",
      "Friday: 9:00 AM – 6:00 PM",
      "Saturday: Closed",
      "Sunday: Closed",
    ]);

    expect(parsed?.mon.open).toBe(true);
    expect(parsed?.mon.windows[0]).toEqual({ start: "09:00", end: "18:00" });
    expect(parsed?.sat.open).toBe(false);
    expect(parsed?.sun.open).toBe(false);
  });

  it("location form hides email field label for new locations (only 'Alert email' shown)", async () => {
    renderWithProviders(<Admin />, { initialEntries: ["/admin/location"] });
    await waitFor(() => expect(screen.getByText("Add location")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Add location"));
    await waitFor(() => {
      expect(screen.queryByText("Location email")).not.toBeInTheDocument();
    });
  });

  it("location form has Location phone field", async () => {
    renderWithProviders(<Admin />, { initialEntries: ["/admin/location"] });
    await waitFor(() => expect(screen.getByText("Add location")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Add location"));
    await waitFor(() => {
      expect(screen.getByText("Location phone (optional)")).toBeInTheDocument();
    });
  });

  it("clicking Edit on a location opens edit form", async () => {
    renderWithProviders(<Admin />, { initialEntries: ["/admin/location"] });
    await waitFor(() => expect(screen.getByText("Address")).toBeInTheDocument());
    fireEvent.click(screen.getAllByText("Edit")[0]);
    await waitFor(() => {
      expect(screen.getByText("Edit location")).toBeInTheDocument();
    });
  });

  it("clicking delete on a location shows confirm modal with the location's name", async () => {
    renderWithProviders(<Admin />, { initialEntries: ["/admin/location"] });
    await waitFor(() => expect(screen.getByText("Delete location")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Delete location"));
    await waitFor(() => {
      expect(screen.getByText(byFullText('This will permanently remove "Main Branch" and cannot be undone.'))).toBeInTheDocument();
    });
  });

  it("confirm modal has Cancel button", async () => {
    renderWithProviders(<Admin />, { initialEntries: ["/admin/location"] });
    await waitFor(() => expect(screen.getByText("Delete location")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Delete location"));
    await waitFor(() => {
      expect(screen.getByText("Cancel")).toBeInTheDocument();
    });
  });

  it("clicking 'Add a team member' opens the unified team member form", async () => {
    renderWithProviders(<Admin />, { initialEntries: ["/admin/users"] });
    await waitFor(() => {
      expect(screen.getByText("Add a team member")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Add a team member"));
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Add team member" })).toBeInTheDocument();
    });
  });

  it("team member form has Full name, Email, Role, and Kiosk PIN fields", async () => {
    renderWithProviders(<Admin />, { initialEntries: ["/admin/users"] });
    await waitFor(() => expect(screen.getByText("Add a team member")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Add a team member"));
    await waitFor(() => {
      expect(screen.getAllByText("Full name").length).toBeGreaterThan(0);
      expect(screen.getByText("Email (optional)")).toBeInTheDocument();
      expect(screen.getAllByText("Role").length).toBeGreaterThan(0);
      expect(screen.getByText("Kiosk PIN")).toBeInTheDocument();
    });
  });

  it("team member form requires email and shows permissions only once manager role is enabled", async () => {
    renderWithProviders(<Admin />, { initialEntries: ["/admin/users"] });
    await waitFor(() => expect(screen.getByText("Add a team member")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Add a team member"));
    await waitFor(() => expect(screen.getByText("Manager role")).toBeInTheDocument());

    expect(screen.queryByText("Permissions")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("switch"));
    await waitFor(() => {
      expect(screen.getByText("Email (required for manager access)")).toBeInTheDocument();
      expect(screen.getByText("Permissions")).toBeInTheDocument();
    });
  });

  it("owner team member edit form does not offer a Manager-role toggle change and shows Generate for the PIN", async () => {
    renderWithProviders(<Admin />, { initialEntries: ["/admin/users"] });
    await waitFor(() => expect(screen.getAllByText("Sarah Owner").length).toBeGreaterThanOrEqual(1));
    fireEvent.click(screen.getByLabelText("Edit Sarah Owner"));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Edit team member" })).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText("Generate")).toBeInTheDocument());
  });

  it("billing card is visible in Billing tab", async () => {
    renderWithProviders(<Admin />, { initialEntries: ["/admin/billing"] });
    await waitFor(() => {
      expect(screen.getByText("Current plan")).toBeInTheDocument();
    });
  });

  it("billing card shows plan name", async () => {
    renderWithProviders(<Admin />, { initialEntries: ["/admin/billing"] });
    await waitFor(() => {
      expect(screen.getByText("Olia Growth")).toBeInTheDocument();
    });
  });

  it("'Manage Billing' button is visible in Billing tab on web", async () => {
    mockUseIsNativeApp.mockReturnValue(false);
    renderWithProviders(<Admin />, { initialEntries: ["/admin/billing"] });
    await waitFor(() => {
      expect(screen.getByText("Manage Billing")).toBeInTheDocument();
    });
  });

  it("shows 'Manage at olia.app' link instead of 'Manage Billing' on native", async () => {
    mockUseIsNativeApp.mockReturnValue(true);
    renderWithProviders(<Admin />, { initialEntries: ["/admin/billing"] });
    await waitFor(() => {
      expect(screen.getByText("Manage at olia.app")).toBeInTheDocument();
      expect(screen.queryByText("Manage Billing")).not.toBeInTheDocument();
    });
  });

  it("permission labels appear when a manager team member is expanded", async () => {
    renderWithProviders(<Admin />, { initialEntries: ["/admin/users"] });
    await waitFor(() => {
      expect(screen.getAllByText("Mike Manager").length).toBeGreaterThanOrEqual(1);
    });
    const mikeRow = screen.getByText("Mike Manager").closest("[class*='flex items-center']");
    if (mikeRow) {
      const chevronBtn = mikeRow.querySelector("button:nth-last-child(2)");
      if (chevronBtn) {
        fireEvent.click(chevronBtn as HTMLElement);
        await waitFor(() => {
          const permLabel = screen.queryByText("Create & edit checklists");
          expect(permLabel).toBeInTheDocument();
        });
      }
    }
  });

  it("Billing tab shows Current plan section", async () => {
    renderWithProviders(<Admin />, { initialEntries: ["/admin/billing"] });
    await waitFor(() => {
      expect(screen.getByText("Current plan")).toBeInTheDocument();
    });
  });

  it("Billing tab shows per-location price and location count instead of the total", async () => {
    renderWithProviders(<Admin />, { initialEntries: ["/admin/billing"] });
    await waitFor(() => {
      expect(screen.getByText("€99/month/location")).toBeInTheDocument();
      expect(screen.getByText("(2 active locations)")).toBeInTheDocument();
    });
    expect(screen.queryByText(/€198/)).not.toBeInTheDocument();
  });

  it("Billing tab shows the grace-period location selector when over the plan limit", async () => {
    // mockReturnValue (not Once): Admin's concept-default effect re-renders
    // after mount, which would consume a "Once" value on the first render.
    mockUseLocations.mockReturnValue({
      data: [mockLocations[1]],
      allLocations: mockLocations,
      inactiveLocations: [mockLocations[0]],
      maxLocations: 1,
      isOverLimit: true,
      graceEndsAt: new Date(Date.now() - 60_000).toISOString(),
      isGraceActive: false,
      isGraceExpired: true,
      effectiveActiveLocationIds: ["l2"],
      isLoading: false,
    });

    renderWithProviders(<Admin />, { initialEntries: ["/admin/billing"] });

    await waitFor(() => {
      expect(screen.getByText("Read-only")).toBeInTheDocument();
      expect(screen.getAllByText("Active").length).toBeGreaterThan(0);
    });

    mockUseLocations.mockReturnValue({
      data: mockLocations,
      allLocations: mockLocations,
      inactiveLocations: [],
      maxLocations: 10,
      isOverLimit: false,
      graceEndsAt: null,
      isGraceActive: false,
      isGraceExpired: false,
      effectiveActiveLocationIds: mockLocations.map((location) => location.id),
      isLoading: false,
    });
  });

  it("Concepts tab shows 'Run kiosk' and 'Activate' buttons", async () => {
    renderWithProviders(<Admin />, { initialEntries: ["/admin/location"] });
    await waitFor(() => {
      expect(screen.getByText("Run kiosk")).toBeInTheDocument();
      expect(screen.getByText("Activate")).toBeInTheDocument();
    });
  });

  it("Concepts tab shows Assigned checklists section with checklist names for the current location", async () => {
    renderWithProviders(<Admin />, { initialEntries: ["/admin/location"] });
    await waitFor(() => {
      expect(screen.getByText(/Assigned checklists/i)).toBeInTheDocument();
      expect(screen.getAllByText("Opening Checklist").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("Closing Checklist").length).toBeGreaterThanOrEqual(1);
    });
  });

  it("Concepts tab shows 'no checklists' message for a location with no assigned checklists", async () => {
    renderWithProviders(<Admin />, { initialEntries: ["/admin/location"] });
    await waitFor(() => expect(screen.getByText("Address")).toBeInTheDocument());
    fireEvent.click(screen.getByText("City Centre"));
    await waitFor(() => {
      expect(screen.getByText(/No checklists assigned/i)).toBeInTheDocument();
    });
  });

  it("location form does not show Opening hours section", async () => {
    renderWithProviders(<Admin />, { initialEntries: ["/admin/location"] });
    await waitFor(() => expect(screen.getByText("Add location")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Add location"));
    await waitFor(() => expect(screen.getByText("New location")).toBeInTheDocument());
    expect(screen.queryByText("Opening hours")).not.toBeInTheDocument();
  });

  it("location detail does not show trading_hours even when structured JSON is present", async () => {
    const jsonHours = JSON.stringify({
      mon: { open: true, windows: [{ start: "09:00", end: "18:00" }] },
      tue: { open: true, windows: [{ start: "09:00", end: "18:00" }] },
      wed: { open: true, windows: [{ start: "09:00", end: "18:00" }] },
      thu: { open: true, windows: [{ start: "09:00", end: "18:00" }] },
      fri: { open: true, windows: [{ start: "09:00", end: "18:00" }] },
      sat: { open: true, windows: [{ start: "10:00", end: "16:00" }] },
      sun: { open: false, windows: [] },
    });
    mockUseLocations.mockReturnValueOnce({
      data: [{ ...mockLocations[0], trading_hours: jsonHours }, mockLocations[1]],
      allLocations: [{ ...mockLocations[0], trading_hours: jsonHours }, mockLocations[1]],
      inactiveLocations: [],
      maxLocations: 10,
      isOverLimit: false,
      graceEndsAt: null,
      isGraceActive: false,
      isGraceExpired: false,
      effectiveActiveLocationIds: mockLocations.map((location) => location.id),
      isLoading: false,
    });
    renderWithProviders(<Admin />, { initialEntries: ["/admin/location"] });
    await waitFor(() => {
      expect(screen.getByText("Address")).toBeInTheDocument();
    });
    const addressCard = screen.getByText("Address").closest(".card-surface");
    expect(addressCard?.textContent).not.toContain("Mon:");
    expect(addressCard?.textContent).not.toContain("09:00");
  });

  it("Concepts tab shows onboarding empty state when the org has no concepts yet", async () => {
    mockUseConcepts.mockReturnValueOnce({ data: [], isLoading: false });
    renderWithProviders(<Admin />, { initialEntries: ["/admin/location"] });
    await waitFor(() => {
      expect(screen.getByText("Add your first concept")).toBeInTheDocument();
    });
  });

  it("Concepts tab shows onboarding CTA to add a location when the concept has none yet", async () => {
    mockUseLocations.mockReturnValue({
      data: [], allLocations: [], inactiveLocations: [], maxLocations: 10,
      isOverLimit: false, graceEndsAt: null, isGraceActive: false, isGraceExpired: false,
      effectiveActiveLocationIds: [], isLoading: false,
    });
    renderWithProviders(<Admin />, { initialEntries: ["/admin/location"] });
    await waitFor(() => {
      expect(screen.getByText(/Add a location to/i)).toBeInTheDocument();
    });
    mockUseLocations.mockReturnValue({
      data: mockLocations,
      allLocations: mockLocations,
      inactiveLocations: [],
      maxLocations: 10,
      isOverLimit: false,
      graceEndsAt: null,
      isGraceActive: false,
      isGraceExpired: false,
      effectiveActiveLocationIds: mockLocations.map((location) => location.id),
      isLoading: false,
    });
  });

  it("renders correctly with isNative=false (web default)", async () => {
    mockUseIsNativeApp.mockReturnValue(false);
    renderWithProviders(<Admin />, { initialEntries: ["/admin/account"] });
    await waitFor(() => expect(document.body).toBeDefined());
  });

  it("renders correctly with isNative=true (native)", async () => {
    mockUseIsNativeApp.mockReturnValue(true);
    renderWithProviders(<Admin />, { initialEntries: ["/admin/account"] });
    await waitFor(() => expect(document.body).toBeDefined());
  });

  it("calls signOut and navigates to / when 'Log out' is clicked", async () => {
    mockSignOut.mockClear();
    mockNavigate.mockClear();
    renderWithProviders(<Admin />, { initialEntries: ["/admin/account"] });
    await waitFor(() => screen.getByRole("button", { name: /log out/i }));
    fireEvent.click(screen.getByRole("button", { name: /log out/i }));
    await waitFor(() => {
      expect(mockSignOut).toHaveBeenCalledTimes(1);
      expect(mockNavigate).toHaveBeenCalledWith("/");
    });
  });

  it("shows 'Log out' and an account-options menu (with 'Delete account') in the Account tab for an Owner", async () => {
    renderWithProviders(<Admin />, { initialEntries: ["/admin/account"] });
    await waitFor(() => expect(screen.getByRole("button", { name: /log out/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /account options/i }));
    expect(screen.getByRole("button", { name: /delete account/i })).toBeInTheDocument();
  });

  it("opens the delete confirmation modal when 'Delete account' is clicked from the menu", async () => {
    renderWithProviders(<Admin />, { initialEntries: ["/admin/account"] });
    await waitFor(() => screen.getByRole("button", { name: /account options/i }));
    fireEvent.click(screen.getByRole("button", { name: /account options/i }));
    fireEvent.click(screen.getByRole("button", { name: /delete account/i }));
    await waitFor(() => expect(screen.getByText(/cancels your subscription/i)).toBeInTheDocument());
  });

  it("calls the delete-my-account edge function when DELETE is typed and confirm is clicked", async () => {
    const { supabase } = await import("@/lib/supabase");
    renderWithProviders(<Admin />, { initialEntries: ["/admin/account"] });
    await waitFor(() => screen.getByRole("button", { name: /account options/i }));
    fireEvent.click(screen.getByRole("button", { name: /account options/i }));
    fireEvent.click(screen.getByRole("button", { name: /delete account/i }));
    await waitFor(() => screen.getByPlaceholderText(/Type DELETE/i));

    fireEvent.change(screen.getByPlaceholderText(/Type DELETE/i), { target: { value: "DELETE" } });
    fireEvent.click(screen.getByRole("button", { name: /yes, delete my account/i }));

    await waitFor(() => expect(supabase.functions.invoke).toHaveBeenCalledWith("delete-my-account"));
  });

  describe("Run kiosk confirmation", () => {
    beforeEach(() => {
      mockNavigate.mockClear();
    });

    it("does not navigate immediately when the Run kiosk button is clicked", async () => {
      renderWithProviders(<Admin />, { initialEntries: ["/admin/location"] });
      await waitFor(() => expect(screen.getByRole("button", { name: "Run kiosk" })).toBeInTheDocument());
      fireEvent.click(screen.getByRole("button", { name: "Run kiosk" }));

      expect(mockNavigate).not.toHaveBeenCalledWith(expect.stringContaining("/kiosk?locationId="));
      await waitFor(() => {
        expect(screen.getByText("Set up this device as a kiosk")).toBeInTheDocument();
      });
    });

    it("names the current location in the confirmation message", async () => {
      renderWithProviders(<Admin />, { initialEntries: ["/admin/location"] });
      await waitFor(() => expect(screen.getByRole("button", { name: "Run kiosk" })).toBeInTheDocument());
      fireEvent.click(screen.getByRole("button", { name: "Run kiosk" }));

      await waitFor(() => {
        expect(screen.getByText(/will become the kiosk for Main Branch/)).toBeInTheDocument();
      });
    });

    it("navigates to /kiosk with the location id only after confirming", async () => {
      renderWithProviders(<Admin />, { initialEntries: ["/admin/location"] });
      await waitFor(() => expect(screen.getByRole("button", { name: "Run kiosk" })).toBeInTheDocument());
      fireEvent.click(screen.getByRole("button", { name: "Run kiosk" }));
      await waitFor(() => expect(screen.getByText("Set up kiosk")).toBeInTheDocument());
      fireEvent.click(screen.getByText("Set up kiosk"));

      expect(mockNavigate).toHaveBeenCalledWith("/kiosk?locationId=l1");
    });

    it("includes a typed device name as deviceLabel on the /kiosk navigation", async () => {
      renderWithProviders(<Admin />, { initialEntries: ["/admin/location"] });
      await waitFor(() => expect(screen.getByRole("button", { name: "Run kiosk" })).toBeInTheDocument());
      fireEvent.click(screen.getByRole("button", { name: "Run kiosk" }));
      await waitFor(() => expect(screen.getByPlaceholderText(/Host stand/)).toBeInTheDocument());
      fireEvent.change(screen.getByPlaceholderText(/Host stand/), { target: { value: "Kitchen tablet" } });
      fireEvent.click(screen.getByText("Set up kiosk"));

      expect(mockNavigate).toHaveBeenCalledWith("/kiosk?locationId=l1&deviceLabel=Kitchen%20tablet");
    });

    it("does not navigate when the confirmation is cancelled", async () => {
      renderWithProviders(<Admin />, { initialEntries: ["/admin/location"] });
      await waitFor(() => expect(screen.getByRole("button", { name: "Run kiosk" })).toBeInTheDocument());
      fireEvent.click(screen.getByRole("button", { name: "Run kiosk" }));
      await waitFor(() => expect(screen.getByText("Cancel")).toBeInTheDocument());
      fireEvent.click(screen.getByText("Cancel"));

      expect(mockNavigate).not.toHaveBeenCalledWith(expect.stringContaining("/kiosk?locationId="));
      expect(screen.queryByText("Set up this device as a kiosk")).not.toBeInTheDocument();
    });
  });

  describe("Activate kiosk", () => {
    it("registers a device without navigating, then shows a copyable link", async () => {
      const { supabase } = await import("@/lib/supabase");
      (supabase.rpc as ReturnType<typeof vi.fn>).mockImplementation((fn: string) =>
        fn === "register_kiosk_device"
          ? Promise.resolve({ data: [{ device_id: "d1", device_token: "t1" }], error: null })
          : Promise.resolve({ data: { success: true }, error: null }),
      );
      renderWithProviders(<Admin />, { initialEntries: ["/admin/location"] });
      await waitFor(() => expect(screen.getByRole("button", { name: "Activate" })).toBeInTheDocument());
      fireEvent.click(screen.getByRole("button", { name: "Activate" }));
      await waitFor(() => expect(screen.getByText("Activate a kiosk for this location")).toBeInTheDocument());
      const activateButtons = screen.getAllByRole("button", { name: "Activate" });
      fireEvent.click(activateButtons[activateButtons.length - 1]);

      await waitFor(() => expect(supabase.rpc).toHaveBeenCalledWith("register_kiosk_device", { p_location_id: "l1", p_label: "" }));
      expect(mockNavigate).not.toHaveBeenCalledWith(expect.stringContaining("/kiosk?locationId="));
      await waitFor(() => expect(screen.getByText("Kiosk activated")).toBeInTheDocument());
      const linkInput = screen.getByDisplayValue(/deviceId=d1&deviceToken=t1/) as HTMLInputElement;
      expect(linkInput.value).toContain("locationId=l1");

      (supabase.rpc as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { success: true }, error: null });
    });
  });

  describe("Active kiosk indicator", () => {
    afterEach(() => {
      mockKioskDevices = [];
      localStorage.removeItem("kiosk_location_id");
      localStorage.removeItem("kiosk_location_name");
      localStorage.removeItem("kiosk_device_token");
    });

    it("never shows the old per-browser kiosk banner or an exit button", async () => {
      localStorage.setItem("kiosk_location_id", "l1");
      localStorage.setItem("kiosk_location_name", "Main Branch");
      renderWithProviders(<Admin />, { initialEntries: ["/admin/location"] });
      await waitFor(() => expect(screen.getByText("Address")).toBeInTheDocument());
      expect(screen.queryByText(/currently running as the kiosk/)).not.toBeInTheDocument();
      expect(screen.queryByText("Exit kiosk mode")).not.toBeInTheDocument();
    });

    it("shows a green dot only on locations with an active kiosk device", async () => {
      mockKioskDevices = [
        { id: "d1", organization_id: "org1", location_id: "l2", label: "", last_seen_at: null, revoked_at: null, created_at: "2026-09-01" },
      ];
      renderWithProviders(<Admin />, { initialEntries: ["/admin/location"] });
      await waitFor(() => expect(screen.getAllByLabelText("Kiosk active")).toHaveLength(1));
      const dot = screen.getByLabelText("Kiosk active");
      expect(dot.closest("button")).toHaveTextContent("City Centre");
    });

    it("shows no dot when there are no active kiosk devices", async () => {
      renderWithProviders(<Admin />, { initialEntries: ["/admin/location"] });
      await waitFor(() => expect(screen.getByText("Address")).toBeInTheDocument());
      expect(screen.queryByLabelText("Kiosk active")).not.toBeInTheDocument();
    });

    // Regression (#824): stale local kiosk state (device deactivated from
    // another browser) would otherwise keep this browser locked to /kiosk.
    it("clears stale local kiosk state on mount when the server reports this device was deactivated", async () => {
      localStorage.setItem("kiosk_location_id", "l1");
      localStorage.setItem("kiosk_device_token", "revoked-token");
      const { supabase } = await import("@/lib/supabase");
      (supabase.rpc as ReturnType<typeof vi.fn>).mockImplementation((fn: string) =>
        fn === "touch_kiosk_device"
          ? Promise.resolve({ data: false, error: null })
          : Promise.resolve({ data: { success: true }, error: null }),
      );

      renderWithProviders(<Admin />, { initialEntries: ["/admin/location"] });
      await waitFor(() => expect(localStorage.getItem("kiosk_location_id")).toBeNull());

      (supabase.rpc as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { success: true }, error: null });
    });
  });
});
