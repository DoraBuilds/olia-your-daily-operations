import { useState, useEffect, useRef } from "react";
import { X, Check } from "lucide-react";
import { cn, blurOnWheel } from "@/lib/utils";
import { sanitizeImageUrl } from "@/lib/sanitize";
import { supabase } from "@/lib/supabase";
import { fitWithin, KIOSK_PHOTO_MAX_DIMENSION } from "@/lib/image-resize";
import type { Question } from "./types";
import { useTranslation } from "react-i18next";
import { translateChoice } from "@/pages/checklists/data";

// ─── Checkbox ─────────────────────────────────────────────────────────────────

export function CheckboxInput({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  const { t } = useTranslation("kiosk");
  return (
    <button
      onClick={() => onChange(!value)}
      className={cn(
        "w-full min-h-[44px] rounded-2xl border-2 px-5 py-4 text-left text-sm font-medium transition-colors flex items-center gap-3",
        value
          ? "bg-sage-light border-sage text-sage-deep"
          : "bg-card border-border text-foreground hover:border-sage/40",
      )}
    >
      <div className={cn(
        "w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors",
        value ? "bg-sage border-sage" : "border-muted-foreground/40",
      )}>
        {value && <Check size={12} className="text-primary-foreground" />}
      </div>
      {value ? t("checkbox.completed") : t("checkbox.tapToConfirm")}
    </button>
  );
}

// ─── Number ───────────────────────────────────────────────────────────────────

export function NumberInput({
  value, onChange, min, max, unit,
}: {
  value: number | "";
  onChange: (v: number | "") => void;
  min?: number;
  max?: number;
  unit?: "C" | "F";
}) {
  const { t } = useTranslation("kiosk");
  const num = value === "" ? 0 : Number(value);
  const hasRange = min != null || max != null;
  const outOfRange = hasRange && value !== "" && (
    (min != null && num < min) || (max != null && num > max)
  );
  return (
    <div className="space-y-1.5">
      <div className="flex items-center">
        <button
          onClick={() => onChange(num - 1)}
          className="w-14 min-h-[44px] bg-muted rounded-l-2xl border border-border text-xl font-semibold text-foreground hover:bg-muted/60 transition-colors flex items-center justify-center"
        >
          −
        </button>
        <input
          type="number"
          onWheel={blurOnWheel}
          value={value}
          onChange={e => onChange(e.target.value === "" ? "" : Number(e.target.value))}
          className={cn(
            "flex-1 min-h-[44px] border-y border-border text-center text-xl font-semibold bg-card focus:outline-none",
            outOfRange && "text-status-error",
          )}
        />
        <button
          onClick={() => onChange(num + 1)}
          className="w-14 min-h-[44px] bg-muted rounded-r-2xl border border-border text-xl font-semibold text-foreground hover:bg-muted/60 transition-colors flex items-center justify-center"
        >
          +
        </button>
      </div>
      {hasRange && (
        <p className={cn(
          "text-[11px] text-center",
          outOfRange ? "text-status-error font-semibold" : "text-muted-foreground",
        )}>
          {outOfRange ? `${t("inputs.outOfRange")} · ` : ""}
          {t("inputs.acceptable", { range: `${min != null ? min : "—"} – ${max != null ? max : "—"}${unit ? ` ${unit}` : ""}` })}
        </p>
      )}
    </div>
  );
}

// ─── Temperature keypad ───────────────────────────────────────────────────────
// The sign is a toggle, not a character: "−" flips the reading at any point, so
// typing "18" for a freezer is fixed with one tap. Readings stop at one decimal.

const TEMPERATURE_MAX_INTEGER_DIGITS = 3;

function splitTemperature(value: number | "") {
  if (value === "" || value == null || !Number.isFinite(Number(value))) return { digits: "", negative: false };
  const rounded = Math.round(Number(value) * 10) / 10;
  return { digits: String(Math.abs(rounded)), negative: rounded < 0 };
}

function joinTemperature(digits: string, negative: boolean): number | "" {
  if (digits === "") return "";
  const magnitude = Number(digits);
  // Avoid storing -0 while "−0" is still being typed towards "−0.5".
  return negative && magnitude !== 0 ? -magnitude : magnitude;
}

export function TemperatureKeypadInput({
  value, onChange, acceptableMin, acceptableMax, unit = "C",
}: {
  value: number | "";
  onChange: (v: number | "") => void;
  acceptableMin?: number;
  acceptableMax?: number;
  unit?: "C" | "F";
}) {
  const { t } = useTranslation("kiosk");
  // What's been typed lives here: "18." and a lone "−" can't round-trip through a number.
  const [entry, setEntry] = useState(() => splitTemperature(value));
  const { digits, negative } = entry;

  // Follow the answer when it changes from outside (draft restore, reset).
  useEffect(() => {
    setEntry(current => (
      joinTemperature(current.digits, current.negative) === value ? current : splitTemperature(value)
    ));
  }, [value]);

  const update = (nextDigits: string, nextNegative: boolean) => {
    setEntry({ digits: nextDigits, negative: nextNegative });
    const next = joinTemperature(nextDigits, nextNegative);
    if (next !== value) onChange(next);
  };

  const pressDigit = (digit: string) => {
    const [whole, decimal] = digits.split(".");
    if (decimal !== undefined) {
      if (decimal.length >= 1) return;
      update(digits + digit, negative);
      return;
    }
    if (whole === "0" || whole === "") { update(digit, negative); return; }
    if (whole.length >= TEMPERATURE_MAX_INTEGER_DIGITS) return;
    update(digits + digit, negative);
  };

  const pressDecimal = () => {
    if (digits.includes(".")) return;
    update(digits === "" ? "0." : `${digits}.`, negative);
  };

  const current = joinTemperature(digits, negative);
  const hasAcceptableRange = acceptableMin != null || acceptableMax != null;
  const outOfRange = hasAcceptableRange && current !== "" && (
    (acceptableMin != null && current < acceptableMin) ||
    (acceptableMax != null && current > acceptableMax)
  );

  const keyClass = "h-14 rounded-2xl bg-white border border-border text-2xl font-light text-foreground flex items-center justify-center transition-all shadow-card active:scale-95 active:shadow-inset active:bg-muted";

  return (
    <div className="space-y-3 px-1">
      <div className="flex items-end justify-center gap-1 py-2" data-testid="temperature-reading">
        <span className={cn(
          "text-6xl font-bold tabular-nums leading-none",
          outOfRange ? "text-status-error" : "text-foreground",
        )}>
          {negative && "−"}{digits === "" ? (negative ? "" : "—") : digits}
        </span>
        <span className={cn(
          "text-2xl font-medium pb-1",
          outOfRange ? "text-status-error" : "text-muted-foreground",
        )}>
          °{unit}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2 max-w-xs mx-auto">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map(digit => (
          <button key={digit} type="button" onClick={() => pressDigit(digit)} className={keyClass}>
            {digit}
          </button>
        ))}
        <button
          type="button"
          onClick={() => update(digits, !negative)}
          aria-label={t("inputs.negative")}
          aria-pressed={negative}
          className={cn(keyClass, negative && "bg-sage border-sage text-primary-foreground active:bg-sage")}
        >
          +/−
        </button>
        <button type="button" onClick={() => pressDigit("0")} className={keyClass}>0</button>
        <button type="button" onClick={pressDecimal} aria-label={t("inputs.decimalPoint")} className={cn(keyClass, "font-semibold")}>
          .
        </button>
      </div>
      <div className="flex justify-center">
        <button
          type="button"
          onClick={() => update(digits.slice(0, -1), negative)}
          disabled={digits === ""}
          aria-label={t("inputs.deleteLastDigit")}
          className="min-h-[44px] px-5 rounded-xl text-sm font-medium text-muted-foreground hover:bg-muted transition-colors disabled:opacity-40"
        >
          ⌫ {t("inputs.delete")}
        </button>
      </div>
      {hasAcceptableRange && (
        <p className={cn(
          "text-[11px] text-center",
          outOfRange ? "text-status-error font-semibold" : "text-muted-foreground",
        )}>
          {outOfRange ? `${t("inputs.outOfRange")} · ` : ""}
          {t("inputs.acceptable", { range: `${acceptableMin != null ? acceptableMin : "—"} – ${acceptableMax != null ? acceptableMax : "—"}°${unit}` })}
        </p>
      )}
    </div>
  );
}

