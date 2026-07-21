import { screen } from "@testing-library/react";
import { beforeEach, afterEach } from "vitest";
import Privacy from "@/pages/Privacy";
import { renderWithProviders } from "../test-utils";

describe("Privacy page", () => {
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
  });

  it("renders without crashing", () => {
    renderWithProviders(<Privacy />);
    expect(document.body).toBeDefined();
  });

  it("shows the Privacy Policy heading", () => {
    renderWithProviders(<Privacy />);
    expect(screen.getByRole("heading", { name: /privacy policy/i })).toBeInTheDocument();
  });

  it("shows a link back to home", () => {
    renderWithProviders(<Privacy />);
    expect(screen.getByRole("link", { name: /back to olia/i })).toBeInTheDocument();
  });

  it("shows a contact email link", () => {
    renderWithProviders(<Privacy />);
    const links = screen.getAllByRole("link");
    const emailLink = links.find(l => l.getAttribute("href")?.includes("hello@oliahq.com"));
    expect(emailLink).toBeDefined();
  });

  it("shows a link to Terms of Service", () => {
    renderWithProviders(<Privacy />);
    expect(screen.getByRole("link", { name: /terms of service/i })).toBeInTheDocument();
  });

  it("covers key GDPR sections", () => {
    renderWithProviders(<Privacy />);
    expect(screen.getByRole("heading", { name: /your rights/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /cookies/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /data retention/i })).toBeInTheDocument();
  });
});
