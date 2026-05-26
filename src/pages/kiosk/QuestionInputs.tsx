import { useState, useEffect, useRef } from "react";
import { X, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { sanitizeImageUrl } from "@/lib/sanitize";
import { supabase } from "@/lib/supabase";
import type { Question } from "./types";

// ─── Checkbox ─────────────────────────────────────────────────────────────────

export function CheckboxInput({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
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
      {value ? "Yes, completed" : "Tap to confirm"}
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
          {outOfRange ? "⚠ Out of acceptable range · " : ""}
          Acceptable: {min != null ? min : "—"} – {max != null ? max : "—"}{unit ? ` ${unit}` : ""}
        </p>
      )}
    </div>
  );
}

// ─── Temperature slider ────────────────────────────────────────────────────────

export function TemperatureSliderInput({
  value, onChange, acceptableMin, acceptableMax, unit = "C",
}: {
  value: number | "";
  onChange: (v: number | "") => void;
  acceptableMin?: number;
  acceptableMax?: number;
  unit?: "C" | "F";
}) {
  const sliderMin = unit === "F" ? 32 : 0;
  const sliderMax = unit === "F" ? 104 : 40;
  const displayValue = value === "" ? sliderMin : Number(value);

  const hasAcceptableRange = acceptableMin != null || acceptableMax != null;
  const outOfRange = hasAcceptableRange && value !== "" && (
    (acceptableMin != null && displayValue < acceptableMin) ||
    (acceptableMax != null && displayValue > acceptableMax)
  );

  return (
    <div className="space-y-3 px-1">
      <div className="flex items-end justify-center gap-1 py-2">
        <span className={cn(
          "text-6xl font-bold tabular-nums leading-none",
          outOfRange ? "text-status-error" : "text-foreground",
        )}>
          {value === "" ? "—" : displayValue}
        </span>
        <span className={cn(
          "text-2xl font-medium pb-1",
          outOfRange ? "text-status-error" : "text-muted-foreground",
        )}>
          °{unit}
        </span>
      </div>
      <input
        type="range"
        min={sliderMin}
        max={sliderMax}
        step={1}
        value={displayValue}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full cursor-pointer"
        style={{ accentColor: outOfRange ? "var(--status-error)" : "var(--sage)" }}
      />
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{sliderMin}°{unit}</span>
        <span>{sliderMax}°{unit}</span>
      </div>
      {hasAcceptableRange && (
        <p className={cn(
          "text-[11px] text-center",
          outOfRange ? "text-status-error font-semibold" : "text-muted-foreground",
        )}>
          {outOfRange ? "⚠ Out of acceptable range · " : ""}
          Acceptable: {acceptableMin != null ? acceptableMin : "—"} – {acceptableMax != null ? acceptableMax : "—"}°{unit}
        </p>
      )}
    </div>
  );
}

// ─── Text ─────────────────────────────────────────────────────────────────────

export function TextInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <textarea
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder="Type your answer here…"
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
                : "bg-card border-border text-foreground hover:border-sage/40",
              isSelected && optionColors?.[idx],
              isSelected && !optionColors?.[idx] && !isNoOption && "bg-sage-light",
            )}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}

// ─── DateTime ─────────────────────────────────────────────────────────────────

