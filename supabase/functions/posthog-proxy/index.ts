/**
 * posthog-proxy
 *
 * Reverse proxy for PostHog EU cloud, so client analytics requests go to
 * <project>.supabase.co instead of *.posthog.com. Most ad-block lists
 * (EasyList etc.) target the posthog.com domain specifically, so this
 * recovers a meaningful slice of client events that would otherwise be
 * silently dropped.
 *
 * Routing mirrors PostHog's own proxy recipes (Vercel rewrites, Cloudflare
 * Workers):
 *   /static/*, /array/*  -> https://eu-assets.i.posthog.com
 *   everything else      -> https://eu.i.posthog.com
 *
 * Must stay reachable by anonymous visitors — verify_jwt is disabled for
 * this function in supabase/config.toml, same as the other public-facing
 * functions (create-checkout-session, stripe-webhook).
 */

const API_HOST = "https://eu.i.posthog.com";
const ASSET_HOST = "https://eu-assets.i.posthog.com";
const FUNCTION_PATH = "/posthog-proxy";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
};

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  const url = new URL(req.url);
  let path = url.pathname;
  const cut = path.indexOf(FUNCTION_PATH);
  if (cut !== -1) path = path.slice(cut + FUNCTION_PATH.length);
  if (path === "") path = "/";

  const upstreamHost =
    path.startsWith("/static/") || path.startsWith("/array/") ? ASSET_HOST : API_HOST;
  const upstreamUrl = `${upstreamHost}${path}${url.search}`;

  const headers = new Headers(req.headers);
  headers.delete("host");
  // Preserve the visitor's real IP for PostHog's geolocation — otherwise
  // every event would appear to originate from Supabase's edge network.
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) headers.set("x-forwarded-for", forwardedFor);

  const upstreamResponse = await fetch(upstreamUrl, {
    method: req.method,
    headers,
    body: ["GET", "HEAD"].includes(req.method) ? undefined : req.body,
  });

  const responseHeaders = new Headers(upstreamResponse.headers);
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    responseHeaders.set(key, value);
  }

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    headers: responseHeaders,
  });
});
