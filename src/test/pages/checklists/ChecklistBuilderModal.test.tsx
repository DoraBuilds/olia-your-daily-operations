import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
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

vi.mock("@/hooks/useLocations", () => ({
  useLocations: () => ({
    data: [
      { id: "loc-1", name: "Main Branch", address: "14 Rue de la Paix, Lyon, France" },
      { id: "loc-2", name: "Terrace", address: "14 Rue de la Paix (outdoor), Lyon, France" },
      { id: "loc-3", name: "Riverside", address: "1 Riverside Road, Lyon, France" },
    ],
    isLoading: false,
  }),
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

  it("lets ask-question triggers build a follow-up question with its own trigger", async () => {
    renderWithClient(<ChecklistBuilderModal onClose={onClose} onAdd={onAdd} />);

    fireEvent.click(screen.getByRole("button", { name: /Add logic/i }));
    fireEvent.click(screen.getByRole("button", { name: /trigger/i }));
    fireEvent.click(screen.getByText("Ask question"));

    const followUpEditor = await screen.findByTestId("followup-question-editor");
    fireEvent.change(within(followUpEditor).getByPlaceholderText("Follow-up question text"), {
      target: { value: "Did you recheck the fridge?" },
    });

    fireEvent.click(within(followUpEditor).getByRole("button", { name: /Add logic/i }));
    fireEvent.click(within(followUpEditor).getByRole("button", { name: /trigger/i }));
    fireEvent.click(within(followUpEditor).getByText("Notify (email)"));

    fireEvent.change(screen.getByPlaceholderText(/Morning Opening Checklist/), {
      target: { value: "Nested Follow-up Checklist" },
    });
    fireEvent.click(screen.getByText("Create checklist"));

    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({
      title: "Nested Follow-up Checklist",
      sections: expect.arrayContaining([
        expect.objectContaining({
          questions: expect.arrayContaining([
            expect.objectContaining({
              responseType: "checkbox",
              config: expect.objectContaining({
                logicRules: expect.any(Array),
              }),
            }),
          ]),
        }),
      ]),
    }));

    const saved = onAdd.mock.calls[0][0] as any;
    const trigger = saved.sections[0].questions[0].config.logicRules[0].triggers[0];
    expect(trigger.type).toBe("ask_question");
    expect(trigger.config.followUpQuestion.text).toBe("Did you recheck the fridge?");
    expect(trigger.config.followUpQuestion.config.logicRules[0].triggers[0].type).toBe("notify");
  });

  it("shows Start date picker", () => {
    renderWithClient(<ChecklistBuilderModal onClose={onClose} onAdd={onAdd} />);
    expect(screen.getByText("Select start date")).toBeInTheDocument();
  });

  it("shows a visibility window toggle after the start date", () => {
    renderWithClient(<ChecklistBuilderModal onClose={onClose} onAdd={onAdd} />);
    expect(screen.getByText("Visibility window")).toBeInTheDocument();
    expect(screen.getByText(/Leave it off and the checklist stays visible all day/i)).toBeInTheDocument();
  });

  it("reveals visibility window inputs when enabled", () => {
    renderWithClient(<ChecklistBuilderModal onClose={onClose} onAdd={onAdd} />);
    fireEvent.click(screen.getByRole("button", { name: /Visibility window/i }));
    expect(screen.getByDisplayValue("09:00")).toBeInTheDocument();
    expect(screen.getByDisplayValue("10:00")).toBeInTheDocument();
  });

  it("shows the locations picker before the title section", () => {
    renderWithClient(<ChecklistBuilderModal onClose={onClose} onAdd={onAdd} />);
    const locationsLabel = screen.getByText("Locations");
    const titleLabel = screen.getByText(/Title/i);
    expect(locationsLabel.compareDocumentPosition(titleLabel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(locationsLabel).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "All locations" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Morning Opening Checklist/)).toBeInTheDocument();
  });

  it("searches locations and saves a specific multi-location selection", () => {
    renderWithClient(<ChecklistBuilderModal onClose={onClose} onAdd={onAdd} />);

    fireEvent.click(screen.getByRole("button", { name: "Select specific locations" }));
    fireEvent.change(screen.getByPlaceholderText("Search locations or address"), {
      target: { value: "terrace" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Terrace/i }));

    fireEvent.change(screen.getByPlaceholderText(/Morning Opening Checklist/), {
      target: { value: "Location Checklist" },
    });
    fireEvent.click(screen.getByText("Create checklist"));

    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({
      title: "Location Checklist",
      location_id: "loc-2",
      location_ids: ["loc-2"],
    }));
  });

  it("keeps a specific selection even when every location is picked manually", () => {
    renderWithClient(<ChecklistBuilderModal onClose={onClose} onAdd={onAdd} />);

    fireEvent.click(screen.getByRole("button", { name: "Select specific locations" }));
    fireEvent.click(screen.getByText("Select all"));

    fireEvent.change(screen.getByPlaceholderText(/Morning Opening Checklist/), {
      target: { value: "All Locations Checklist" },
    });
    fireEvent.click(screen.getByText("Create checklist"));

    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({
      title: "All Locations Checklist",
      location_id: null,
      location_ids: ["loc-1", "loc-2", "loc-3"],
    }));
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

  it("stores preset multiple-choice options on the question payload", async () => {
    renderWithClient(<ChecklistBuilderModal onClose={onClose} onAdd={onAdd} />);

    fireEvent.click(screen.getByText("Checkbox"));
    fireEvent.click(screen.getByText("Good"));

    fireEvent.change(screen.getByPlaceholderText(/Morning Opening Checklist/), {
      target: { value: "MC Checklist" },
    });

    fireEvent.click(screen.getByText("Create checklist"));

    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({
      title: "MC Checklist",
      sections: expect.arrayContaining([
        expect.objectContaining({
          questions: expect.arrayContaining([
            expect.objectContaining({
              responseType: "multiple_choice",
              mcSetId: "mc1",
              choices: ["Good", "Fair", "Poor", "N/A"],
            }),
          ]),
        }),
      ]),
    }));
  });

  it("lets you edit multiple-choice options and switch to multi-select", () => {
    renderWithClient(<ChecklistBuilderModal onClose={onClose} onAdd={onAdd} />);

    fireEvent.click(screen.getByText("Checkbox"));
    fireEvent.click(screen.getByText("Good"));

    fireEvent.click(screen.getByRole("button", { name: "Multiple" }));

    const optionInputs = screen.getAllByDisplayValue(/Good|Fair|Poor|N\/A/);
    fireEvent.change(optionInputs[0], { target: { value: "Perhaps" } });

    fireEvent.click(screen.getByText("Add option"));
    expect(screen.getByDisplayValue("Perhaps")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Option 5")).toBeInTheDocument();
  });

  it("keeps number questions in single-value mode by default", () => {
    renderWithClient(<ChecklistBuilderModal onClose={onClose} onAdd={onAdd} />);

    fireEvent.click(screen.getByText("Checkbox"));
    fireEvent.click(screen.getByText("Number"));

    expect(screen.getByText(/single numeric answer/i)).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Min")).not.toBeInTheDocument();
    expect(screen.queryByText("Celsius")).not.toBeInTheDocument();
  });

  it("shows range and unit controls when number question is switched to temperature mode", () => {
    renderWithClient(<ChecklistBuilderModal onClose={onClose} onAdd={onAdd} />);

    fireEvent.click(screen.getByText("Checkbox"));
    fireEvent.click(screen.getByText("Number"));
    fireEvent.click(screen.getByRole("button", { name: "Temperature" }));

    expect(screen.getByPlaceholderText("Min")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Max")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Celsius" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Fahrenheit" })).toBeInTheDocument();
  });

  it("lets instruction questions link to Infohub content", () => {
    renderWithClient(<ChecklistBuilderModal onClose={onClose} onAdd={onAdd} />);

    fireEvent.click(screen.getByText("Checkbox"));
    fireEvent.click(screen.getByText("Instruction"));
    fireEvent.click(screen.getByRole("button", { name: /Link Infohub content/i }));
    fireEvent.change(screen.getByPlaceholderText(/Search library or training/i), {
      target: { value: "latte" },
    });
    fireEvent.click(screen.getByRole("button", { name: /How to make a latte/i }));
    fireEvent.change(screen.getByPlaceholderText(/Morning Opening Checklist/), {
      target: { value: "Instruction Checklist" },
    });

    fireEvent.click(screen.getByText("Create checklist"));

    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({
      title: "Instruction Checklist",
      sections: expect.arrayContaining([
        expect.objectContaining({
          questions: expect.arrayContaining([
            expect.objectContaining({
              responseType: "instruction",
              config: expect.objectContaining({
                instructionLinkId: "tr1",
                instructionLinkTitle: "How to make a latte",
                instructionLinkSection: "training",
              }),
            }),
          ]),
        }),
      ]),
    }));
  });

  it("stores the visibility window on save when enabled", () => {
    renderWithClient(<ChecklistBuilderModal onClose={onClose} onAdd={onAdd} />);

    fireEvent.click(screen.getByRole("button", { name: /Visibility window/i }));
    fireEvent.change(screen.getByDisplayValue("09:00"), { target: { value: "08:30" } });
    fireEvent.change(screen.getByDisplayValue("10:00"), { target: { value: "10:15" } });
    fireEvent.change(screen.getByPlaceholderText(/Morning Opening Checklist/), {
      target: { value: "Window Checklist" },
    });

    fireEvent.click(screen.getByText("Create checklist"));

    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({
      title: "Window Checklist",
      visibility_from: "08:30",
      visibility_until: "10:15",
      due_time: null,
    }));
  });

  it("stores the selected start date on save", async () => {
    renderWithClient(<ChecklistBuilderModal onClose={onClose} onAdd={onAdd} />);

    fireEvent.click(screen.getByText("Select start date"));
    await waitFor(() => {
      expect(screen.getByText("15")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("15"));
    fireEvent.change(screen.getByPlaceholderText(/Morning Opening Checklist/), {
      target: { value: "Date Checklist" },
    });

    fireEvent.click(screen.getByText("Create checklist"));

    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({
      title: "Date Checklist",
      start_date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    }));
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

  it("pre-fills the saved start date in edit mode", () => {
    renderWithClient(
      <ChecklistBuilderModal
        onClose={onClose}
        onAdd={onAdd}
        onUpdate={onUpdate}
        editId="cl-1"
        initialTitle="Existing Checklist"
        initialStartDate="2026-04-08"
      />
    );
    expect(screen.getByText(/Apr/i)).toBeInTheDocument();
  });

  it("pre-fills and saves a specific location selection in edit mode", () => {
    renderWithClient(
      <ChecklistBuilderModal
        onClose={onClose}
        onAdd={onAdd}
        onUpdate={onUpdate}
        editId="cl-1"
        initialTitle="Existing Checklist"
        initialLocationIds={["loc-2"]}
      />
    );

    expect(screen.getByRole("button", { name: "Select specific locations" })).toHaveClass("bg-sage");
    fireEvent.click(screen.getByText("Save checklist"));

    expect(onUpdate).toHaveBeenCalledWith("cl-1", expect.objectContaining({
      location_id: "loc-2",
      location_ids: ["loc-2"],
    }));
  });
});
