import { isChunkLoadError } from "@/lib/chunk-error";

describe("isChunkLoadError", () => {
  it("matches 'Failed to fetch dynamically imported module' errors", () => {
    expect(isChunkLoadError(new Error("Failed to fetch dynamically imported module: https://oliahq.com/assets/Notifications-kS2lyu6P.js"))).toBe(true);
  });

  it("matches 'Importing a module script failed' errors", () => {
    expect(isChunkLoadError(new Error("Importing a module script failed"))).toBe(true);
  });

  it("matches errors named ChunkLoadError", () => {
    const error = new Error("boom");
    error.name = "ChunkLoadError";
    expect(isChunkLoadError(error)).toBe(true);
  });

  it("returns false for unrelated errors", () => {
    expect(isChunkLoadError(new Error("Network request failed"))).toBe(false);
  });

  it("returns false for non-Error values", () => {
    expect(isChunkLoadError("some string")).toBe(false);
    expect(isChunkLoadError(undefined)).toBe(false);
  });
});
