// Shared CORS helper for AI edge functions.
// Set CORS_ALLOWED_ORIGINS in Supabase secrets to a comma-separated list of
// allowed origins (e.g. "https://myapp.com,capacitor://localhost").
// Leave unset (or set to "*") to allow all origins during development.

const raw = Deno.env.get("CORS_ALLOWED_ORIGINS") ?? "*";
const ALLOWED: "*" | Set<string> =
  raw.trim() === "*" ? "*" : new Set(raw.split(",").map((s) => s.trim()));

export function corsHeaders(origin: string | null): Record<string, string> {
  const allow =
    ALLOWED === "*"
      ? "*"
      : origin && (ALLOWED as Set<string>).has(origin)
      ? origin
      : "null";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}
