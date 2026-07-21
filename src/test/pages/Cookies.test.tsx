import { screen } from "@testing-library/react";
import { beforeEach, afterEach } from "vitest";
import Cookies from "@/pages/Cookies";
import { renderWithProviders } from "../test-utils";

describe("Cookies page", () => {
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
  });

  it("renders without crashing", () => {
    renderWithProviders(<Cookies />);
    expect(document.body).toBeDefined();
  });

  it("shows the Cookie Policy heading", () => {
    renderWithProviders(<Cookies />);
    expect(screen.getByRole("heading", { name: /cookie policy/i })).toBeInTheDocument();
  });

  it("shows a link back to home", () => {
    renderWithProviders(<Cookies />);
    expect(screen.getByRole("link", { name: /back to olia/i })).toBeInTheDocument();
  });

  it("lists essential cookies section", () => {
    renderWithProviders(<Cookies />);
    expect(screen.getByRole("heading", { name: /essential cookies/i })).toBeInTheDocument();
  });

  it("lists analytics cookies section", () => {
    renderWithProviders(<Cookies />);
    expect(screen.getByRole("heading", { name: /analytics/i })).toBeInTheDocument();
  });

  it("mentions Sentry", () => {
    renderWithProviders(<Cookies />);
    const matches = screen.getAllByText(/sentry/i);
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it("mentions Supabase", () => {
    renderWithProviders(<Cookies />);
    expect(screen.getByText(/supabase/i)).toBeInTheDocument();
  });

  it("links to AEPD", () => {
    renderWithProviders(<Cookies />);
    const links = screen.getAllByRole("link");
    const aepdLink = links.find(l => l.getAttribute("href")?.includes("aepd.es"));
    expect(aepdLink).toBeDefined();
  });
});
