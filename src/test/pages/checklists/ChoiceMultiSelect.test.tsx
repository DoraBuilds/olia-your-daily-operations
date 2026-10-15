import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ChoiceMultiSelect } from "@/pages/checklists/ChoiceMultiSelect";

const choices = ["Good", "Fair", "Poor"];

describe("ChoiceMultiSelect", () => {
  it("shows chosen options as chips and lists all options in a popover with Done", () => {
    const onToggle = vi.fn();
    render(<ChoiceMultiSelect choices={choices} choiceColors={["bg-green-100", "bg-yellow-100", "bg-red-100"]} selected={["Good"]} onToggle={onToggle} translate={false} />);
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Good/ }));
    expect(screen.getAllByRole("option")).toHaveLength(3);
    expect(screen.getByRole("option", { name: "Good" })).toHaveAttribute("aria-selected", "true");
    fireEvent.click(screen.getByRole("option", { name: "Fair" }));
    expect(onToggle).toHaveBeenCalledWith("Fair");
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
  });

  it("prompts to select when nothing is chosen", () => {
    render(<ChoiceMultiSelect choices={choices} selected={[]} onToggle={vi.fn()} translate={false} />);
    expect(screen.getByText("Select options")).toBeInTheDocument();
  });
});
