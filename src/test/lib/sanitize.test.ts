import { describe, it, expect, vi, beforeEach } from "vitest";

// Set env before importing the module so the build-time branch is exercised.
// vitest runs ESM so we patch import.meta.env directly.
const MOCK_SUPABASE_URL = "https://abcdefgh.supabase.co";

vi.stubEnv("VITE_SUPABASE_URL", MOCK_SUPABASE_URL);

// Dynamic import so the env stub above is visible when the module initialises.
const { isAllowedImageUrl, sanitizeImageUrl } = await import("@/lib/sanitize");

describe("isAllowedImageUrl", () => {
  describe("falsy / empty values", () => {
    it("returns false for undefined", () => {
      expect(isAllowedImageUrl(undefined)).toBe(false);
    });
    it("returns false for null", () => {
      expect(isAllowedImageUrl(null)).toBe(false);
    });
    it("returns false for empty string", () => {
      expect(isAllowedImageUrl("")).toBe(false);
    });
  });

  describe("relative paths (same-origin)", () => {
    it("allows root-relative paths", () => {
      expect(isAllowedImageUrl("/images/logo.png")).toBe(true);
    });
    it("allows dot-relative paths", () => {
      expect(isAllowedImageUrl("./assets/photo.jpg")).toBe(true);
    });
  });

  describe("data URIs", () => {
    it("allows data:image/png URIs", () => {
      expect(isAllowedImageUrl("data:image/png;base64,abc123")).toBe(true);
    });
    it("allows data:image/jpeg URIs", () => {
      expect(isAllowedImageUrl("data:image/jpeg;base64,abc123")).toBe(true);
    });
    it("allows data:image/webp URIs", () => {
      expect(isAllowedImageUrl("data:image/webp;base64,abc123")).toBe(true);
    });
    it("blocks data:text/html URIs", () => {
      expect(isAllowedImageUrl("data:text/html,<script>alert(1)</script>")).toBe(false);
    });
    it("blocks data:application/javascript URIs", () => {
      expect(isAllowedImageUrl("data:application/javascript,alert(1)")).toBe(false);
    });
  });

  describe("Supabase storage URLs (allowlisted origins)", () => {
    it("allows supabase.co storage URLs", () => {
      expect(isAllowedImageUrl("https://project.supabase.co/storage/v1/object/public/img.png")).toBe(true);
    });
    it("allows supabase.in storage URLs", () => {
      expect(isAllowedImageUrl("https://project.supabase.in/storage/v1/object/public/img.png")).toBe(true);
    });
    it("allows VITE_SUPABASE_URL-based storage URLs", () => {
      expect(isAllowedImageUrl(`${MOCK_SUPABASE_URL}/storage/v1/object/public/img.png`)).toBe(true);
    });
  });

  describe("blocked external URLs", () => {
    it("blocks http:// URLs", () => {
      expect(isAllowedImageUrl("http://evil.com/track.png")).toBe(false);
    });
    it("blocks arbitrary https:// origins", () => {
      expect(isAllowedImageUrl("https://evil.com/track.png")).toBe(false);
    });
    it("blocks javascript: URIs", () => {
      expect(isAllowedImageUrl("javascript:alert(1)")).toBe(false);
    });
    it("blocks blob: URLs", () => {
      expect(isAllowedImageUrl("blob:https://example.com/1234")).toBe(false);
    });
    it("blocks ftp:// URLs", () => {
      expect(isAllowedImageUrl("ftp://files.example.com/image.png")).toBe(false);
    });
    it("blocks URLs that look similar but are not on the allowlist", () => {
      // hostname ends with 'supabase.co' but as a suffix of a different label
      expect(isAllowedImageUrl("https://evil-supabase.co.attacker.com/img.png")).toBe(false);
      // hostname contains 'supabase.co' as a substring but not a proper subdomain
      expect(isAllowedImageUrl("https://notsupabase.co/img.png")).toBe(false);
    });
    it("blocks attacker-controlled HTTPS hosts", () => {
      expect(isAllowedImageUrl("https://attacker.example.org/track.gif")).toBe(false);
    });
  });

  describe("malformed URLs", () => {
    it("blocks non-parseable strings that are not relative paths or data URIs", () => {
      expect(isAllowedImageUrl("not a url at all")).toBe(false);
    });
    it("blocks strings that start with https but are invalid URLs", () => {
      expect(isAllowedImageUrl("https://")).toBe(false);
    });
  });
});

describe("sanitizeImageUrl", () => {
  it("returns the URL when it is allowed", () => {
    const url = "data:image/png;base64,abc";
    expect(sanitizeImageUrl(url)).toBe(url);
  });
  it("returns undefined when the URL is blocked", () => {
    expect(sanitizeImageUrl("https://evil.com/track.png")).toBeUndefined();
  });
  it("returns undefined for null", () => {
    expect(sanitizeImageUrl(null)).toBeUndefined();
  });
  it("returns undefined for undefined", () => {
    expect(sanitizeImageUrl(undefined)).toBeUndefined();
  });
  it("returns undefined for empty string", () => {
    expect(sanitizeImageUrl("")).toBeUndefined();
  });
  it("returns the relative path when allowed", () => {
    expect(sanitizeImageUrl("/img/photo.jpg")).toBe("/img/photo.jpg");
  });
});
