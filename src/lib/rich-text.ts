import DOMPurify from "dompurify";

// Infohub document bodies are either legacy plain text or sanitized HTML from
// the rich text editor. Images are stored as <img data-path="org/file.jpg"> with
// no src: signed URLs expire, so each viewer resolves them at render time.

const HTML_START = /^\s*<(p|h[1-6]|ul|ol|div|table|blockquote|hr|img)[\s>/]/i;

const ALLOWED_TAGS = [
  "p", "br", "strong", "b", "em", "i", "u", "s", "code", "pre", "h1", "h2", "h3", "h4",
  "ul", "ol", "li", "blockquote", "hr", "a", "img", "div", "span", "label", "input",
  "table", "thead", "tbody", "tr", "th", "td", "colgroup", "col",
];
const ALLOWED_ATTR = [
  "href", "target", "rel", "src", "alt", "data-path", "data-type", "data-checked",
  "type", "checked", "disabled", "colspan", "rowspan",
];

DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (node.tagName === "A") {
    node.setAttribute("target", "_blank");
    node.setAttribute("rel", "noopener noreferrer");
  }
  if (node.tagName === "INPUT") node.setAttribute("disabled", "");
});

export function isRichHtml(body: string): boolean {
  return HTML_START.test(body);
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Legacy plain text → paragraphs, so it opens in the editor unchanged. */
export function plainToHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .filter((p) => p.trim())
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

export function bodyToHtml(body: string): string {
  if (!body.trim()) return "";
  return sanitizeRichHtml(isRichHtml(body) ? body : plainToHtml(body));
}

/**
 * Sanitizes editor/stored HTML. Images without a storage path are dropped
 * (no external images) and src is stripped from the rest; see injectImageSrc.
 */
export function sanitizeRichHtml(html: string): string {
  const clean = DOMPurify.sanitize(html, { ALLOWED_TAGS, ALLOWED_ATTR });
  const doc = new DOMParser().parseFromString(clean, "text/html");
  doc.body.querySelectorAll("img").forEach((img) => {
    if (!img.getAttribute("data-path")) img.remove();
    else img.removeAttribute("src");
  });
  return doc.body.innerHTML;
}

export function collectImagePaths(body: string): string[] {
  if (!isRichHtml(body)) return [];
  const doc = new DOMParser().parseFromString(body, "text/html");
  const paths = new Set<string>();
  doc.querySelectorAll("img[data-path]").forEach((img) => paths.add(img.getAttribute("data-path")!));
  return [...paths];
}

/** Adds viewer-specific signed URLs to the stored (src-less) images. */
export function injectImageSrc(html: string, urls: Record<string, string>): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.body.querySelectorAll("img[data-path]").forEach((img) => {
    const url = urls[img.getAttribute("data-path")!];
    if (url) img.setAttribute("src", url);
  });
  return doc.body.innerHTML;
}

const BLOCK = new Set(["P", "DIV", "H1", "H2", "H3", "H4", "UL", "OL", "BLOCKQUOTE", "TABLE", "TR", "PRE", "HR"]);

/** Plain text for AI actions, .txt download and search. */
export function richTextToPlain(body: string): string {
  if (!isRichHtml(body)) return body;
  const doc = new DOMParser().parseFromString(body, "text/html");
  const walk = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
    if (!(node instanceof HTMLElement)) return "";
    const tag = node.tagName;
    if (tag === "BR") return "\n";
    if (tag === "IMG" || tag === "INPUT") return "";
    let inner = [...node.childNodes].map(walk).join("");
    if (tag === "LI") {
      const task = node.getAttribute("data-type") === "taskItem";
      const mark = task ? (node.getAttribute("data-checked") === "true" ? "[x] " : "[ ] ") : "- ";
      return `${mark}${inner.trim()}\n`;
    }
    if (tag === "TD" || tag === "TH") return `${inner.trim()}\t`;
    if (tag === "TR") inner = inner.replace(/\t$/, "");
    return BLOCK.has(tag) ? `${inner.trim()}\n\n` : inner;
  };
  return walk(doc.body).replace(/\n{3,}/g, "\n\n").trim();
}
