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

const reportingTabMock = vi.fn(({ initialLocationId }: { initialLocationId?: string }) => (
  <div>Reporting Tab {initialLocationId ?? "all"}</div>
));

vi.mock("@/pages/checklists/ReportingTab", () => ({
  ReportingTab: (props: { initialLocationId?: string }) => reportingTabMock(props),
}));

describe("Reporting page", () => {
  beforeEach(() => {
    reportingTabMock.mockClear();
  });

  it("renders the top-level Reporting page", () => {
    renderWithProviders(<Reporting />, { initialEntries: ["/reporting"] });
    expect(screen.getByRole("heading", { name: "Reporting" })).toBeInTheDocument();
    expect(screen.getByText("Logs & compliance overview")).toBeInTheDocument();
    expect(screen.getByText("Reporting Tab all")).toBeInTheDocument();
  });

  it("passes the location filter from the route to ReportingTab", () => {
    renderWithProviders(<Reporting />, { initialEntries: ["/reporting?location=loc-2"] });
    expect(screen.getByText("Reporting Tab loc-2")).toBeInTheDocument();
  });
});