// ─── Text ─────────────────────────────────────────────────────────────────────

export function TextInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useTranslation("kiosk");
  return (
    <textarea
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={t("inputs.textPlaceholder")}
      className="w-full min-h-[130px] border border-border rounded-xl px-4 py-3 text-sm bg-muted focus:outline-none focus:ring-1 focus:ring-ring resize-none"
    />
  );
}

// ─── Multiple choice ──────────────────────────────────────────────────────────

export function MultipleChoiceInput({
  options, optionColors, selectionMode = "single", value, onChange,
}: {
  options: string[];
  optionColors?: string[];
  selectionMode?: "single" | "multiple";
  value: string | string[];
  onChange: (v: string | string[]) => void;
}) {
  useTranslation("checklists"); // re-render on language change (translateChoice reads i18n directly)
  const selected = Array.isArray(value) ? value : value ? [value] : [];

  const toggleOption = (option: string) => {
    if (selectionMode === "multiple") {
      onChange(selected.includes(option)
        ? selected.filter(item => item !== option)
        : [...selected, option]);
      return;
    }
    onChange(option);
  };

  return (
    <div className="space-y-2">
      {options.map((opt, idx) => {
        const isSelected = selected.includes(opt);
        const isNoOption = isSelected && !optionColors?.[idx] && opt.toLowerCase() === "no";
        return (
          <button
            key={opt}
            type="button"
            onClick={() => toggleOption(opt)}
            className={cn(
              "w-full min-h-[56px] rounded-xl border-2 px-4 py-3 text-sm text-left font-medium transition-colors",
              isSelected
                ? isNoOption
                  ? "bg-status-warn/10 border-status-warn text-status-warn"
                  : "border-sage text-sage-deep"
                // Hover only on devices that really hover: on a tablet the
                // finger's last tap position keeps :hover stuck, so the same
                // slot on the next question (often "No") looked pre-highlighted.
                : "bg-card border-border text-foreground [@media(hover:hover)]:hover:border-sage/40",
              isSelected && optionColors?.[idx],
              isSelected && !optionColors?.[idx] && !isNoOption && "bg-sage-light",
            )}
          >
            {translateChoice(opt)}
          </button>
        );
      })}
    </div>
  );
}

