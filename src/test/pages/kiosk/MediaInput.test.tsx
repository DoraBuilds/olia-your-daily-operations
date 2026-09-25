import { useState } from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MediaInput } from "@/pages/kiosk/QuestionInputs";

// ─── Supabase storage mock ────────────────────────────────────────────────────
// Mirrors production: the anonymous kiosk can upload to kiosk-photos but can't
// sign a URL for it (SELECT is managers-only), so createSignedUrl comes back empty.
const mockUpload = vi.fn();
const mockCreateSignedUrl = vi.fn();

vi.mock("@/lib/supabase", () => ({
  supabase: {
    storage: {
      from: () => ({ upload: mockUpload, createSignedUrl: mockCreateSignedUrl }),
    },
  },
}));

const CAPTURED_DATA_URL = "data:image/jpeg;base64,captured";

function Harness({ initial = "" }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return <MediaInput value={value} onChange={setValue} organizationId="org" locationId="loc" questionId="q1" />;
}

describe("MediaInput", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpload.mockResolvedValue({ data: { path: "org/loc/1_q1.jpg" }, error: null });
    mockCreateSignedUrl.mockResolvedValue({ data: null, error: { message: "Object not found" } });

    const track = { stop: vi.fn() };
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [track] }) },
    });
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage: vi.fn() } as never);
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue(CAPTURED_DATA_URL);
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (cb: BlobCallback) {
      cb(new Blob(["x"], { type: "image/jpeg" }));
    });
  });

  it("previews the captured photo after upload without needing a signed URL", async () => {
    render(<Harness />);
    fireEvent.click(screen.getByText("Take photo"));
    fireEvent.click(await screen.findByRole("button", { name: /capture photo/i }));
    fireEvent.click(await screen.findByRole("button", { name: /use photo/i }));

    const img = await screen.findByAltText("Captured");
    expect(img).toHaveAttribute("src", CAPTURED_DATA_URL);
    expect(mockUpload).toHaveBeenCalledTimes(1);
    expect(mockCreateSignedUrl).not.toHaveBeenCalled();
    expect(screen.queryByText("Loading photo…")).not.toBeInTheDocument();
  });

  it("stops showing 'Loading photo…' when a stored photo can't be signed", async () => {
    render(<Harness initial="org/loc/older_q1.jpg" />);
    await waitFor(() => expect(screen.getByText("Photo saved")).toBeInTheDocument());
    expect(screen.queryByText("Loading photo…")).not.toBeInTheDocument();
    expect(screen.getByText("Photo attached")).toBeInTheDocument();
  });
});
