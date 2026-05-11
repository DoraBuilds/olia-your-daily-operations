import { screen } from "@testing-library/react";
import { SidebarNav } from "@/components/SidebarNav";
import { renderWithProviders } from "../test-utils";

const { mockUseAuth } = vi.hoisted(() => ({
  mockUseAuth: vi.fn(),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: mockUseAuth,
}));

describe("SidebarNav", () => {
  beforeEach(() => {
    mockUseAuth.mockReturnValue({
      teamMember: {
        id: "tm-1",
        role: "Owner",
      },
    });
  });

  it("always shows Infohub child links regardless of active route", () => {
    renderWithProviders(<SidebarNav />, { initialEntries: ["/dashboard"] });

    expect(screen.getByRole("link", { name: "Library" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Training" })).toBeInTheDocument();
  });

  it("shows Infohub child links when Infohub is active", () => {
    renderWithProviders(<SidebarNav />, { initialEntries: ["/infohub/library"] });

    expect(screen.getByRole("link", { name: "Library" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Training" })).toBeInTheDocument();
  });

  it("always shows all Admin child links for owners regardless of active route", () => {
    renderWithProviders(<SidebarNav />, { initialEntries: ["/dashboard"] });

    expect(screen.getByRole("link", { name: "Locations" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Users" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Account" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Billing" })).toBeInTheDocument();
  });

  it("shows Admin child links for owners when Admin is active", () => {
    renderWithProviders(<SidebarNav />, { initialEntries: ["/admin/location"] });

    expect(screen.getByRole("link", { name: "Locations" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Users" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Account" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Billing" })).toBeInTheDocument();
  });

  it("hides owner-only child links for non-owners", () => {
    mockUseAuth.mockReturnValue({
      teamMember: {
        id: "tm-2",
        role: "Manager",
      },
    });

    renderWithProviders(<SidebarNav />, { initialEntries: ["/admin/location"] });

    expect(screen.getByRole("link", { name: "Locations" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Users" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Account" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Billing" })).toBeNull();
  });

  it("hides owner-only child links for non-owners even when not on admin route", () => {
    mockUseAuth.mockReturnValue({
      teamMember: {
        id: "tm-2",
        role: "Manager",
      },
    });

    renderWithProviders(<SidebarNav />, { initialEntries: ["/dashboard"] });

    expect(screen.getByRole("link", { name: "Locations" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Users" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Account" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Billing" })).toBeNull();
  });
});