// ─── DateTime ─────────────────────────────────────────────────────────────────

export function DateTimeInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useTranslation("kiosk");
  // Auto-initialize to current date/time when the field first appears with no value
  useEffect(() => {
    if (!value) {
      const now = new Date();
      const d = now.toLocaleDateString("en-CA"); // YYYY-MM-DD
      const t = now.toTimeString().slice(0, 5);   // HH:MM
      onChange(`${d}T${t}`);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Store date and time separately for clear mobile UX; combine on change
  const datePart = value ? value.slice(0, 10) : "";
  const timePart = value ? value.slice(11, 16) : "";
  const emit = (d: string, t: string) => onChange(d && t ? `${d}T${t}` : d ? `${d}T00:00` : "");
  return (
    <div className="space-y-2">
      <div>
        <label className="text-xs text-muted-foreground mb-1 block">{t("inputs.date")}</label>
        <input
          type="date"
          value={datePart}
          onChange={e => emit(e.target.value, timePart)}
          className="w-full min-h-[44px] border border-border rounded-xl px-4 py-3 text-sm bg-muted focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>
      <div>
        <label className="text-xs text-muted-foreground mb-1 block">{t("inputs.time")}</label>
        <input
          type="time"
          value={timePart}
          onChange={e => emit(datePart, e.target.value)}
          className="w-full min-h-[44px] border border-border rounded-xl px-4 py-3 text-sm bg-muted focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>
    </div>
  );
}

// ─── Instruction block ────────────────────────────────────────────────────────

export function InstructionBlock({
  text, imageUrl, linkedResourceTitle, linkedResourceSection, onImageClick, onLinkedResourceOpen,
}: {
  text: string;
  imageUrl?: string;
  linkedResourceTitle?: string;
  linkedResourceSection?: "library" | "training";
  onImageClick?: (url: string) => void;
  onLinkedResourceOpen?: () => void;
}) {
  const { t } = useTranslation("kiosk");
  const safeImageUrl = sanitizeImageUrl(imageUrl);
  return (
    <div className="min-h-[44px] bg-lavender-light rounded-xl px-5 py-4 space-y-3">
      {text && <p className="text-sm text-lavender-deep leading-relaxed">{text}</p>}
      {safeImageUrl && (
        <button
          type="button"
          onClick={() => onImageClick?.(safeImageUrl)}
          className="w-full relative group overflow-hidden rounded-lg focus:outline-none"
          aria-label={t("inputs.tapToEnlargeImage")}
        >
          <img
            src={safeImageUrl}
            alt={t("inputs.instruction")}
            className="w-full max-h-48 object-cover rounded-lg group-hover:opacity-90 transition-opacity"
          />
          <div className="absolute inset-0 flex items-end justify-end p-2 pointer-events-none">
            <span className="bg-foreground/60 text-background text-xs px-2 py-0.5 rounded-full font-medium">
              {t("inputs.tapToEnlarge")}
            </span>
          </div>
        </button>
      )}
      {linkedResourceTitle && (
        <button
          type="button"
          onClick={onLinkedResourceOpen}
          className="w-full rounded-lg border border-lavender-deep/20 bg-background/70 px-4 py-3 text-left transition-colors hover:bg-background"
        >
          <p className="text-xs text-lavender-deep/70">
            Open linked {linkedResourceSection === "training" ? "training" : "document"}
          </p>
          <p className="text-sm font-medium text-lavender-deep mt-1">{linkedResourceTitle}</p>
        </button>
      )}
    </div>
  );
}

// ─── Media (camera capture + Supabase upload) ─────────────────────────────────
// Live camera capture only. No file picker or library access is exposed.
// Photos are compressed to JPEG and uploaded to Supabase Storage (kiosk-photos
// bucket); only the short storage path is stored in the answer, not the raw
// base64 data — prevents DB bloat and bulk data exposure (SEQ-008).

function compressToJpeg(canvas: HTMLCanvasElement, quality = 0.7): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error("Canvas toBlob failed")),
      "image/jpeg",
      quality,
    );
  });
}

