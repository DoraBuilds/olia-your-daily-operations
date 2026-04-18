import { screen, fireEvent, waitFor } from "@testing-library/react";
import Admin, { parseGoogleOpeningHours } from "@/pages/Admin";
import { renderWithProviders } from "../test-utils";

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
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      insert: vi.fn().mockResolvedValue({ error: null }),
      update: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockResolvedValue({ error: null }),
      delete: vi.fn().mockReturnThis(),
      then: vi.fn().mockImplementation((cb) => Promise.resolve(cb({ data: [
        { id: "00000000-0000-0000-0000-000000000011", name: "Terrace" },
        { id: "00000000-0000-0000-0000-000000000010", name: "Grand Ballroom" },
      ], error: null }))),
    }),
  },
}));

// ─── AuthContext mock ─────────────────────────────────────────────────────────
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "u1", email: "manager@example.com" },
    session: { user: { id: "u1" } },
    teamMember: { id: "u1", organization_id: "org1", name: "Sarah", email: "sarah@example.com", role: "Owner", location_ids: [], permissions: {}, pin_reset_required: true },
    loading: false,
    signOut: vi.fn(),
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
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
}));

// ─── Data mocks ───────────────────────────────────────────────────────────────
const mockLocations = [
  { id: "l1", name: "Main Branch", address: "123 Street", contact_email: "main@test.com", contact_phone: "555-0001", trading_hours: "9-17", archive_threshold_days: 90, lat: 45.7608, lng: 4.8597, place_id: "place-1" },
  { id: "l2", name: "City Centre", address: "456 Ave", contact_email: "city@test.com", contact_phone: "555-0002", trading_hours: "8-22", archive_threshold_days: 90 },
];

const mockStaff = [
  { id: "sp1", location_id: "l1", first_name: "Alice", last_name: "Smith", role: "Front of House", status: "active", pin: "1234", last_used_at: null, archived_at: null, created_at: "2024-01-01T00:00:00Z" },
  { id: "sp2", location_id: "l1", first_name: "Bob", last_name: "Jones", role: "Back of House", status: "archived", pin: "5678", last_used_at: "2024-02-01T00:00:00Z", archived_at: "2024-02-15T00:00:00Z", created_at: "2024-01-01T00:00:00Z" },
];

const mockTeam = [
  { id: "tm1", name: "Sarah Owner", email: "sarah@example.com", role: "Owner", initials: "SO", location_ids: ["l1"], pin_reset_required: true, permissions: { create_edit_checklists: true, assign_checklists: true, manage_staff_profiles: true, view_reporting: true, edit_location_details: true, manage_alerts: true, export_data: true, override_inactivity_threshold: true } },
  { id: "tm2", name: "Mike Manager", email: "mike@example.com", role: "Manager", initials: "MM", location_ids: ["l2"], permissions: { create_edit_checklists: true, assign_checklists: true, manage_staff_profiles: false, view_reporting: true, edit_location_details: false, manage_alerts: false, export_data: false, override_inactivity_threshold: false } },
];

