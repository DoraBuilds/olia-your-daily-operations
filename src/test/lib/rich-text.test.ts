import { describe, expect, it } from "vitest";
import { bodyToHtml, collectImagePaths, injectImageSrc, isRichHtml, richTextToPlain, sanitizeRichHtml } from "@/lib/rich-text";

describe("rich-text", () => {
  it("treats legacy plain text as plain and converts it to paragraphs", () => {
    expect(isRichHtml("Hello\n\nWorld")).toBe(false);
    expect(bodyToHtml("Hello <b>x</b>\nline2\n\nWorld")).toBe("<p>Hello &lt;b&gt;x&lt;/b&gt;<br>line2</p><p>World</p>");
  });

  it("strips scripts, event handlers and external images", () => {
    const out = sanitizeRichHtml('<p onclick="x()">Hi<script>alert(1)</script></p><img src="https://evil/x.png"><a href="javascript:alert(1)">l</a>');
    expect(out).not.toMatch(/script|onclick|evil|javascript:/);
  });

  it("keeps stored images by path only and re-injects signed urls", () => {
    const stored = sanitizeRichHtml('<img src="https://signed/x" data-path="org/a.jpg" alt="a">');
    expect(stored).toContain('data-path="org/a.jpg"');
    expect(stored).not.toContain("signed");
    expect(collectImagePaths(stored)).toEqual(["org/a.jpg"]);
    expect(injectImageSrc(stored, { "org/a.jpg": "https://signed/new" })).toContain('src="https://signed/new"');
  });

  it("opens links in a new tab safely", () => {
    expect(sanitizeRichHtml('<p><a href="https://a.com">a</a></p>')).toContain('rel="noopener noreferrer"');
  });

  it("converts rich text to plain text with list and checklist markers", () => {
    const html = '<h2>Title</h2><ul><li><p>one</p></li></ul><ul data-type="taskList"><li data-type="taskItem" data-checked="true"><div><p>done</p></div></li></ul>';
    expect(richTextToPlain(html)).toBe("Title\n\n- one\n\n[x] done");
    expect(richTextToPlain("plain\ntext")).toBe("plain\ntext");
  });
});
