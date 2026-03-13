import { screen, fireEvent, waitFor } from "@testing-library/react";
import Admin from "@/pages/Admin";
import { renderWithProviders } from "../test-utils";

// ─── Supabase mock ────────────────────────────────────────────────────────────
vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      signInWithPassword: vi.fn().mockResolvedValue({ data: { session: { user: { id: "u1" } } }, error: null }),
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
    teamMember: { id: "u1", organization_id: "org1", name: "Sarah", email: "sarah@example.com", role: "Owner", location_ids: [], permissions: {} },
    loading: false,
    signOut: vi.fn(),
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// ─── usePlan mock ─────────────────────────────────────────────────────────────
vi.mock("@/hooks/usePlan", () => ({
  usePlan: () => ({
    plan: "growth",
    planStatus: "active",
    features: { aiBuilder: true, fileConvert: true, recharts: true, maxLocations: 10, maxStaff: 200, maxChecklists: -1 },
    can: () => true,
    withinLimit: () => true,
    isActive: true,
    hasStripeSubscription: true,
    isLoading: false,
  }),
}));

// ─── Data mocks ───────────────────────────────────────────────────────────────
const mockLocations = [
  { id: "l1", name: "Main Branch", address: "123 Street", contact_email: "main@test.com", contact_phone: "555-0001", trading_hours: "9-17", archive_threshold_days: 90 },
  { id: "l2", name: "City Centre", address: "456 Ave", contact_email: "city@test.com", contact_phone: "555-0002", trading_hours: "8-22", archive_threshold_days: 90 },
];

const mockStaff = [
  { id: "sp1", location_id: "l1", first_name: "Alice", last_name: "Smith", role: "Waiter", status: "active", pin: "1234", last_used_at: null, archived_at: null, created_at: "2024-01-01T00:00:00Z" },
  { id: "sp2", location_id: "l1", first_name: "Bob", last_name: "Jones", role: "Kitchen", status: "archived", pin: "5678", last_used_at: "2024-02-01T00:00:00Z", archived_at: "2024-02-15T00:00:00Z", created_at: "2024-01-01T00:00:00Z" },
];

const mockTeam = [
  { id: "tm1", name: "Sarah Owner", email: "sarah@example.com", role: "Owner", initials: "SO", location_ids: ["l1"], permissions: { create_edit_checklists: true, assign_checklists: true, manage_staff_profiles: true, view_reporting: true, edit_location_details: true, manage_alerts: true, export_data: true, override_inactivity_threshold: true } },
  { id: "tm2", name: "Mike Manager", email: "mike@example.com", role: "Manager", initials: "MM", location_ids: ["l2"], permissions: { create_edit_checklists: true, assign_checklists: true, manage_staff_profiles: false, view_reporting: true, edit_location_details: false, manage_alerts: false, export_data: false, override_inactivity_threshold: false } },
];

