import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
vi.mock("@/lib/supabase", () => ({ supabase: { functions: { invoke: (...a: any[]) => invoke(...a) } } }));
const extract = vi.fn();
vi.mock("@/lib/file-text", async (orig) => ({ ...(await orig<typeof import("@/lib/file-text")>()), extractUploadText: (...a: any[]) => extract(...a) }));

import { trainingFromFile } from "@/lib/training-from-file";

const blob = new Blob(["x"]);

describe("trainingFromFile", () => {
  beforeEach(() => { invoke.mockReset(); extract.mockReset(); });

  it("builds steps from locally extracted text without OCR", async () => {
    extract.mockResolvedValue("Clean the grinder");
    invoke.mockResolvedValue({ data: { steps: ["a", "b"], duration: "6 min" }, error: null });
    const res = await trainingFromFile(blob, "org/1.pdf", "application/pdf", "Grinder");
    expect(res).toEqual({ steps: ["a", "b"], duration: "6 min" });
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith("generate-training", { body: { mode: "document", title: "Grinder", content: "Clean the grinder" } });
  });

  it("falls back to OCR for a scanned PDF", async () => {
    extract.mockResolvedValue("");
    invoke
      .mockResolvedValueOnce({ data: { text: "scanned text" }, error: null })
      .mockResolvedValueOnce({ data: { steps: ["a"], duration: "5 min" }, error: null });
    await trainingFromFile(blob, "org/1.pdf", "application/pdf", "T");
    expect(invoke.mock.calls[0][0]).toBe("infohub-ocr");
    expect(invoke.mock.calls[1][1].body.content).toBe("scanned text");
  });

  it("rejects legacy .doc and empty files without calling AI", async () => {
    await expect(trainingFromFile(blob, "p", "application/msword", "T")).rejects.toThrow();
    extract.mockResolvedValue("");
    await expect(trainingFromFile(blob, "p", "text/plain", "T")).rejects.toThrow();
    expect(invoke).not.toHaveBeenCalled();
  });

  it("surfaces generation failure", async () => {
    extract.mockResolvedValue("text");
    invoke.mockResolvedValue({ data: { error: "AI features require the Growth plan." }, error: null });
    await expect(trainingFromFile(blob, "p", "text/plain", "T")).rejects.toThrow("Growth plan");
  });
});
