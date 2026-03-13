import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { BuildWithAIModal } from "@/pages/checklists/BuildWithAIModal";

// Use vi.hoisted so the variable is available inside the vi.mock factory
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
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      insert: vi.fn().mockResolvedValue({ data: [{ id: "new1" }], error: null }),
      update: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockResolvedValue({ data: [{ id: "new1" }], error: null }),
      delete: vi.fn().mockReturnThis(),
      then: vi.fn().mockImplementation((cb) => Promise.resolve(cb({ data: [], error: null }))),
    }),
    functions: {
      invoke: mockFunctionsInvoke,
    },
  },
}));

describe("BuildWithAIModal", () => {
  const onClose = vi.fn();
  const onGenerate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockFunctionsInvoke.mockResolvedValue({
      data: {
        title: "AI Checklist",
        sections: [{ id: "s1", name: "Section 1", questions: [] }],
      },
      error: null,
    });
  });

  it("renders without crashing", () => {
    render(<BuildWithAIModal onClose={onClose} onGenerate={onGenerate} />);
    expect(screen.getByText("Build with AI")).toBeInTheDocument();
  });

  it("shows descriptive text", () => {
    render(<BuildWithAIModal onClose={onClose} onGenerate={onGenerate} />);
    expect(screen.getByText(/Describe the checklist/i)).toBeInTheDocument();
  });

  it("has a textarea for prompt input", () => {
    render(<BuildWithAIModal onClose={onClose} onGenerate={onGenerate} />);
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("has a Generate checklist button", () => {
    render(<BuildWithAIModal onClose={onClose} onGenerate={onGenerate} />);
    expect(screen.getByText("Generate checklist")).toBeInTheDocument();
  });

  it("has a close button that calls onClose", () => {
    render(<BuildWithAIModal onClose={onClose} onGenerate={onGenerate} />);
    const buttons = screen.getAllByRole("button");
    // The X button is the first non-generate button
    const closeButton = buttons.find((b) => b.querySelector("svg"));
    fireEvent.click(buttons[0]);
    expect(onClose).toHaveBeenCalled();
  });

  it("Generate button is disabled when prompt is empty", () => {
    render(<BuildWithAIModal onClose={onClose} onGenerate={onGenerate} />);
    const btn = screen.getByText("Generate checklist").closest("button");
    expect(btn).toBeDisabled();
  });

  it("Generate button is enabled when prompt has text", async () => {
    render(<BuildWithAIModal onClose={onClose} onGenerate={onGenerate} />);
    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "Daily opening checklist" } });
    const btn = screen.getByText("Generate checklist").closest("button");
    expect(btn).not.toBeDisabled();
  });

  it("shows 'Generating...' text while loading", async () => {
    mockFunctionsInvoke.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ data: null, error: { message: "timeout" } }), 5000))
    );
    render(<BuildWithAIModal onClose={onClose} onGenerate={onGenerate} />);
    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "Opening checklist" } });
    fireEvent.click(screen.getByText("Generate checklist").closest("button")!);
    await waitFor(() => expect(screen.getByText("Generating…")).toBeInTheDocument());
  });

  it("calls onGenerate and onClose when generation succeeds", async () => {
    render(<BuildWithAIModal onClose={onClose} onGenerate={onGenerate} />);
    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "Opening checklist" } });
    fireEvent.click(screen.getByText("Generate checklist").closest("button")!);
    await waitFor(() => expect(onGenerate).toHaveBeenCalledWith(
      "AI Checklist",
      [{ id: "s1", name: "Section 1", questions: [] }]
    ));
    expect(onClose).toHaveBeenCalled();
  });

  it("shows error message when generation fails", async () => {
    mockFunctionsInvoke.mockResolvedValue({ data: null, error: { message: "Server error" } });
    render(<BuildWithAIModal onClose={onClose} onGenerate={onGenerate} />);
    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "Opening checklist" } });
    fireEvent.click(screen.getByText("Generate checklist").closest("button")!);
    await waitFor(() => expect(screen.getByText("Server error")).toBeInTheDocument());
  });

  it("shows error message when response has no title", async () => {
    mockFunctionsInvoke.mockResolvedValue({ data: { sections: [] }, error: null });
    render(<BuildWithAIModal onClose={onClose} onGenerate={onGenerate} />);
    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "Opening checklist" } });
    fireEvent.click(screen.getByText("Generate checklist").closest("button")!);
    await waitFor(() => expect(screen.getByText(/Unexpected response/i)).toBeInTheDocument());
  });

  it("textarea accepts user input", async () => {
    render(<BuildWithAIModal onClose={onClose} onGenerate={onGenerate} />);
    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "Daily restaurant checklist" } });
    expect((textarea as HTMLTextAreaElement).value).toBe("Daily restaurant checklist");
  });
});
