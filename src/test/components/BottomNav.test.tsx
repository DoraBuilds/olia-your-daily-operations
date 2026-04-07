import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { BottomNav } from "@/components/BottomNav";
import { routerFutureFlags } from "@/lib/router-future-flags";

// Mock useLocation to return /dashboard as the current path
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useLocation: vi.fn().mockReturnValue({ pathname: "/dashboard" }),
  };
});

function renderBottomNav() {
  return render(
    <MemoryRouter initialEntries={["/dashboard"]} future={routerFutureFlags}>
      <BottomNav />
    </MemoryRouter>
  );
}

describe("BottomNav", () => {
  it("renders all 5 nav labels", () => {
    renderBottomNav();
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.getByText("Checklists")).toBeInTheDocument();
    expect(screen.getByText("Reporting")).toBeInTheDocument();
    expect(screen.getByText("Infohub")).toBeInTheDocument();
    expect(screen.getByText("Admin")).toBeInTheDocument();
  });

  it("renders 5 NavLink elements", () => {
    renderBottomNav();
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(5);
  });

  it("active nav item (Dashboard) icon span has bg-sage class", () => {
    renderBottomNav();
    const dashLink = document.getElementById("nav-dashboard");
    expect(dashLink).not.toBeNull();
    // The icon wrapper span should have bg-sage class when active
    const iconSpan = dashLink?.querySelector("span");
    expect(iconSpan?.className).toContain("bg-sage");
  });

  it("inactive nav items do not have bg-sage on icon span", () => {
    renderBottomNav();
    const checklistsLink = document.getElementById("nav-checklists");
    const iconSpan = checklistsLink?.querySelector("span");
    // Should not contain bg-sage since it's not active
    expect(iconSpan?.className).not.toContain("bg-sage");
  });

  it("links point to correct hrefs", () => {
    renderBottomNav();
    const links = screen.getAllByRole("link");
    const hrefs = links.map((l) => l.getAttribute("href"));
    expect(hrefs).toContain("/dashboard");
    expect(hrefs).toContain("/checklists");
    expect(hrefs).toContain("/reporting");
    expect(hrefs).toContain("/infohub");
    expect(hrefs).toContain("/admin");
  });
});
