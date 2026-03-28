import { screen } from "@testing-library/react";
import NotFound from "@/pages/NotFound";
import { renderWithProviders } from "../test-utils";

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      signInWithPassword: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      signOut: vi.fn().mockResolvedValue({}),
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      insert: vi.fn().mockResolvedValue({ error: null }),
      update: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockResolvedValue({ error: null }),
      delete: vi.fn().mockReturnThis(),
      then: vi.fn().mockImplementation(cb => Promise.resolve(cb({ data: [], error: null }))),
    }),
  },
}));

describe("NotFound page", () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it("renders without crashing", () => {
    renderWithProviders(<NotFound />);
    expect(document.body).toBeDefined();
  });

  it("shows '404' heading", () => {
    renderWithProviders(<NotFound />);
    expect(screen.getByText("404")).toBeInTheDocument();
  });

  it("shows 'Oops! Page not found' message", () => {
    renderWithProviders(<NotFound />);
    expect(screen.getByText("Oops! Page not found")).toBeInTheDocument();
  });

  it("shows a 'Return to Home' link", () => {
    renderWithProviders(<NotFound />);
    const link = screen.getByRole("link", { name: /return to home/i });
    expect(link).toBeInTheDocument();
  });

  it("'Return to Home' link points to '/'", () => {
    renderWithProviders(<NotFound />);
    const link = screen.getByRole("link", { name: /return to home/i });
    expect(link).toHaveAttribute("href", "/");
  });

  it("404 heading has large text styling", () => {
    renderWithProviders(<NotFound />);
    const heading = screen.getByText("404");
    expect(heading.tagName).toBe("H1");
  });

  it("logs a 404 error to console on render", () => {
    renderWithProviders(<NotFound />);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("404 Error"),
      expect.any(String)
    );
  });

  it("renders centered layout with min-h-screen", () => {
    renderWithProviders(<NotFound />);
    const container = document.querySelector(".min-h-screen");
    expect(container).not.toBeNull();
  });

  it("the page text is centered", () => {
    renderWithProviders(<NotFound />);
    const textCenter = document.querySelector(".text-center");
    expect(textCenter).not.toBeNull();
  });
});
