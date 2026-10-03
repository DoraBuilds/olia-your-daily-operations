import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { MultipleChoiceInput } from "@/pages/kiosk/QuestionInputs";

vi.mock("@/lib/supabase", () => ({ supabase: {} }));

describe("MultipleChoiceInput unselected styling", () => {
  it("renders every unselected option identically (no 'No' bias)", () => {
    render(<MultipleChoiceInput options={["Yes", "No"]} value="" onChange={vi.fn()} />);
    const [yes, no] = [screen.getByRole("button", { name: "Yes" }), screen.getByRole("button", { name: "No" })];
    expect(no.className).toBe(yes.className);
  });

  it("only applies the hover border on hover-capable devices (sticky touch :hover)", () => {
    render(<MultipleChoiceInput options={["Yes", "No"]} value="" onChange={vi.fn()} />);
    const cls = screen.getByRole("button", { name: "No" }).className;
    expect(cls).not.toMatch(/(^|\s)hover:border-sage/);
    expect(cls).toContain("[@media(hover:hover)]:hover:border-sage/40");
  });
});
