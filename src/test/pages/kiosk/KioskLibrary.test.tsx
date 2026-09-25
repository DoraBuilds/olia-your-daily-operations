import { screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { KioskLibrary } from "@/pages/kiosk/KioskLibrary";
import { renderWithProviders } from "../../test-utils";

// ─── Supabase mock ────────────────────────────────────────────────────────────
const mockGetKioskLibrary = vi.fn();
const mockGetProgress = vi.fn();
const mockSetComplete = vi.fn();

vi.mock("@/lib/supabase", () => ({
  supabase: {
    rpc: vi.fn().mockImplementation((fn: string, _params?: unknown) => {
      if (fn === "get_kiosk_library") return mockGetKioskLibrary();
      if (fn === "get_kiosk_training_progress") return mockGetProgress(_params);
      if (fn === "set_kiosk_training_complete") return mockSetComplete(_params);
      if (fn === "get_kiosk_token") return Promise.resolve({ data: { kiosk_token: "test-token" }, error: null });
      return Promise.resolve({ data: null, error: null });
    }),
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { kiosk_token: "test-token" }, error: null }),
      maybeSingle: vi.fn().mockResolvedValue({ data: { kiosk_token: "test-token" }, error: null }),
    }),
  },
}));

// ensureKioskToken reads from localStorage then queries Supabase — stub it out
vi.mock("@/pages/kiosk/PinEntryModal", async () => {
  const actual = await vi.importActual<typeof import("@/pages/kiosk/PinEntryModal")>("@/pages/kiosk/PinEntryModal");
  return {
    ...actual,
    ensureKioskToken: vi.fn().mockResolvedValue("test-token"),
  };
});

const FOLDERS = [
  { id: "f1", name: "Safety Procedures", parent_id: null },
  { id: "f2", name: "Service Standards", parent_id: null },
  { id: "f3", name: "Allergen Sub", parent_id: "f1" },
];

const DOCS = [
  { id: "d1", title: "Allergen Handling", summary: "How to handle allergens.", body: "Step 1.\n\nStep 2.", folder_id: "f1", metadata: { tags: ["Safety"] } },
  { id: "d2", title: "Customer Greeting", summary: "Greet every customer.", body: "Eye contact first.", folder_id: "f2", metadata: {} },
  { id: "d3", title: "Sub Doc", summary: "", body: "Sub body.", folder_id: "f3", metadata: { filePath: "path/to/file.pdf", fileType: "PDF" } },
];

const SUCCESS_RESPONSE = { data: { folders: FOLDERS, documents: DOCS }, error: null };
const EMPTY_RESPONSE = { data: { folders: [], documents: [] }, error: null };
const ERROR_RESPONSE = { data: null, error: { message: "DB error" } };

const DEFAULT_PROPS = {
  memberId: "tm-1",
  memberName: "Jay Crichton",
  locationId: "loc-1",
  onBack: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetProgress.mockResolvedValue({ data: [], error: null });
  mockSetComplete.mockResolvedValue({ data: null, error: null });
  DEFAULT_PROPS.onBack = vi.fn();
});

// ─── Loading + error states ───────────────────────────────────────────────────

describe("KioskLibrary loading and error", () => {
  it("shows loading state initially", () => {
    mockGetKioskLibrary.mockReturnValue(new Promise(() => {}));
    renderWithProviders(<KioskLibrary {...DEFAULT_PROPS} />);
    expect(screen.getByText("Loading Infohub…")).toBeInTheDocument();
  });

  it("shows error message on RPC failure", async () => {
    mockGetKioskLibrary.mockResolvedValue(ERROR_RESPONSE);
    renderWithProviders(<KioskLibrary {...DEFAULT_PROPS} />);
    await waitFor(() => expect(screen.getByText(/Could not load Infohub/)).toBeInTheDocument());
  });

  it("back link on error screen calls onBack", async () => {
    mockGetKioskLibrary.mockResolvedValue(ERROR_RESPONSE);
    renderWithProviders(<KioskLibrary {...DEFAULT_PROPS} />);
    await waitFor(() => screen.getByText("Back to kiosk"));
    fireEvent.click(screen.getByText("Back to kiosk"));
    expect(DEFAULT_PROPS.onBack).toHaveBeenCalledTimes(1);
  });
});

