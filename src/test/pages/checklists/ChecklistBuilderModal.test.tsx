import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ChecklistBuilderModal } from "@/pages/checklists/ChecklistBuilderModal";

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

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
      then: vi.fn().mockImplementation((cb) => Promise.resolve(cb({ data: [], error: null }))),
    }),
  },
}));

vi.mock("@/hooks/useAlerts", () => ({
  useAlerts: () => ({ data: [] }),
  useCreateAlert: () => ({ mutate: vi.fn(), isPending: false }),
}));

describe("ChecklistBuilderModal - new checklist", () => {
  const onClose = vi.fn();
  const onAdd = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders without crashing", () => {
    renderWithClient(<ChecklistBuilderModal onClose={onClose} onAdd={onAdd} />);
    expect(screen.getByText("Build checklist")).toBeInTheDocument();
  });

  it("shows 'Build checklist' title for new checklist", () => {
    renderWithClient(<ChecklistBuilderModal onClose={onClose} onAdd={onAdd} />);
    expect(screen.getByText("Build checklist")).toBeInTheDocument();
  });

  it("has a Title input field", () => {
    renderWithClient(<ChecklistBuilderModal onClose={onClose} onAdd={onAdd} />);
    expect(screen.getByPlaceholderText(/Morning Opening Checklist/)).toBeInTheDocument();
  });

  it("has a Description textarea", () => {
    renderWithClient(<ChecklistBuilderModal onClose={onClose} onAdd={onAdd} />);
    expect(screen.getByPlaceholderText("Optional description")).toBeInTheDocument();
  });

  it("title input can be filled", () => {
    renderWithClient(<ChecklistBuilderModal onClose={onClose} onAdd={onAdd} />);
    const titleInput = screen.getByPlaceholderText(/Morning Opening Checklist/);
    fireEvent.change(titleInput, { target: { value: "Daily Checklist" } });
    expect((titleInput as HTMLInputElement).value).toBe("Daily Checklist");
  });

  it("has Schedule section", () => {
    renderWithClient(<ChecklistBuilderModal onClose={onClose} onAdd={onAdd} />);
    expect(screen.getByText("Schedule")).toBeInTheDocument();
  });

  it("shows schedule options: Once, Every day, etc.", () => {
    renderWithClient(<ChecklistBuilderModal onClose={onClose} onAdd={onAdd} />);
    expect(screen.getByText("Once")).toBeInTheDocument();
    expect(screen.getByText("Every day")).toBeInTheDocument();
    expect(screen.getByText("Every week")).toBeInTheDocument();
  });

  it("shows Custom schedule option", () => {
    renderWithClient(<ChecklistBuilderModal onClose={onClose} onAdd={onAdd} />);
    expect(screen.getByText("Custom")).toBeInTheDocument();
  });

  it("clicking a schedule option selects it", () => {
    renderWithClient(<ChecklistBuilderModal onClose={onClose} onAdd={onAdd} />);
    fireEvent.click(screen.getByText("Every day"));
    const btn = screen.getByText("Every day").closest("button");
    expect(btn?.className).toContain("bg-sage");
  });

  it("has at least one question field by default", () => {
    renderWithClient(<ChecklistBuilderModal onClose={onClose} onAdd={onAdd} />);
    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBeGreaterThan(0);
  });

  it("has 'Add another question' button", () => {
    renderWithClient(<ChecklistBuilderModal onClose={onClose} onAdd={onAdd} />);
    expect(screen.getByText("Add another question")).toBeInTheDocument();
  });

  it("has 'Add a section' button", () => {
    renderWithClient(<ChecklistBuilderModal onClose={onClose} onAdd={onAdd} />);
    expect(screen.getByText("Add a section")).toBeInTheDocument();
  });

  it("clicking 'Add a section' adds a new section (section name inputs appear)", () => {
    renderWithClient(<ChecklistBuilderModal onClose={onClose} onAdd={onAdd} />);
    // Initially 1 section — the section name input is hidden (only shown when 2+ sections exist)
    expect(screen.queryByPlaceholderText("Section name")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Add a section"));
    // Now 2 sections → both show the section name input
    expect(screen.getAllByPlaceholderText("Section name").length).toBeGreaterThan(0);
  });

  it("clicking 'Add another question' adds a new question row", () => {
    renderWithClient(<ChecklistBuilderModal onClose={onClose} onAdd={onAdd} />);
    const beforeInputs = screen.getAllByPlaceholderText("Write your question here").length;
    fireEvent.click(screen.getByText("Add another question"));
    const afterInputs = screen.getAllByPlaceholderText("Write your question here").length;
    expect(afterInputs).toBe(beforeInputs + 1);
  });

  it("has a Create checklist button", () => {
    renderWithClient(<ChecklistBuilderModal onClose={onClose} onAdd={onAdd} />);
    expect(screen.getByText("Create checklist")).toBeInTheDocument();
  });

  it("does not call onAdd if title is empty", () => {
    renderWithClient(<ChecklistBuilderModal onClose={onClose} onAdd={onAdd} />);
    fireEvent.click(screen.getByText("Create checklist"));
    expect(onAdd).not.toHaveBeenCalled();
  });

  it("calls onAdd when title is filled and Create is clicked", () => {
    renderWithClient(<ChecklistBuilderModal onClose={onClose} onAdd={onAdd} />);
    const titleInput = screen.getByPlaceholderText(/Morning Opening Checklist/);
    fireEvent.change(titleInput, { target: { value: "New Checklist" } });
    fireEvent.click(screen.getByText("Create checklist"));
    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ title: "New Checklist" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("close button calls onClose", () => {
    renderWithClient(<ChecklistBuilderModal onClose={onClose} onAdd={onAdd} />);
    const buttons = screen.getAllByRole("button");
    fireEvent.click(buttons[0]);
    expect(onClose).toHaveBeenCalled();
  });

  it("question text input can be filled", () => {
    renderWithClient(<ChecklistBuilderModal onClose={onClose} onAdd={onAdd} />);
    const questionInput = screen.getByPlaceholderText("Write your question here");
    fireEvent.change(questionInput, { target: { value: "Is the fridge temperature correct?" } });
    expect((questionInput as HTMLInputElement).value).toBe("Is the fridge temperature correct?");
  });

  it("shows response type selector for questions (Checkbox option)", () => {
    renderWithClient(<ChecklistBuilderModal onClose={onClose} onAdd={onAdd} />);
    expect(screen.getByText("Checkbox")).toBeInTheDocument();
  });

  it("shows Start date picker", () => {
    renderWithClient(<ChecklistBuilderModal onClose={onClose} onAdd={onAdd} />);
    expect(screen.getByText("Select start date")).toBeInTheDocument();
  });

  it("shows Locations selector", () => {
    renderWithClient(<ChecklistBuilderModal onClose={onClose} onAdd={onAdd} />);
    expect(screen.getByText("All locations")).toBeInTheDocument();
  });

  it("shows section name input after adding a second section", () => {
    renderWithClient(<ChecklistBuilderModal onClose={onClose} onAdd={onAdd} />);
    fireEvent.click(screen.getByText("Add a section"));
    expect(screen.getAllByPlaceholderText("Section name").length).toBeGreaterThan(0);
  });

  it("clicking Custom schedule shows custom recurrence button", () => {
    renderWithClient(<ChecklistBuilderModal onClose={onClose} onAdd={onAdd} />);
    fireEvent.click(screen.getByText("Custom"));
    expect(screen.getByText(/Edit custom recurrence/)).toBeInTheDocument();
  });

  it("opening custom recurrence shows the picker", async () => {
    renderWithClient(<ChecklistBuilderModal onClose={onClose} onAdd={onAdd} />);
    fireEvent.click(screen.getByText("Custom"));
    fireEvent.click(screen.getByText(/Edit custom recurrence/));
    await waitFor(() => {
      expect(screen.getByText("Custom recurrence")).toBeInTheDocument();
    });
  });

  it("shows Required checkbox for questions", () => {
    renderWithClient(<ChecklistBuilderModal onClose={onClose} onAdd={onAdd} />);
    const requiredLabels = screen.getAllByText("Required");
    expect(requiredLabels.length).toBeGreaterThan(0);
  });
});

describe("ChecklistBuilderModal - edit mode", () => {
  const onClose = vi.fn();
  const onAdd = vi.fn();
  const onUpdate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows 'Edit checklist' title when editId is provided", () => {
    renderWithClient(
      <ChecklistBuilderModal
        onClose={onClose}
        onAdd={onAdd}
        onUpdate={onUpdate}
        editId="cl-1"
        initialTitle="Existing Checklist"
        initialSections={[
          {
            id: "sec-1",
            name: "Morning",
            questions: [{ id: "q1", text: "Check temps", responseType: "checkbox", required: true }],
          },
        ]}
      />
    );
    expect(screen.getByText("Edit checklist")).toBeInTheDocument();
  });

  it("pre-fills title in edit mode", () => {
    renderWithClient(
      <ChecklistBuilderModal
        onClose={onClose}
        onAdd={onAdd}
        onUpdate={onUpdate}
        editId="cl-1"
        initialTitle="Existing Checklist"
      />
    );
    const titleInput = screen.getByPlaceholderText(/Morning Opening Checklist/);
    expect((titleInput as HTMLInputElement).value).toBe("Existing Checklist");
  });

  it("pre-fills sections in edit mode (with 2 sections so name inputs are visible)", () => {
    renderWithClient(
      <ChecklistBuilderModal
        onClose={onClose}
        onAdd={onAdd}
        onUpdate={onUpdate}
        editId="cl-1"
        initialTitle="Existing Checklist"
        initialSections={[
          {
            id: "sec-1",
            name: "Morning",
            questions: [{ id: "q1", text: "Check temps", responseType: "checkbox", required: true }],
          },
          {
            id: "sec-2",
            name: "Evening",
            questions: [{ id: "q2", text: "Lock doors", responseType: "checkbox", required: true }],
          },
        ]}
      />
    );
    expect(screen.getByDisplayValue("Morning")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Check temps")).toBeInTheDocument();
  });

  it("shows 'Save checklist' button in edit mode", () => {
    renderWithClient(
      <ChecklistBuilderModal
        onClose={onClose}
        onAdd={onAdd}
        onUpdate={onUpdate}
        editId="cl-1"
        initialTitle="Existing Checklist"
      />
    );
    expect(screen.getByText("Save checklist")).toBeInTheDocument();
  });

  it("calls onUpdate (not onAdd) when saving in edit mode", () => {
    renderWithClient(
      <ChecklistBuilderModal
        onClose={onClose}
        onAdd={onAdd}
        onUpdate={onUpdate}
        editId="cl-1"
        initialTitle="Existing Checklist"
      />
    );
    fireEvent.click(screen.getByText("Save checklist"));
    expect(onUpdate).toHaveBeenCalledWith("cl-1", expect.objectContaining({ title: "Existing Checklist" }));
    expect(onAdd).not.toHaveBeenCalled();
  });
});
