import { ensurePromiseWithResolvers } from "./promise-with-resolvers-polyfill";

/** Extracts text from a PDF using pdfjs-dist (client-side, no API required). */
export async function extractPdfText(file: File): Promise<string> {
  // pdfjs-dist calls Promise.withResolvers(), unsupported before Safari 17.4.
  ensurePromiseWithResolvers();
  const pdfjsLib = await import("pdfjs-dist");
  // Create the Worker ourselves so Vite bundles it with the right URL and Safari
  // doesn't have to handle pdf.js's internal new Worker() call, which fails on Safari
  // when loading an ES-module worker from a path-relative URL. Routed through our
  // own entry file (rather than pdf.worker.min.mjs directly) so the same
  // Promise.withResolvers polyfill applies inside the worker's own global scope.
  const worker = new Worker(
    new URL("./pdf-worker-entry.ts", import.meta.url),
    { type: "module" }
  );
  pdfjsLib.GlobalWorkerOptions.workerPort = worker;
  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let text = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      text += content.items
        .filter((item: any) => "str" in item)
        .map((item: any) => item.str)
        .join(" ") + "\n";
    }
    return text.trim();
  } finally {
    worker.terminate();
    pdfjsLib.GlobalWorkerOptions.workerPort = null;
  }
}

export const DOCX_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
/** Legacy binary Word format — can't be read in the browser. */
export const DOC_TYPE = "application/msword";

/** Types with no text layer we can read locally; the infohub-ocr edge function transcribes these. */
export function needsOcr(fileType: string): boolean {
  return fileType === "application/pdf" || /^image\/(jpeg|png|webp)$/.test(fileType);
}

async function extractDocxText(file: Blob): Promise<string> {
  const mammoth = await import("mammoth");
  const { value } = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
  return value;
}

/** Max characters of extracted text stored on a document body. */
const MAX_BODY_CHARS = 100_000;

/**
 * Best-effort text extraction for Info Hub uploads so the AI tools have something to read.
 * Returns "" for unsupported types or files with no text layer (e.g. scanned PDFs) — never throws.
 */
export async function extractUploadText(file: Blob, fileType: string): Promise<string> {
  try {
    let text = "";
    if (fileType === "application/pdf") {
      text = await extractPdfText(file as File);
    } else if (fileType === "text/plain") {
      text = await file.text();
    } else if (fileType === DOCX_TYPE) {
      text = await extractDocxText(file);
    }
    return text.trim().slice(0, MAX_BODY_CHARS);
  } catch {
    return "";
  }
}
