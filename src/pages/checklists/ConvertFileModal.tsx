import { useState, useEffect } from "react";
import { X, FileUp, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import * as XLSX from "xlsx";
import { supabase } from "@/lib/supabase";
import type { SectionDef } from "./types";

/** Extracts readable text from CSV/Excel files using SheetJS. For PDF/images, returns the filename as context. */
async function extractFileContent(file: File): Promise<string> {
  if (/\.(csv|xlsx|xls)$/i.test(file.name)) {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });
    let content = "";
    workbook.SheetNames.forEach(sheet => {
      content += `Sheet: ${sheet}\n`;
      content += XLSX.utils.sheet_to_csv(workbook.Sheets[sheet]) + "\n\n";
    });
    return content.trim() || `File: ${file.name}`;
  }
  // PDF / images: send filename + type as context — Claude can still generate a relevant checklist
  return `Document: "${file.name}" (${file.type || "unknown type"}) — generate a practical hospitality operations checklist based on this document's name and type.`;
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
      const content = await extractFileContent(file);
      const { data, error: fnError } = await supabase.functions.invoke(
        "generate-checklist",
        { body: { mode: "file", content } }
      );
      if (fnError) throw new Error(fnError.message);
      if (data?.error) throw new Error(data.error);

      const { sections } = data as { sections: SectionDef[] };
      if (!Array.isArray(sections)) throw new Error("Unexpected response from AI. Please try again.");
      onConvert(sections);
      onClose();
    } catch (e: any) {
      setError(e?.message ?? "Something went wrong. Please try again.");
    } finally {
      setConverting(false);
    }
  };

  return (
    // No pb-16 on outer wrapper — that created a dead zone covered by the bottom nav.
    // The card itself has pb-safe to clear nav on mobile.
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-foreground/20 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div className="bg-card w-full rounded-t-2xl p-5 pb-safe space-y-5 animate-fade-in" onClick={e => e.stopPropagation()}>
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