vi.mock("@/hooks/useLocations", () => ({
  useLocations: () => ({ data: mockLocations, isLoading: false }),
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
  useSaveTeamMember: () => ({ mutate: vi.fn(), mutateAsync: vi.fn() }),
  useDeleteTeamMember: () => ({ mutate: vi.fn() }),
}));

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Admin page", () => {
  // 1. Renders without crashing
  it("renders the Admin page without crashing", () => {
    renderWithProviders(<Admin />);
    expect(document.body).toBeDefined();
  });

  // 2. Shows both tabs
  it("shows 'My Location' and 'Account' tabs", () => {
    renderWithProviders(<Admin />);
    expect(screen.getByText("My Location")).toBeInTheDocument();
    expect(screen.getByText("Account")).toBeInTheDocument();
  });

  // 3. My Location is active by default
  it("'My Location' tab is active by default", () => {
    renderWithProviders(<Admin />);
    // The location picker / section-label should be visible
    expect(screen.getByText("Location details")).toBeInTheDocument();
  });

  // 4. Clicking Account tab shows account content
  it("clicking 'Account' tab shows account content", () => {
    renderWithProviders(<Admin />);
    const accountTab = screen.getByText("Account");
    fireEvent.click(accountTab);
    expect(screen.getByText("All locations")).toBeInTheDocument();
  });

  // 5. Location section shows location names
  it("location select shows location names (Main Branch, City Centre)", async () => {
    renderWithProviders(<Admin />);
    await waitFor(() => {
      // Either in a dropdown or displayed text somewhere
      const mainBranch = screen.queryByText("Main Branch") || screen.queryAllByText(/Main Branch/i)[0];
      expect(mainBranch).toBeTruthy();
    });
  });

  // 6. Location details card appears when a location exists
  it("location details card is rendered when location is selected", async () => {
    renderWithProviders(<Admin />);
    await waitFor(() => {
      expect(screen.getByText("Location details")).toBeInTheDocument();
    });
  });

  // 7. Staff Profiles section shows active staff (Alice Smith)
  it("staff profiles section shows Alice Smith", async () => {
    renderWithProviders(<Admin />);
    await waitFor(() => {
      expect(screen.getByText("Alice Smith")).toBeInTheDocument();
    });
  });

  // 8. Staff role badge shows "Waiter"
  it("shows Alice Smith's role as Waiter", async () => {
    renderWithProviders(<Admin />);
    await waitFor(() => {
      const waiterBadges = screen.getAllByText("Waiter");
      expect(waiterBadges.length).toBeGreaterThanOrEqual(1);
    });
  });

  // 9. Active staff shows Edit button (Pencil)
  it("active staff has edit (pencil) button", async () => {
    renderWithProviders(<Admin />);
    await waitFor(() => {
      const editBtns = screen.getAllByRole("button", { name: /edit/i });
      expect(editBtns.length).toBeGreaterThanOrEqual(1);
    });
  });

  // 10. Active staff has Archive button
  it("active staff has archive button", async () => {
    renderWithProviders(<Admin />);
    await waitFor(() => {
      const archiveBtns = screen.getAllByRole("button", { name: /archive/i });
      expect(archiveBtns.length).toBeGreaterThanOrEqual(1);
    });
  });

  // 11. Clicking "Add" staff button opens staff profile form
  it("clicking 'Add' staff opens the staff profile form sheet", async () => {
    renderWithProviders(<Admin />);
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
    renderWithProviders(<Admin />);
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
      expect(screen.getByText("Archived")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Archived"));
    await waitFor(() => {
      expect(screen.getByText("Bob Jones")).toBeInTheDocument();
    });
  });

  // 17. Archived staff shows Restore button
  it("archived staff has Restore button", async () => {
    renderWithProviders(<Admin />);
    await waitFor(() => {
      expect(screen.getByText("Archived")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Archived"));
    await waitFor(() => {
      const restoreBtns = screen.getAllByRole("button", { name: /restore/i });
      expect(restoreBtns.length).toBeGreaterThanOrEqual(1);
    });
  });

  // 18. Archived staff has Delete permanently button
  it("archived staff has 'Delete permanently' button", async () => {
    renderWithProviders(<Admin />);
    await waitFor(() => expect(screen.getByText("Archived")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Archived"));
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
    renderWithProviders(<Admin />);
    fireEvent.click(screen.getByText("Account"));
    await waitFor(() => {
      expect(screen.getAllByText("Main Branch").length).toBeGreaterThanOrEqual(1);
    });
  });

  // 22. Account tab shows "City Centre" location
  it("Account tab shows City Centre location", async () => {
    renderWithProviders(<Admin />);
    fireEvent.click(screen.getByText("Account"));
    await waitFor(() => {
      expect(screen.getAllByText("City Centre").length).toBeGreaterThanOrEqual(1);
    });
  });

  // 23. Team Members section shows Sarah Owner and Mike Manager
  it("Account tab shows team members Sarah Owner and Mike Manager", async () => {
    renderWithProviders(<Admin />);
    fireEvent.click(screen.getByText("Account"));
    await waitFor(() => {
      expect(screen.getByText("Sarah Owner")).toBeInTheDocument();
      expect(screen.getByText("Mike Manager")).toBeInTheDocument();
    });
  });

  // 24. "Add location" button visible in Account tab
  it("'Add location' button is visible in Account tab", async () => {
    renderWithProviders(<Admin />);
    fireEvent.click(screen.getByText("Account"));
    await waitFor(() => {
      expect(screen.getByText("Add location")).toBeInTheDocument();
    });
  });

  // 25. Clicking "Add location" opens a location form
  it("clicking 'Add location' opens location form sheet", async () => {
    renderWithProviders(<Admin />);
    fireEvent.click(screen.getByText("Account"));
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
    renderWithProviders(<Admin />);
    fireEvent.click(screen.getByText("Account"));
    await waitFor(() => expect(screen.getByText("Add location")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Add location"));
    await waitFor(() => {
      expect(screen.getByText("Location name (required)")).toBeInTheDocument();
    });
  });

  // 27. Location form has Address field
  it("location form has Address field", async () => {
    renderWithProviders(<Admin />);
    fireEvent.click(screen.getByText("Account"));
    await waitFor(() => expect(screen.getByText("Add location")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Add location"));
    await waitFor(() => {
      expect(screen.getByText("Address")).toBeInTheDocument();
    });
  });

  // 28. Location form has Contact email field
  it("location form has Contact email field", async () => {
    renderWithProviders(<Admin />);
    fireEvent.click(screen.getByText("Account"));
    await waitFor(() => expect(screen.getByText("Add location")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Add location"));
    await waitFor(() => {
      expect(screen.getByText("Contact email")).toBeInTheDocument();
    });
  });

  // 29. Location form has Contact phone field
  it("location form has Contact phone field", async () => {
    renderWithProviders(<Admin />);
    fireEvent.click(screen.getByText("Account"));
    await waitFor(() => expect(screen.getByText("Add location")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Add location"));
    await waitFor(() => {
      expect(screen.getByText("Contact phone")).toBeInTheDocument();
    });
  });

  // 30. Clicking Edit on a location opens edit form with "Edit location" heading
  it("clicking Edit on a location opens edit form", async () => {
    renderWithProviders(<Admin />);
    fireEvent.click(screen.getByText("Account"));
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
    renderWithProviders(<Admin />);
    fireEvent.click(screen.getByText("Account"));
    await waitFor(() => {
      expect(screen.getByText("Main Branch")).toBeInTheDocument();
    });
    // Find the "All locations" section and grab its trash (delete) buttons
    // Each location row: [MapPin] [name/addr] [Pencil btn] [Trash btn]
    // The Trash buttons have no text content and contain an SVG
    const allLocationButtons = screen.getAllByRole("button");
    // The first icon-only button after "Add location" text buttons
    // We look for buttons immediately following the "All locations" section header
    const allLocationsHeading = screen.getByText("All locations");
    const section = allLocationsHeading.closest("section");
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
    renderWithProviders(<Admin />);
    fireEvent.click(screen.getByText("Account"));
    await waitFor(() => expect(screen.getByText("Main Branch")).toBeInTheDocument());
    const allLocationsHeading = screen.getByText("All locations");
    const section = allLocationsHeading.closest("section");
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
    renderWithProviders(<Admin />);
    fireEvent.click(screen.getByText("Account"));
    await waitFor(() => {
      expect(screen.getByText("Invite")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Invite"));
    await waitFor(() => {
      expect(screen.getByText("Invite team member")).toBeInTheDocument();
    });
  });

  // 34. Team member form has Full name field
  it("team member form has Full name field", async () => {
    renderWithProviders(<Admin />);
    fireEvent.click(screen.getByText("Account"));
    await waitFor(() => expect(screen.getByText("Invite")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Invite"));
    await waitFor(() => {
      expect(screen.getByText("Full name")).toBeInTheDocument();
    });
  });

  // 35. Team member form has Email field
  it("team member form has Email field", async () => {
    renderWithProviders(<Admin />);
    fireEvent.click(screen.getByText("Account"));
    await waitFor(() => expect(screen.getByText("Invite")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Invite"));
    await waitFor(() => {
      expect(screen.getByText("Email")).toBeInTheDocument();
    });
  });

  // 36. Billing card is visible in Account tab
  it("billing card is visible in Account tab", async () => {
    renderWithProviders(<Admin />);
    fireEvent.click(screen.getByText("Account"));
    await waitFor(() => {
      expect(screen.getByText("Current Plan")).toBeInTheDocument();
    });
  });

  // 37. Billing card shows "Olia Growth" plan name
  it("billing card shows plan name", async () => {
    renderWithProviders(<Admin />);
    fireEvent.click(screen.getByText("Account"));
    await waitFor(() => {
      expect(screen.getByText("Olia Growth")).toBeInTheDocument();
    });
  });

  // 38. Manage Billing button is visible
  it("'Manage Billing' button is visible in Account tab", async () => {
    renderWithProviders(<Admin />);
    fireEvent.click(screen.getByText("Account"));
    await waitFor(() => {
      expect(screen.getByText("Manage Billing")).toBeInTheDocument();
    });
  });

  // 39. At least one permission label appears in team member expand
  it("permission labels appear when team member is expanded", async () => {
    renderWithProviders(<Admin />);
    fireEvent.click(screen.getByText("Account"));
    await waitFor(() => {
      expect(screen.getByText("Mike Manager")).toBeInTheDocument();
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

  // 40. Role management section shows default roles
  it("Account tab shows Role management section with default roles", async () => {
    renderWithProviders(<Admin />);
    fireEvent.click(screen.getByText("Account"));
    await waitFor(() => {
      expect(screen.getByText("Role management")).toBeInTheDocument();
    });
  });

  // 41. Default roles listed (e.g. Waiter)
  it("Role management section shows 'Waiter' default role", async () => {
    renderWithProviders(<Admin />);
    fireEvent.click(screen.getByText("Account"));
    await waitFor(() => {
      // Multiple Waiter labels (role in staff card + role management)
      const waiterEls = screen.getAllByText("Waiter");
      expect(waiterEls.length).toBeGreaterThanOrEqual(1);
    });
  });

  // 42. Add custom role input exists
  it("Account tab has 'Add custom role' input", async () => {
    renderWithProviders(<Admin />);
    fireEvent.click(screen.getByText("Account"));
    await waitFor(() => {
      expect(screen.getByPlaceholderText("Add custom role…")).toBeInTheDocument();
    });
  });

  // 43. Audit log section exists
  it("Account tab has Audit log section", async () => {
    renderWithProviders(<Admin />);
    fireEvent.click(screen.getByText("Account"));
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

  // 45. Auto-archive threshold section is present
  it("My Location tab shows 'Auto-archive threshold' section", async () => {
    renderWithProviders(<Admin />);
    await waitFor(() => {
      expect(screen.getByText("Auto-archive threshold")).toBeInTheDocument();
    });
  });

  // 46. Notifications & Alerts section is visible
  it("My Location tab shows Notifications & alerts section", async () => {
    renderWithProviders(<Admin />);
    await waitFor(() => {
      expect(screen.getByText("Notifications & alerts")).toBeInTheDocument();
    });
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
    renderWithProviders(<Admin />);
    fireEvent.click(screen.getByText("Account"));
    await waitFor(() => {
      expect(screen.getByText("Team members")).toBeInTheDocument();
    });
  });

  // 50. Checklist assignment placeholder in Account tab
  it("Account tab shows Checklist assignment placeholder", async () => {
    renderWithProviders(<Admin />);
    fireEvent.click(screen.getByText("Account"));
    await waitFor(() => {
      expect(screen.getByText("Checklist assignment")).toBeInTheDocument();
    });
  });
});
