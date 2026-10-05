import { useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { TemperatureKeypadInput, QuestionInput } from "@/pages/kiosk/QuestionInputs";

vi.mock("@/lib/supabase", () => ({ supabase: {} }));

function Harness({ initial = "" as number | "", onChange = vi.fn(), ...props }: any) {
  const [value, setValue] = useState<number | "">(initial);
  return (
    <TemperatureKeypadInput
      value={value}
      onChange={v => { onChange(v); setValue(v); }}
      {...props}
    />
  );
}

const press = (...names: string[]) =>
  names.forEach(name => fireEvent.click(screen.getByRole("button", { name })));
const reading = () => screen.getByTestId("temperature-reading").textContent?.replace("\u200B", "");

describe("TemperatureKeypadInput", () => {
  it("shows every digit, the sign toggle, the decimal point and delete", () => {
    render(<Harness />);
    for (const d of ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"]) {
      expect(screen.getByRole("button", { name: d })).toBeInTheDocument();
    }
    expect(screen.getByRole("button", { name: "Negative" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Decimal point" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete last digit" })).toBeDisabled();
    expect(reading()).toBe("°C");
  });

  it("builds a reading from key presses", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    press("3", "Decimal point", "5");
    expect(reading()).toBe("3.5°C");
    expect(onChange).toHaveBeenLastCalledWith(3.5);
  });

  it("flips the sign after digits were typed, without backspacing", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    press("1", "8");
    expect(onChange).toHaveBeenLastCalledWith(18);
    press("Negative");
    expect(reading()).toBe("−18°C");
    expect(onChange).toHaveBeenLastCalledWith(-18);
    expect(screen.getByRole("button", { name: "Negative" })).toHaveAttribute("aria-pressed", "true");
    press("Negative");
    expect(reading()).toBe("18°C");
    expect(onChange).toHaveBeenLastCalledWith(18);
  });

  it("keeps the sign when it is tapped first or mid-entry", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    press("Negative");
    expect(reading()).toBe("−°C");
    expect(onChange).not.toHaveBeenCalled();
    press("1", "Negative", "Negative", "8", "Decimal point", "5");
    expect(reading()).toBe("−18.5°C");
    expect(onChange).toHaveBeenLastCalledWith(-18.5);
  });

  it("limits input to one decimal place and one decimal point", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    press("3", "Decimal point", "4", "7", "Decimal point", "2");
    expect(reading()).toBe("3.4°C");
    expect(onChange).toHaveBeenLastCalledWith(3.4);
  });

  it("starts a bare decimal point with a leading zero and never stores -0", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    press("Negative", "Decimal point");
    expect(reading()).toBe("−0.°C");
    expect(Object.is(onChange.mock.lastCall?.[0], 0)).toBe(true);
    press("5");
    expect(onChange).toHaveBeenLastCalledWith(-0.5);
  });

  it("replaces a leading zero and caps the whole part at three digits", () => {
    render(<Harness />);
    press("0", "7");
    expect(reading()).toBe("7°C");
    press("1", "2", "9");
    expect(reading()).toBe("712°C");
  });

  it("delete removes one character at a time and clears the answer", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} initial={-18.5} />);
    expect(reading()).toBe("−18.5°C");
    press("Delete last digit");
    expect(reading()).toBe("−18.°C");
    press("Delete last digit", "Delete last digit", "Delete last digit");
    expect(onChange).toHaveBeenLastCalledWith("");
    expect(reading()).toBe("−°C");
  });

  it("flags readings outside the acceptable range, including after a sign flip", () => {
    render(<Harness acceptableMin={-22} acceptableMax={-16} />);
    expect(screen.getByText(/Acceptable: -22 – -16°C/)).toBeInTheDocument();
    press("1", "8");
    expect(screen.getByText(/out of acceptable range/i)).toBeInTheDocument();
    press("Negative");
    expect(screen.queryByText(/out of acceptable range/i)).not.toBeInTheDocument();
  });

  it("follows the answer when it changes from outside", () => {
    const { rerender } = render(<TemperatureKeypadInput value={4.26} onChange={vi.fn()} unit="F" />);
    expect(reading()).toBe("4.3°F");
    rerender(<TemperatureKeypadInput value="" onChange={vi.fn()} unit="F" />);
    expect(reading()).toBe("°F");
  });

  it("is what the kiosk renders for temperature questions, with no slider", () => {
    render(
      <QuestionInput
        question={{ id: "q", text: "Freezer", type: "number", required: true, temperatureUnit: "C" } as any}
        value={undefined}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Negative" })).toBeInTheDocument();
    expect(screen.queryByRole("slider")).not.toBeInTheDocument();
  });
});
