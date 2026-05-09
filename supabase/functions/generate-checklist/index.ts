// Supabase Edge Function — generate-checklist
// Proxies requests to Anthropic Claude to keep the API key server-side.
// Called by BuildWithAIModal (mode: "text") and ConvertFileModal (mode: "file" | "document").

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM_PROMPT = `You are a hospitality operations expert. Generate a practical checklist as a JSON object.

Return ONLY valid JSON with this exact structure — no explanation, no markdown code fences:

{
  "title": "checklist title",
  "sections": [
    {
      "id": "sec-1",
      "name": "Section Name",
      "questions": [
        {
          "id": "q-1",
          "text": "Question text",
          "responseType": "checkbox",
          "required": true,
          "config": {}
        }
      ]
    }
  ]
}

== RESPONSE TYPE RULES (apply in order) ==

1. INSTRUCTION — use when the item is a staff instruction or action step (imperative: "Clean the X", "Place the Y", "Check that Z"), not a question asking for a response. config: {}

2. DATETIME — use when asking for a date or time (e.g. "When was X last done?", "Date of last cleaning", "Record the time"). config: {}

3. NUMBER (plain) — use for numeric quantities (counts, amounts). config: {}

4. NUMBER (temperature) — use when measuring temperature. You MUST add "config": { "mode": "temperature" } to the question object.

5. CHECKBOX — use ONLY for simple yes/no to-do tasks the user ticks off (e.g. "Is the equipment clean?"). config: {}

6. MULTIPLE_CHOICE — use when the question has specific named options (Sí/No, Pass/Fail, Good/Fair/Poor, Bueno/Regular/Malo). You MUST add "selectionMode": "single" and "choices": ["Option 1", "Option 2"]. Do NOT use multiple_choice for open date questions.

7. MEDIA — use when asking for a photo as evidence of a completed task.

8. TEXT — use for open-ended written answers only when no other type fits.

== WARNING RULES (non-negotiable) ==

Add "uncertain": true AND "warning": "<reason>" to any question where:
- The source had an image or photo attached to an instruction → warning: "The source document had an image attached to this item that could not be transferred. Please add the image manually."
- The source had conditional logic or triggers (e.g. "if temperature < X, then…") → warning: "The source had conditional logic that could not be converted. Please set up the logic manually using 'Add logic'."
- The response type is genuinely ambiguous → warning: "Response type uncertain — please review and choose the correct one."
- A question from the source could not be clearly categorised → warning: "This item could not be fully converted. Please review."

== GENERAL RULES ==

- PRESERVE the source language exactly — if the content is in Spanish, write all text and choices in Spanish; never translate
- Do NOT duplicate questions — each check appears exactly once
- When converting a file, extract every item from the source; do not invent new ones
- For new checklists (not file conversion): create 2–4 sections with 3–6 questions each, practical and specific
- Omit any field that is empty or not applicable (e.g. omit "config" if it would be {}, omit "choices" if not multiple_choice)`;

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
