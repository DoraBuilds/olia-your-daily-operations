import {
  buildInfohubAiSystemPrompt,
  buildInfohubAiUserPrompt,
  isInfohubAiResult,
} from "@/lib/infohub-ai";

describe("infohub-ai helpers", () => {
  it("builds a summary prompt with the right JSON schema guidance", () => {
    const system = buildInfohubAiSystemPrompt("summary");
    expect(system).toContain('"type": "summary"');
    expect(system).toContain("4 to 6 bullet points");
  });

  it("builds a flashcards prompt with the right JSON schema guidance", () => {
    const system = buildInfohubAiSystemPrompt("flashcards");
    expect(system).toContain('"type": "flashcards"');
    expect(system).toContain("4 to 6 cards");
  });

  it("builds a quiz prompt with the right JSON schema guidance", () => {
    const system = buildInfohubAiSystemPrompt("quiz");
    expect(system).toContain('"type": "quiz"');
    expect(system).toContain("4 to 5 multiple-choice questions");
  });

  it("builds a user prompt with the document title and content", () => {
    const user = buildInfohubAiUserPrompt({
      action: "summary",
      title: "Opening Checklist",
      content: "Check the fridge temperature.",
    });

    expect(user).toContain("Opening Checklist");
    expect(user).toContain("Check the fridge temperature.");
    expect(user).toContain("generate a summary output");
  });

  it("validates supported AI result payloads", () => {
    expect(isInfohubAiResult({
      type: "summary",
      title: "Doc",
      bullets: ["One"],
      takeaway: "Two",
    })).toBe(true);

    expect(isInfohubAiResult({
      type: "flashcards",
      title: "Doc",
      cards: [{ front: "Q", back: "A" }],
    })).toBe(true);

    expect(isInfohubAiResult({
      type: "quiz",
      title: "Doc",
      questions: [{ question: "Q", options: ["A", "B", "C", "D"], answerIndex: 0, explanation: "Because." }],
    })).toBe(true);

    expect(isInfohubAiResult({ type: "summary", title: "Doc", bullets: [], takeaway: "" })).toBe(true);
  });
});
