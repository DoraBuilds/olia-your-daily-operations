import { render, screen, fireEvent } from "@testing-library/react";
import { RouteErrorBoundary } from "@/components/RouteErrorBoundary";

const mockUseRouteError = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useRouteError: () => mockUseRouteError(),
  };
});

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  sessionStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("RouteErrorBoundary", () => {
  it("reloads once on a chunk-load error instead of rendering the fallback", () => {
    mockUseRouteError.mockReturnValue(new Error("Failed to fetch dynamically imported module: /assets/Notifications-abc123.js"));
    const reloadSpy = vi.fn();
    Object.defineProperty(window, "location", { value: { reload: reloadSpy }, writable: true });

    render(<RouteErrorBoundary />);

    expect(reloadSpy).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem("chunk_reload_attempted")).toBe("1");
    expect(screen.queryByText("Something went wrong")).not.toBeInTheDocument();
  });

  it("does not reload again if a chunk error already triggered one this session", () => {
    sessionStorage.setItem("chunk_reload_attempted", "1");
    mockUseRouteError.mockReturnValue(new Error("Failed to fetch dynamically imported module: /assets/Notifications-abc123.js"));
    const reloadSpy = vi.fn();
    Object.defineProperty(window, "location", { value: { reload: reloadSpy }, writable: true });

    render(<RouteErrorBoundary />);

    expect(reloadSpy).not.toHaveBeenCalled();
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
  });

  it("renders the fallback card for a non-chunk error", () => {
    mockUseRouteError.mockReturnValue(new Error("Some other render error"));

    render(<RouteErrorBoundary />);

    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
  });

  it("retry button reloads and clears the reload flag", () => {
    sessionStorage.setItem("chunk_reload_attempted", "1");
    mockUseRouteError.mockReturnValue(new Error("Some other render error"));
    const reloadSpy = vi.fn();
    Object.defineProperty(window, "location", { value: { reload: reloadSpy }, writable: true });

    render(<RouteErrorBoundary />);
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));

    expect(reloadSpy).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem("chunk_reload_attempted")).toBeNull();
  });
});
