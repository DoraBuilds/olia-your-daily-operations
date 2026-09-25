import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fitWithin, shrinkImageFile } from "@/lib/image-resize";

describe("fitWithin", () => {
  it("scales the longest side down to the max, keeping aspect ratio", () => {
    expect(fitWithin(4032, 3024, 2000)).toEqual({ width: 2000, height: 1500 });
    expect(fitWithin(1080, 1920, 1280)).toEqual({ width: 720, height: 1280 });
  });

  it("never scales up", () => {
    expect(fitWithin(640, 480, 1280)).toEqual({ width: 640, height: 480 });
    expect(fitWithin(0, 0, 1280)).toEqual({ width: 0, height: 0 });
  });
});

describe("shrinkImageFile", () => {
  let encoded: { type: string; size: number } | null;
  let drawn: { width: number; height: number } | null;

  beforeEach(() => {
    encoded = { type: "image/jpeg", size: 300_000 };
    drawn = null;
    vi.stubGlobal("URL", { ...URL, createObjectURL: vi.fn(() => "blob:x"), revokeObjectURL: vi.fn() });
    // jsdom never loads images — fire onload with a 12 MP phone-photo size.
    vi.spyOn(window, "Image").mockImplementation(function (this: any) {
      const img: any = { naturalWidth: 4032, naturalHeight: 3024 };
      Object.defineProperty(img, "src", { set() { queueMicrotask(() => img.onload()); } });
      return img;
    } as any);
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (this: HTMLCanvasElement) {
      return { drawImage: () => { drawn = { width: this.width, height: this.height }; } } as never;
    });
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (cb: BlobCallback, type?: string) {
      if (!encoded) return cb(null);
      const blob = new Blob([new Uint8Array(encoded.size)], { type: encoded.type });
      cb(blob);
    });
  });

  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  const bigJpeg = () => new File([new Uint8Array(5_000_000)], "IMG_0001.JPG", { type: "image/jpeg" });

  it("downscales a phone photo to 2000px and re-encodes it smaller", async () => {
    const out = await shrinkImageFile(bigJpeg());
    expect(drawn).toEqual({ width: 2000, height: 1500 });
    expect(out.type).toBe("image/jpeg");
    expect(out.name).toBe("IMG_0001.jpg");
    expect(out.size).toBe(300_000);
  });

  it("converts PNGs to WebP so transparency is kept", async () => {
    encoded = { type: "image/webp", size: 200_000 };
    const png = new File([new Uint8Array(4_000_000)], "diagram.png", { type: "image/png" });
    const out = await shrinkImageFile(png);
    expect(out.type).toBe("image/webp");
    expect(out.name).toBe("diagram.webp");
  });

  it("keeps the original when the browser can't encode WebP", async () => {
    encoded = { type: "image/png", size: 100 };
    const png = new File([new Uint8Array(4_000_000)], "diagram.png", { type: "image/png" });
    expect(await shrinkImageFile(png)).toBe(png);
  });

  it("keeps the original when re-encoding wouldn't make it smaller", async () => {
    encoded = { type: "image/jpeg", size: 6_000_000 };
    const file = bigJpeg();
    expect(await shrinkImageFile(file)).toBe(file);
  });

  it("leaves non-images (PDF, Word) untouched", async () => {
    const pdf = new File(["%PDF"], "manual.pdf", { type: "application/pdf" });
    expect(await shrinkImageFile(pdf)).toBe(pdf);
    expect(drawn).toBeNull();
  });

  it("keeps the original when encoding fails", async () => {
    encoded = null;
    const file = bigJpeg();
    expect(await shrinkImageFile(file)).toBe(file);
  });
});
