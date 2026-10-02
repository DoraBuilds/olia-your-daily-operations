// Supabase Edge Function - infohub-ocr
// Transcribes the text of an uploaded Infohub file that has no text layer
// (scanned PDF or a photo of a page) by sending it to Claude. The caller saves
// the returned text on the document body, so each file is only OCR'd once.
//
// Called by Infohub (src/pages/Infohub.tsx) when AI Tools is opened on a file
// whose local text extraction came back empty:
//   supabase.functions.invoke("infohub-ocr", { body: { file_path } })
// Response: { text } or { error }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encodeBase64 } from "https://deno.land/std@0.224.0/encoding/base64.ts";
import { enforcePaidPlan } from "../_shared/plan-guard.ts";
import { corsHeaders } from "../_shared/cors.ts";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const MAX_CHARS = 100_000;
const SUPPORTED = ["application/pdf", "image/jpeg", "image/png", "image/webp"];

const PROMPT =
  "Transcribe all the text in this document exactly as written, in its original language. " +
  "Keep headings, lists and tables readable as plain text. Do not summarise, translate or add commentary. " +
  "Return only the transcribed text. If there is no readable text, return an empty response.";

Deno.serve(async (req) => {
  const CORS = corsHeaders(req.headers.get("origin"));
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS } });

  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (!ANTHROPIC_API_KEY) return json({ error: "ANTHROPIC_API_KEY is not configured" }, 500);

  const authHeader = req.headers.get("authorization");
  const planBlock = await enforcePaidPlan(authHeader, req.headers.get("origin"));
  if (planBlock) return planBlock;

  try {
    const body = await req.json();
    const filePath = String(body?.file_path ?? "").trim();
    if (!filePath || filePath.includes("..")) return json({ error: "Provide file_path" }, 400);

    // Download as the caller so storage RLS decides whether they may read the file.
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader! } },
      auth: { persistSession: false },
    });
    const { data: blob, error: dlError } = await userClient.storage.from("infohub-files").download(filePath);
    if (dlError || !blob) return json({ error: "File not found" }, 404);

    const mediaType = blob.type;
    if (!SUPPORTED.includes(mediaType)) return json({ error: "Unsupported file type" }, 415);

    const data = encodeBase64(new Uint8Array(await blob.arrayBuffer()));
    const block = mediaType === "application/pdf"
      ? { type: "document", source: { type: "base64", media_type: mediaType, data } }
      : { type: "image", source: { type: "base64", media_type: mediaType, data } };

    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 16000,
        messages: [{ role: "user", content: [block, { type: "text", text: PROMPT }] }],
      }),
    });

    if (!anthropicRes.ok) {
      const err = await anthropicRes.text();
      return json({ error: `Anthropic API error (${anthropicRes.status}): ${err}` }, 502);
    }

    const result = await anthropicRes.json();
    const text = String(result.content?.[0]?.text ?? "").trim().slice(0, MAX_CHARS);
    return json({ text });
  } catch (err: unknown) {
    return json({ error: err instanceof Error ? err.message : "Internal error" }, 500);
  }
});