// ─── Empty state ──────────────────────────────────────────────────────────────

describe("KioskLibrary empty state", () => {
  it("shows empty message when no folders are returned", async () => {
    mockGetKioskLibrary.mockResolvedValue(EMPTY_RESPONSE);
    renderWithProviders(<KioskLibrary {...DEFAULT_PROPS} />);
    await waitFor(() => expect(screen.getByText("No library documents available.")).toBeInTheDocument());
  });
});

// ─── Root folder list ─────────────────────────────────────────────────────────

describe("KioskLibrary root folder list", () => {
  it("renders root-level folders with document counts", async () => {
    mockGetKioskLibrary.mockResolvedValue(SUCCESS_RESPONSE);
    renderWithProviders(<KioskLibrary {...DEFAULT_PROPS} />);
    await waitFor(() => expect(screen.getByText("Safety Procedures")).toBeInTheDocument());
    expect(screen.getByText("Service Standards")).toBeInTheDocument();
    // Both f1 and f2 have 1 direct doc each
    expect(screen.getAllByText("1 document")).toHaveLength(2);
  });

  it("shows member name in header", async () => {
    mockGetKioskLibrary.mockResolvedValue(SUCCESS_RESPONSE);
    renderWithProviders(<KioskLibrary {...DEFAULT_PROPS} />);
    await waitFor(() => expect(screen.getByText("Jay Crichton")).toBeInTheDocument());
  });

  it("shows Infohub heading at root", async () => {
    mockGetKioskLibrary.mockResolvedValue(SUCCESS_RESPONSE);
    renderWithProviders(<KioskLibrary {...DEFAULT_PROPS} />);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Infohub" })).toBeInTheDocument());
  });
});

// ─── Folder navigation ────────────────────────────────────────────────────────

describe("KioskLibrary folder navigation", () => {
  it("clicking a folder shows its docs", async () => {
    mockGetKioskLibrary.mockResolvedValue(SUCCESS_RESPONSE);
    renderWithProviders(<KioskLibrary {...DEFAULT_PROPS} />);
    await waitFor(() => screen.getByText("Safety Procedures"));
    fireEvent.click(screen.getByTestId("library-folder-f1"));
    expect(screen.getByText("Safety Procedures")).toBeInTheDocument();
    expect(screen.getByText("Allergen Handling")).toBeInTheDocument();
  });

  it("back button from folder returns to root", async () => {
    mockGetKioskLibrary.mockResolvedValue(SUCCESS_RESPONSE);
    renderWithProviders(<KioskLibrary {...DEFAULT_PROPS} />);
    await waitFor(() => screen.getByText("Safety Procedures"));
    fireEvent.click(screen.getByTestId("library-folder-f1"));
    fireEvent.click(screen.getByTestId("library-back-btn"));
    expect(screen.getByRole("heading", { name: "Infohub" })).toBeInTheDocument();
    expect(screen.getByText("Safety Procedures")).toBeInTheDocument();
  });

  it("back button at root calls onBack", async () => {
    mockGetKioskLibrary.mockResolvedValue(SUCCESS_RESPONSE);
    renderWithProviders(<KioskLibrary {...DEFAULT_PROPS} />);
    await waitFor(() => screen.getByRole("heading", { name: "Infohub" }));
    fireEvent.click(screen.getByTestId("library-back-btn"));
    expect(DEFAULT_PROPS.onBack).toHaveBeenCalledTimes(1);
  });

  it("sub-folders inside a folder are shown", async () => {
    mockGetKioskLibrary.mockResolvedValue(SUCCESS_RESPONSE);
    renderWithProviders(<KioskLibrary {...DEFAULT_PROPS} />);
    await waitFor(() => screen.getByText("Safety Procedures"));
    fireEvent.click(screen.getByTestId("library-folder-f1"));
    expect(screen.getByTestId("library-folder-f3")).toBeInTheDocument();
    expect(screen.getByText("Allergen Sub")).toBeInTheDocument();
  });

  it("shows empty message when folder has no content", async () => {
    // f2 has d2, but let's test a folder with no sub-folders and no docs
    const emptyFolderData = {
      data: {
        folders: [{ id: "f-empty", name: "Empty Folder", parent_id: null }],
        documents: [],
      },
      error: null,
    };
    mockGetKioskLibrary.mockResolvedValue(emptyFolderData);
    renderWithProviders(<KioskLibrary {...DEFAULT_PROPS} />);
    await waitFor(() => screen.getByText("Empty Folder"));
    fireEvent.click(screen.getByTestId("library-folder-f-empty"));
    expect(screen.getByText("No documents in this folder.")).toBeInTheDocument();
  });
});

