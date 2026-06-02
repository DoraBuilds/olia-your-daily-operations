// Supabase Edge Function — generate-checklist
// Proxies requests to Anthropic Claude to keep the API key server-side.
// Called by BuildWithAIModal (mode: "text") and ConvertFileModal (mode: "file" | "document").

import { enforcePaidPlan } from "../_shared/plan-guard.ts";
import { corsHeaders } from "../_shared/cors.ts";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");

const SYSTEM_PROMPT = `You are a hospitality operations expert. Generate a checklist as a JSON object.

Return ONLY valid JSON — no explanation, no markdown fences:

{
  "title": "checklist title",
  "sections": [
    {
      "id": "sec-1",
      "name": "Section Name",
      "questions": [
        { "id": "q-1", "text": "Question text", "responseType": "checkbox", "required": true }
      ]
    }
  ]
}

RESPONSE TYPE — pick the FIRST that matches:

• "instruction" — item tells staff to DO something (imperative verb: "Limpia los carros", "Asegúrate de que…", "Lleva la basura a…", "Check that X is done"). This includes action steps that have a photo/image in the source — the image shows HOW to do it, so the item is still an instruction. Add the image warning below.
• "datetime" — item asks WHEN something happened or should happen ("¿Cuándo se limpió X?", "When was X last done?", "Fecha del último…", "Record the date/time"). Use this for any question starting with ¿Cuándo / When / Date / Time.
• "number" — plain count or quantity (not temperature).
• "number" + temperature — item asks for a temperature reading. You MUST output it like this example:
  {"id":"q-1","text":"Temperatura del nevera","responseType":"number","required":true,"config":{"mode":"temperature"}}
• "multiple_choice" ["Sí","No"] — YES/NO verification question where staff must explicitly record the answer ("¿Se ha limpiado X?", "¿Está Y en orden?", "Is X clean?"). Add "selectionMode":"single" and "choices":["Sí","No"] (or ["Yes","No"] in English).
• "multiple_choice" other — ONLY when the source explicitly lists 3+ named options (e.g. "Bueno/Regular/Malo"). Add "selectionMode":"single" and "choices":[…]. Do NOT invent options.
• "checkbox" — ONLY a plain to-do task with no answer options in the source (a box to tick, nothing more).
• "media" — item asks staff to take/submit a photo as evidence of a completed task (NOT an item that has a photo in the source document — that is "instruction").
• "text" — open-ended written answer, nothing else fits.

WARNINGS — add "uncertain":true AND "warning":"<reason>" when:
• Source had an image/photo attached to this item → "The source document had an image attached to this item that could not be transferred. Please add the image manually."
• Source had conditional logic or triggers → "The source had conditional logic that could not be converted. Please set up the logic manually using 'Add logic'."
• Type is genuinely ambiguous → "Response type uncertain — please review."

GENERAL:
• Preserve the source language exactly. Never translate.
• Never duplicate questions.
• When converting a file, extract every item from the source; do not invent new ones.
• Omit fields that are not needed (no "config" unless temperature, no "choices" unless multiple_choice).`;

Deno.serve(async (req) => {
  const CORS = corsHeaders(req.headers.get("origin"));

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  const planBlock = await enforcePaidPlan(req.headers.get("authorization"), req.headers.get("origin"));
  if (planBlock) return planBlock;

  if (!ANTHROPIC_API_KEY) {
    return new Response(
      JSON.stringify({ error: "ANTHROPIC_API_KEY is not configured" }),
      { status: 500, headers: { "Content-Type": "application/json", ...CORS } }
    );
  }

  try {
    const body = await req.json();
    const { prompt, mode, content, fileBase64, fileType } = body as {
      prompt?: string;
      mode?: "text" | "file" | "document";
      content?: string;
      fileBase64?: string;
      fileType?: string;
    };

    let messages: unknown[];

    if (mode === "document" && fileBase64 && fileType) {
      // PDF or image — send as vision/document content block
      const isPdf = fileType === "application/pdf";
      const contentBlock = isPdf
        ? { type: "document", source: { type: "base64", media_type: fileType, data: fileBase64 } }
        : { type: "image", source: { type: "base64", media_type: fileType, data: fileBase64 } };
      messages = [{
        role: "user",
        content: [
          contentBlock,
          {
            type: "text",
            text: "Convert this document into a hospitality operations checklist. Preserve the source language. Extract all tasks, checks and questions from the document and organise them into logical sections. Return only the JSON.",
          },
        ],
      }];
    } else if (mode === "file" && content) {
      messages = [{
        role: "user",
        content: `Convert this document content into a hospitality operations checklist. Preserve the source language. Extract the tasks and checks and organise them into logical sections:\n\n${content}`,
      }];
    } else if (prompt) {
      messages = [{
        role: "user",
        content: `Create a hospitality operations checklist for: ${prompt}`,
      }];
    } else {
      return new Response(
        JSON.stringify({ error: "Provide either prompt (text mode) or content/fileBase64 (file/document mode)" }),
        { status: 400, headers: { "Content-Type": "application/json", ...CORS } }
      );
    }

    const model = "claude-sonnet-4-6";

    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 8192,
        system: SYSTEM_PROMPT,
        messages,
      }),
    });

    if (!anthropicRes.ok) {
      const err = await anthropicRes.text();
      console.error(`Anthropic error ${anthropicRes.status}:`, err);
      // Return 200 so Supabase client puts the body in data (not fnError),
      // letting the actual Anthropic error reach the frontend.
      return new Response(
        JSON.stringify({ error: `Anthropic ${anthropicRes.status}: ${err}` }),
        { headers: { "Content-Type": "application/json", ...CORS } }
      );
    }

    const anthropicData = await anthropicRes.json();
    const rawText: string = anthropicData.content?.[0]?.text ?? "";

    // Parse the JSON from Claude's response
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      // Claude sometimes wraps JSON in markdown code fences — strip them
      const match = rawText.match(/\{[\s\S]*\}/);
      if (match) {
        parsed = JSON.parse(match[0]);
      } else {
        throw new Error("AI returned non-JSON output. Please try again.");
      }
    }

    return new Response(JSON.stringify(parsed), {
      headers: { "Content-Type": "application/json", ...CORS },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    // Return 200 so Supabase puts the body in data (not fnError), letting the real error reach the frontend
    return new Response(
      JSON.stringify({ error: message }),
      { headers: { "Content-Type": "application/json", ...CORS } }
    );
  }
});
