import { screen } from "@testing-library/react";
import Index from "@/pages/Index";
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

describe("Index page", () => {
  it("renders without crashing", () => {
    renderWithProviders(<Index />);
    expect(document.body).toBeDefined();
  });

  it("shows 'Welcome to Your Blank App' heading", () => {
    renderWithProviders(<Index />);
    expect(screen.getByText("Welcome to Your Blank App")).toBeInTheDocument();
  });

  it("shows the subtitle text", () => {
    renderWithProviders(<Index />);
    expect(screen.getByText("Start building your amazing project here!")).toBeInTheDocument();
  });

  it("heading is an h1 element", () => {
    renderWithProviders(<Index />);
    const heading = screen.getByText("Welcome to Your Blank App");
    expect(heading.tagName).toBe("H1");
  });

  it("renders a centered layout", () => {
    renderWithProviders(<Index />);
    const container = document.querySelector(".min-h-screen");
    expect(container).not.toBeNull();
  });

  it("has a text-center div", () => {
    renderWithProviders(<Index />);
    const textCenter = document.querySelector(".text-center");
    expect(textCenter).not.toBeNull();
  });
});