export function DateTimeInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  // Store date and time separately for clear mobile UX; combine on change
  const datePart = value ? value.slice(0, 10) : "";
  const timePart = value ? value.slice(11, 16) : "";
  const emit = (d: string, t: string) => onChange(d && t ? `${d}T${t}` : d ? `${d}T00:00` : "");
  return (
    <div className="space-y-2">
      <div>
        <label className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1 block">Date</label>
        <input
          type="date"
          value={datePart}
          onChange={e => emit(e.target.value, timePart)}
          className="w-full min-h-[44px] border border-border rounded-xl px-4 py-3 text-sm bg-muted focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>
      <div>
        <label className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1 block">Time</label>
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
  const safeImageUrl = sanitizeImageUrl(imageUrl);
  return (
    <div className="min-h-[44px] bg-lavender-light rounded-xl px-5 py-4 space-y-3">
      {text && <p className="text-sm text-lavender-deep leading-relaxed">{text}</p>}
      {safeImageUrl && (
        <button
          type="button"
          onClick={() => onImageClick?.(safeImageUrl)}
          className="w-full relative group overflow-hidden rounded-lg focus:outline-none"
          aria-label="Tap to enlarge image"
        >
          <img
            src={safeImageUrl}
            alt="Instruction"
            className="w-full max-h-48 object-cover rounded-lg group-hover:opacity-90 transition-opacity"
          />
          <div className="absolute inset-0 flex items-end justify-end p-2 pointer-events-none">
            <span className="bg-foreground/60 text-background text-[10px] px-2 py-0.5 rounded-full font-medium">
              Tap to enlarge
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
          <p className="text-xs uppercase tracking-wide text-lavender-deep/70">
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
  const [isOpen, setIsOpen] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [captured, setCaptured] = useState<string | null>(null);
  const [capturedCanvas, setCapturedCanvas] = useState<HTMLCanvasElement | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState("");
  const [displayUrl, setDisplayUrl] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (!value) { setDisplayUrl(null); return; }
    const { isBase64, isStoragePath } = detectPhotoFormat(value);
    if (isBase64) { setDisplayUrl(value); return; }
    if (isStoragePath) {
      let cancelled = false;
      getSignedUrl(value).then(url => { if (!cancelled) setDisplayUrl(url); });
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
    if (!mediaDevices?.getUserMedia) { setError("Camera access is not available on this device."); return; }
    let cancelled = false;
    setIsLoading(true);
    mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false })
      .then(nextStream => {
        if (cancelled) { nextStream.getTracks().forEach(track => track.stop()); return; }
        streamRef.current = nextStream;
        setStream(nextStream);
        setError("");
      })
      .catch(() => { if (!cancelled) setError("Camera access could not be started."); })
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
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
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
        setError(`Photo upload failed: ${uploadError.message}. Please try again.`);
        setIsUploading(false);
        return;
      }
      onChange(uploadData.path);
      closeCamera();
    } catch (err: any) {
      setError(`Photo upload failed: ${err?.message ?? "Unknown error"}. Please try again.`);
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
              <img src={displayUrl} alt="Captured" className="w-full max-h-52 object-cover" />
            ) : (
              <div className="w-full h-32 flex items-center justify-center bg-muted text-xs text-muted-foreground">
                Loading photo…
              </div>
            )}
            <button
              type="button"
              onClick={() => onChange("")}
              className="absolute top-2 right-2 w-7 h-7 rounded-full bg-foreground/60 flex items-center justify-center"
              aria-label="Remove photo"
            >
              <X size={14} className="text-background" />
            </button>
          </div>
          <div className="flex items-center gap-2 text-xs font-medium text-sage">
            <Check size={14} />
            Photo attached
          </div>
          <button type="button" onClick={openCamera} className="text-xs font-medium text-sage hover:underline">
            Retake photo
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
          <span className="text-sm font-medium">Take photo</span>
          <span className="text-xs">Use the camera to capture this now</span>
        </button>
      )}

      {isOpen && (
        <div className="fixed inset-0 z-[80] bg-background/95 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-card shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div>
                <p className="text-sm font-semibold text-foreground">Capture photo</p>
                <p className="text-xs text-muted-foreground">Take a new photo now, then confirm it.</p>
              </div>
              <button
                type="button"
                onClick={closeCamera}
                className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted"
                aria-label="Close camera"
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
                  <img src={captured} alt="Captured preview" className="w-full rounded-xl border border-border max-h-[60vh] object-cover" />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => { setCaptured(null); setCapturedCanvas(null); }}
                      disabled={isUploading}
                      className="flex-1 px-4 py-3 rounded-xl border border-border text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50"
                    >
                      Retake
                    </button>
                    <button
                      type="button"
                      onClick={useCapturedPhoto}
                      disabled={isUploading}
                      className="flex-1 px-4 py-3 rounded-xl bg-sage text-primary-foreground text-sm font-medium hover:bg-sage/90 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isUploading ? "Uploading…" : "Use photo"}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="rounded-xl overflow-hidden border border-border bg-black">
                    <video ref={videoRef} autoPlay playsInline muted className="w-full max-h-[60vh] object-cover" />
                  </div>
                  <canvas ref={canvasRef} className="hidden" />
                  {isLoading && <p className="text-xs text-muted-foreground">Starting camera…</p>}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={closeCamera}
                      className="flex-1 px-4 py-3 rounded-xl border border-border text-sm font-medium text-foreground hover:bg-muted"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={capturePhoto}
                      disabled={isLoading || !stream}
                      className="flex-1 px-4 py-3 rounded-xl bg-sage text-primary-foreground text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-sage/90"
                    >
                      Capture photo
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
          <TemperatureSliderInput
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
