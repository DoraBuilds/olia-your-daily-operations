export type InfohubAiAction = "summary" | "flashcards" | "quiz";

export interface InfohubAiRequest {
  action: InfohubAiAction;
  title: string;
  content: string;
}

export interface InfohubAiSummaryResult {
  type: "summary";
  title: string;
  bullets: string[];
  takeaway: string;
}

export interface InfohubAiFlashcardResult {
  type: "flashcards";
  title: string;
  cards: { front: string; back: string }[];
}

export interface InfohubAiQuizQuestion {
  question: string;
  options: string[];
  answerIndex: number;
  explanation: string;
}

export interface InfohubAiQuizResult {
  type: "quiz";
  title: string;
  questions: InfohubAiQuizQuestion[];
}

export type InfohubAiResult =
  | InfohubAiSummaryResult
  | InfohubAiFlashcardResult
  | InfohubAiQuizResult;

export function buildInfohubAiSystemPrompt(action: InfohubAiAction) {
  const shared = `You are an expert hospitality trainer helping staff learn Infohub content.
Return only valid JSON, no markdown, no code fences, no explanation.`;

  if (action === "summary") {
    return `${shared}
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
    return `${shared}
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

  return `${shared}
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

export function buildInfohubAiUserPrompt(request: InfohubAiRequest) {
  const content = request.content.trim();
  return `Document title: ${request.title}
Document content:
${content}

Task: generate a ${request.action} output from the document above.`;
}

export function isInfohubAiResult(value: unknown): value is InfohubAiResult {
  if (!value || typeof value !== "object") return false;
  const result = value as Partial<InfohubAiResult>;
  if (result.type === "summary") return Array.isArray((result as InfohubAiSummaryResult).bullets);
  if (result.type === "flashcards") return Array.isArray((result as InfohubAiFlashcardResult).cards);
  if (result.type === "quiz") return Array.isArray((result as InfohubAiQuizResult).questions);
  return false;
}
