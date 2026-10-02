import { describe, it, expect, vi } from "vitest";

vi.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: {},
  getDocument: () => ({
    promise: Promise.resolve({
      numPages: 2,
      getPage: async (n: number) => ({
        getTextContent: async () => ({ items: [{ str: `Page ${n}` }, { str: "text" }] }),
      }),
    }),
  }),
}));

class FakeWorker { terminate() {} }
vi.stubGlobal("Worker", FakeWorker);

import { extractUploadText } from "@/lib/file-text";

describe("extractUploadText", () => {
  it("extracts text from every PDF page", async () => {
    const blob = { arrayBuffer: async () => new ArrayBuffer(1) } as unknown as Blob;
    expect(await extractUploadText(blob, "application/pdf")).toBe("Page 1 text\nPage 2 text");
  });

  it("reads plain text files", async () => {
    const blob = { text: async () => "  hello  " } as unknown as Blob;
    expect(await extractUploadText(blob, "text/plain")).toBe("hello");
  });

  it("returns empty string for unsupported types", async () => {
    expect(await extractUploadText(new Blob(["x"]), "image/png")).toBe("");
  });

  it("never throws when extraction fails", async () => {
    const bad = { arrayBuffer: () => Promise.reject(new Error("boom")) } as unknown as Blob;
    expect(await extractUploadText(bad, "application/pdf")).toBe("");
  });
});
