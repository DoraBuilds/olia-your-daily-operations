// Supabase Edge Function - infohub-ai-tools
// Generates Infohub study outputs from document/training content.

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SHARED_PROMPT = `You are an expert hospitality trainer helping staff learn Infohub content.
Return only valid JSON, no markdown, no code fences, no explanation.`;

function buildSystemPrompt(action: "summary" | "flashcards" | "quiz") {
  if (action === "summary") {
    return `${SHARED_PROMPT}
Create a concise summary with exactly this shape:
{
  "type": "summary",
  "title": "string",
  "bullets": ["string", "string", "string", "string"],
  "takeaway": "string"
}
Rules:
- 4 to 6 bullet points
- keep bullets practical and concise
- the takeaway should be one short sentence that captures the main point`;
  }

  if (action === "flashcards") {
    return `${SHARED_PROMPT}
Create flashcards with exactly this shape:
{
  "type": "flashcards",
  "title": "string",
  "cards": [
    { "front": "string", "back": "string" }
  ]
}
Rules:
- create 4 to 6 cards
- each card should ask a useful question and answer it clearly
- keep front and back short enough for quick revision`;
  }

  return `${SHARED_PROMPT}
Create a short quiz with exactly this shape:
{
  "type": "quiz",
  "title": "string",
  "questions": [
    {
      "question": "string",
      "options": ["string", "string", "string", "string"],
      "answerIndex": 0,
      "explanation": "string"
    }
  ]
}
Rules:
- create 4 to 5 multiple-choice questions
- each question must have exactly 4 options
- answerIndex must be the zero-based index of the correct option
- explanation should explain why that answer is correct`;
}

function buildUserPrompt(title: string, content: string, action: string) {
  return `Document title: ${title}
Document content:
${content.trim()}

Task: generate a ${action} output from the document above.`;
}

function parseJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error("AI returned non-JSON output. Please try again.");
  }
}

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
    const action = body?.action as "summary" | "flashcards" | "quiz" | undefined;
    const title = String(body?.title ?? "").trim();
    const content = String(body?.content ?? "").trim();

    if (!action || !title || !content) {
      return new Response(
        JSON.stringify({ error: "Provide action, title, and content" }),
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
        max_tokens: 2200,
        system: buildSystemPrompt(action),
        messages: [{ role: "user", content: buildUserPrompt(title, content, action) }],
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
    const parsed = parseJson(rawText);

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
