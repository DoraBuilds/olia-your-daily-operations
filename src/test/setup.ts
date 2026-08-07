import "@testing-library/jest-dom";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
// Initializes the i18next singleton for every test file (react-i18next's
// useTranslation() renders raw keys instead of translated text without an
// initialized instance, and each test file gets a fresh module registry —
// see #594).
import "@/lib/i18n";

afterEach(() => {
  cleanup();
});

if (!import.meta.env.VITE_SUPABASE_URL) {
  import.meta.env.VITE_SUPABASE_URL = "https://example.supabase.co";
}

if (!import.meta.env.VITE_SUPABASE_ANON_KEY) {
  import.meta.env.VITE_SUPABASE_ANON_KEY = "test-anon-key";
}

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});

// jsdom doesn't implement window.scrollTo — silence the "Not implemented" warnings.
window.scrollTo = () => {};

// Polyfill ResizeObserver — required by Radix UI components (Switch, etc.)
if (!global.ResizeObserver) {
  global.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// Stub Worker — jsdom doesn't support web workers; components that create Workers
// (e.g. pdf.js extraction) need this so tests don't throw NotSupportedError.
global.Worker = class MockWorker {
  constructor(_url: string | URL, _options?: WorkerOptions) {}
  terminate() {}
  postMessage() {}
  addEventListener() {}
  removeEventListener() {}
  dispatchEvent() { return false; }
  onmessage = null;
  onerror = null;
  onmessageerror = null;
} as any;
