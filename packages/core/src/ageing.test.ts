import { describe, expect, it } from "vitest";
import { DEFAULT_CREDIT_POLICY, creditPolicyFrom } from "@hishabai/shared";
import { ageingFrom, bandFor, daysBetween } from "./ageing";

/**
 * Spec R5.2. The bands are tested at the day, because an off-by-one in an
 * ageing report is the kind of wrong that only shows up as an argument with a
 * customer.
 */
describe("the ageing bands", () => {
  const policy = DEFAULT_CREDIT_POLICY; // 0 / 30 / 60

  it("is healthy while nothing is outstanding", () => {
    expect(ageingFrom(null, policy, "2026-08-20").band).toBe("healthy");
  });

  it("holds each boundary exactly", () => {
    expect(bandFor(29, policy)).toBe("healthy");
    expect(bandFor(30, policy)).toBe("slow");
    expect(bandFor(59, policy)).toBe("slow");
    expect(bandFor(60, policy)).toBe("risky");
  });

  it("counts from the bill, and shifts by the credit period", () => {
    // Sold on the 1st of July, read on the 31st: 30 days old.
    expect(ageingFrom("2026-07-01", policy, "2026-07-31")).toEqual({
      oldestUnpaid: "2026-07-01",
      daysOverdue: 30,
      band: "slow",
    });

    // The same bill, for a company that gives 30 days' credit, is not late.
    const withTerms = { ...policy, creditPeriodDays: 30 };
    expect(ageingFrom("2026-07-01", withTerms, "2026-07-31")).toEqual({
      oldestUnpaid: "2026-07-01",
      daysOverdue: 0,
      band: "healthy",
    });
  });

  it("never reports a negative overdue", () => {
    const withTerms = { ...DEFAULT_CREDIT_POLICY, creditPeriodDays: 30 };
    expect(ageingFrom("2026-08-19", withTerms, "2026-08-20").daysOverdue).toBe(0);
  });

  it("counts whole days across a month end", () => {
    expect(daysBetween("2026-07-31", "2026-08-01")).toBe(1);
    expect(daysBetween("2026-02-01", "2026-03-01")).toBe(28);
  });
});

describe("the credit policy in company settings", () => {
  it("falls back rather than throwing on anything malformed", () => {
    // The column is jsonb and nothing constrains its shape. A bad blob must
    // not be able to stop every entry in the company.
    for (const junk of [null, undefined, "", 0, [], "not an object", { creditPeriodDays: "30" }]) {
      expect(creditPolicyFrom(junk)).toEqual(DEFAULT_CREDIT_POLICY);
    }
  });

  it("rejects a value outside anything a trading term could mean", () => {
    expect(creditPolicyFrom({ slowPayerDays: -1 }).slowPayerDays).toBe(30);
    expect(creditPolicyFrom({ slowPayerDays: 99999 }).slowPayerDays).toBe(30);
    expect(creditPolicyFrom({ slowPayerDays: 45 }).slowPayerDays).toBe(45);
  });
});
