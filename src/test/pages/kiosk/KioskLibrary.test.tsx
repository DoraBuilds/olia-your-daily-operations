import { screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { KioskLibrary } from "@/pages/kiosk/KioskLibrary";
import { renderWithProviders } from "../../test-utils";

// ─── Supabase mock ────────────────────────────────────────────────────────────
const mockGetKioskLibrary = vi.fn();

vi.mock("@/lib/supabase", () => ({
  supabase: {
    rpc: vi.fn().mockImplementation((fn: string, _params?: unknown) => {
      if (fn === "get_kiosk_library") return mockGetKioskLibrary();
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
  DEFAULT_PROPS.onBack = vi.fn();
});

// ─── Loading + error states ───────────────────────────────────────────────────

describe("KioskLibrary loading and error", () => {
  it("shows loading state initially", () => {
    mockGetKioskLibrary.mockReturnValue(new Promise(() => {}));
    renderWithProviders(<KioskLibrary {...DEFAULT_PROPS} />);
    expect(screen.getByText("Loading library…")).toBeInTheDocument();
  });

  it("shows error message on RPC failure", async () => {
    mockGetKioskLibrary.mockResolvedValue(ERROR_RESPONSE);
    renderWithProviders(<KioskLibrary {...DEFAULT_PROPS} />);
    await waitFor(() => expect(screen.getByText(/Could not load library/)).toBeInTheDocument());
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

  it("shows Staff Library heading at root", async () => {
    mockGetKioskLibrary.mockResolvedValue(SUCCESS_RESPONSE);
    renderWithProviders(<KioskLibrary {...DEFAULT_PROPS} />);
    await waitFor(() => expect(screen.getByText("Staff Library")).toBeInTheDocument());
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
    expect(screen.getByText("Staff Library")).toBeInTheDocument();
    expect(screen.getByText("Safety Procedures")).toBeInTheDocument();
  });

  it("back button at root calls onBack", async () => {
    mockGetKioskLibrary.mockResolvedValue(SUCCESS_RESPONSE);
    renderWithProviders(<KioskLibrary {...DEFAULT_PROPS} />);
    await waitFor(() => screen.getByText("Staff Library"));
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
