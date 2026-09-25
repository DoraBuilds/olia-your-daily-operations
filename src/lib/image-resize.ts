// Client-side image downscaling, so storage holds sensibly sized images
// rather than whatever resolution a phone camera produces.

/** Checklist photos from the kiosk camera: longest side, in px. */
export const KIOSK_PHOTO_MAX_DIMENSION = 1280;
/** Images uploaded to the Infohub: longest side, in px (still sharp on a tablet, full-screen). */
export const INFOHUB_IMAGE_MAX_DIMENSION = 2000;

/** Scales (width, height) down so the longest side is at most maxDimension; never scales up. */
export function fitWithin(width: number, height: number, maxDimension: number) {
  const longest = Math.max(width, height);
  if (!longest || longest <= maxDimension) return { width, height };
  const scale = maxDimension / longest;
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise(resolve => canvas.toBlob(resolve, type, quality));
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Could not read image")); };
    img.src = url;
  });
}

const RESIZABLE_TYPES = ["image/jpeg", "image/png", "image/webp"];

/**
 * Downscales and re-encodes an uploaded image. JPEGs stay JPEG; PNG/WebP
 * become WebP so transparency survives. Returns the original file when it
 * isn't a resizable image, the browser can't encode the target format, or
 * the result wouldn't be smaller — so this never makes an upload worse.
 */
export async function shrinkImageFile(
  file: File,
  maxDimension = INFOHUB_IMAGE_MAX_DIMENSION,
  quality = 0.82,
): Promise<File> {
  if (!RESIZABLE_TYPES.includes(file.type)) return file;
  try {
    const img = await loadImage(file);
    const { width, height } = fitWithin(img.naturalWidth, img.naturalHeight, maxDimension);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, width, height);

    const targetType = file.type === "image/jpeg" ? "image/jpeg" : "image/webp";
    const blob = await canvasToBlob(canvas, targetType, quality);
    // Browsers that can't encode the target type silently fall back to PNG.
    if (!blob || blob.type !== targetType || blob.size >= file.size) return file;

    const ext = targetType === "image/jpeg" ? ".jpg" : ".webp";
    const name = file.name.replace(/\.[^.]+$/, "") + ext;
    return new File([blob], name, { type: targetType, lastModified: file.lastModified });
  } catch {
    return file;
  }
}
