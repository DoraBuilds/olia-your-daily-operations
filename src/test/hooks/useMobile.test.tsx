import { renderHook, act } from "@testing-library/react";
import { useIsMobile } from "@/hooks/use-mobile";

describe("useIsMobile", () => {
  it("returns a boolean", () => {
    const { result } = renderHook(() => useIsMobile());
    expect(typeof result.current).toBe("boolean");
  });

  it("returns false by default in jsdom (window.innerWidth is 1024)", () => {
    // jsdom default innerWidth is 1024 which is >= 768
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });

  it("returns true when window.innerWidth is below 768", () => {
    Object.defineProperty(window, "innerWidth", {
      writable: true,
      configurable: true,
      value: 375,
    });
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
    // restore
    Object.defineProperty(window, "innerWidth", {
      writable: true,
      configurable: true,
      value: 1024,
    });
  });

  it("subscribes to matchMedia change events", () => {
    const addEventListener = vi.fn();
    const removeEventListener = vi.fn();
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = vi.fn().mockReturnValue({
      matches: false,
      media: "",
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener,
      removeEventListener,
      dispatchEvent: vi.fn(),
    });
    const { unmount } = renderHook(() => useIsMobile());
    expect(addEventListener).toHaveBeenCalledWith("change", expect.any(Function));
    unmount();
    expect(removeEventListener).toHaveBeenCalledWith("change", expect.any(Function));
    window.matchMedia = originalMatchMedia;
  });

  it("does not throw when rendered", () => {
    expect(() => renderHook(() => useIsMobile())).not.toThrow();
  });
});
