/**
 * sanitize.ts — URL sanitization helpers for user-supplied content.
 *
 * Guards against stored XSS via unvalidated imageUrl fields in checklist
 * JSONB data (SEQ-007). Images must come from Supabase storage, the app's
 * own origin, or be inline base64 data URIs captured by the kiosk camera.
 */

/**
 * Hostnames (or hostname suffixes) that are allowed.
 * A parsed URL is considered safe when its hostname either exactly equals one
 * of these entries, or ends with ".<entry>" (i.e. any subdomain is allowed).
 */
const ALLOWED_IMAGE_HOSTNAMES: string[] = [
  "supabase.co",
  "supabase.in",
];

// Pull in the project's Supabase URL at build time so uploads to this
// project's Storage bucket are always allowed.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
if (SUPABASE_URL) {
  try {
    const supabaseHostname = new URL(SUPABASE_URL).hostname;
    if (supabaseHostname && !ALLOWED_IMAGE_HOSTNAMES.includes(supabaseHostname)) {
      ALLOWED_IMAGE_HOSTNAMES.push(supabaseHostname);
    }
  } catch { /* ignore malformed env value */ }
}

/**
 * Returns true only for image URLs that the app itself can legitimately
 * produce or store:
 *
 *  - Relative paths (same-origin)
 *  - `data:image/…` URIs (base64 photos captured by MediaInput)
 *  - Absolute HTTPS URLs whose origin is on the allowlist (Supabase Storage)
 *
 * Everything else — including http://, javascript:, arbitrary HTTPS origins,
 * and blob: URLs — is rejected.
 */
export function isAllowedImageUrl(url: string | undefined | null): boolean {
  if (!url) return false;

  // Same-origin relative paths produced by the app itself.
  if (url.startsWith("/") || url.startsWith("./")) return true;

  // Base64 data URIs — kiosk camera captures and builder file-uploads both
  // produce these. Only allow image/* subtypes.
  if (url.startsWith("data:image/")) return true;

  try {
    const parsed = new URL(url);
    // Require HTTPS for all absolute URLs.
    if (parsed.protocol !== "https:") return false;
    const { hostname } = parsed;
    // Allow exact match or any subdomain of an allowlisted hostname.
    return ALLOWED_IMAGE_HOSTNAMES.some(
      allowed => hostname === allowed || hostname.endsWith(`.${allowed}`),
    );
  } catch {
    return false;
  }
}

/**
 * Returns the URL unchanged if it passes the allowlist check, or
 * `undefined` if it should be blocked.  Use the return value as the
 * `src` prop — React will not render `<img src={undefined}>`.
 */
export function sanitizeImageUrl(url: string | undefined | null): string | undefined {
  return isAllowedImageUrl(url) ? (url as string) : undefined;
}
