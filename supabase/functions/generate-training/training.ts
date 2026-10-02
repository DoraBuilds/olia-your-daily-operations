import type { TrainingCategory } from "../../../src/lib/training-ai.ts";

export interface TrainingModulePayload {
  title: string;
  category: TrainingCategory;
  duration: string;
  steps: string[];
}

export interface TrainingPromptInput {
  prompt: string;
  category?: TrainingCategory;
}

export function buildTrainingPrompt(input: TrainingPromptInput): string {
  const categoryLine = input.category
    ? `The module should fit the ${input.category} track.`
    : "Choose the most suitable track: onboarding or troubleshooting.";

  return [
    `Create a practical staff training module for: ${input.prompt}.`,
    categoryLine,
    "Return ONLY valid JSON with this exact shape:",
    `{`,
    `  "title": "module title",`,
    `  "category": "onboarding" or "troubleshooting",`,
    `  "duration": "5 min",`,
    `  "steps": ["Step 1", "Step 2"]`,
    `}`,
    "Rules:",
    "- Steps must be clear, actionable and hospitality-focused.",
    "- Use 4 to 8 steps.",
    "- Keep the title short and practical.",
    "- Duration should be realistic and formatted like '6 min'.",
    "- Category must be onboarding or troubleshooting.",
  ].join("\n");
}

/** Max characters of a source document sent to the model. */
export const MAX_SOURCE_CHARS = 60_000;

export const DOCUMENT_SYSTEM_PROMPT = `You convert an existing document (manual, procedure, SOP) into a staff training module.

Return ONLY valid JSON with this exact structure - no explanation, no markdown code fences:

{
  "title": "module title",
  "category": "onboarding",
  "duration": "6 min",
  "steps": ["Step 1", "Step 2"]
}

Rules:
- Write in the same language as the document
- Stay faithful to the document: keep its numbers, settings, temperatures, part names and warnings; never invent information
- Produce 4 to 15 steps, each short, self-contained and actionable; split long procedures logically and put safety warnings in the step they apply to
- category must be either onboarding or troubleshooting
- duration should be a realistic reading/practice time such as 8 min`;

export function buildDocumentTrainingPrompt(title: string, content: string): string {
  return [
    `Convert this document into a training module. Suggested title: ${title}.`,
    "Document content:",
    content.trim().slice(0, MAX_SOURCE_CHARS),
  ].join("\n\n");
}

export function parseTrainingModule(rawText: string): TrainingModulePayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    const match = rawText.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("AI returned non-JSON output. Please try again.");
    parsed = JSON.parse(match[0]);
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("AI returned invalid training content. Please try again.");
  }

  const { title, category, duration, steps } = parsed as Record<string, unknown>;
  const normalizedCategory = category === "troubleshooting" ? "troubleshooting" : "onboarding";

  if (typeof title !== "string" || !title.trim()) {
    throw new Error("AI returned a training module without a title.");
  }
  if (typeof duration !== "string" || !duration.trim()) {
    throw new Error("AI returned a training module without a duration.");
  }
  if (!Array.isArray(steps) || steps.some(step => typeof step !== "string" || !step.trim())) {
    throw new Error("AI returned invalid training steps.");
  }

  return {
    title: title.trim(),
    category: normalizedCategory,
    duration: duration.trim(),
    steps: steps.map(step => step.trim()),
  };
}
