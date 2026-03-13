import { describe, it, expect } from "vitest";
import { cn } from "@/lib/utils";

describe("cn (className merger)", () => {
  it("returns a single class unchanged", () => {
    expect(cn("foo")).toBe("foo");
  });

  it("merges multiple classes", () => {
    expect(cn("foo", "bar")).toBe("foo bar");
  });

  it("deduplicates conflicting Tailwind classes (last wins)", () => {
    expect(cn("text-red-500", "text-blue-500")).toBe("text-blue-500");
  });

  it("ignores falsy values", () => {
    expect(cn("foo", false, undefined, null, "bar")).toBe("foo bar");
  });

  it("supports conditional objects", () => {
    expect(cn({ "font-bold": true, "italic": false })).toBe("font-bold");
  });

  it("supports arrays", () => {
    expect(cn(["foo", "bar"])).toBe("foo bar");
  });

  it("returns empty string when no valid classes", () => {
    expect(cn(false, undefined, null)).toBe("");
  });

  it("handles nested conditional arrays", () => {
    const isActive = true;
    expect(cn("base", isActive && "active")).toBe("base active");
  });
});
