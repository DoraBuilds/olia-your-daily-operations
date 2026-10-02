/**
 * kiosk-library-file
 *
 * Lets the anonymous kiosk open an uploaded Infohub file (PDF/image). The
 * kiosk has no storage SELECT on the infohub-files bucket, so it trades
 * (location + kiosk token + team member + document id) for a short-lived
 * signed URL.
 *
 * Visibility is decided by get_kiosk_library — the same RPC that lists the
 * documents — so a file is only signed if this team member could see it in
 * the kiosk Infohub.
 *
 * Called by DocDetail (src/pages/kiosk/KioskLibrary.tsx):
 *   supabase.functions.invoke("kiosk-library-file", { body: { location_id, team_member_id, kiosk_token, document_id } })
 *
 * Responses (always 200, like the other functions here):
 *   { url, file_type }
 *   { error: "not_found" | "bad_request" | "server_error" }
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

  let body: { location_id?: string; team_member_id?: string | null; kiosk_token?: string; document_id?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad_request" });
  }
  const { location_id, kiosk_token, document_id } = body;
  const teamMemberId = body.team_member_id ?? null;
  if (
    !location_id || !UUID_RE.test(location_id) ||
    !kiosk_token || !UUID_RE.test(kiosk_token) ||
    !document_id || !UUID_RE.test(document_id) ||
    (teamMemberId !== null && !UUID_RE.test(teamMemberId))
  ) return json({ error: "bad_request" });

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await admin.rpc("get_kiosk_library", {
    p_location_id: location_id,
    p_team_member_id: teamMemberId,
    p_kiosk_token: kiosk_token,
  });
  if (error) {
    console.error("get_kiosk_library failed:", error.message);
    return json({ error: "server_error" });
  }

  const doc = (data?.documents ?? []).find((d: { id: string }) => d.id === document_id);
  const filePath = doc?.metadata?.filePath;
  if (!filePath) return json({ error: "not_found" });

  const { data: signed, error: signError } = await admin.storage
    .from("infohub-files")
    .createSignedUrl(filePath, 3600);
  if (signError || !signed?.signedUrl) {
    console.error("createSignedUrl failed:", signError?.message);
    return json({ error: "server_error" });
  }

  return json({ url: signed.signedUrl, file_type: doc.metadata.fileType ?? "" });
});
