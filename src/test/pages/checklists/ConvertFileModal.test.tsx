import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ConvertFileModal } from "@/pages/checklists/ConvertFileModal";

const { mockFunctionsInvoke } = vi.hoisted(() => ({
  mockFunctionsInvoke: vi.fn(),
}));

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
    functions: {
      invoke: mockFunctionsInvoke,
    },
  },
}));

// Mock xlsx since we don't want actual file parsing
vi.mock("xlsx", () => ({
  read: vi.fn().mockReturnValue({ SheetNames: [], Sheets: {} }),
  utils: { sheet_to_csv: vi.fn().mockReturnValue("") },
}));

describe("ConvertFileModal", () => {
  const onClose = vi.fn();
  const onConvert = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockFunctionsInvoke.mockResolvedValue({
      data: { sections: [{ id: "s1", name: "Section 1", questions: [] }] },
      error: null,
    });
  });

  it("renders without crashing", () => {
    render(<ConvertFileModal onClose={onClose} onConvert={onConvert} />);
    expect(screen.getByText("Convert file to checklist")).toBeInTheDocument();
  });

  it("shows file upload instruction", () => {
    render(<ConvertFileModal onClose={onClose} onConvert={onConvert} />);
    expect(screen.getByText("Tap to select a file")).toBeInTheDocument();
  });

  it("shows accepted file types", () => {
    render(<ConvertFileModal onClose={onClose} onConvert={onConvert} />);
    // Text appears in description and in the drop zone hint
    expect(screen.getByText(/Excel, PDF, or image · Max 10MB/)).toBeInTheDocument();
  });

  it("has a close button", () => {
    render(<ConvertFileModal onClose={onClose} onConvert={onConvert} />);
    const buttons = screen.getAllByRole("button");
    fireEvent.click(buttons[0]);
    expect(onClose).toHaveBeenCalled();
  });

  it("has a Convert to checklist button", () => {
    render(<ConvertFileModal onClose={onClose} onConvert={onConvert} />);
    expect(screen.getByText("Convert to checklist")).toBeInTheDocument();
  });

  it("Convert button is disabled when no file selected", () => {
    render(<ConvertFileModal onClose={onClose} onConvert={onConvert} />);
    const btn = screen.getByText("Convert to checklist").closest("button");
    expect(btn).toBeDisabled();
  });

  it("shows file name after file is dropped", () => {
    render(<ConvertFileModal onClose={onClose} onConvert={onConvert} />);
    const dropZone = screen.getByText("Tap to select a file").closest("div")!;
    const file = new File(["content"], "test.csv", { type: "text/csv" });
    fireEvent.drop(dropZone, {
      dataTransfer: { files: [file] },
    });
    expect(screen.getByText("test.csv")).toBeInTheDocument();
  });

  it("Convert button enabled after file selected via drop", () => {
    render(<ConvertFileModal onClose={onClose} onConvert={onConvert} />);
    const dropZone = screen.getByText("Tap to select a file").closest("div")!;
    const file = new File(["content"], "checklist.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    fireEvent.drop(dropZone, {
      dataTransfer: { files: [file] },
    });
    const btn = screen.getByText("Convert to checklist").closest("button");
    expect(btn).not.toBeDisabled();
  });

  it("shows drag over style when dragging over", () => {
    render(<ConvertFileModal onClose={onClose} onConvert={onConvert} />);
    const dropZone = screen.getByText("Tap to select a file").closest("div")!;
    fireEvent.dragOver(dropZone);
    // component state changes, no error thrown
  });

  it("resets drag over on drag leave", () => {
    render(<ConvertFileModal onClose={onClose} onConvert={onConvert} />);
    const dropZone = screen.getByText("Tap to select a file").closest("div")!;
    fireEvent.dragOver(dropZone);
    fireEvent.dragLeave(dropZone);
    // component handles state without error
  });

  it("calls onConvert and onClose on successful conversion", async () => {
    render(<ConvertFileModal onClose={onClose} onConvert={onConvert} />);
    const dropZone = screen.getByText("Tap to select a file").closest("div")!;
    const file = new File(["id,name\n1,item1"], "checklist.csv", { type: "text/csv" });
    // jsdom File doesn't have arrayBuffer; polyfill it
    file.arrayBuffer = () => Promise.resolve(new ArrayBuffer(0));
    fireEvent.drop(dropZone, { dataTransfer: { files: [file] } });
    fireEvent.click(screen.getByText("Convert to checklist").closest("button")!);
    await waitFor(() => expect(onConvert).toHaveBeenCalled());
    expect(onClose).toHaveBeenCalled();
  });

  it("shows error when conversion fails", async () => {
    mockFunctionsInvoke.mockResolvedValue({ data: null, error: { message: "Conversion failed" } });
    render(<ConvertFileModal onClose={onClose} onConvert={onConvert} />);
    const dropZone = screen.getByText("Tap to select a file").closest("div")!;
    const file = new File(["content"], "test.pdf", { type: "application/pdf" });
    fireEvent.drop(dropZone, { dataTransfer: { files: [file] } });
    fireEvent.click(screen.getByText("Convert to checklist").closest("button")!);
    await waitFor(() => expect(screen.getByText("Something went wrong. Please try again.")).toBeInTheDocument());
  });

  it("shows AI quota error for rate-limit failures", async () => {
    mockFunctionsInvoke.mockResolvedValue({ data: null, error: { message: "rate limit exceeded 429" } });
    render(<ConvertFileModal onClose={onClose} onConvert={onConvert} />);
    const dropZone = screen.getByText("Tap to select a file").closest("div")!;
    const file = new File(["content"], "test.pdf", { type: "application/pdf" });
    fireEvent.drop(dropZone, { dataTransfer: { files: [file] } });
    fireEvent.click(screen.getByText("Convert to checklist").closest("button")!);
    await waitFor(() => expect(screen.getByText(/quota reached/)).toBeInTheDocument());
  });

  it("shows service unavailable error for edge function failures", async () => {
    mockFunctionsInvoke.mockResolvedValue({ data: null, error: { message: "Edge Function returned a non-2xx status code" } });
    render(<ConvertFileModal onClose={onClose} onConvert={onConvert} />);
    const dropZone = screen.getByText("Tap to select a file").closest("div")!;
    const file = new File(["content"], "test.pdf", { type: "application/pdf" });
    fireEvent.drop(dropZone, { dataTransfer: { files: [file] } });
    fireEvent.click(screen.getByText("Convert to checklist").closest("button")!);
    await waitFor(() => expect(screen.getByText(/temporarily unavailable/)).toBeInTheDocument());
  });
});
