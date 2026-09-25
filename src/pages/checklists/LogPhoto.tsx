import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { subYears } from "date-fns";
import { Camera, Download, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { detectPhotoFormat } from "@/pages/kiosk/QuestionInputs";

// Checklist photos are deleted 2 years after they're taken (cleanup-media,
// Privacy Policy §5). A log older than that whose photo can't be loaded
// gets an explanation rather than a generic "unavailable".
const PHOTO_RETENTION_YEARS = 2;

type PhotoState =
  | { status: "loading" }
  | { status: "ready"; url: string; downloadUrl: string }
  | { status: "missing" };

async function signPhoto(path: string) {
  const bucket = supabase.storage.from("kiosk-photos");
  const [view, download] = await Promise.all([
    bucket.createSignedUrl(path, 3600),
    bucket.createSignedUrl(path, 3600, { download: path.split("/").pop() }),
  ]);
  if (!view.data?.signedUrl) return null;
  return { url: view.data.signedUrl, downloadUrl: download.data?.signedUrl ?? view.data.signedUrl };
}

export function LogPhoto({ value, label, takenAt }: { value: string; label: string; takenAt?: string }) {
  const { t } = useTranslation("checklists");
  const [state, setState] = useState<PhotoState>({ status: "loading" });
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const { isBase64, isStoragePath } = detectPhotoFormat(value);
    if (isBase64) { setState({ status: "ready", url: value, downloadUrl: value }); return; }
    if (!isStoragePath) { setState({ status: "missing" }); return; }
    let cancelled = false;
    setState({ status: "loading" });
    signPhoto(value)
      .then(urls => { if (!cancelled) setState(urls ? { status: "ready", ...urls } : { status: "missing" }); })
      .catch(() => { if (!cancelled) setState({ status: "missing" }); });
    return () => { cancelled = true; };
  }, [value]);

  if (state.status === "loading") {
    return <div data-testid="log-photo-loading" className="mt-2 w-32 h-24 rounded-lg bg-muted animate-pulse border border-border" />;
  }

  if (state.status === "missing") {
    const taken = takenAt ? new Date(takenAt) : null;
    const expired = !!taken && !Number.isNaN(taken.getTime()) && taken < subYears(new Date(), PHOTO_RETENTION_YEARS);
    return (
      <div className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-muted border border-border px-3 py-2">
        <Camera size={14} className="text-muted-foreground shrink-0" />
        <span className="text-xs text-muted-foreground">
          {expired ? t("logDetail.photoExpired") : t("logDetail.photoUnavailable")}
        </span>
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("logDetail.viewPhoto")}
        className="mt-2 block w-32 h-24 rounded-lg overflow-hidden border border-border bg-muted hover:opacity-90 transition-opacity"
      >
        <img src={state.url} alt={label} className="w-full h-full object-cover" />
      </button>

      {open && createPortal(
        <div
          className="fixed inset-0 z-[70] flex flex-col items-center justify-center gap-3 bg-foreground/80 backdrop-blur-sm p-4 animate-fade-in"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-label={label}
        >
          <div className="flex max-w-3xl flex-col items-end gap-3" onClick={e => e.stopPropagation()}>
          <div className="flex items-center gap-2">
            <a
              href={state.downloadUrl}
              download
              className="flex items-center gap-1.5 text-xs font-medium text-background px-3 py-1.5 rounded-full border border-background/40 hover:bg-background/10 transition-colors"
            >
              <Download size={12} /> {t("logDetail.downloadPhoto")}
            </a>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label={t("close")}
              className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-background/10 transition-colors"
            >
              <X size={18} className="text-background" />
            </button>
          </div>
          <img src={state.url} alt={label} className="max-w-full max-h-[80vh] rounded-xl object-contain" />
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
