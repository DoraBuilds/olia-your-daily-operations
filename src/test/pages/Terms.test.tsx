import { screen } from "@testing-library/react";
import { beforeEach, afterEach } from "vitest";
import Terms from "@/pages/Terms";
import { renderWithProviders } from "../test-utils";

describe("Terms page", () => {
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
  });

  it("renders without crashing", () => {
    renderWithProviders(<Terms />);
    expect(document.body).toBeDefined();
  });

  it("shows the Terms of Service heading", () => {
    renderWithProviders(<Terms />);
    expect(screen.getByRole("heading", { name: /terms of service/i })).toBeInTheDocument();
  });

  it("shows a link back to home", () => {
    renderWithProviders(<Terms />);
    expect(screen.getByRole("link", { name: /back to olia/i })).toBeInTheDocument();
  });

  it("shows links to the Privacy Policy", () => {
    renderWithProviders(<Terms />);
    const links = screen.getAllByRole("link", { name: /privacy policy/i });
    expect(links.length).toBeGreaterThanOrEqual(1);
  });

  it("shows a contact email link", () => {
    renderWithProviders(<Terms />);
    const links = screen.getAllByRole("link");
    const emailLink = links.find(l => l.getAttribute("href")?.includes("hello@oliahq.com"));
    expect(emailLink).toBeDefined();
  });

  it("covers subscription and payment section", () => {
    renderWithProviders(<Terms />);
    expect(screen.getByText(/subscription and payment/i)).toBeInTheDocument();
  });

  it("covers acceptable use section", () => {
    renderWithProviders(<Terms />);
    expect(screen.getByText(/acceptable use/i)).toBeInTheDocument();
  });
});
