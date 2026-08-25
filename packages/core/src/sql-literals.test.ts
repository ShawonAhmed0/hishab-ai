import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A backtick inside a SQL string closes the template literal it lives in.
 *
 * The failure is a parse error, so it cannot reach production — but it reaches
 * the running dev server, and the message ("Expected ) but found date") points
 * at a line that looks fine, because the real problem is three lines above it
 * in a comment. CLAUDE.md has recorded this since the first time. I made it
 * twice more anyway, in one sitting, both times while writing a comment
 * explaining a *different* bug.
 *
 * So it is a test now. Remembering a warning is not a control.
 */

const PACKAGES = join(import.meta.dirname, "..", "..");

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "dist") continue;
      out.push(...sourceFiles(path));
    } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
      out.push(path);
    }
  }
  return out;
}

/**
 * Every line inside a `sql` or `tenantQuery` tagged template, with the line
 * number it came from.
 *
 * Deliberately a scanner rather than a parser: it only has to be right about
 * where a template starts and ends, and a template that ends early is exactly
 * the bug being looked for — so an over-eager scan reports it too.
 */
function offendingLines(source: string): { line: number; text: string }[] {
  const lines = source.split("\n");
  const found: { line: number; text: string }[] = [];
  let inside = false;

  for (const [index, text] of lines.entries()) {
    if (!inside) {
      // Opened and closed on the same line is a one-liner, not a block.
      if (/\b(sql|tenantQuery)`/.test(text) && !/\b(sql|tenantQuery)`[^`]*`/.test(text)) {
        inside = true;
      }
      continue;
    }

    const comment = text.indexOf("--");
    const tick = text.indexOf("`");

    // A backtick inside a SQL line comment. This is the whole quarry: it is
    // how the mistake has been made every time, it terminates the template
    // three lines above wherever the parser then complains, and unlike a
    // backtick in code it is never legitimate.
    if (comment !== -1 && tick > comment) {
      found.push({ line: index + 1, text });
      inside = false;
      continue;
    }

    // Any other backtick is the template closing — which it may do part way
    // along a line, as `set_config(...)\`,` does.
    if (tick !== -1) inside = false;
  }
  return found;
}

describe("SQL written inside a template literal", () => {
  const files = sourceFiles(PACKAGES);

  it("leaves a clean template alone", () => {
    const clean = ["const q = sql`", "  -- filters by date, which is fine", "  select 1", "`;"].join("\n");
    expect(offendingLines(clean)).toEqual([]);
  });

  it("finds the files it is supposed to be checking", () => {
    // A scanner that silently matches nothing is worse than no scanner.
    expect(files.length).toBeGreaterThan(10);
    const withSql = files.filter((f) => /\b(sql|tenantQuery)`/.test(readFileSync(f, "utf8")));
    expect(withSql.length).toBeGreaterThan(3);
  });

  it("never contains a backtick, in a comment or anywhere else", () => {
    const offences: string[] = [];

    for (const file of files) {
      const source = readFileSync(file, "utf8");
      for (const { line, text } of offendingLines(source)) {
        offences.push(`${file.replace(PACKAGES, "packages")}:${line} — ${text.trim()}`);
      }
    }

    expect(offences).toEqual([]);
  });

  it("catches the mistake when it is made", () => {
    // The scanner earning its keep, on a sample rather than on the repo.
    const sample = [
      "const q = sql`",
      "  -- filters by `date`, which is the bug",
      "  select 1",
      "`;",
    ].join("\n");

    const flagged = offendingLines(sample);
    expect(flagged).toHaveLength(1);
    expect(flagged[0]!.line).toBe(2);
  });
});
