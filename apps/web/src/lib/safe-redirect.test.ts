import { describe, expect, it } from "vitest";
import { safeNext } from "@/lib/safe-redirect";

/**
 * `next` arrives on this route from a query string in an email, so it is
 * attacker-controlled by construction: anyone who can get a link in front of a
 * user can choose it. The job is to make our domain useless for laundering a
 * redirect somewhere else.
 */
describe("where the emailed link is allowed to land", () => {
  it("keeps an ordinary path", () => {
    expect(safeNext("/new-password")).toBe("/new-password");
    expect(safeNext("/customers/health")).toBe("/customers/health");
    expect(safeNext("/reports/dues?side=payable")).toBe("/reports/dues?side=payable");
  });

  it("falls back when there is nothing to go on", () => {
    expect(safeNext(null)).toBe("/dashboard");
    expect(safeNext("")).toBe("/dashboard");
  });

  it("refuses an absolute URL", () => {
    expect(safeNext("https://elsewhere.example/phish")).toBe("/dashboard");
    expect(safeNext("http://elsewhere.example")).toBe("/dashboard");
  });

  it("refuses a protocol-relative URL", () => {
    // `//elsewhere.example` starts with a slash and is still off-site. This is
    // the half of the check that gets forgotten.
    expect(safeNext("//elsewhere.example")).toBe("/dashboard");
    expect(safeNext("//elsewhere.example/path")).toBe("/dashboard");
  });

  it("refuses anything that is not a path at all", () => {
    expect(safeNext("javascript:alert(1)")).toBe("/dashboard");
    expect(safeNext("dashboard")).toBe("/dashboard");
    expect(safeNext("../etc")).toBe("/dashboard");
  });
});