export function detectPhotoFormat(answer: string) {
  const isBase64 = typeof answer === "string" && answer.startsWith("data:image/");
  const isStoragePath = typeof answer === "string" && !isBase64 && !answer.startsWith("http") && answer.length > 0;
  return { isBase64, isStoragePath };
}

async function getSignedUrl(storagePath: string): Promise<string | null> {
  try {
    const { data } = await supabase.storage
      .from("kiosk-photos")
      .createSignedUrl(storagePath, 3600);
    return data?.signedUrl ?? null;
  } catch {
    return null;
  }
}

export function MediaInput({
  value, onChange, organizationId, locationId, questionId,
}: {
  value: string;
  onChange: (v: string) => void;
  organizationId?: string;
  locationId?: string;
  questionId?: string;
}) {
  const { t } = useTranslation("kiosk");
  const [isOpen, setIsOpen] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [captured, setCaptured] = useState<string | null>(null);
  const [capturedCanvas, setCapturedCanvas] = useState<HTMLCanvasElement | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState("");
  const [displayUrl, setDisplayUrl] = useState<string | null>(null);
  const [previewFailed, setPreviewFailed] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  // Storage path → the data URL we captured it from. The kiosk is anonymous
  // and kiosk-photos only grants SELECT to signed-in managers, so it can't
  // sign a URL for its own upload — preview the local capture instead.
  const localPreviews = useRef<Record<string, string>>({});

  useEffect(() => {
    setPreviewFailed(false);
    if (!value) { setDisplayUrl(null); return; }
    const { isBase64, isStoragePath } = detectPhotoFormat(value);
    if (isBase64) { setDisplayUrl(value); return; }
    const local = localPreviews.current[value];
    if (local) { setDisplayUrl(local); return; }
    if (isStoragePath) {
      let cancelled = false;
      setDisplayUrl(null);
      getSignedUrl(value).then(url => {
        if (cancelled) return;
        setDisplayUrl(url);
        if (!url) setPreviewFailed(true);
      });
      return () => { cancelled = true; };
    }
    setDisplayUrl(null);
  }, [value]);

  const stopStream = () => {
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    setStream(null);
  };

  useEffect(() => {
    if (!isOpen) { stopStream(); setCaptured(null); setCapturedCanvas(null); setError(""); return; }
    const mediaDevices = navigator.mediaDevices;
    if (!mediaDevices?.getUserMedia) { setError(t("inputs.cameraUnavailable")); return; }
    let cancelled = false;
    setIsLoading(true);
    mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: KIOSK_PHOTO_MAX_DIMENSION },
        height: { ideal: 720 },
      },
      audio: false,
    })
      .then(nextStream => {
        if (cancelled) { nextStream.getTracks().forEach(track => track.stop()); return; }
        streamRef.current = nextStream;
        setStream(nextStream);
        setError("");
      })
      .catch(() => { if (!cancelled) setError(t("inputs.cameraFailed")); })
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [isOpen]);

  useEffect(() => {
    if (!stream || !videoRef.current) return;
    videoRef.current.srcObject = stream;
    void videoRef.current.play().catch(() => {});
  }, [stream]);

  useEffect(() => () => stopStream(), []);

  const openCamera = () => { setCaptured(null); setCapturedCanvas(null); setError(""); setIsOpen(true); };
  const closeCamera = () => { stopStream(); setCaptured(null); setCapturedCanvas(null); setIsOpen(false); };

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    // Cap the stored size regardless of what resolution the camera streams at.
    const { width, height } = fitWithin(video.videoWidth || 1280, video.videoHeight || 720, KIOSK_PHOTO_MAX_DIMENSION);
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    setCaptured(canvas.toDataURL("image/jpeg", 0.7));
    setCapturedCanvas(canvas);
  };

  const useCapturedPhoto = async () => {
    if (!capturedCanvas) return;
    setIsUploading(true);
    setError("");
    try {
      const blob = await compressToJpeg(capturedCanvas, 0.7);
      const orgSegment = organizationId ?? "unknown-org";
      const locSegment = locationId ?? "unknown-loc";
      const qSegment = questionId ?? "photo";
      const fileName = `${orgSegment}/${locSegment}/${Date.now()}_${qSegment}.jpg`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("kiosk-photos")
        .upload(fileName, blob, { contentType: "image/jpeg", upsert: false });
      if (uploadError) {
        setError(t("inputs.uploadFailed", { message: uploadError.message }));
        setIsUploading(false);
        return;
      }
      if (captured) localPreviews.current[uploadData.path] = captured;
      onChange(uploadData.path);
      closeCamera();
    } catch (err: any) {
      setError(t("inputs.uploadFailed", { message: err?.message ?? t("inputs.unknownError") }));
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="space-y-3">
      {value ? (
        <div className="space-y-2">
          <div className="relative rounded-xl overflow-hidden border border-border">
            {displayUrl ? (
              <img src={displayUrl} alt={t("inputs.captured")} className="w-full max-h-52 object-cover" />
            ) : (
              <div className="w-full h-32 flex items-center justify-center bg-muted text-xs text-muted-foreground">
                {previewFailed ? t("inputs.photoSaved") : t("inputs.loadingPhoto")}
              </div>
            )}
            <button
              type="button"
              onClick={() => onChange("")}
              className="absolute top-2 right-2 w-7 h-7 rounded-full bg-foreground/60 flex items-center justify-center"
              aria-label={t("inputs.removePhoto")}
            >
              <X size={14} className="text-background" />
            </button>
          </div>
          <div className="flex items-center gap-2 text-xs font-medium text-sage">
            <Check size={14} />
            {t("inputs.photoAttached")}
          </div>
          <button type="button" onClick={openCamera} className="text-xs font-medium text-sage hover:underline">
            {t("inputs.retakePhoto")}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={openCamera}
          className="w-full min-h-[80px] border-2 border-dashed border-border rounded-xl flex flex-col items-center justify-center gap-2 text-muted-foreground hover:border-sage hover:text-sage transition-colors"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/>
            <circle cx="12" cy="13" r="3"/>
          </svg>
          <span className="text-sm font-medium">{t("inputs.takePhoto")}</span>
          <span className="text-xs">{t("inputs.takePhotoHint")}</span>
        </button>
      )}

      {isOpen && (
        <div className="fixed inset-0 z-[80] bg-background/95 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-card shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div>
                <p className="text-sm font-semibold text-foreground">{t("inputs.capturePhoto")}</p>
                <p className="text-xs text-muted-foreground">{t("inputs.capturePhotoHint")}</p>
              </div>
              <button
                type="button"
                onClick={closeCamera}
                className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted"
                aria-label={t("inputs.closeCamera")}
              >
                <X size={16} />
              </button>
            </div>
            <div className="p-4 space-y-4">
              {error ? (
                <div className="rounded-xl border border-status-error/30 bg-status-error/10 px-4 py-3 text-sm text-status-error">
                  {error}
                </div>
              ) : captured ? (
                <div className="space-y-3">
                  <img src={captured} alt={t("inputs.capturedPreview")} className="w-full rounded-xl border border-border max-h-[60vh] object-cover" />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => { setCaptured(null); setCapturedCanvas(null); }}
                      disabled={isUploading}
                      className="flex-1 px-4 py-3 rounded-xl border border-border text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50"
                    >
                      {t("inputs.retake")}
                    </button>
                    <button
                      type="button"
                      onClick={useCapturedPhoto}
                      disabled={isUploading}
                      className="flex-1 px-4 py-3 rounded-xl bg-sage text-primary-foreground text-sm font-medium hover:bg-sage/90 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isUploading ? t("inputs.uploading") : t("inputs.usePhoto")}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="rounded-xl overflow-hidden border border-border bg-black">
                    <video ref={videoRef} autoPlay playsInline muted className="w-full max-h-[60vh] object-cover" />
                  </div>
                  <canvas ref={canvasRef} className="hidden" />
                  {isLoading && <p className="text-xs text-muted-foreground">{t("inputs.startingCamera")}</p>}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={closeCamera}
                      className="flex-1 px-4 py-3 rounded-xl border border-border text-sm font-medium text-foreground hover:bg-muted"
                    >
                      {t("inputs.cancel")}
                    </button>
                    <button
                      type="button"
                      onClick={capturePhoto}
                      disabled={isLoading || !stream}
                      className="flex-1 px-4 py-3 rounded-xl bg-sage text-primary-foreground text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-sage/90"
                    >
                      {t("inputs.capturePhoto")}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── QuestionInput (router) ───────────────────────────────────────────────────

export function QuestionInput({
  question, value, onChange, onImageClick, onLinkedResourceOpen,
  organizationId, locationId,
}: {
  question: Question;
  value: any;
  onChange: (v: any) => void;
  onImageClick?: (url: string) => void;
  onLinkedResourceOpen?: () => void;
  organizationId?: string;
  locationId?: string;
}) {
  switch (question.type) {
    case "checkbox":
      return <CheckboxInput value={!!value} onChange={onChange} />;
    case "media":
      return (
        <MediaInput
          value={value ?? ""}
          onChange={onChange}
          organizationId={organizationId}
          locationId={locationId}
          questionId={question.id}
        />
      );
    case "number":
      if (question.temperatureUnit) {
        return (
          <TemperatureKeypadInput
            value={value ?? ""}
            onChange={onChange}
            acceptableMin={question.min}
            acceptableMax={question.max}
            unit={question.temperatureUnit}
          />
        );
      }
      return <NumberInput value={value ?? ""} onChange={onChange} min={question.min} max={question.max} unit={question.temperatureUnit} />;
    case "text":
      return <TextInput value={value ?? ""} onChange={onChange} />;
    case "multiple_choice":
      return (
        <MultipleChoiceInput
          options={question.options ?? []}
          optionColors={question.optionColors}
          selectionMode={question.selectionMode}
          value={value ?? (question.selectionMode === "multiple" ? [] : "")}
          onChange={onChange}
        />
      );
    case "datetime":
      return <DateTimeInput value={value ?? ""} onChange={onChange} />;
    case "instruction":
      return (
        <InstructionBlock
          text={question.instructionText ?? ""}
          imageUrl={question.imageUrl}
          linkedResourceTitle={question.linkedResourceTitle}
          linkedResourceSection={question.linkedResourceSection}
          onImageClick={onImageClick}
          onLinkedResourceOpen={onLinkedResourceOpen}
        />
      );
    default:
      return null;
  }
}
