import { render, screen, fireEvent } from "@testing-library/react";
import { ChecklistPreviewModal } from "@/pages/checklists/ChecklistPreviewModal";
import type { ChecklistItem } from "@/pages/checklists/types";

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

const mockChecklist: ChecklistItem = {
  id: "cl-1",
  title: "Opening Checklist",
  type: "checklist",
  questionsCount: 3,
  schedule: "Every day",
  folderId: null,
  createdAt: "2026-01-01",
  sections: [
    {
      id: "sec-1",
      name: "Morning Setup",
      questions: [
        { id: "q1", text: "Check fridge temperature", responseType: "checkbox", required: true },
        { id: "q2", text: "Sanitize surfaces", responseType: "checkbox", required: true },
        { id: "q3", text: "Record stock count", responseType: "number", required: false },
      ],
    },
  ],
};

const multipleChoiceChecklist: ChecklistItem = {
  id: "cl-mc",
  title: "Multiple Choice Checklist",
  type: "checklist",
  questionsCount: 1,
  folderId: null,
  createdAt: "2026-01-01",
  sections: [
    {
      id: "sec-mc",
      name: "Service",
      questions: [
        {
          id: "q-mc",
          text: "How did service go?",
          responseType: "multiple_choice",
          required: true,
          choices: ["Great", "Okay", "Poor"],
        },
      ],
    },
  ],
};

const temperatureChecklist: ChecklistItem = {
  id: "cl-temp",
  title: "Temperature Checklist",
  type: "checklist",
  questionsCount: 1,
  folderId: null,
  createdAt: "2026-01-01",
  sections: [
    {
      id: "sec-temp",
      name: "Kitchen",
      questions: [
        {
          id: "q-temp",
          text: "Fridge temperature",
          responseType: "number",
          required: true,
          config: {
            numberMode: "temperature",
            numberMin: 2,
            numberMax: 5,
            temperatureUnit: "C",
          },
        },
      ],
    },
  ],
};

const visibilityWindowChecklist: ChecklistItem = {
  id: "cl-window",
  title: "Window Checklist",
  type: "checklist",
  questionsCount: 1,
  folderId: null,
  createdAt: "2026-01-01",
  visibility_from: "09:00",
  visibility_until: "10:00",
  sections: [
    {
      id: "sec-window",
      name: "",
      questions: [
        { id: "q-window", text: "Open checklist", responseType: "checkbox", required: true },
      ],
    },
  ],
};

const checklistWithoutSections: ChecklistItem = {
  id: "cl-2",
  title: "Simple Checklist",
  type: "checklist",
  questionsCount: 2,
  folderId: null,
  createdAt: "2026-01-01",
};

const nestedFollowUpChecklist: ChecklistItem = {
  id: "cl-nested",
  title: "Nested Follow-up Checklist",
  type: "checklist",
  questionsCount: 1,
  folderId: null,
  createdAt: "2026-01-01",
  sections: [
    {
      id: "sec-nested",
      name: "Triggers",
      questions: [
        {
          id: "q-nested",
          text: "Primary question",
          responseType: "checkbox",
          required: true,
          config: {
            logicRules: [
              {
                id: "lr-1",
                comparator: "is",
                value: "Yes",
                triggers: [
                  {
                    type: "ask_question",
                    config: {
                      questionText: "Did you recheck the fridge?",
                      followUpQuestion: {
                        id: "q-follow-up",
                        text: "Did you recheck the fridge?",
                        responseType: "text",
                        required: true,
                        config: {
                          logicRules: [
                            {
                              id: "lr-2",
                              comparator: "is",
                              value: "No",
                              triggers: [
                                { type: "notify", config: { notifyUser: "sarah@example.com" } },
                              ],
                            },
                          ],
                        },
                      },
                    },
                  },
                ],
              },
            ],
          },
        },
      ],
    },
  ],
};

