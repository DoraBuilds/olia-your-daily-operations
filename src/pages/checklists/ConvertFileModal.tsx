import { useState, useEffect } from "react";
import { X, FileUp, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import type { SectionDef } from "./types";
import pdfjsWorkerSrc from "pdfjs-dist/build/pdf.worker.mjs?url";

/** Reads a file as a base64-encoded string. */
async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

/** Extracts text from a PDF using pdfjs-dist (client-side, no API required). */
async function extractPdfText(file: File): Promise<string> {
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerSrc;
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
}

/** Extracts readable text from CSV/Excel/PDF files. For images, returns base64 for Claude's vision API. */
async function extractFileContent(file: File): Promise<
  | { type: "text"; content: string }
  | { type: "document"; base64: string; mediaType: string }
> {
  if (/\.(csv|xlsx|xls)$/i.test(file.name)) {
    const XLSX = await import("xlsx");
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });
    let content = "";
    workbook.SheetNames.forEach(sheet => {
      content += `Sheet: ${sheet}\n`;
      content += XLSX.utils.sheet_to_csv(workbook.Sheets[sheet]) + "\n\n";
    });
    return { type: "text", content: content.trim() || `File: ${file.name}` };
  }
  if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
    const text = await extractPdfText(file);
    return { type: "text", content: text || `File: ${file.name}` };
  }
  // Images — send as vision document
  const base64 = await fileToBase64(file);
  return { type: "document", base64, mediaType: file.type || "image/jpeg" };
}

function humanizeConvertError(msg: string): string {
  if (!msg) return "Something went wrong. Please try again.";
  // Pass Anthropic errors through so we can see the actual message
  if (msg.startsWith("Anthropic ")) return msg;
  const l = msg.toLowerCase();
  if (l.includes("quota") || l.includes("billing") || l.includes("credit") || l.includes("rate limit") || l.includes("429")) {
    return "AI service quota reached. Please try again later or contact support.";
  }
  if (l.includes("non-2xx") || l.includes("edge function") || l.includes("500") || l.includes("502") || l.includes("503") || l.includes("unavailable")) {
    return "The AI service is temporarily unavailable. Please try again in a moment.";
  }
  if (l.includes("parse") || l.includes("corrupt") || l.includes("invalid file") || l.includes("unsupported")) {
    return "Could not read this file. Try saving as .xlsx or .csv and uploading again.";
  }
  if (l.includes("unexpected response") || l.includes("invalid json") || l.includes("not an array")) {
    return "The AI returned an unexpected response. Please try again.";
  }
  if (l.includes("network") || l.includes("fetch")) {
    return "Network error. Check your connection and try again.";
  }
  return "Something went wrong. Please try again.";
}

export function ConvertFileModal({ onClose, onConvert }: { onClose: () => void; onConvert: (sections: SectionDef[]) => void }) {
  const [dragOver, setDragOver] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [converting, setConverting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const handleFile = (f: File) => {
    setFile(f);
    setError(null);
  };

  const handleConvert = async () => {
    if (!file) return;
    setConverting(true);
    setError(null);
    try {
      const extracted = await extractFileContent(file);
      const body = extracted.type === "text"
        ? { mode: "file", content: extracted.content }
        : { mode: "document", fileBase64: extracted.base64, fileType: extracted.mediaType };
      const { data, error: fnError } = await supabase.functions.invoke(
        "generate-checklist",
        { body }
      );
      if (fnError) throw new Error(fnError.message);
      if (data?.error) throw new Error(data.error);

      const { sections } = data as { sections: SectionDef[] };
      if (!Array.isArray(sections)) throw new Error("Unexpected response from AI. Please try again.");
      onConvert(sections);
      onClose();
    } catch (e: any) {
      setError(humanizeConvertError(e?.message ?? ""));
    } finally {
      setConverting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-foreground/20 p-4 backdrop-blur-sm animate-fade-in sm:p-6"
      onClick={onClose}
    >
      <div
        className="bg-card w-full max-w-3xl rounded-2xl p-5 pb-safe shadow-2xl space-y-5 animate-fade-in sm:rounded-3xl sm:p-6"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg text-foreground">Convert file to checklist</h2>
          <button
            onClick={onClose}
            className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-muted hover:bg-muted/80 transition-colors text-xs font-medium text-muted-foreground"
          >
            <X size={14} />
            Close
          </button>
        </div>
        <p className="text-sm text-muted-foreground">Upload an Excel, PDF, or image file and we'll convert it into a checklist.</p>
        <div
          data-testid="convert-drop-zone"
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
          className={cn(
            "border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer",
            dragOver ? "border-sage bg-sage-light/30" : "border-border hover:border-sage/40"
          )}
          onClick={() => {
            const input = document.createElement("input");
            input.type = "file";
            input.accept = ".xlsx,.xls,.csv,.pdf,.png,.jpg,.jpeg";
            input.onchange = e => {
              const f = (e.target as HTMLInputElement).files?.[0];
              if (f) handleFile(f);
            };
            input.click();
          }}
        >
          <FileUp size={32} className="mx-auto text-muted-foreground mb-3" />
          {file ? (
            <p className="text-sm font-medium text-foreground">{file.name}</p>
          ) : (
            <>
              <p className="text-sm font-medium text-foreground">Tap to select a file</p>
              <p className="text-xs text-muted-foreground mt-1">Excel, PDF, or image · Max 10MB</p>
            </>
          )}
        </div>
        {error && (
          <div className="flex items-start gap-2 text-status-error text-xs">
            <AlertCircle size={14} className="shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}
        <button
          disabled={!file || converting}
          onClick={handleConvert}
          className={cn("w-full py-3 rounded-xl text-sm font-medium transition-colors",
            file && !converting ? "bg-sage text-primary-foreground hover:bg-sage-deep" : "bg-muted text-muted-foreground cursor-not-allowed"
          )}
        >
          {converting ? "Converting…" : "Convert to checklist"}
        </button>
      </div>
    </div>
  );
}
