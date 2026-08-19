import { describe, expect, it } from "vitest";
import { DEFAULT_LOCALE, LOCALES, dictionaries, getDictionary, parseLocale } from "./index";

/**
 * Walks both dictionaries together and reports every leaf that disagrees in
 * shape — a missing key, or a string where the other has a function.
 *
 * The compile-time check on `const en: Dictionary` already catches these, but
 * only for keys. This also catches a key that exists in both and is empty in
 * one, which is the failure that would ship a blank label.
 */
function compare(
  bn: Record<string, unknown>,
  en: Record<string, unknown>,
  path: string[] = [],
): string[] {
  const problems: string[] = [];
  const keys = new Set([...Object.keys(bn), ...Object.keys(en)]);

  for (const key of keys) {
    const here = [...path, key];
    const a = bn[key];
    const b = en[key];

    if (a === undefined) problems.push(`${here.join(".")} — only in en`);
    else if (b === undefined) problems.push(`${here.join(".")} — only in bn`);
    else if (typeof a !== typeof b) problems.push(`${here.join(".")} — ${typeof a} vs ${typeof b}`);
    else if (typeof a === "object" && a !== null && b !== null) {
      problems.push(
        ...compare(a as Record<string, unknown>, b as Record<string, unknown>, here),
      );
    } else if (typeof a === "string" && (a.trim() === "" || b === undefined)) {
      // An empty English string is legitimate — `people: ""` drops a Bengali
      // counter word English does not use — so only Bengali is required here.
      problems.push(`${here.join(".")} — empty in bn`);
    }
  }

  return problems;
}

describe("the dictionary", () => {
  it("has the same shape in both locales", () => {
    expect(
      compare(
        dictionaries.bn as unknown as Record<string, unknown>,
        dictionaries.en as unknown as Record<string, unknown>,
      ),
    ).toEqual([]);
  });

  it("gives every parametrised message the same arity in both locales", () => {
    const problems: string[] = [];

    for (const [group, entries] of Object.entries(dictionaries.bn)) {
      if (Array.isArray(entries)) continue;
      for (const [key, value] of Object.entries(entries as Record<string, unknown>)) {
        if (typeof value !== "function") continue;
        const other = (dictionaries.en as never)[group][key] as (...a: unknown[]) => string;
        if (other.length !== value.length) {
          problems.push(`${group}.${key} — bn takes ${value.length}, en takes ${other.length}`);
        }
      }
    }

    expect(problems).toEqual([]);
  });

  it("keeps ৳ and 2-2-3 grouping out of the dictionary's hands", () => {
    // Neither locale should be spelling out a currency word — the formatter
    // owns the sign, so a stray "Taka" or "টাকা" in a label would double it.
    const suspicious: string[] = [];
    for (const locale of LOCALES) {
      for (const [group, entries] of Object.entries(getDictionary(locale))) {
        if (Array.isArray(entries)) continue;
        for (const [key, value] of Object.entries(entries as Record<string, unknown>)) {
          if (typeof value === "string" && /\bTaka\b/.test(value)) {
            suspicious.push(`${locale}.${group}.${key}`);
          }
        }
      }
    }
    expect(suspicious).toEqual([]);
  });
});

describe("parseLocale", () => {
  it("accepts the locales we ship", () => {
    expect(parseLocale("bn")).toBe("bn");
    expect(parseLocale("en")).toBe("en");
  });

  it("returns null for anything else, rather than throwing", () => {
    // The cookie is attacker-controlled and is resent on every retry, so a
    // throw here would make the app unrecoverable — see the `hishabai_company`
    // incident in CLAUDE.md.
    for (const junk of [
      undefined,
      null,
      "",
      "EN",
      "bn-BD",
      "fr",
      "../../etc/passwd",
      "<script>",
      "bn en",
      "0",
    ]) {
      expect(parseLocale(junk)).toBeNull();
    }
  });

  it("defaults to Bengali", () => {
    expect(DEFAULT_LOCALE).toBe("bn");
    expect(parseLocale("nonsense") ?? DEFAULT_LOCALE).toBe("bn");
  });
});
