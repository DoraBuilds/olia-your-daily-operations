import { describe, it, expect } from "vitest";
import { staffSizeBand } from "@/lib/staff-size-band";

describe("staffSizeBand", () => {
  it("keeps typical sites in standard", () => {
    expect(staffSizeBand(0)).toBe("standard");
    expect(staffSizeBand(40)).toBe("standard");
    expect(staffSizeBand(50)).toBe("standard");
  });
  it("puts 51-150 in large", () => {
    expect(staffSizeBand(51)).toBe("large");
    expect(staffSizeBand(150)).toBe("large");
  });
  it("sends above 150 to custom", () => {
    expect(staffSizeBand(151)).toBe("custom");
  });
});