// ─── Document detail ──────────────────────────────────────────────────────────

describe("KioskLibrary document detail", () => {
  it("clicking a doc shows its content", async () => {
    mockGetKioskLibrary.mockResolvedValue(SUCCESS_RESPONSE);
    renderWithProviders(<KioskLibrary {...DEFAULT_PROPS} />);
    await waitFor(() => screen.getByText("Safety Procedures"));
    fireEvent.click(screen.getByTestId("library-folder-f1"));
    fireEvent.click(screen.getByTestId("library-doc-d1"));
    expect(screen.getByText("Allergen Handling")).toBeInTheDocument();
    expect(screen.getByText("How to handle allergens.")).toBeInTheDocument();
    expect(screen.getByText("Step 1.")).toBeInTheDocument();
    expect(screen.getByText("Step 2.")).toBeInTheDocument();
  });

  it("shows tags on document detail", async () => {
    mockGetKioskLibrary.mockResolvedValue(SUCCESS_RESPONSE);
    renderWithProviders(<KioskLibrary {...DEFAULT_PROPS} />);
    await waitFor(() => screen.getByText("Safety Procedures"));
    fireEvent.click(screen.getByTestId("library-folder-f1"));
    fireEvent.click(screen.getByTestId("library-doc-d1"));
    expect(screen.getByText("Safety")).toBeInTheDocument();
  });

  it("back from doc returns to folder", async () => {
    mockGetKioskLibrary.mockResolvedValue(SUCCESS_RESPONSE);
    renderWithProviders(<KioskLibrary {...DEFAULT_PROPS} />);
    await waitFor(() => screen.getByText("Safety Procedures"));
    fireEvent.click(screen.getByTestId("library-folder-f1"));
    fireEvent.click(screen.getByTestId("library-doc-d1"));
    fireEvent.click(screen.getByTestId("library-back-btn"));
    expect(screen.getByText("Allergen Handling")).toBeInTheDocument();
    expect(screen.queryByText("Step 1.")).not.toBeInTheDocument();
  });

  it("shows attachment note for docs with filePath", async () => {
    mockGetKioskLibrary.mockResolvedValue(SUCCESS_RESPONSE);
    renderWithProviders(<KioskLibrary {...DEFAULT_PROPS} />);
    await waitFor(() => screen.getByText("Safety Procedures"));
    fireEvent.click(screen.getByTestId("library-folder-f1"));
    fireEvent.click(screen.getByTestId("library-folder-f3"));
    fireEvent.click(screen.getByTestId("library-doc-d3"));
    expect(screen.getByText(/Open in admin panel to download/)).toBeInTheDocument();
  });

  it("does not show attachment block when no filePath", async () => {
    mockGetKioskLibrary.mockResolvedValue(SUCCESS_RESPONSE);
    renderWithProviders(<KioskLibrary {...DEFAULT_PROPS} />);
    await waitFor(() => screen.getByText("Safety Procedures"));
    fireEvent.click(screen.getByTestId("library-folder-f1"));
    fireEvent.click(screen.getByTestId("library-doc-d1"));
    expect(screen.queryByText(/Open in admin panel/)).not.toBeInTheDocument();
  });
});

// ─── null memberId (staff profile) ───────────────────────────────────────────

