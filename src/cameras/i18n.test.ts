import { describe, expect, test } from "bun:test";
import { detectLocale, type Locale, setLocale, STRINGS, t } from "./i18n";

const LOCALES: Locale[] = ["en", "nl", "de", "fr"];

describe("locales", () => {
  test("every language carries exactly the English key set", () => {
    const english = Object.keys(STRINGS.en).sort();
    for (const loc of LOCALES) expect(Object.keys(STRINGS[loc]).sort(), loc).toEqual(english);
  });

  test("no value is empty", () => {
    for (const loc of LOCALES) {
      setLocale(loc);
      for (const key of Object.keys(STRINGS.en) as (keyof typeof STRINGS.en)[]) {
        expect(t(key).trim(), `${loc}.${key}`).not.toBe("");
      }
    }
    setLocale("en");
  });

  test("unknown languages fall back to English", () => {
    expect(detectLocale("nl-NL")).toBe("nl");
    expect(detectLocale("pt-BR")).toBe("en");
    expect(detectLocale(undefined)).toBe("en");
  });
});
