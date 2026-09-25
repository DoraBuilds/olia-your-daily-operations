import { screen, fireEvent, waitFor } from "@testing-library/react";
import { MobileMenu, MobileRouteTitle } from "@/components/MobileNav";
import { renderWithProviders } from "../test-utils";

const { mockNavigate, mockUseAuth, mockSignOut } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockUseAuth: vi.fn(),
  mockSignOut: vi.fn(),
}));

vi.mock("@/contexts/AuthContext", () => ({ useAuth: mockUseAuth }));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

const owner = { name: "Dora Angelov", email: "dora@olia.app", is_owner: true };
const staff = { name: "Maria Lopez", email: "maria@x.com", is_owner: false };

function renderNav(path: string, props: Partial<React.ComponentProps<typeof MobileMenu>> = {}) {
  const onBackToKiosk = vi.fn();
  renderWithProviders(
    <MobileMenu isKioskAdminSession={false} onBackToKiosk={onBackToKiosk} {...props} />,
    { initialEntries: [path] },
  );
  return { onBackToKiosk };
}

const renderTitle = (path: string) => renderWithProviders(<MobileRouteTitle />, { initialEntries: [path] });

const openMenu = () => fireEvent.click(screen.getByRole("button", { name: "Open menu" }));

describe("MobileNav", () => {
  beforeEach(() => {
    mockUseAuth.mockReturnValue({ teamMember: owner, signOut: mockSignOut });
    mockNavigate.mockClear();
    mockSignOut.mockReset().mockResolvedValue(undefined);
  });

  describe("MobileRouteTitle", () => {
    it("names the current main page", () => {
      renderTitle("/checklists");
      expect(screen.getByText("Checklists")).toBeInTheDocument();
    });

    it("shows 'Admin' over the current admin section", () => {
      renderTitle("/admin/users");
      expect(screen.getByText("Admin")).toBeInTheDocument();
      expect(screen.getByText("Users")).toBeInTheDocument();
    });

    it("treats bare /admin as the Concepts section", () => {
      renderTitle("/admin");
      expect(screen.getByText("Concepts")).toBeInTheDocument();
    });

    it("falls back to 'Olia' on a route outside the main nav", () => {
      renderTitle("/notifications");
      expect(screen.getByText("Olia")).toBeInTheDocument();
    });
  });

  describe("drawer", () => {
    it("is closed until the burger is tapped", () => {
      renderNav("/dashboard");
      expect(screen.queryByRole("dialog")).toBeNull();
      openMenu();
      expect(screen.getByRole("dialog", { name: "Menu" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Open menu" })).toHaveAttribute("aria-expanded", "true");
    });

    it("lists every main page, with Admin's sections collapsed outside Admin", () => {
      renderNav("/dashboard");
      openMenu();
      for (const label of ["Checklists", "Reporting", "Infohub"]) {
        expect(screen.getByRole("link", { name: label })).toBeInTheDocument();
      }
      expect(screen.getByRole("button", { name: "Admin" })).toHaveAttribute("aria-expanded", "false");
      expect(screen.queryByRole("link", { name: "Billing" })).toBeNull();
    });

    it("expands Admin into its six sections on tap, and collapses it again", () => {
      renderNav("/dashboard");
      openMenu();
      fireEvent.click(screen.getByRole("button", { name: "Admin" }));
      for (const label of ["Concepts", "Departments", "Users", "Devices", "Account", "Billing"]) {
        expect(screen.getByRole("link", { name: label })).toBeInTheDocument();
      }
      expect(screen.getByRole("link", { name: "Devices" })).toHaveAttribute("href", "/admin/kiosks");
      fireEvent.click(screen.getByRole("button", { name: "Admin" }));
      expect(screen.queryByRole("link", { name: "Billing" })).toBeNull();
    });

    it("opens with Admin already expanded and the current section highlighted when on an admin page", () => {
      renderNav("/admin/billing");
      openMenu();
      expect(screen.getByRole("link", { name: "Billing" })).toHaveClass("font-semibold");
      expect(screen.getByRole("link", { name: "Users" })).not.toHaveClass("font-semibold");
    });

    it("re-expands Admin on reopen from an admin page even if it was collapsed", () => {
      renderNav("/admin/users");
      openMenu();
      fireEvent.click(screen.getByRole("button", { name: "Admin" }));
      fireEvent.click(screen.getByRole("button", { name: "Close menu" }));
      openMenu();
      expect(screen.getByRole("link", { name: "Users" })).toBeInTheDocument();
    });

    it("gives a non-owner a plain Admin link — they only have Concepts", () => {
      mockUseAuth.mockReturnValue({ teamMember: staff, signOut: mockSignOut });
      renderNav("/dashboard");
      openMenu();
      expect(screen.getByRole("link", { name: "Admin" })).toHaveAttribute("href", "/admin");
      expect(screen.queryByRole("button", { name: "Admin" })).toBeNull();
    });

    it("highlights the current main page", () => {
      renderNav("/reporting");
      openMenu();
      expect(screen.getByRole("link", { name: "Reporting" })).toHaveClass("bg-muted");
      expect(screen.getByRole("link", { name: "Checklists" })).not.toHaveClass("bg-muted");
    });

    it("closes via the X, the backdrop, Escape, and picking an item", () => {
      renderNav("/dashboard");
      openMenu();
      fireEvent.click(screen.getByRole("button", { name: "Close menu" }));
      expect(screen.queryByRole("dialog")).toBeNull();

      openMenu();
      fireEvent.click(screen.getByTestId("mobile-nav-backdrop"));
      expect(screen.queryByRole("dialog")).toBeNull();

      openMenu();
      fireEvent.keyDown(window, { key: "Enter" });
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      fireEvent.keyDown(window, { key: "Escape" });
      expect(screen.queryByRole("dialog")).toBeNull();

      openMenu();
      fireEvent.click(screen.getByRole("link", { name: "Checklists" }));
      expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("closes after picking an admin section", () => {
      renderNav("/admin/users");
      openMenu();
      fireEvent.click(screen.getByRole("link", { name: "Billing" }));
      expect(screen.queryByRole("dialog")).toBeNull();
    });
  });

  describe("footer", () => {
    it("shows who is signed in and logs out to the landing page", async () => {
      renderNav("/dashboard");
      openMenu();
      expect(screen.getByText("Dora Angelov")).toBeInTheDocument();
      expect(screen.getByText("dora@olia.app")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Log out" }));
      await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/"));
      expect(mockSignOut).toHaveBeenCalled();
    });

    it("swaps Log out for Back to Kiosk in a kiosk-PIN admin session — the real sign-out would break the kiosk", () => {
      const { onBackToKiosk } = renderNav("/admin/location", { isKioskAdminSession: true });
      openMenu();
      expect(screen.queryByRole("button", { name: "Log out" })).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: /kiosk/i }));
      expect(onBackToKiosk).toHaveBeenCalled();
    });

    it("still offers Back to Kiosk when no team member is loaded", () => {
      mockUseAuth.mockReturnValue({ teamMember: null, signOut: mockSignOut });
      renderNav("/dashboard", { isKioskAdminSession: true });
      openMenu();
      expect(screen.getByRole("button", { name: /kiosk/i })).toBeInTheDocument();
    });

    it("has no footer without a team member or kiosk session", () => {
      mockUseAuth.mockReturnValue({ teamMember: null, signOut: mockSignOut });
      renderNav("/dashboard");
      openMenu();
      expect(screen.queryByRole("button", { name: "Log out" })).toBeNull();
    });
  });
});
