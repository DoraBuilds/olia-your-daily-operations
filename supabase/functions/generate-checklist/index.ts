// Supabase Edge Function — generate-checklist
// Proxies requests to Anthropic Claude to keep the API key server-side.
// Called by BuildWithAIModal (mode: "text") and ConvertFileModal (mode: "file").

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
- Valid responseType values: text, number, checkbox, datetime, media, signature, person, instruction, multiple_choice
- Create 2–4 sections with 3–6 questions each
- Questions must be practical, specific and actionable for hospitality operations
- Use "number" for temperature/quantity readings, "checkbox" for yes/no compliance checks, "media" for photo evidence, "text" for open notes
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
    const { prompt, mode, content } = body as {
      prompt?: string;
      mode?: "text" | "file";
      content?: string;
    };

    let userMessage: string;
    if (mode === "file" && content) {
      userMessage = `Convert this document content into a hospitality operations checklist. Extract the tasks and checks and organise them into logical sections:\n\n${content}`;
    } else if (prompt) {
      userMessage = `Create a hospitality operations checklist for: ${prompt}`;
    } else {
      return new Response(
        JSON.stringify({ error: "Provide either prompt (text mode) or content (file mode)" }),
        { status: 400, headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
      );
    }

    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-3-5-haiku-20241022",
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userMessage }],
      }),
    });

    if (!anthropicRes.ok) {
      const err = await anthropicRes.text();
      return new Response(
        JSON.stringify({ error: `Anthropic API error (${anthropicRes.status}): ${err}` }),
        { status: 502, headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
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
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
    );
  }
});
