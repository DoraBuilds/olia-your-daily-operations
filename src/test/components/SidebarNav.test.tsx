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

  it("shows Infohub child links when Infohub is active", () => {
    renderWithProviders(<SidebarNav />, { initialEntries: ["/infohub/library"] });

    expect(screen.getByRole("link", { name: "Library" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Training" })).toBeInTheDocument();
  });

  it("shows Admin child links for owners when Admin is active", () => {
    renderWithProviders(<SidebarNav />, { initialEntries: ["/admin/account"] });

    expect(screen.getByRole("link", { name: "My Location" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Account" })).toBeInTheDocument();
  });

  it("hides the Account child link for non-owners", () => {
    mockUseAuth.mockReturnValue({
      teamMember: {
        id: "tm-2",
        role: "Manager",
      },
    });

    renderWithProviders(<SidebarNav />, { initialEntries: ["/admin/location"] });

    expect(screen.getByRole("link", { name: "My Location" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Account" })).toBeNull();
  });
});
