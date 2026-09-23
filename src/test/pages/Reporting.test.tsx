import { screen } from "@testing-library/react";
import Reporting from "@/pages/Reporting";
import { renderWithProviders } from "../test-utils";

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      signOut: vi.fn().mockResolvedValue({}),
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
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

const reportingTabMock = vi.fn(({ initialLocationId, initialStatus }: { initialLocationId?: string; initialStatus?: string }) => (
  <div>Reporting Tab {initialLocationId ?? "all"} status:{initialStatus ?? "none"}</div>
));

vi.mock("@/pages/checklists/ReportingTab", () => ({
  ReportingTab: (props: { initialLocationId?: string; initialStatus?: string }) => reportingTabMock(props),
}));

describe("Reporting page", () => {
  beforeEach(() => {
    reportingTabMock.mockClear();
  });

  it("renders the top-level Reporting page", () => {
    renderWithProviders(<Reporting />, { initialEntries: ["/reporting"] });
    // No more "Olia" + subtitle header — the page renders straight into ReportingTab.
    expect(document.querySelector("header")).toBeNull();
    expect(screen.getByText("Reporting Tab all status:none")).toBeInTheDocument();
  });

  it("passes the location filter from the route to ReportingTab", () => {
    renderWithProviders(<Reporting />, { initialEntries: ["/reporting?location=loc-2"] });
    expect(screen.getByText("Reporting Tab loc-2 status:none")).toBeInTheDocument();
  });

  it("passes a valid status filter from the route to ReportingTab", () => {
    renderWithProviders(<Reporting />, { initialEntries: ["/reporting?status=unstarted"] });
    expect(screen.getByText("Reporting Tab all status:unstarted")).toBeInTheDocument();
  });

  it("ignores an invalid status value from the route", () => {
    renderWithProviders(<Reporting />, { initialEntries: ["/reporting?status=bogus"] });
    expect(screen.getByText("Reporting Tab all status:none")).toBeInTheDocument();
  });
});
