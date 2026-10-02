import { useEffect, useRef, useState } from "react";
import { ensurePromiseWithResolvers } from "@/lib/promise-with-resolvers-polyfill";

/**
 * Renders every page of a PDF as a canvas in a scrollable column. iOS Safari
 * only shows page 1 of a PDF inside an <iframe> and can't scroll to the rest,
 * so we draw the pages ourselves with pdfjs-dist. Falls back to the iframe if
 * the file can't be fetched or parsed.
 */
export function PdfPages({ url, title }: { url: string; title: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");

  useEffect(() => {
    let cancelled = false;
    let worker: Worker | null = null;
    let pdfjsLib: typeof import("pdfjs-dist") | null = null;
    const container = containerRef.current;

    (async () => {
      try {
        ensurePromiseWithResolvers();
        pdfjsLib = await import("pdfjs-dist");
        worker = new Worker(new URL("../../lib/pdf-worker-entry.ts", import.meta.url), { type: "module" });
        pdfjsLib.GlobalWorkerOptions.workerPort = worker;

        const res = await fetch(url);
        if (!res.ok) throw new Error(`fetch ${res.status}`);
        const pdf = await pdfjsLib.getDocument({ data: await res.arrayBuffer() }).promise;

        const width = Math.max((container?.clientWidth ?? 800) - 2, 300);
        const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
        for (let i = 1; i <= pdf.numPages; i++) {
          if (cancelled) return;
          const page = await pdf.getPage(i);
          const base = page.getViewport({ scale: 1 });
          const viewport = page.getViewport({ scale: (width / base.width) * dpr });
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.style.width = "100%";
          canvas.style.height = "auto";
          canvas.className = "bg-white rounded-lg";
          container?.appendChild(canvas);
          await page.render({ canvasContext: canvas.getContext("2d")!, viewport, canvas }).promise;
          if (i === 1) setStatus("ready");
        }
        if (!cancelled) setStatus("ready");
      } catch {
        if (!cancelled) setStatus("failed");
      }
    })();

    return () => {
      cancelled = true;
      container?.replaceChildren();
      worker?.terminate();
      if (pdfjsLib) pdfjsLib.GlobalWorkerOptions.workerPort = null;
    };
  }, [url]);

  if (status === "failed") {
    return <iframe src={url} title={title} className="w-full h-full rounded-xl shadow-lg bg-white" />;
  }

  return (
    <div className="w-full h-full overflow-y-auto overscroll-contain touch-pan-y [-webkit-overflow-scrolling:touch] [transform:translateZ(0)]" data-testid="pdf-pages">
      <div ref={containerRef} className="max-w-3xl mx-auto flex flex-col gap-3 pb-4" />
      {status === "loading" && <p className="text-sm text-background text-center py-8">…</p>}
    </div>
  );
}
