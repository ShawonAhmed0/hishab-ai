import { describe, expect, it } from "vitest";
import { transactionInputSchema } from "./schemas";
import { bn, en, validationMessage } from "./i18n";

/**
 * Spec R4.5, the half of it that can be tested without a browser.
 *
 * An empty entry used to reach the server, come back with one banner, and then
 * fight the user: the summary stole focus and scrolled the page on every
 * render. Half of that fix is that the same schema now runs in the browser
 * first and reports against each field. This is the regression test for the
 * messages it reports — that every one of them is a key the dictionary knows,
 * in both languages, rather than a Bengali sentence frozen into a module.
 *
 * The other half — the wheel changing a focused <select>, and the banner
 * pulling the viewport — is DOM behaviour, and this repo has no DOM harness.
 * It is fixed in `field.tsx` and is not covered here.
 */
function issuesFor(input: unknown): { path: string; message: string }[] {
  const parsed = transactionInputSchema.safeParse(input);
  if (parsed.success) return [];
  return parsed.error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));
}

describe("an empty entry", () => {
  const empty = { type: "sale", date: "", source: "manual", lines: [], payments: [] };

  it("is refused, with a complaint against each field rather than one banner", () => {
    const issues = issuesFor(empty);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.map((i) => i.path)).toContain("date");
    expect(issues.map((i) => i.path)).toContain("lines");
  });

  it("says something in whichever language is being served", () => {
    for (const issue of issuesFor(empty)) {
      const inBengali = validationMessage(issue.message, bn);
      const inEnglish = validationMessage(issue.message, en);

      // Resolved, not passed through as a raw key.
      expect(inBengali).not.toMatch(/^validation\./);
      expect(inEnglish).not.toMatch(/^validation\./);
      // And actually different, which is what proves the lookup happened.
      expect(inEnglish).not.toBe(inBengali);
      // No Bengali left on the English side.
      expect(inEnglish).not.toMatch(/[ঀ-৿]/);
    }
  });
});

describe("the messages a real entry can produce", () => {
  const cases: [string, unknown][] = [
    [
      "a sale with no product chosen",
      {
        type: "sale",
        date: "2026-08-20",
        source: "manual",
        partyId: "00000000-0000-4000-8000-000000000001",
        lines: [{ productId: "", unitId: "", quantity: "1", rate: "1" }],
        payments: [],
      },
    ],
    [
      "an expense with no payment method",
      {
        type: "expense",
        date: "2026-08-20",
        source: "manual",
        categoryAccountId: "00000000-0000-4000-8000-000000000002",
        payments: [],
      },
    ],
    [
      "a quantity that is not a number",
      {
        type: "sale",
        date: "2026-08-20",
        source: "manual",
        partyId: "00000000-0000-4000-8000-000000000001",
        lines: [
          {
            productId: "00000000-0000-4000-8000-000000000003",
            unitId: "00000000-0000-4000-8000-000000000004",
            quantity: "abc",
            rate: "1",
          },
        ],
        payments: [],
      },
    ],
    [
      "a production run with nothing produced",
      { type: "production", date: "2026-08-20", source: "manual", inputs: [], outputs: [] },
    ],
  ];

  for (const [name, input] of cases) {
    it(`resolves every message for ${name}`, () => {
      const issues = issuesFor(input);
      expect(issues.length).toBeGreaterThan(0);
      for (const issue of issues) {
        expect(validationMessage(issue.message, en)).not.toMatch(/[ঀ-৿]/);
        expect(validationMessage(issue.message, en)).not.toMatch(/^validation\./);
      }
    });
  }
});
