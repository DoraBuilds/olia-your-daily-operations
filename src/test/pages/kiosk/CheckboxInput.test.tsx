import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { CheckboxInput } from "@/pages/kiosk/QuestionInputs";

vi.mock("@/lib/supabase", () => ({ supabase: {} }));

describe("CheckboxInput unselected styling", () => {
  it("only applies the hover border on hover-capable devices (sticky touch :hover)", () => {
    render(<CheckboxInput value={false} onChange={vi.fn()} />);
    const cls = screen.getByRole("button").className;
    expect(cls).not.toMatch(/(^|\s)hover:border-sage/);
    expect(cls).toContain("[@media(hover:hover)]:hover:border-sage/40");
  });
});
