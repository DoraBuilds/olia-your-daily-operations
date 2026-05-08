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

Rules:
- Valid responseType values: text, number, checkbox, datetime, media, instruction, multiple_choice
- Create 2–4 sections with 3–6 questions each
- Questions must be practical, specific and actionable for hospitality operations
- PRESERVE the source language of the document — if the content is in Spanish, write all question text and choices in Spanish; never translate
- Use "number" for temperature or quantity readings
- Use "checkbox" ONLY for simple yes/no to-do-style tasks where the user ticks it off as done (e.g. "Is the equipment clean?", "Has the area been sanitised?")
- Use "multiple_choice" when the question has specific named answer options (e.g. Sí/No, Bueno/Regular/Malo, Pass/Fail, Good/Fair/Poor). For multiple_choice questions you MUST add "selectionMode": "single" and "choices": ["Option 1", "Option 2"] to the question object
- Use "media" for photo evidence requirements
- Use "text" for open-ended written answers
- If you are not confident about the responseType for a question, add "uncertain": true to that question object so the user can review it
- If converting a file, extract the actual items/checks from the content and organise them into logical sections`;

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

    // Use claude-3-5-sonnet-20241022 for all modes — confirmed available on this API key
    const model = "claude-3-5-sonnet-20241022";

    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 2048,
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
