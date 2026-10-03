// Shared branded shell for transactional emails (alerts, digest). The login
// code email lives in supabase/templates/magic-link.html (pasted into the
// Supabase Auth dashboard) and mirrors this look — keep the two in sync.
//
// Table-based with inline styles: Gmail/Outlook ignore most <style> and web
// fonts, so the wordmark falls back to Georgia and the logo is a PNG
// (SVG is blocked by most mail clients).

export const BRAND = {
  ink: "#0B100E",
  muted: "#5F6B66",
  teal: "#00E5CC",
  tealDeep: "#007E70",
  tealTint: "#E6FBF8",
  border: "#E3E8E6",
  page: "#F3F6F5",
} as const;

// The app icon (dark rounded square with the rings) reads on light and dark
// mail backgrounds; the transparent mark PNGs are white-on-clear and vanish.
export const LOGO_URL = "https://oliahq.com/olia-app-icon-180.png";
export const APP_URL = "https://oliahq.com";
export const SERIF = "Georgia,'Times New Roman',serif";
const SANS = "-apple-system,'Segoe UI',Helvetica,Arial,sans-serif";

export function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Only https links are allowed in the CTA; anything else (javascript:, data:,
// malformed) falls back to the app URL rather than reaching the href.
function safeHref(href: string): string {
  try {
    const u = new URL(href, APP_URL);
    return u.protocol === "https:" ? u.toString() : APP_URL;
  } catch {
    return APP_URL;
  }
}

export function emailButton(label: string, href: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 0"><tr>
    <td style="background:${BRAND.ink};border-radius:999px">
      <a href="${esc(safeHref(href))}" style="display:inline-block;padding:13px 28px;font-family:${SANS};font-size:14px;font-weight:600;color:#ffffff;text-decoration:none">${esc(label)}</a>
    </td>
  </tr></table>`;
}

export function emailShell(opts: { eyebrow: string; bodyHtml: string; footerHtml: string }): string {
  const { eyebrow, bodyHtml, footerHtml } = opts;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<style>
  @media (prefers-color-scheme: dark) {
    .o-page { background:#0B100E !important; }
    .o-card { background:#151B19 !important; border-color:#26302D !important; }
    .o-ink { color:#F2F5F4 !important; }
    .o-muted { color:#A3AEA9 !important; }
    .o-tint { background:#12302C !important; }
  }
  @media only screen and (max-width:620px) {
    .o-pad { padding-left:20px !important; padding-right:20px !important; }
  }
</style>
</head>
<body class="o-page" style="margin:0;padding:0;background:${BRAND.page}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="o-page" style="background:${BRAND.page}"><tr><td align="center" style="padding:32px 12px">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" class="o-card" style="width:100%;max-width:600px;background:#ffffff;border:1px solid ${BRAND.border};border-radius:20px;overflow:hidden">
    <tr><td style="height:4px;background:${BRAND.teal};font-size:0;line-height:0">&nbsp;</td></tr>
    <tr><td class="o-pad" style="padding:28px 36px 8px">
      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
        <td style="vertical-align:middle"><img src="${LOGO_URL}" width="36" height="36" alt="" style="display:block;border:0;border-radius:9px"></td>
        <td class="o-ink" style="vertical-align:middle;padding-left:10px;font-family:${SERIF};font-size:28px;line-height:1;color:${BRAND.ink}">Olia</td>
        <td style="vertical-align:middle;padding-left:14px"><span class="o-tint" style="display:inline-block;padding:4px 10px;border-radius:999px;background:${BRAND.tealTint};color:${BRAND.tealDeep};font-family:${SANS};font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase">${esc(eyebrow)}</span></td>
      </tr></table>
    </td></tr>
    <tr><td class="o-pad o-ink" style="padding:16px 36px 32px;font-family:${SANS};font-size:15px;line-height:1.55;color:${BRAND.ink}">
      ${bodyHtml}
    </td></tr>
    <tr><td class="o-pad o-muted" style="padding:0 36px 28px;font-family:${SANS};font-size:12px;line-height:1.55;color:${BRAND.muted}">
      <div style="border-top:1px solid ${BRAND.border};padding-top:16px">${footerHtml}</div>
    </td></tr>
  </table>
</td></tr></table>
</body>
</html>`;
}