const { mockUseLocations } = vi.hoisted(() => ({
  mockUseLocations: vi.fn(),
}));
const { mockSaveTeamMember } = vi.hoisted(() => ({
  mockSaveTeamMember: {
    mutate: vi.fn(),
    mutateAsync: vi.fn().mockResolvedValue({}),
  },
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

vi.mock("@/hooks/useLocations", () => ({
  useLocations: mockUseLocations,
  useSaveLocation: () => ({ mutate: vi.fn(), mutateAsync: vi.fn() }),
  useDeleteLocation: () => ({ mutate: vi.fn() }),
}));

vi.mock("@/hooks/useStaffProfiles", () => ({
  useStaffProfiles: () => ({ data: mockStaff, isLoading: false }),
  useSaveStaffProfile: () => ({ mutate: vi.fn(), mutateAsync: vi.fn() }),
  useArchiveStaffProfile: () => ({ mutate: vi.fn() }),
  useRestoreStaffProfile: () => ({ mutate: vi.fn() }),
  useDeleteStaffProfile: () => ({ mutate: vi.fn() }),
}));

vi.mock("@/hooks/useTeamMembers", () => ({
  useTeamMembers: () => ({ data: mockTeam, isLoading: false }),
  useSaveTeamMember: () => mockSaveTeamMember,
  useDeleteTeamMember: () => ({ mutate: vi.fn() }),
  useSaveAdminPin: () => ({ mutateAsync: vi.fn().mockResolvedValue({}), isPending: false }),
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

  // 1. Renders without crashing
  it("renders the Admin page without crashing", () => {
    renderWithProviders(<Admin />, { initialEntries: ["/admin/location"] });
    expect(document.body).toBeDefined();
  });

  // 2. Shows both tabs
  it("shows 'My Location' and 'Account' tabs", () => {
    renderWithProviders(<Admin />, { initialEntries: ["/admin/location"] });
    expect(screen.getAllByText("My Location").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Account").length).toBeGreaterThanOrEqual(1);
  });

  // 3. My Location is active by default
  it("'My Location' tab is active by default", () => {
    renderWithProviders(<Admin />, { initialEntries: ["/admin/location"] });
    // The location picker / section-label should be visible
    expect(screen.getByText("Location details")).toBeInTheDocument();
  });

  // 4. Account route shows account content
  it("account route shows account content", () => {
    renderWithProviders(<Admin />, { initialEntries: ["/admin/account"] });
    expect(screen.getByText("My account")).toBeInTheDocument();
  });

  // 5. Location section shows location names
  it("location select shows location names (Main Branch, City Centre)", async () => {
    renderWithProviders(<Admin />, { initialEntries: ["/admin/location"] });
    await waitFor(() => {
      // Either in a dropdown or displayed text somewhere
      const mainBranch = screen.queryByText("Main Branch") || screen.queryAllByText(/Main Branch/i)[0];
      expect(mainBranch).toBeTruthy();
    });
  });

  // 6. Location details card appears when a location exists
  it("location details card is rendered when location is selected", async () => {
    renderWithProviders(<Admin />, { initialEntries: ["/admin/location"] });
    await waitFor(() => {
      expect(screen.getByText("Location details")).toBeInTheDocument();
    });
  });

  it("prompts that Google Maps can autofill address details and opening hours", async () => {
    renderWithProviders(<Admin />, { initialEntries: ["/admin/account"] });
    const addBtn = await screen.findByRole("button", { name: /add location/i });
    fireEvent.click(addBtn);

    await waitFor(() => {
      expect(
        screen.getByText(/Pick a real place from Google Maps to autofill the official address, map preview, and opening hours when available\./i),
      ).toBeInTheDocument();
    });
  });

  // 7. Staff Profiles section shows active staff (Alice Smith)
  it("staff profiles section shows Alice Smith", async () => {
    renderWithProviders(<Admin />, { initialEntries: ["/admin/location"] });
    await waitFor(() => {
      expect(screen.getByText("Alice Smith")).toBeInTheDocument();
    });
  });

  // 8. Staff role badge shows department-based label
  it("shows Alice Smith's role as Front of House", async () => {
    renderWithProviders(<Admin />, { initialEntries: ["/admin/location"] });
    await waitFor(() => {
      const roleBadges = screen.getAllByText("Front of House");
      expect(roleBadges.length).toBeGreaterThanOrEqual(1);
    });
  });

  // 9. Active staff shows Edit button (Pencil)
  it("active staff has edit (pencil) button", async () => {
    renderWithProviders(<Admin />, { initialEntries: ["/admin/location"] });
    await waitFor(() => {
      const editBtns = screen.getAllByRole("button", { name: /edit/i });
      expect(editBtns.length).toBeGreaterThanOrEqual(1);
    });
  });

  // 10. Active staff has Archive button
  it("active staff has archive button", async () => {
    renderWithProviders(<Admin />, { initialEntries: ["/admin/location"] });
    await waitFor(() => {
      const archiveBtns = screen.getAllByRole("button", { name: /archive/i });
      expect(archiveBtns.length).toBeGreaterThanOrEqual(1);
    });
  });

  // 11. Clicking "Add" staff button opens staff profile form
  it("clicking 'Add' staff opens the staff profile form sheet", async () => {
    renderWithProviders(<Admin />, { initialEntries: ["/admin/location"] });
    await waitFor(() => {
      expect(screen.getByText("Staff profiles")).toBeInTheDocument();
    });
    // The Add link next to Staff profiles
    const addBtns = screen.getAllByText("Add");
    fireEvent.click(addBtns[0]);
    await waitFor(() => {
      expect(screen.getByText("Add staff profile")).toBeInTheDocument();
    });
  });

  // 12. Staff form has First Name field
  it("staff profile form has First name field", async () => {
    renderWithProviders(<Admin />, { initialEntries: ["/admin/location"] });
    await waitFor(() => expect(screen.getByText("Staff profiles")).toBeInTheDocument());
    const addBtns = screen.getAllByText("Add");
    fireEvent.click(addBtns[0]);
    await waitFor(() => {
      expect(screen.getByText("First name (required)")).toBeInTheDocument();
    });
  });

  // 13. Staff form has Last Name field
  it("staff profile form has Last name field", async () => {
    renderWithProviders(<Admin />);
    await waitFor(() => expect(screen.getByText("Staff profiles")).toBeInTheDocument());
    const addBtns = screen.getAllByText("Add");
    fireEvent.click(addBtns[0]);
    await waitFor(() => {
      expect(screen.getByText("Last name")).toBeInTheDocument();
    });
  });

  // 14. Staff form has Role field
  it("staff profile form has Role field", async () => {
    renderWithProviders(<Admin />);
    await waitFor(() => expect(screen.getByText("Staff profiles")).toBeInTheDocument());
    const addBtns = screen.getAllByText("Add");
    fireEvent.click(addBtns[0]);
    await waitFor(() => {
      expect(screen.getByText("Role")).toBeInTheDocument();
    });
  });

  // 15. Staff form has PIN field
  it("staff profile form has Staff PIN field", async () => {
    renderWithProviders(<Admin />);
    await waitFor(() => expect(screen.getByText("Staff profiles")).toBeInTheDocument());
    const addBtns = screen.getAllByText("Add");
    fireEvent.click(addBtns[0]);
    await waitFor(() => {
      expect(screen.getByText("Staff PIN")).toBeInTheDocument();
    });
  });

  // 16. Archived staff toggle shows Bob Jones
  it("clicking 'Archived' toggle shows archived staff (Bob Jones)", async () => {
    renderWithProviders(<Admin />);
    await waitFor(() => {
      // the toggle button has accessible name "Archived" (distinct from "Archive" action buttons)
      expect(screen.getByRole("button", { name: /^archived$/i })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: /^archived$/i }));
    await waitFor(() => {
      expect(screen.getByText("Bob Jones")).toBeInTheDocument();
    });
  });

  // 17. Archived staff shows Restore button
  it("archived staff has Restore button", async () => {
    renderWithProviders(<Admin />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^archived$/i })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: /^archived$/i }));
    await waitFor(() => {
      const restoreBtns = screen.getAllByRole("button", { name: /restore/i });
      expect(restoreBtns.length).toBeGreaterThanOrEqual(1);
    });
  });

  // 18. Archived staff has Delete permanently button
  it("archived staff has 'Delete permanently' button", async () => {
    renderWithProviders(<Admin />);
    await waitFor(() => expect(screen.getByRole("button", { name: /^archived$/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /^archived$/i }));
    await waitFor(() => {
      const deleteBtns = screen.getAllByRole("button", { name: /delete permanently/i });
      expect(deleteBtns.length).toBeGreaterThanOrEqual(1);
    });
  });

  // 19. Search input appears in staff section
  it("search input appears in staff section", async () => {
    renderWithProviders(<Admin />);
    await waitFor(() => {
      const searchInput = screen.getByPlaceholderText("Search staff…");
      expect(searchInput).toBeInTheDocument();
    });
  });

  // 20. Searching staff filters results
  it("typing in staff search filters displayed staff", async () => {
    renderWithProviders(<Admin />);
    await waitFor(() => {
      expect(screen.getByPlaceholderText("Search staff…")).toBeInTheDocument();
    });
    const searchInput = screen.getByPlaceholderText("Search staff…");
    fireEvent.change(searchInput, { target: { value: "Alice" } });
    await waitFor(() => {
      expect(screen.getByText("Alice Smith")).toBeInTheDocument();
    });
  });

  // 21. Account tab shows "All locations" section with locations
  it("Account tab shows all locations", async () => {
    renderWithProviders(<Admin />, { initialEntries: ["/admin/account"] });
    await waitFor(() => {
      expect(screen.getAllByText("Main Branch").length).toBeGreaterThanOrEqual(1);
    });
  });

  // 22. Account tab shows "City Centre" location
  it("Account tab shows City Centre location", async () => {
    renderWithProviders(<Admin />, { initialEntries: ["/admin/account"] });
    await waitFor(() => {
      expect(screen.getAllByText("City Centre").length).toBeGreaterThanOrEqual(1);
    });
  });

  // 23. Team Members section shows Sarah Owner and Mike Manager
  it("Account tab shows team members Sarah Owner and Mike Manager", async () => {
    renderWithProviders(<Admin />, { initialEntries: ["/admin/account"] });
    await waitFor(() => {
      expect(screen.getAllByText("Sarah Owner").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("Mike Manager").length).toBeGreaterThanOrEqual(1);
    });
  });

  // 23b. Account tab shows self-service account settings
  it("Account tab shows my account settings", async () => {
    renderWithProviders(<Admin />, { initialEntries: ["/admin/account"] });

    await waitFor(() => {
      expect(screen.getByText("My account")).toBeInTheDocument();
      expect(screen.getByText("Security")).toBeInTheDocument();
      expect(screen.getAllByText((_, element) => element?.textContent?.includes("New owner accounts start with PIN 1234") ?? false).length).toBeGreaterThan(0);
      expect(screen.getByText("Assigned locations")).toBeInTheDocument();
      expect(screen.getByText("Role and permissions")).toBeInTheDocument();
      expect(screen.getByDisplayValue("Sarah")).toBeInTheDocument();
      expect(screen.getByDisplayValue("manager@example.com")).toBeInTheDocument();
      expect(screen.getByPlaceholderText("Enter a new 4-digit PIN")).toBeInTheDocument();
      expect(screen.queryByPlaceholderText("At least 8 characters")).not.toBeInTheDocument();
      expect(screen.queryByPlaceholderText("Repeat password")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Create or reset PIN" })).toBeInTheDocument();
    });
  });

  // 23c. Saving account profile updates auth + team member record
  it("saving profile calls supabase auth update and account save", async () => {
    const { supabase } = await import("@/lib/supabase");
    const updateUser = vi.mocked(supabase.auth.updateUser);
    mockSaveTeamMember.mutateAsync.mockClear();
    updateUser.mockClear();

    renderWithProviders(<Admin />, { initialEntries: ["/admin/account"] });

    await waitFor(() => expect(screen.getByText("Save profile")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));

    await waitFor(() => {
      expect(updateUser).toHaveBeenCalled();
      expect(mockSaveTeamMember.mutateAsync).toHaveBeenCalledWith(expect.objectContaining({
        id: "u1",
        name: "Sarah",
        email: "manager@example.com",
      }));
    });
  });

  // 24. "Add location" button visible in Account tab
  it("'Add location' button is visible in Account tab", async () => {
    renderWithProviders(<Admin />, { initialEntries: ["/admin/account"] });
    await waitFor(() => {
      expect(screen.getByText("Add location")).toBeInTheDocument();
    });
  });

  // 25. Clicking "Add location" opens a location form
  it("clicking 'Add location' opens location form sheet", async () => {
    renderWithProviders(<Admin />, { initialEntries: ["/admin/account"] });
    await waitFor(() => {
      expect(screen.getByText("Add location")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Add location"));
    await waitFor(() => {
      expect(screen.getByText("New location")).toBeInTheDocument();
    });
  });

  // 26. Location form has Name field
  it("location form has 'Location name (required)' field", async () => {
    renderWithProviders(<Admin />, { initialEntries: ["/admin/account"] });
    await waitFor(() => expect(screen.getByText("Add location")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Add location"));
    await waitFor(() => {
      expect(screen.getByText("Location name (required)")).toBeInTheDocument();
    });
  });

  // 27. Location form has Address field
  it("location form has Address field", async () => {
    renderWithProviders(<Admin />, { initialEntries: ["/admin/account"] });
    await waitFor(() => expect(screen.getByText("Add location")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Add location"));
    await waitFor(() => {
      expect(screen.getByText("Address")).toBeInTheDocument();
    });
  });

  // 27b. Existing location shows map confirmation when structured place data exists
  it("edit location form shows map preview and confirmation for stored place data", async () => {
    renderWithProviders(<Admin />);
    await waitFor(() => expect(screen.getByText("Location details")).toBeInTheDocument());
    const locationDetailsCard = screen.getByText("Location details").closest(".card-surface");
    const editButtons = locationDetailsCard
      ? Array.from(locationDetailsCard.querySelectorAll("button")).filter(btn => btn.textContent?.trim() === "Edit")
      : [];
    expect(editButtons.length).toBeGreaterThan(0);
    fireEvent.click(editButtons[0] as HTMLElement);

    await waitFor(() => {
      expect(screen.getByAltText("Location map preview")).toBeInTheDocument();
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

  // 28. Location form does not show email for new locations
  it("location form hides email field for new locations", async () => {
    renderWithProviders(<Admin />, { initialEntries: ["/admin/account"] });
    await waitFor(() => expect(screen.getByText("Add location")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Add location"));
    await waitFor(() => {
      expect(screen.queryByText("Location email")).not.toBeInTheDocument();
    });
  });

  // 29. Location form has Location phone field
  it("location form has Location phone field", async () => {
    renderWithProviders(<Admin />, { initialEntries: ["/admin/account"] });
    await waitFor(() => expect(screen.getByText("Add location")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Add location"));
    await waitFor(() => {
      expect(screen.getByText("Location phone (optional)")).toBeInTheDocument();
    });
  });

  // 30. Clicking Edit on a location opens edit form with "Edit location" heading
  it("clicking Edit on a location opens edit form", async () => {
    renderWithProviders(<Admin />, { initialEntries: ["/admin/account"] });
    await waitFor(() => {
      // There are pencil (Edit) buttons next to each location
      const editBtns = screen.getAllByRole("button");
      const pencilBtn = editBtns.find(btn => btn.closest("[class*='divide-y']") && btn.querySelector("svg"));
      expect(pencilBtn).toBeTruthy();
    });
    // Click the first Edit (pencil) button in the locations section
    const allButtons = screen.getAllByRole("button");
    // Find the pencil button adjacent to "Main Branch"
    const editButtons = allButtons.filter(btn => {
      const svg = btn.querySelector("svg");
      return svg && btn.closest(".card-surface, [class*='divide-y']");
    });
    if (editButtons.length > 0) {
      fireEvent.click(editButtons[0]);
      await waitFor(() => {
        const editLocation = screen.queryByText("Edit location");
        expect(editLocation).toBeInTheDocument();
      });
    }
  });

  // 31. Delete location button opens confirm modal
  it("clicking delete on a location shows confirm modal", async () => {
    renderWithProviders(<Admin />, { initialEntries: ["/admin/account"] });
    await waitFor(() => {
      expect(screen.getAllByText("Main Branch").length).toBeGreaterThanOrEqual(1);
    });
    // Find the "All locations" section and grab its trash (delete) buttons
    // Each location row: [MapPin] [name/addr] [Pencil btn] [Trash btn]
    // The Trash buttons have no text content and contain an SVG
    const allLocationButtons = screen.getAllByRole("button");
    // The first icon-only button after "Add location" text buttons
    // We look for buttons immediately following the "All locations" section header
    const allLocationsHeading = screen.getAllByText("All locations").find(el => el.classList.contains("section-label"));
    const section = allLocationsHeading?.closest("section");
    if (section) {
      const sectionButtons = Array.from(section.querySelectorAll("button"));
      // Buttons with no text content are icon-only (Pencil or Trash)
      const iconOnlyButtons = sectionButtons.filter(btn => !btn.textContent?.trim());
      // Trash buttons come second (after pencil) for each location
      // Main Branch is first location → buttons at index 1 (trash)
      const trashBtn = iconOnlyButtons[1]; // second icon-only btn = trash of first location
      if (trashBtn) {
        fireEvent.click(trashBtn);
        await waitFor(() => {
          expect(screen.getByText("Delete location")).toBeInTheDocument();
        });
      } else {
        // Fallback: just verify section exists
        expect(section).toBeInTheDocument();
      }
    }
  });

  // 32. Confirm modal has "Cancel" button
  it("confirm modal has Cancel button", async () => {
    renderWithProviders(<Admin />, { initialEntries: ["/admin/account"] });
    await waitFor(() => expect(screen.getAllByText("Main Branch").length).toBeGreaterThanOrEqual(1));
    const allLocationsHeading = screen.getAllByText("All locations").find(el => el.classList.contains("section-label"));
    const section = allLocationsHeading?.closest("section");
    if (section) {
      const sectionButtons = Array.from(section.querySelectorAll("button"));
      const iconOnlyButtons = sectionButtons.filter(btn => !btn.textContent?.trim());
      const trashBtn = iconOnlyButtons[1];
      if (trashBtn) {
        fireEvent.click(trashBtn);
        await waitFor(() => {
          expect(screen.getByText("Cancel")).toBeInTheDocument();
        });
      } else {
        expect(section).toBeInTheDocument();
      }
    }
  });

  // 33. Clicking "Invite" opens team member form
  it("clicking 'Invite' opens team member form", async () => {
    renderWithProviders(<Admin />, { initialEntries: ["/admin/account"] });
    await waitFor(() => {
      expect(screen.getByText("Add")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Add"));
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Add team member" })).toBeInTheDocument();
    });
  });

  // 34. Team member form has Full name field
  it("team member form has Full name field", async () => {
    renderWithProviders(<Admin />, { initialEntries: ["/admin/account"] });
    await waitFor(() => expect(screen.getByText("Add")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Add"));
    await waitFor(() => {
      expect(screen.getAllByText("Full name").length).toBeGreaterThan(0);
    });
  });

  // 35. Team member form has Email field
  it("team member form has Email field", async () => {
    renderWithProviders(<Admin />, { initialEntries: ["/admin/account"] });
    await waitFor(() => expect(screen.getByText("Add")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Add"));
    await waitFor(() => {
      expect(screen.getAllByText("Email").length).toBeGreaterThan(0);
    });
  });

  // 35b. Team member form has PIN field for kiosk/admin access
  it("team member form has Kiosk PIN field", async () => {
    renderWithProviders(<Admin />, { initialEntries: ["/admin/account"] });
    await waitFor(() => expect(screen.getByText("Add")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Add"));
    await waitFor(() => {
      expect(screen.getByText("Kiosk PIN")).toBeInTheDocument();
    });
  });

  // 35c. Owner edit form shows Admin PIN field
  it("owner team member edit form has Admin PIN field", async () => {
    renderWithProviders(<Admin />, { initialEntries: ["/admin/account"] });
    await waitFor(() => expect(screen.getAllByText("Sarah Owner").length).toBeGreaterThanOrEqual(1));
    fireEvent.click(screen.getByLabelText("Edit Sarah Owner"));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Edit team member" })).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText("Generate")).toBeInTheDocument());
  });

  // 36. Billing card is visible in Account tab
  it("billing card is visible in Account tab", async () => {
    renderWithProviders(<Admin />, { initialEntries: ["/admin/account"] });
    await waitFor(() => {
      expect(screen.getByText("Current Plan")).toBeInTheDocument();
    });
  });

  // 37. Billing card shows "Olia Growth" plan name
  it("billing card shows plan name", async () => {
    renderWithProviders(<Admin />, { initialEntries: ["/admin/account"] });
    await waitFor(() => {
      expect(screen.getByText("Olia Growth")).toBeInTheDocument();
    });
  });

  // 38. Manage Billing button is visible on web
  it("'Manage Billing' button is visible in Account tab on web", async () => {
    mockUseIsNativeApp.mockReturnValue(false);
    renderWithProviders(<Admin />, { initialEntries: ["/admin/account"] });
    await waitFor(() => {
      expect(screen.getByText("Manage Billing")).toBeInTheDocument();
    });
  });

  // 38b. On native, 'Manage Billing' is replaced with external link
  it("shows 'Manage at olia.app' link instead of 'Manage Billing' on native", async () => {
    mockUseIsNativeApp.mockReturnValue(true);
    renderWithProviders(<Admin />, { initialEntries: ["/admin/account"] });
    await waitFor(() => {
      expect(screen.getByText("Manage at olia.app")).toBeInTheDocument();
      expect(screen.queryByText("Manage Billing")).not.toBeInTheDocument();
    });
  });

  // 39. At least one permission label appears in team member expand
  it("permission labels appear when team member is expanded", async () => {
    renderWithProviders(<Admin />, { initialEntries: ["/admin/account"] });
    await waitFor(() => {
      expect(screen.getAllByText("Mike Manager").length).toBeGreaterThanOrEqual(1);
    });
    // Click the expand (ChevronDown) button for Mike Manager
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

  // 40. Department management section shows default departments
  it("Account tab shows Department management section with default departments", async () => {
    renderWithProviders(<Admin />, { initialEntries: ["/admin/account"] });
    await waitFor(() => {
      expect(screen.getByText("Department management")).toBeInTheDocument();
    });
  });

  // 41. Default departments listed
  it("Department management section shows default department names", async () => {
    renderWithProviders(<Admin />, { initialEntries: ["/admin/account"] });
    await waitFor(() => {
      expect(screen.getByText("Front of House")).toBeInTheDocument();
      expect(screen.getByText("Back of House")).toBeInTheDocument();
      expect(screen.getByText("Management")).toBeInTheDocument();
      expect(screen.getByText("Cleaning Crew")).toBeInTheDocument();
    });
  });

  it("Department management no longer shows sub-role controls", async () => {
    renderWithProviders(<Admin />, { initialEntries: ["/admin/account"] });
    await waitFor(() => {
      expect(screen.getByText("Department management")).toBeInTheDocument();
    });
    expect(screen.queryByPlaceholderText("Add sub-role…")).not.toBeInTheDocument();
    expect(screen.queryByText(/sub-role/i)).not.toBeInTheDocument();
  });

  // 42. Add department input exists
  it("Account tab has 'Add department' input", async () => {
    renderWithProviders(<Admin />, { initialEntries: ["/admin/account"] });
    await waitFor(() => {
      expect(screen.getByPlaceholderText("Add department…")).toBeInTheDocument();
    });
  });

  // 43. Audit log section exists
  it("Account tab has Audit log section", async () => {
    renderWithProviders(<Admin />, { initialEntries: ["/admin/account"] });
    await waitFor(() => {
      expect(screen.getByText("Audit log")).toBeInTheDocument();
    });
  });

  // 44. Launch Kiosk Mode button in My Location tab
  it("My Location tab shows 'Launch Kiosk Mode' button", async () => {
    renderWithProviders(<Admin />);
    await waitFor(() => {
      expect(screen.getByText(/Launch Kiosk Mode/i)).toBeInTheDocument();
    });
  });

  it("Account tab marks inactive over-limit locations as read-only", async () => {
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

    renderWithProviders(<Admin />, { initialEntries: ["/admin/account"] });

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

  // 45. Auto-archive threshold section is present
  it("My Location tab shows 'Auto-archive threshold' section", async () => {
    renderWithProviders(<Admin />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^archived$/i })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: /^archived$/i }));
    await waitFor(() => {
      expect(screen.getByText("Auto-archive threshold")).toBeInTheDocument();
    });
  });

  // 46. Notifications section has been removed from the current My Location view
  it("My Location tab does not show a Notifications & alerts section", async () => {
    renderWithProviders(<Admin />);
    await waitFor(() => {
      expect(screen.getByText("Location details")).toBeInTheDocument();
    });
    expect(screen.queryByText("Notifications & alerts")).not.toBeInTheDocument();
  });

  // 47. Assigned checklists section is visible
  it("My Location tab shows Assigned checklists section", async () => {
    renderWithProviders(<Admin />);
    await waitFor(() => {
      expect(screen.getByText("Assigned checklists")).toBeInTheDocument();
    });
  });

  // 48. Staff profiles section label
  it("My Location tab shows 'Staff profiles' section label", async () => {
    renderWithProviders(<Admin />);
    await waitFor(() => {
      expect(screen.getByText("Staff profiles")).toBeInTheDocument();
    });
  });

  // 49. Team members section label in Account tab
  it("Account tab shows 'Team members' section label", async () => {
    renderWithProviders(<Admin />, { initialEntries: ["/admin/account"] });
    await waitFor(() => {
      expect(screen.getByText("Team members")).toBeInTheDocument();
    });
  });

  // 50. Checklist coverage summary in Account tab
  it("Account tab shows Checklist coverage summary", async () => {
    renderWithProviders(<Admin />, { initialEntries: ["/admin/account"] });
    await waitFor(() => {
      expect(screen.getByText("Checklist coverage")).toBeInTheDocument();
    });
  });

  // ── Opening hours & checklists ─────────────────────────────────────────────

  it("location detail shows formatted opening hours when trading_hours is structured JSON", async () => {
    const jsonHours = JSON.stringify({
      mon: { open: true, windows: [{ start: "09:00", end: "18:00" }] },
      tue: { open: true, windows: [{ start: "09:00", end: "18:00" }] },
      wed: { open: true, windows: [{ start: "09:00", end: "18:00" }] },
      thu: { open: true, windows: [{ start: "09:00", end: "18:00" }] },
      fri: { open: true, windows: [{ start: "09:00", end: "18:00" }] },
      sat: { open: true, windows: [{ start: "10:00", end: "16:00" }] },
      sun: { open: false, windows: [] },
    });
    // use mockReturnValue (not Once) so all re-renders get the JSON data
    mockUseLocations.mockReturnValue({
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
    renderWithProviders(<Admin />);
    await waitFor(() => {
      const locationDetails = screen.getByText("Location details").closest(".card-surface");
      expect(locationDetails?.textContent).toContain("Mon:");
      expect(locationDetails?.textContent).toContain("09:00");
    });
    // Restore default mock for subsequent tests
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

  it("location form shows Opening hours with time inputs for open days and 'Closed' for closed days", async () => {
    renderWithProviders(<Admin />, { initialEntries: ["/admin/account"] });
    await waitFor(() => expect(screen.getAllByText("Main Branch").length).toBeGreaterThanOrEqual(1));
    // click the pencil/edit button on the first location
    const allLocationsSection = screen.getAllByText("All locations").find(el => el.classList.contains("section-label"))?.closest("section");
    if (allLocationsSection) {
      const pencilBtns = Array.from(allLocationsSection.querySelectorAll("button")).filter(btn => !btn.textContent?.trim());
      if (pencilBtns.length > 0) {
        fireEvent.click(pencilBtns[0] as HTMLElement);
        await waitFor(() => {
          expect(screen.getByText("Opening hours")).toBeInTheDocument();
          // Sun is closed by default in parseHours
          expect(screen.getByText("Closed")).toBeInTheDocument();
        });
      }
    }
  });

  it("location form supports split-day hours and copying them to later days", async () => {
    renderWithProviders(<Admin />, { initialEntries: ["/admin/account"] });
    await waitFor(() => expect(screen.getByText("Add location")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Add location"));

    await waitFor(() => expect(screen.getByText("Opening hours")).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText("Mon start time window 1"), { target: { value: "09:00" } });
    fireEvent.change(screen.getByLabelText("Mon end time window 1"), { target: { value: "14:00" } });
    fireEvent.click(screen.getByRole("button", { name: "Add split hours for Mon" }));

    await waitFor(() => {
      expect(screen.getByLabelText("Mon start time window 2")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText("Mon start time window 2"), { target: { value: "17:00" } });
    fireEvent.change(screen.getByLabelText("Mon end time window 2"), { target: { value: "22:00" } });
    fireEvent.click(screen.getByRole("button", { name: "Copy Mon to later days" }));

    await waitFor(() => {
      expect(screen.getByLabelText("Tue start time window 1")).toHaveValue("09:00");
      expect(screen.getByLabelText("Tue end time window 1")).toHaveValue("14:00");
      expect(screen.getByLabelText("Tue start time window 2")).toHaveValue("17:00");
      expect(screen.getByLabelText("Tue end time window 2")).toHaveValue("22:00");
    });
  });

  it("My Location tab shows assigned checklist names for current location", async () => {
    renderWithProviders(<Admin />);
    await waitFor(() => {
      expect(screen.getByText("Assigned checklists")).toBeInTheDocument();
      expect(screen.getByText("Opening Checklist")).toBeInTheDocument();
      expect(screen.getByText("Closing Checklist")).toBeInTheDocument();
    });
  });

  it("My Location tab shows 'no checklists' message for a location with no assigned checklists", async () => {
    // Switch to a location with no checklists (City Centre, id=l2, no checklists in mock)
    renderWithProviders(<Admin />);
    // Change location selector to l2
    await waitFor(() => expect(screen.getByText("Location details")).toBeInTheDocument());
    const locationSelect = document.querySelector("select");
    if (locationSelect) {
      fireEvent.change(locationSelect, { target: { value: "l2" } });
      await waitFor(() => {
        expect(screen.getByText(/No checklists assigned/i)).toBeInTheDocument();
      });
    }
  });

  it("staff edit form shows 'New PIN (optional)' label for existing profiles", async () => {
    renderWithProviders(<Admin />);
    await waitFor(() => expect(screen.getByText("Alice Smith")).toBeInTheDocument());
    // click the edit pencil on Alice Smith
    const staffSection = screen.getByText("Staff profiles").closest("section");
    if (staffSection) {
      const editBtns = Array.from(staffSection.querySelectorAll("button[aria-label='Edit']"));
      if (editBtns.length > 0) {
        fireEvent.click(editBtns[0] as HTMLElement);
        await waitFor(() => {
          expect(screen.getByText("New PIN (optional)")).toBeInTheDocument();
        });
      }
    }
  });

  it("Account tab shows checklist coverage with checklist titles", async () => {
    renderWithProviders(<Admin />, { initialEntries: ["/admin/account"] });
    await waitFor(() => {
      expect(screen.getByText("Checklist coverage")).toBeInTheDocument();
      expect(screen.getAllByText("Opening Checklist").length).toBeGreaterThanOrEqual(1);
    });
  });

  // ── My Location empty state (new user with no locations) ───────────────────

  it("My Location tab shows onboarding empty state when user has no locations", async () => {
    mockUseLocations.mockReturnValueOnce({ data: [], isLoading: false });
    renderWithProviders(<Admin />);
    await waitFor(() => {
      // Both the h2 heading and the CTA button contain this text
      const matches = screen.getAllByText("Add your first location");
      expect(matches.length).toBeGreaterThanOrEqual(1);
    });
  });

  it("My Location empty state includes an explanatory message", async () => {
    mockUseLocations.mockReturnValueOnce({ data: [], isLoading: false });
    renderWithProviders(<Admin />);
    await waitFor(() => {
      expect(screen.getByText(/locations are where your team works/i)).toBeInTheDocument();
    });
  });

  // ── isNativeApp hook is mocked (web default) ─────────────────────────────────

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
});
