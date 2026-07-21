import { screen, fireEvent } from "@testing-library/react";
import { beforeEach, afterEach } from "vitest";
import { CookieBanner } from "@/components/CookieBanner";
import { renderWithProviders } from "../test-utils";

vi.mock("@/lib/sentry", () => ({
  getCookieConsent: vi.fn(),
  setCookieConsent: vi.fn(),
  initSentryIfConsented: vi.fn(),
}));

import { getCookieConsent, setCookieConsent, initSentryIfConsented } from "@/lib/sentry";

describe("CookieBanner", () => {
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.mocked(getCookieConsent).mockReturnValue(null);
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
    vi.clearAllMocks();
  });

  it("renders when no consent is stored", () => {
    renderWithProviders(<CookieBanner />);
    expect(screen.getByRole("dialog", { name: /cookie consent/i })).toBeInTheDocument();
  });

  it("does not render when consent is already given", () => {
    vi.mocked(getCookieConsent).mockReturnValue("accepted");
    renderWithProviders(<CookieBanner />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("does not render when consent was declined", () => {
    vi.mocked(getCookieConsent).mockReturnValue("declined");
    renderWithProviders(<CookieBanner />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows Accept all and Essential only buttons", () => {
    renderWithProviders(<CookieBanner />);
    expect(screen.getByRole("button", { name: /accept all/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /essential only/i })).toBeInTheDocument();
  });

  it("accepting sets consent to accepted and inits Sentry", () => {
    renderWithProviders(<CookieBanner />);
    fireEvent.click(screen.getByRole("button", { name: /accept all/i }));
    expect(setCookieConsent).toHaveBeenCalledWith("accepted");
    expect(initSentryIfConsented).toHaveBeenCalled();
  });

  it("accepting hides the banner", () => {
    renderWithProviders(<CookieBanner />);
    fireEvent.click(screen.getByRole("button", { name: /accept all/i }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("declining sets consent to declined", () => {
    renderWithProviders(<CookieBanner />);
    fireEvent.click(screen.getByRole("button", { name: /essential only/i }));
    expect(setCookieConsent).toHaveBeenCalledWith("declined");
  });

  it("declining hides the banner", () => {
    renderWithProviders(<CookieBanner />);
    fireEvent.click(screen.getByRole("button", { name: /essential only/i }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("declining does not init Sentry", () => {
    renderWithProviders(<CookieBanner />);
    fireEvent.click(screen.getByRole("button", { name: /essential only/i }));
    expect(initSentryIfConsented).not.toHaveBeenCalled();
  });

  it("shows a link to the Cookie Policy", () => {
    renderWithProviders(<CookieBanner />);
    expect(screen.getByRole("link", { name: /cookie policy/i })).toBeInTheDocument();
  });
});
