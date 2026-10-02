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

vi.mock("mammoth", () => ({ extractRawText: async () => ({ value: "  Word body  " }) }));

class FakeWorker { terminate() {} }
vi.stubGlobal("Worker", FakeWorker);

import { DOCX_TYPE, extractUploadText, needsOcr } from "@/lib/file-text";

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

  it("extracts text from .docx files", async () => {
    const blob = { arrayBuffer: async () => new ArrayBuffer(1) } as unknown as Blob;
    expect(await extractUploadText(blob, DOCX_TYPE)).toBe("Word body");
  });
});

describe("needsOcr", () => {
  it("is true for PDFs and photos, false for text and Word", () => {
    expect(needsOcr("application/pdf")).toBe(true);
    expect(needsOcr("image/jpeg")).toBe(true);
    expect(needsOcr("text/plain")).toBe(false);
    expect(needsOcr(DOCX_TYPE)).toBe(false);
  });
});