describe("KioskLibrary with null memberId", () => {
  it("still fetches and renders with null memberId", async () => {
    mockGetKioskLibrary.mockResolvedValue(SUCCESS_RESPONSE);
    renderWithProviders(
      <KioskLibrary {...DEFAULT_PROPS} memberId={null} memberName="Staff Member" />,
    );
    await waitFor(() => expect(screen.getByText("Safety Procedures")).toBeInTheDocument());
    expect(screen.getByText("Staff Member")).toBeInTheDocument();
  });
});

// ─── Library / Training sections ─────────────────────────────────────────────

describe("KioskLibrary Library/Training sections", () => {
  const MIXED_RESPONSE = {
    data: {
      folders: [
        { id: "f1", name: "Safety Procedures", parent_id: null, section: "library" },
        { id: "t1", name: "Onboarding", parent_id: null, section: "training" },
      ],
      documents: [
        { id: "d1", title: "Allergen Handling", summary: "How to handle allergens.", body: "", folder_id: "f1", section: "library", metadata: {} },
        { id: "td1", title: "Opening the bar", summary: "", body: "", folder_id: "t1", section: "training", metadata: { duration: "10 min", steps: ["Unlock the shutters", "Check the fridges"] } },
      ],
    },
    error: null,
  };

  it("shows Library by default and switches to Training, keeping sections apart", async () => {
    mockGetKioskLibrary.mockResolvedValue(MIXED_RESPONSE);
    renderWithProviders(<KioskLibrary {...DEFAULT_PROPS} />);
    await waitFor(() => expect(screen.getByText("Safety Procedures")).toBeInTheDocument());
    expect(screen.queryByText("Onboarding")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("infohub-tab-training"));
    expect(screen.getByText("Onboarding")).toBeInTheDocument();
    expect(screen.queryByText("Safety Procedures")).not.toBeInTheDocument();
    expect(screen.getByTestId("infohub-tab-training")).toHaveAttribute("aria-selected", "true");
  });

  it("opens a training doc with its duration and numbered steps", async () => {
    mockGetKioskLibrary.mockResolvedValue(MIXED_RESPONSE);
    renderWithProviders(<KioskLibrary {...DEFAULT_PROPS} />);
    await waitFor(() => screen.getByText("Safety Procedures"));
    fireEvent.click(screen.getByTestId("infohub-tab-training"));
    fireEvent.click(screen.getByTestId("library-folder-t1"));
    expect(screen.getByText("10 min")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("library-doc-td1"));
    expect(screen.getByRole("heading", { name: "Opening the bar" })).toBeInTheDocument();
    expect(screen.getByText("Unlock the shutters")).toBeInTheDocument();
    expect(screen.getByText("Check the fridges")).toBeInTheDocument();
    expect(screen.queryByTestId("infohub-tab-training")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("library-back-btn"));
    fireEvent.click(screen.getByTestId("library-back-btn"));
    expect(screen.getByTestId("library-folder-t1")).toBeInTheDocument();
    expect(screen.getByTestId("infohub-tab-training")).toHaveAttribute("aria-selected", "true");
  });

  it("shows a training empty state when nothing is shared with this member", async () => {
    mockGetKioskLibrary.mockResolvedValue(SUCCESS_RESPONSE);
    renderWithProviders(<KioskLibrary {...DEFAULT_PROPS} />);
    await waitFor(() => screen.getByText("Safety Procedures"));
    fireEvent.click(screen.getByTestId("infohub-tab-training"));
    expect(screen.getByText("No training available.")).toBeInTheDocument();
  });
});

// ─── Training completion ─────────────────────────────────────────────────────

