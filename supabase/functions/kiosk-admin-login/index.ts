/**
 * kiosk-admin-login
 *
 * The in-kiosk "Admin" PIN on a code-paired tablet (#861). The tablet never
 * holds account credentials — it only has its kiosk device token. This
 * function trades (device token + owner Admin PIN) for a regular Supabase
 * session for that owner, which the kiosk then uses until "Back to Kiosk"
 * or the idle timeout signs it out again (see Kiosk.tsx).
 *
 * Called by AdminLoginModal (src/pages/kiosk/PinEntryModal.tsx):
 *   supabase.functions.invoke("kiosk-admin-login", { body: { device_token, pin } })
 *
 * Checks live in kiosk_admin_pin_login (service_role only): the device must
 * be paired and not deactivated, and the PIN goes through validate_admin_pin
 * (owner-only, 10 failed attempts per location per 5 minutes).
 *
 * Responses (always 200, like the other functions here):
 *   { access_token, refresh_token, team_member_id, location_id }
 *   { error: "invalid_pin" | "rate_limited" | "device_inactive" | "no_login" | "bad_request" | "server_error" }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2?target=denonext";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL              = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req: Request): Promise<Response> => {
  const CORS = corsHeaders(req.headers.get("origin"));
  const json = (body: unknown) =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json", ...CORS },
    });

  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST")    return json({ error: "bad_request" });

  let body: { device_token?: string; pin?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad_request" });
  }
  const deviceToken = body.device_token ?? "";
  const pin = body.pin ?? "";
  if (!UUID_RE.test(deviceToken) || !/^\d{4}$/.test(pin)) return json({ error: "bad_request" });

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await admin.rpc("kiosk_admin_pin_login", {
    p_device_token: deviceToken,
    p_pin: pin,
  });
  if (error) {
    if (error.message?.includes("Too many PIN attempts")) return json({ error: "rate_limited" });
    if (error.message?.includes("kiosk_device_inactive")) return json({ error: "device_inactive" });
    console.error("kiosk_admin_pin_login failed:", error.message);
    return json({ error: "server_error" });
  }

  const match = Array.isArray(data) ? data[0] : null;
  if (!match) return json({ error: "invalid_pin" });
  if (!match.email) return json({ error: "no_login" });

  // Mint a session without sending anything: generateLink only returns the
  // one-time token, which we redeem straight away.
  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: match.email,
  });
  const tokenHash = link?.properties?.hashed_token;
  if (linkError || !tokenHash) {
    console.error("generateLink failed:", linkError?.message);
    return json({ error: "server_error" });
  }

  const { data: verified, error: verifyError } = await admin.auth.verifyOtp({
    type: "magiclink",
    token_hash: tokenHash,
  });
  const session = verified?.session;
  if (verifyError || !session) {
    console.error("verifyOtp failed:", verifyError?.message);
    return json({ error: "server_error" });
  }

  return json({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    team_member_id: match.team_member_id,
    location_id: match.location_id,
  });
});
