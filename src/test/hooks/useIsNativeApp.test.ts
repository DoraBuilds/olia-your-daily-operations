import { renderHook } from "@testing-library/react";
import { vi } from "vitest";

const mockGetPlatform = vi.fn();

vi.mock("@capacitor/core", () => ({
  Capacitor: { getPlatform: mockGetPlatform },
}));

// Import after mock is set up
const { useIsNativeApp, isNativeApp } = await import("@/hooks/useIsNativeApp");

describe("useIsNativeApp", () => {
  it("returns false on web", () => {
    mockGetPlatform.mockReturnValue("web");
    const { result } = renderHook(() => useIsNativeApp());
    expect(result.current).toBe(false);
  });

  it("returns true on ios", () => {
    mockGetPlatform.mockReturnValue("ios");
    const { result } = renderHook(() => useIsNativeApp());
    expect(result.current).toBe(true);
  });

  it("returns true on android", () => {
    mockGetPlatform.mockReturnValue("android");
    const { result } = renderHook(() => useIsNativeApp());
    expect(result.current).toBe(true);
  });
});

describe("isNativeApp (utility)", () => {
  it("returns false on web", () => {
    mockGetPlatform.mockReturnValue("web");
    expect(isNativeApp()).toBe(false);
  });

  it("returns true on ios", () => {
    mockGetPlatform.mockReturnValue("ios");
    expect(isNativeApp()).toBe(true);
  });

  it("returns true on android", () => {
    mockGetPlatform.mockReturnValue("android");
    expect(isNativeApp()).toBe(true);
  });
});
