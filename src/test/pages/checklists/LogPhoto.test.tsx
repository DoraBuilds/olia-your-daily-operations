import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { LogPhoto } from "@/pages/checklists/LogPhoto";
import { LogDetailModal } from "@/pages/checklists/LogDetailModal";

const mockCreateSignedUrl = vi.fn();

vi.mock("@/lib/supabase", () => ({
  supabase: { storage: { from: () => ({ createSignedUrl: mockCreateSignedUrl }) } },
}));
vi.mock("@/lib/export-utils", () => ({ exportLogDetailPdf: vi.fn() }));

const PATH = "org-1/loc-1/1790000000000_q1.jpg";

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
}

describe("LogPhoto", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateSignedUrl.mockImplementation((_path: string, _exp: number, opts?: { download?: string }) =>
      Promise.resolve({ data: { signedUrl: opts?.download ? "https://signed/download" : "https://signed/view" }, error: null }));
  });

  it("shows a placeholder while signing, then the thumbnail", async () => {
    const view = deferred<any>();
    mockCreateSignedUrl.mockImplementation((_p: string, _e: number, opts?: any) =>
      opts?.download ? Promise.resolve({ data: { signedUrl: "https://signed/download" } }) : view.promise);

    render(<LogPhoto value={PATH} label="Fridge photo" />);
    expect(screen.getByTestId("log-photo-loading")).toBeInTheDocument();

    view.resolve({ data: { signedUrl: "https://signed/view" }, error: null });
    const img = await screen.findByAltText("Fridge photo");
    expect(img).toHaveAttribute("src", "https://signed/view");
    expect(screen.queryByTestId("log-photo-loading")).not.toBeInTheDocument();
    expect(mockCreateSignedUrl).toHaveBeenCalledWith(PATH, 3600);
  });

  it("opens a full-size view with a download link, and closes it", async () => {
    render(<LogPhoto value={PATH} label="Fridge photo" />);
    fireEvent.click(await screen.findByRole("button", { name: /view photo/i }));

    const dialog = screen.getByRole("dialog", { name: "Fridge photo" });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /download/i })).toHaveAttribute("href", "https://signed/download");
    expect(mockCreateSignedUrl).toHaveBeenCalledWith(PATH, 3600, { download: "1790000000000_q1.jpg" });

    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("says 'Photo unavailable' when a recent photo can't be loaded", async () => {
    mockCreateSignedUrl.mockResolvedValue({ data: null, error: { message: "Object not found" } });
    render(<LogPhoto value={PATH} label="Fridge photo" takenAt={new Date().toISOString()} />);
    expect(await screen.findByText("Photo unavailable")).toBeInTheDocument();
  });

  it("explains the 2-year deletion when an old photo is gone", async () => {
    mockCreateSignedUrl.mockResolvedValue({ data: null, error: { message: "Object not found" } });
    render(<LogPhoto value={PATH} label="Fridge photo" takenAt="2023-01-10T08:00:00Z" />);
    expect(await screen.findByText("Photo deleted after 2 years")).toBeInTheDocument();
  });

  it("shows legacy base64 photos directly, without signing", async () => {
    render(<LogPhoto value="data:image/jpeg;base64,abc" label="Old photo" />);
    expect(await screen.findByAltText("Old photo")).toHaveAttribute("src", "data:image/jpeg;base64,abc");
    expect(mockCreateSignedUrl).not.toHaveBeenCalled();
  });
});

describe("LogDetailModal — kiosk photo answers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateSignedUrl.mockResolvedValue({ data: { signedUrl: "https://signed/view" }, error: null });
  });

  it("renders a kiosk 'media' answer as a photo thumbnail", async () => {
    render(
      <LogDetailModal
        onClose={vi.fn()}
        log={{
          id: "l1", checklist: "Opening", completedBy: "Ana", date: "Today", score: 100, type: "opening",
          answers: [{ label: "Photo required: Fridge OK?", type: "media", answer: PATH, hasPhoto: true } as any],
        }}
      />,
    );
    await waitFor(() => expect(screen.getByAltText("Photo required: Fridge OK?")).toHaveAttribute("src", "https://signed/view"));
    expect(screen.queryByText("No photo attached")).not.toBeInTheDocument();
  });
});
