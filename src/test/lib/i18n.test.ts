import { resolveSupportedLanguage, SUPPORTED_LANGUAGES, DEFAULT_LANGUAGE } from "@/lib/i18n";

describe("resolveSupportedLanguage", () => {
  it("returns the exact tag when directly supported", () => {
    expect(resolveSupportedLanguage("es")).toBe("es");
    expect(resolveSupportedLanguage("en")).toBe("en");
  });

  it("strips a region subtag and matches the base language", () => {
    expect(resolveSupportedLanguage("es-MX")).toBe("es");
    expect(resolveSupportedLanguage("en-GB")).toBe("en");
  });

  it("is case-insensitive", () => {
    expect(resolveSupportedLanguage("ES-mx")).toBe("es");
  });

  it("falls back to the default language for unsupported tags", () => {
    expect(resolveSupportedLanguage("fr")).toBe(DEFAULT_LANGUAGE);
    expect(resolveSupportedLanguage("fr-CA")).toBe(DEFAULT_LANGUAGE);
  });

  it("falls back to the default language for null/undefined/empty", () => {
    expect(resolveSupportedLanguage(null)).toBe(DEFAULT_LANGUAGE);
    expect(resolveSupportedLanguage(undefined)).toBe(DEFAULT_LANGUAGE);
    expect(resolveSupportedLanguage("")).toBe(DEFAULT_LANGUAGE);
  });
});

describe("SUPPORTED_LANGUAGES / DEFAULT_LANGUAGE", () => {
  it("includes English and Spanish", () => {
    expect(SUPPORTED_LANGUAGES).toContain("en");
    expect(SUPPORTED_LANGUAGES).toContain("es");
  });

  it("defaults to English", () => {
    expect(DEFAULT_LANGUAGE).toBe("en");
  });
});
