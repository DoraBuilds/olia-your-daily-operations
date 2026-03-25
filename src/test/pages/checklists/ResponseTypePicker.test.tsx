import { render, screen, fireEvent } from "@testing-library/react";
import { ResponseTypePicker } from "@/pages/checklists/ResponseTypePicker";

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

describe("ResponseTypePicker", () => {
  const onSelect = vi.fn();
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders without crashing", () => {
    render(<ResponseTypePicker onSelect={onSelect} onClose={onClose} />);
    expect(screen.getByText("Type of response")).toBeInTheDocument();
  });

  it("shows Responses section header", () => {
    render(<ResponseTypePicker onSelect={onSelect} onClose={onClose} />);
    expect(screen.getByText("Responses")).toBeInTheDocument();
  });

  it("shows Multiple choice section header", () => {
    render(<ResponseTypePicker onSelect={onSelect} onClose={onClose} />);
    expect(screen.getByText("Multiple choice")).toBeInTheDocument();
  });

  it("shows Text answer response type", () => {
    render(<ResponseTypePicker onSelect={onSelect} onClose={onClose} />);
    expect(screen.getByText("Text answer")).toBeInTheDocument();
  });

  it("shows Checkbox response type", () => {
    render(<ResponseTypePicker onSelect={onSelect} onClose={onClose} />);
    expect(screen.getByText("Checkbox")).toBeInTheDocument();
  });

  it("shows Number response type", () => {
    render(<ResponseTypePicker onSelect={onSelect} onClose={onClose} />);
    expect(screen.getByText("Number")).toBeInTheDocument();
  });

  it("does NOT show Date & Time (removed from builder)", () => {
    render(<ResponseTypePicker onSelect={onSelect} onClose={onClose} />);
    expect(screen.queryByText("Date & Time")).not.toBeInTheDocument();
  });

  it("shows Photo / Media response type", () => {
    render(<ResponseTypePicker onSelect={onSelect} onClose={onClose} />);
    expect(screen.getByText("Photo / Media")).toBeInTheDocument();
  });

  it("does NOT show Signature (removed from builder)", () => {
    render(<ResponseTypePicker onSelect={onSelect} onClose={onClose} />);
    expect(screen.queryByText("Signature")).not.toBeInTheDocument();
  });

  it("shows multiple choice set options (Good/Fair/Poor etc)", () => {
    render(<ResponseTypePicker onSelect={onSelect} onClose={onClose} />);
    expect(screen.getByText("Good")).toBeInTheDocument();
  });

  it("has a close button that calls onClose", () => {
    render(<ResponseTypePicker onSelect={onSelect} onClose={onClose} />);
    const buttons = screen.getAllByRole("button");
    fireEvent.click(buttons[0]); // X button
    expect(onClose).toHaveBeenCalled();
  });

  it("clicking Text answer calls onSelect with 'text' and onClose", () => {
    render(<ResponseTypePicker onSelect={onSelect} onClose={onClose} />);
    fireEvent.click(screen.getByText("Text answer"));
    expect(onSelect).toHaveBeenCalledWith("text");
    expect(onClose).toHaveBeenCalled();
  });

  it("clicking Checkbox calls onSelect with 'checkbox'", () => {
    render(<ResponseTypePicker onSelect={onSelect} onClose={onClose} />);
    fireEvent.click(screen.getByText("Checkbox"));
    expect(onSelect).toHaveBeenCalledWith("checkbox");
  });

  it("clicking Number calls onSelect with 'number'", () => {
    render(<ResponseTypePicker onSelect={onSelect} onClose={onClose} />);
    fireEvent.click(screen.getByText("Number"));
    expect(onSelect).toHaveBeenCalledWith("number");
  });
});
