import { screen } from "@testing-library/react";
import { beforeEach, afterEach } from "vitest";
import AvisoLegal from "@/pages/AvisoLegal";
import { renderWithProviders } from "../test-utils";

describe("AvisoLegal page", () => {
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
  });

  it("renders without crashing", () => {
    renderWithProviders(<AvisoLegal />);
    expect(document.body).toBeDefined();
  });

  it("shows the Aviso Legal heading", () => {
    renderWithProviders(<AvisoLegal />);
    expect(screen.getByRole("heading", { name: /aviso legal/i })).toBeInTheDocument();
  });

  it("shows a link back to home", () => {
    renderWithProviders(<AvisoLegal />);
    expect(screen.getByRole("link", { name: /back to olia/i })).toBeInTheDocument();
  });

  it("shows LSSI reference", () => {
    renderWithProviders(<AvisoLegal />);
    const matches = screen.getAllByText(/LSSI/i);
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it("shows LOPDGDD reference", () => {
    renderWithProviders(<AvisoLegal />);
    expect(screen.getByText(/LOPDGDD/i)).toBeInTheDocument();
  });

  it("shows AEPD reference with link", () => {
    renderWithProviders(<AvisoLegal />);
    const links = screen.getAllByRole("link");
    const aepdLink = links.find(l => l.getAttribute("href")?.includes("aepd.es"));
    expect(aepdLink).toBeDefined();
  });

  it("mentions Barcelona jurisdiction", () => {
    renderWithProviders(<AvisoLegal />);
    expect(screen.getByText(/barcelona/i)).toBeInTheDocument();
  });

  it("links to Cookie Policy", () => {
    renderWithProviders(<AvisoLegal />);
    const links = screen.getAllByRole("link");
    const cookieLink = links.find(l => l.getAttribute("href") === "/cookies");
    expect(cookieLink).toBeDefined();
  });
});
