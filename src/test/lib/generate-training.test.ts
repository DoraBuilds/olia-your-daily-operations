import { describe, expect, it } from "vitest";

import { buildTrainingPrompt, parseTrainingModule } from "../../../supabase/functions/generate-training/training";

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
});
