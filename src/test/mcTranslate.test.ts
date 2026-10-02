import { describe, it, expect, afterEach } from "vitest";
import i18n from "@/lib/i18n";
import { translateChoice, getMcSetName, multipleChoiceSets } from "@/pages/checklists/data";

describe("multiple-choice preset translation", () => {
  afterEach(() => i18n.changeLanguage("en"));

  it("translates preset choices and set names in Spanish, leaving custom choices alone", async () => {
    await i18n.changeLanguage("es");
    expect(translateChoice("Yes")).toBe("Sí");
    expect(translateChoice("Non-Compliant")).toBe("No conforme");
    expect(translateChoice("Custom thing")).toBe("Custom thing");
    expect(getMcSetName(multipleChoiceSets[3])).toBe("Sí / No");
  });

  it("keeps English in English", async () => {
    await i18n.changeLanguage("en");
    expect(translateChoice("Pass")).toBe("Pass");
  });
});
