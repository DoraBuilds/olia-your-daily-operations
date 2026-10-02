import { describe, expect, it } from "vitest";

import { buildDocumentTrainingPrompt, buildTrainingPrompt, MAX_SOURCE_CHARS, parseTrainingModule } from "../../../supabase/functions/generate-training/training";

describe("generate-training helpers", () => {
  it("builds a prompt that includes the chosen training category", () => {
    const prompt = buildTrainingPrompt({
      prompt: "Handle a guest complaint",
      category: "troubleshooting",
    });

    expect(prompt).toContain("Handle a guest complaint");
    expect(prompt).toContain("troubleshooting track");
    expect(prompt).toContain("\"category\": \"onboarding\" or \"troubleshooting\"");
  });

  it("parses wrapped JSON into a training module payload", () => {
    const module = parseTrainingModule(`
      {
        "title": "Guest complaint handling",
        "category": "troubleshooting",
        "duration": "6 min",
        "steps": ["Listen first", "Offer a fix", "Escalate if needed"]
      }
    `);

    expect(module).toEqual({
      title: "Guest complaint handling",
      category: "troubleshooting",
      duration: "6 min",
      steps: ["Listen first", "Offer a fix", "Escalate if needed"],
    });
  });

  it("builds a document prompt with the title and truncates very long content", () => {
    const prompt = buildDocumentTrainingPrompt("Grinder maintenance", "x".repeat(MAX_SOURCE_CHARS + 500));
    expect(prompt).toContain("Grinder maintenance");
    expect(prompt.length).toBeLessThan(MAX_SOURCE_CHARS + 300);
  });
});
