import { describe, expect, it } from "vitest";

import { APP_URL, emailButton, emailShell, esc } from "../../../supabase/functions/_shared/email-layout";
import { buildAlertEmail } from "../../../supabase/functions/send-alert-email/email";
import { buildDigestEmail } from "../../../supabase/functions/check-checklist-alerts/digest";

const PAYLOAD = `"><script>alert(1)</script><img src=x onerror='alert(2)'>`;

describe("email layout escaping", () => {
  it("escapes quotes as well as angle brackets and ampersands", () => {
    expect(esc(`a & "b" 'c' <d>`)).toBe("a &amp; &quot;b&quot; &#39;c&#39; &lt;d&gt;");
  });

  it("never lets a payload break out of text or attributes in the shell", () => {
    const html = emailShell({ eyebrow: PAYLOAD, bodyHtml: "", footerHtml: "" });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("falls back to the app URL for javascript:, data: and http: hrefs", () => {
    for (const bad of ["javascript:alert(1)", "data:text/html,<script>1</script>", "http://evil.test/x"]) {
      expect(emailButton("Open", bad)).toContain(`href="${APP_URL}"`);
    }
  });

  it("keeps a valid https href and escapes quotes inside it", () => {
    expect(emailButton("Open", "https://oliahq.com/a")).toContain('href="https://oliahq.com/a"');
    const html = emailButton("Open", `https://oliahq.com/?x="onmouseover="alert(1)`);
    expect(html).not.toContain(`"onmouseover="`);
  });

  it("escapes DB-derived values in the alert and digest emails", () => {
    const alert = buildAlertEmail({
      id: "1", type: "warn", message: PAYLOAD, area: PAYLOAD, time: null, source: PAYLOAD,
      created_at: "2026-10-03T14:22:00Z", organization_id: "o", recipient_email: "a@b.c",
    });
    expect(alert.htmlBody).not.toContain("<script>");
    expect(alert.htmlBody).not.toContain("<img src=x");
    expect(alert.htmlBody).not.toContain("onerror='");

    const digest = buildDigestEmail({ dateStr: PAYLOAD, unstarted: [PAYLOAD], unfinished: [PAYLOAD], isTest: false });
    expect(digest.htmlBody).not.toContain("<script>");
    expect(digest.htmlBody).not.toContain("<img src=x");
  });
});
