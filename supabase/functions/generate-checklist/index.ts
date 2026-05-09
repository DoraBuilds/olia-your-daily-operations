// Supabase Edge Function — generate-checklist
// Proxies requests to Anthropic Claude to keep the API key server-side.
// Called by BuildWithAIModal (mode: "text") and ConvertFileModal (mode: "file" | "document").

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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

• "instruction" — item tells staff to DO something (imperative: "Clean the X", "Take the Y to Z", "Limpia los carros"). The item is an action, not a question.
• "datetime" — item asks for a date or time ("When was X last done?", "Date of last cleaning", "¿Cuándo se limpió por última vez?").
• "number" — item asks for a plain count or quantity.
• "number" with "config":{"mode":"temperature"} — item asks for a temperature reading. Include the config field.
• "multiple_choice" with choices ["Sí","No"] — use when the source has a YES/NO verification question (e.g. "¿Se ha limpiado X?", "¿Está Y en orden?", "¿Se ha completado Z?") where staff must explicitly record Sí or No. Use the source language for the choices (["Yes","No"] in English, ["Sí","No"] in Spanish). Always add "selectionMode":"single".
• "multiple_choice" with other choices — ONLY when the source explicitly lists 3+ specific named options (e.g. "Bueno / Regular / Malo", "Pass / Fail / N/A"). Add "selectionMode":"single" and "choices":[…]. DO NOT invent choices.
• "checkbox" — ONLY for a simple task to tick off with no answer options in the source (e.g. "Limpiar el suelo" as a to-do item, not a question).
• "media" — item asks for a photo or image as evidence.
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
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (!ANTHROPIC_API_KEY) {
    return new Response(
      JSON.stringify({ error: "ANTHROPIC_API_KEY is not configured" }),
      { status: 500, headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
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
        { status: 400, headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
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
        { headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
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
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    // Return 200 so Supabase puts the body in data (not fnError), letting the real error reach the frontend
    return new Response(
      JSON.stringify({ error: message }),
      { headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
    );
  }
});
