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

const checklistWithoutSections: ChecklistItem = {
  id: "cl-2",
  title: "Simple Checklist",
  type: "checklist",
  questionsCount: 2,
  folderId: null,
  createdAt: "2026-01-01",
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
});
