// Supabase Edge Function — generate-training
// Proxies training-module requests to Anthropic Claude and returns a JSON module.

import { buildTrainingPrompt, parseTrainingModule, type TrainingCategory } from "./training.ts";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM_PROMPT = `You are a hospitality training specialist. Generate a practical training module as JSON.

Return ONLY valid JSON with this exact structure - no explanation, no markdown code fences:

{
  "title": "module title",
  "category": "onboarding",
  "duration": "6 min",
  "steps": ["Step 1", "Step 2"]
}

Rules:
- category must be either onboarding or troubleshooting
- produce 4 to 8 steps
- steps must be short, practical and actionable
- keep the title concise and useful
- duration should be realistic, such as 5 min or 8 min`;

Deno.serve(async (req) => {
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
    const { prompt, category } = body as {
      prompt?: string;
      category?: TrainingCategory;
    };

    if (!prompt || !prompt.trim()) {
      return new Response(
        JSON.stringify({ error: "Provide a prompt" }),
        { status: 400, headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
      );
    }

    const userMessage = buildTrainingPrompt({ prompt: prompt.trim(), category });

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
    const parsed = parseTrainingModule(rawText);

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
