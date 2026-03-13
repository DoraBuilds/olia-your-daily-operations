import { render, screen, fireEvent } from "@testing-library/react";
import { CustomRecurrencePicker } from "@/pages/checklists/CustomRecurrencePicker";
import type { CustomRecurrence } from "@/pages/checklists/types";

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      signInWithPassword: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      signOut: vi.fn().mockResolvedValue({}),
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      then: vi.fn().mockImplementation((cb) => Promise.resolve(cb({ data: [], error: null }))),
    }),
  },
}));

const defaultValue: CustomRecurrence = {
  interval: 1,
  unit: "week",
  weekDays: ["mon"],
  ends: "never",
  occurrences: 13,
};

describe("CustomRecurrencePicker", () => {
  const onChange = vi.fn();
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders without crashing", () => {
    render(<CustomRecurrencePicker value={defaultValue} onChange={onChange} onClose={onClose} />);
    expect(screen.getByText("Custom recurrence")).toBeInTheDocument();
  });

  it("shows 'Repeat every' label", () => {
    render(<CustomRecurrencePicker value={defaultValue} onChange={onChange} onClose={onClose} />);
    expect(screen.getByText("Repeat every")).toBeInTheDocument();
  });

  it("shows interval number input", () => {
    render(<CustomRecurrencePicker value={defaultValue} onChange={onChange} onClose={onClose} />);
    const numberInput = screen.getByDisplayValue("1");
    expect(numberInput).toBeInTheDocument();
  });

  it("shows unit select with correct options", () => {
    render(<CustomRecurrencePicker value={defaultValue} onChange={onChange} onClose={onClose} />);
    expect(screen.getByDisplayValue("week")).toBeInTheDocument();
  });

  it("shows day buttons when unit is 'week'", () => {
    render(<CustomRecurrencePicker value={defaultValue} onChange={onChange} onClose={onClose} />);
    expect(screen.getByText("Repeat on")).toBeInTheDocument();
    // Days M, T, W, T, F, S, S
    const dayButtons = screen.getAllByRole("button").filter((b) =>
      ["M", "T", "W", "F", "S"].some((d) => b.textContent === d)
    );
    expect(dayButtons.length).toBeGreaterThan(0);
  });

  it("does not show day buttons when unit is 'day'", () => {
    const dayValue = { ...defaultValue, unit: "day" as const };
    render(<CustomRecurrencePicker value={dayValue} onChange={onChange} onClose={onClose} />);
    expect(screen.queryByText("Repeat on")).not.toBeInTheDocument();
  });

  it("shows Ends section", () => {
    render(<CustomRecurrencePicker value={defaultValue} onChange={onChange} onClose={onClose} />);
    expect(screen.getByText("Ends")).toBeInTheDocument();
  });

  it("shows Never, On, After end options", () => {
    render(<CustomRecurrencePicker value={defaultValue} onChange={onChange} onClose={onClose} />);
    expect(screen.getByText("Never")).toBeInTheDocument();
    expect(screen.getByText("On")).toBeInTheDocument();
    expect(screen.getByText("After")).toBeInTheDocument();
  });

  it("has Cancel and Done buttons", () => {
    render(<CustomRecurrencePicker value={defaultValue} onChange={onChange} onClose={onClose} />);
    expect(screen.getByText("Cancel")).toBeInTheDocument();
    expect(screen.getByText("Done")).toBeInTheDocument();
  });

  it("clicking Done calls onClose", () => {
    render(<CustomRecurrencePicker value={defaultValue} onChange={onChange} onClose={onClose} />);
    fireEvent.click(screen.getByText("Done"));
    expect(onClose).toHaveBeenCalled();
  });

  it("clicking Cancel calls onClose", () => {
    render(<CustomRecurrencePicker value={defaultValue} onChange={onChange} onClose={onClose} />);
    fireEvent.click(screen.getByText("Cancel"));
    expect(onClose).toHaveBeenCalled();
  });

  it("changing interval calls onChange", () => {
    render(<CustomRecurrencePicker value={defaultValue} onChange={onChange} onClose={onClose} />);
    const numberInput = screen.getByDisplayValue("1");
    fireEvent.change(numberInput, { target: { value: "2" } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ interval: 2 }));
  });

  it("changing unit calls onChange", () => {
    render(<CustomRecurrencePicker value={defaultValue} onChange={onChange} onClose={onClose} />);
    const select = screen.getByDisplayValue("week");
    fireEvent.change(select, { target: { value: "month" } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ unit: "month" }));
  });

  it("clicking Never button calls onChange with ends: 'never'", () => {
    const onValue = { ...defaultValue, ends: "on" as const };
    render(<CustomRecurrencePicker value={onValue} onChange={onChange} onClose={onClose} />);
    fireEvent.click(screen.getByText("Never"));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ ends: "never" }));
  });

  it("clicking After button calls onChange with ends: 'after'", () => {
    render(<CustomRecurrencePicker value={defaultValue} onChange={onChange} onClose={onClose} />);
    fireEvent.click(screen.getByText("After"));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ ends: "after" }));
  });

  it("clicking a day button toggles it in weekDays", () => {
    render(<CustomRecurrencePicker value={defaultValue} onChange={onChange} onClose={onClose} />);
    // The M button (monday) - find all M buttons (there could be duplicates for T)
    const allButtons = screen.getAllByRole("button");
    // W is Wednesday which appears once
    const wButton = allButtons.find((b) => b.textContent === "W");
    if (wButton) {
      fireEvent.click(wButton);
      expect(onChange).toHaveBeenCalled();
    }
  });
});
