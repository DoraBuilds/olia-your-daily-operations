import { fireEvent, screen } from "@testing-library/react";
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

  it("renders all five top-level nav items", () => {
    renderWithProviders(<SidebarNav />, { initialEntries: ["/dashboard"] });

    expect(screen.getByRole("link", { name: "Dashboard" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Checklists" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Reporting" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Infohub" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Admin" })).toBeInTheDocument();
  });

  it("shows no sub-items under Infohub", () => {
    renderWithProviders(<SidebarNav />, { initialEntries: ["/infohub/library"] });

    expect(screen.queryByRole("link", { name: "Library" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Training" })).toBeNull();
  });

  it("shows no sub-items under Admin for owners", () => {
    renderWithProviders(<SidebarNav />, { initialEntries: ["/admin/location"] });

    expect(screen.queryByRole("link", { name: "Locations" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Users" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Account" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Billing" })).toBeNull();
  });

  it("shows no sub-items under Admin for non-owners either", () => {
    mockUseAuth.mockReturnValue({
      teamMember: { id: "tm-2", role: "Manager" },
    });

    renderWithProviders(<SidebarNav />, { initialEntries: ["/admin/location"] });

    expect(screen.queryByRole("link", { name: "Locations" })).toBeNull();
  });

  it("marks Dashboard as active when on /dashboard with a teal underline, not a filled pill", () => {
    renderWithProviders(<SidebarNav />, { initialEntries: ["/dashboard"] });
    const dashLink = screen.getByRole("link", { name: "Dashboard" });
    expect(dashLink.className).toContain("text-[hsl(var(--powder-blue-deep))]");
    expect(dashLink.className).not.toContain("bg-[var(--nav-active-bg-soft)]");
    expect(dashLink.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });

  it("marks Admin as active when on an /admin/* route with a teal underline, not a filled pill", () => {
    renderWithProviders(<SidebarNav />, { initialEntries: ["/admin/location"] });
    const adminLink = screen.getByRole("link", { name: "Admin" });
    expect(adminLink.className).toContain("text-[hsl(var(--powder-blue-deep))]");
    expect(adminLink.className).not.toContain("bg-[var(--nav-active-bg-soft)]");
  });

  it("shows a small teal underline mark under the icon (not a filled pill) when collapsed", () => {
    localStorage.setItem("olia_sidebar_collapsed", "1");
    renderWithProviders(<SidebarNav />, { initialEntries: ["/dashboard"] });

    const dashLink = screen.getByRole("link", { name: "Dashboard" });
    expect(dashLink.className).not.toContain("bg-[var(--nav-active-bg-soft)]");
    expect(dashLink.querySelector('[aria-hidden="true"]')).not.toBeNull();

    localStorage.removeItem("olia_sidebar_collapsed");
  });

  it("collapses to icon-only on toggle and hides nav labels", () => {
    renderWithProviders(<SidebarNav />, { initialEntries: ["/dashboard"] });
    expect(screen.getByRole("link", { name: "Dashboard" }).textContent).toBe("Dashboard");

    fireEvent.click(screen.getByRole("button", { name: /collapse sidebar/i }));

    // The label span is gone — only the icon (and the title attribute, which
    // becomes the link's accessible name) remains.
    expect(screen.getByRole("link", { name: "Dashboard" }).textContent).toBe("");
    expect(screen.getByRole("button", { name: /expand sidebar/i })).toBeInTheDocument();
  });

  it("persists the collapsed state across mounts", () => {
    localStorage.setItem("olia_sidebar_collapsed", "1");
    renderWithProviders(<SidebarNav />, { initialEntries: ["/dashboard"] });

    expect(screen.getByRole("button", { name: /expand sidebar/i })).toBeInTheDocument();
    localStorage.removeItem("olia_sidebar_collapsed");
  });

  it("has no concept picker — each tab filters by concept itself", () => {
    renderWithProviders(<SidebarNav />, { initialEntries: ["/dashboard"] });
    expect(screen.queryByText("Concept")).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });
});
