import { screen } from "@testing-library/react";
import { Layout } from "@/components/Layout";
import { renderWithProviders } from "../test-utils";

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn().mockReturnValue({
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    }),
  },
}));

describe("Layout", () => {
  it("renders children content", () => {
    renderWithProviders(
      <Layout>
        <p>Hello children</p>
      </Layout>
    );
    expect(screen.getByText("Hello children")).toBeInTheDocument();
  });

  it("shows header with title when title prop is provided", () => {
    renderWithProviders(<Layout title="My Title"><span /></Layout>);
    expect(screen.getByText("My Title")).toBeInTheDocument();
  });

  it("shows subtitle when subtitle prop is provided", () => {
    renderWithProviders(
      <Layout title="My Title" subtitle="My Subtitle"><span /></Layout>
    );
    expect(screen.getByText("My Subtitle")).toBeInTheDocument();
  });

  it("does NOT render a header element when title is omitted", () => {
    renderWithProviders(<Layout><p>no title</p></Layout>);
    // header element should not be present
    expect(document.querySelector("header")).toBeNull();
  });

  it("renders headerLeft content when provided", () => {
    renderWithProviders(
      <Layout title="T" headerLeft={<button>Left Btn</button>}><span /></Layout>
    );
    expect(screen.getByText("Left Btn")).toBeInTheDocument();
  });

  it("renders headerRight content when provided", () => {
    renderWithProviders(
      <Layout title="T" headerRight={<button>Right Btn</button>}><span /></Layout>
    );
    expect(screen.getByText("Right Btn")).toBeInTheDocument();
  });

  it("renders the BottomNav", () => {
    renderWithProviders(<Layout title="T"><span /></Layout>);
    // BottomNav renders 4 nav links
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.getByText("Checklists")).toBeInTheDocument();
  });
});
