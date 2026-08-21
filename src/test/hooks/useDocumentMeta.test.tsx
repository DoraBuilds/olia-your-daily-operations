import { renderHook } from "@testing-library/react";
import { useDocumentMeta } from "@/hooks/useDocumentMeta";

describe("useDocumentMeta", () => {
  let descriptionTag: HTMLMetaElement;

  beforeEach(() => {
    document.title = "Olia";
    descriptionTag = document.createElement("meta");
    descriptionTag.setAttribute("name", "description");
    descriptionTag.setAttribute("content", "Default description");
    document.head.appendChild(descriptionTag);
  });

  afterEach(() => {
    descriptionTag.remove();
    document.querySelectorAll('meta[name="robots"]').forEach(el => el.remove());
  });

  it("sets the document title", () => {
    renderHook(() => useDocumentMeta("Sign in — Olia"));
    expect(document.title).toBe("Sign in — Olia");
  });

  it("sets the meta description when provided", () => {
    renderHook(() => useDocumentMeta("Sign in — Olia", "Sign in to your account."));
    expect(descriptionTag.getAttribute("content")).toBe("Sign in to your account.");
  });

  it("leaves the meta description untouched when not provided", () => {
    renderHook(() => useDocumentMeta("Sign in — Olia"));
    expect(descriptionTag.getAttribute("content")).toBe("Default description");
  });

  it("restores the previous title and description on unmount", () => {
    const { unmount } = renderHook(() => useDocumentMeta("Sign in — Olia", "Sign in to your account."));
    unmount();
    expect(document.title).toBe("Olia");
    expect(descriptionTag.getAttribute("content")).toBe("Default description");
  });

  it("adds a noindex robots meta tag when requested, and removes it on unmount", () => {
    const { unmount } = renderHook(() => useDocumentMeta("404 — Olia", undefined, { noindex: true }));
    const robots = document.querySelector('meta[name="robots"]');
    expect(robots).not.toBeNull();
    expect(robots?.getAttribute("content")).toBe("noindex");

    unmount();
    expect(document.querySelector('meta[name="robots"]')).toBeNull();
  });

  it("does not add a robots meta tag by default", () => {
    renderHook(() => useDocumentMeta("Sign in — Olia"));
    expect(document.querySelector('meta[name="robots"]')).toBeNull();
  });
});
