import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactNode } from "react";
import { NotificationsTab } from "@/pages/admin/NotificationsTab";

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
    }),
    functions: {
      invoke: vi.fn().mockResolvedValue({ data: { sent: true }, error: null }),
    },
  },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "u1" },
    teamMember: { id: "u1", organization_id: "org1", role: "Owner" },
    loading: false,
    signOut: vi.fn(),
  }),
  AuthProvider: ({ children }: any) => children,
}));

const mockSaveMutate = vi.fn();

vi.mock("@/hooks/useChecklistNotificationRules", () => ({
  useChecklistNotificationRules: () => ({
    data: null,
    isLoading: false,
  }),
  useSaveChecklistNotificationRules: () => ({
    mutate: mockSaveMutate,
    isPending: false,
  }),
}));

vi.mock("@/components/ui/sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe("NotificationsTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders without crashing", () => {
    render(<NotificationsTab />, { wrapper });
    expect(screen.getByText("Daily checklist summary")).toBeInTheDocument();
  });

  it("shows the enabled toggle", () => {
    render(<NotificationsTab />, { wrapper });
    expect(screen.getByTestId("notifications-enabled-toggle")).toBeInTheDocument();
  });

  it("hides email/alert options when disabled", () => {
    render(<NotificationsTab />, { wrapper });
    expect(screen.queryByTestId("notifications-email-input")).not.toBeInTheDocument();
  });

  it("shows email and options when toggle is switched on", () => {
    render(<NotificationsTab />, { wrapper });
    const toggle = screen.getByTestId("notifications-enabled-toggle");
    fireEvent.click(toggle);
    expect(screen.getByTestId("notifications-email-input")).toBeInTheDocument();
    expect(screen.getByTestId("notifications-unstarted-toggle")).toBeInTheDocument();
    expect(screen.getByTestId("notifications-unfinished-toggle")).toBeInTheDocument();
    expect(screen.getByTestId("notifications-hour-select")).toBeInTheDocument();
  });

  it("shows Test button only when enabled", () => {
    render(<NotificationsTab />, { wrapper });
    expect(screen.queryByTestId("notifications-test-btn")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("notifications-enabled-toggle"));
    expect(screen.getByTestId("notifications-test-btn")).toBeInTheDocument();
  });

  it("calls save with correct payload when Save settings is clicked", async () => {
    render(<NotificationsTab />, { wrapper });
    // Enable
    fireEvent.click(screen.getByTestId("notifications-enabled-toggle"));
    // Fill in email
    fireEvent.change(screen.getByTestId("notifications-email-input"), { target: { value: "mgr@hotel.com" } });
    // Click save
    fireEvent.click(screen.getByTestId("notifications-save-btn"));
    await waitFor(() => {
      expect(mockSaveMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          enabled: true,
          recipient_email: "mgr@hotel.com",
          notify_unstarted: true,
          notify_unfinished: true,
        }),
        expect.anything()
      );
    });
  });

  it("shows hour options in the time select", () => {
    render(<NotificationsTab />, { wrapper });
    fireEvent.click(screen.getByTestId("notifications-enabled-toggle"));
    const select = screen.getByTestId("notifications-hour-select");
    const options = select.querySelectorAll("option");
    expect(options.length).toBe(24);
  });
});
