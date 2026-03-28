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