describe("ChecklistPreviewModal", () => {
  const onClose = vi.fn();
  const onEdit = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders without crashing", () => {
    render(<ChecklistPreviewModal checklist={mockChecklist} onClose={onClose} onEdit={onEdit} />);
    expect(screen.getByText("Opening Checklist")).toBeInTheDocument();
  });

  it("shows checklist title", () => {
    render(<ChecklistPreviewModal checklist={mockChecklist} onClose={onClose} onEdit={onEdit} />);
    expect(screen.getByText("Opening Checklist")).toBeInTheDocument();
  });

  it("shows question count and schedule", () => {
    render(<ChecklistPreviewModal checklist={mockChecklist} onClose={onClose} onEdit={onEdit} />);
    expect(screen.getByText(/3 questions/)).toBeInTheDocument();
    expect(screen.getByText(/Every day/)).toBeInTheDocument();
  });

  it("shows section name", () => {
    render(<ChecklistPreviewModal checklist={mockChecklist} onClose={onClose} onEdit={onEdit} />);
    expect(screen.getByText("Morning Setup")).toBeInTheDocument();
  });

  it("shows question text", () => {
    render(<ChecklistPreviewModal checklist={mockChecklist} onClose={onClose} onEdit={onEdit} />);
    expect(screen.getByText("Check fridge temperature")).toBeInTheDocument();
    expect(screen.getByText("Sanitize surfaces")).toBeInTheDocument();
  });

  it("shows required label for required questions", () => {
    render(<ChecklistPreviewModal checklist={mockChecklist} onClose={onClose} onEdit={onEdit} />);
    expect(screen.getAllByText("Required")).toHaveLength(2);
  });

  it("close button calls onClose", () => {
    render(<ChecklistPreviewModal checklist={mockChecklist} onClose={onClose} onEdit={onEdit} />);
    const closeBtn = screen.getAllByRole("button").find((b) => b.querySelector("svg"));
    fireEvent.click(screen.getAllByRole("button")[1]); // X button
    expect(onClose).toHaveBeenCalled();
  });

  it("Edit button calls onEdit", () => {
    render(<ChecklistPreviewModal checklist={mockChecklist} onClose={onClose} onEdit={onEdit} />);
    fireEvent.click(screen.getByText("Edit"));
    expect(onEdit).toHaveBeenCalled();
  });

  it("shows Edit button", () => {
    render(<ChecklistPreviewModal checklist={mockChecklist} onClose={onClose} onEdit={onEdit} />);
    expect(screen.getByText("Edit")).toBeInTheDocument();
  });

  it("renders checklist without sections (fallback)", () => {
    render(<ChecklistPreviewModal checklist={checklistWithoutSections} onClose={onClose} onEdit={onEdit} />);
    expect(screen.getByText("Simple Checklist")).toBeInTheDocument();
    expect(screen.getByText("Question 1")).toBeInTheDocument();
    expect(screen.getByText("Question 2")).toBeInTheDocument();
  });

  it("shows question numbers", () => {
    render(<ChecklistPreviewModal checklist={mockChecklist} onClose={onClose} onEdit={onEdit} />);
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("renders real multiple-choice options instead of placeholder preview text", () => {
    render(<ChecklistPreviewModal checklist={multipleChoiceChecklist} onClose={onClose} onEdit={onEdit} />);
    expect(screen.getByText("Great")).toBeInTheDocument();
    expect(screen.getByText("Okay")).toBeInTheDocument();
    expect(screen.getByText("Poor")).toBeInTheDocument();
    expect(screen.queryByText("Option A")).not.toBeInTheDocument();
  });

  it("shows the configured unit and range for temperature-mode number questions", () => {
    render(<ChecklistPreviewModal checklist={temperatureChecklist} onClose={onClose} onEdit={onEdit} />);
    expect(screen.getByText("Celsius")).toBeInTheDocument();
    expect(screen.getByText(/Acceptable range: 2 to 5 C/)).toBeInTheDocument();
  });

  it("shows the configured visibility window in the preview header", () => {
    render(<ChecklistPreviewModal checklist={visibilityWindowChecklist} onClose={onClose} onEdit={onEdit} />);
    expect(screen.getByText(/Visible 9am - 10am/)).toBeInTheDocument();
  });

  it("shows nested follow-up question summaries in the preview", () => {
    render(<ChecklistPreviewModal checklist={nestedFollowUpChecklist} onClose={onClose} onEdit={onEdit} />);
    expect(screen.getByText("Did you recheck the fridge?")).toBeInTheDocument();
    expect(screen.getByText(/Text/i)).toBeInTheDocument();
    expect(screen.getByText(/nested triggers enabled/i)).toBeInTheDocument();
  });
});
