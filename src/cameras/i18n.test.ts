import { describe, expect, test } from "bun:test";
import { detectLocale, type Locale, setLocale, STRINGS, t } from "./i18n";

const LOCALES: Locale[] = ["en", "nl", "de", "fr"];
const TEMPLATED = new Set(["ago"]);

describe("locales", () => {
  test("every language carries exactly the English key set", () => {
    const english = Object.keys(STRINGS.en).sort();
    for (const loc of LOCALES) expect(Object.keys(STRINGS[loc]).sort(), loc).toEqual(english);
  });

  test("no value is empty or an unfilled template", () => {
    for (const loc of LOCALES) {
      setLocale(loc);
      for (const key of Object.keys(STRINGS.en) as (keyof typeof STRINGS.en)[]) {
        expect(t(key).trim(), `${loc}.${key}`).not.toBe("");
        if (!TEMPLATED.has(key)) expect(t(key), `${loc}.${key}`).not.toContain("{");
      }
      expect(t("ago", { s: 12 }), loc).toContain("12");
    }
    setLocale("en");
  });

  test("unknown languages fall back to English", () => {
    expect(detectLocale("nl-NL")).toBe("nl");
    expect(detectLocale("pt-BR")).toBe("en");
    expect(detectLocale(undefined)).toBe("en");
  });
});
