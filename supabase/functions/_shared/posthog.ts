// Shared PostHog server-side capture helper for edge functions.
// Uses the HTTP capture API directly (POSTHOG_PROJECT_KEY is the same
// public, client-safe project token as VITE_POSTHOG_KEY) rather than the
// posthog-node SDK, since a single fire-and-await POST needs no buffering
// or flush handling in a short-lived function.

const POSTHOG_PROJECT_KEY = Deno.env.get("POSTHOG_PROJECT_KEY");
const POSTHOG_HOST = Deno.env.get("POSTHOG_HOST") ?? "https://eu.i.posthog.com";
const CAPTURE_ENDPOINT = `${POSTHOG_HOST}/i/v0/e/`;

// Never throws — a capture failure must not fail the caller's request.
export async function captureServerEvent(
  event: string,
  distinctId: string,
  properties?: Record<string, unknown>,
): Promise<void> {
  if (!POSTHOG_PROJECT_KEY) return;

  try {
    await fetch(CAPTURE_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: POSTHOG_PROJECT_KEY,
        event,
        distinct_id: distinctId,
        properties,
        timestamp: new Date().toISOString(),
      }),
    });
  } catch (err) {
    console.error(`[posthog] capture failed for ${event}:`, err);
  }
}