describe("KioskLibrary training completion", () => {
  const TRAINING_RESPONSE = {
    data: {
      folders: [{ id: "t1", name: "Bar Training", parent_id: null, section: "training" }],
      documents: [
        { id: "td1", title: "Opening the bar", summary: "", body: "", folder_id: "t1", section: "training", metadata: { duration: "10 min", steps: ["Unlock", "Check fridges"] } },
        { id: "td2", title: "Cocktail basics", summary: "", body: "", folder_id: "t1", section: "training", metadata: { steps: ["Jigger"] } },
      ],
    },
    error: null,
  };

  const openTraining = async () => {
    await waitFor(() => screen.getByTestId("infohub-tab-training"));
    fireEvent.click(screen.getByTestId("infohub-tab-training"));
  };

  it("shows the member's completed count on folders and a check on completed docs", async () => {
    mockGetKioskLibrary.mockResolvedValue(TRAINING_RESPONSE);
    mockGetProgress.mockResolvedValue({ data: [{ module_id: "td1", is_completed: true, completed_step_indices: [0, 1] }], error: null });
    renderWithProviders(<KioskLibrary {...DEFAULT_PROPS} />);
    await openTraining();
    await waitFor(() => expect(screen.getByText("1 of 2 completed")).toBeInTheDocument());
    expect(mockGetProgress).toHaveBeenCalledWith(expect.objectContaining({ p_team_member_id: "tm-1", p_kiosk_token: "test-token" }));

    fireEvent.click(screen.getByTestId("library-folder-t1"));
    expect(screen.getByTestId("library-doc-done-td1")).toBeInTheDocument();
    expect(screen.queryByTestId("library-doc-done-td2")).not.toBeInTheDocument();
  });

  it("marks a training doc complete, then undoes it", async () => {
    mockGetKioskLibrary.mockResolvedValue(TRAINING_RESPONSE);
    renderWithProviders(<KioskLibrary {...DEFAULT_PROPS} />);
    await openTraining();
    fireEvent.click(screen.getByTestId("library-folder-t1"));
    fireEvent.click(screen.getByTestId("library-doc-td2"));

    fireEvent.click(screen.getByTestId("training-complete-btn"));
    await waitFor(() => expect(screen.getByTestId("training-undo-btn")).toBeInTheDocument());
    expect(mockSetComplete).toHaveBeenCalledWith({
      p_location_id: "loc-1", p_team_member_id: "tm-1", p_kiosk_token: "test-token", p_document_id: "td2", p_completed: true,
    });

    fireEvent.click(screen.getByTestId("training-undo-btn"));
    await waitFor(() => expect(screen.getByTestId("training-complete-btn")).toBeInTheDocument());
    expect(mockSetComplete).toHaveBeenLastCalledWith(expect.objectContaining({ p_document_id: "td2", p_completed: false }));
  });

  it("keeps the doc incomplete and shows an error when saving fails", async () => {
    mockGetKioskLibrary.mockResolvedValue(TRAINING_RESPONSE);
    mockSetComplete.mockResolvedValue({ data: null, error: { message: "not allowed" } });
    renderWithProviders(<KioskLibrary {...DEFAULT_PROPS} />);
    await openTraining();
    fireEvent.click(screen.getByTestId("library-folder-t1"));
    fireEvent.click(screen.getByTestId("library-doc-td1"));
    fireEvent.click(screen.getByTestId("training-complete-btn"));
    await waitFor(() => expect(screen.getByText(/Couldn't save/)).toBeInTheDocument());
    expect(screen.getByTestId("training-complete-btn")).toBeInTheDocument();
  });

  it("is read-only when no member identified: no button, no progress lookup", async () => {
    mockGetKioskLibrary.mockResolvedValue(TRAINING_RESPONSE);
    renderWithProviders(<KioskLibrary {...DEFAULT_PROPS} memberId={null} memberName="Staff Member" />);
    await openTraining();
    expect(screen.getByText("2 documents")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("library-folder-t1"));
    fireEvent.click(screen.getByTestId("library-doc-td1"));
    expect(screen.queryByTestId("training-complete-btn")).not.toBeInTheDocument();
    expect(mockGetProgress).not.toHaveBeenCalled();
  });

  it("doesn't offer completion on library docs", async () => {
    mockGetKioskLibrary.mockResolvedValue(SUCCESS_RESPONSE);
    renderWithProviders(<KioskLibrary {...DEFAULT_PROPS} />);
    await waitFor(() => screen.getByText("Safety Procedures"));
    fireEvent.click(screen.getByTestId("library-folder-f2"));
    fireEvent.click(screen.getByTestId("library-doc-d2"));
    expect(screen.queryByTestId("training-complete-btn")).not.toBeInTheDocument();
  });
});
