import { describe, expect, it } from "vitest";
import {
  DEFAULT_ACTIVITY_POLICY,
  activityPolicyFrom,
  money,
} from "@hishabai/shared";
import { statusFor } from "./activity";

/**
 * Spec R5.1 and R5.3. Tested at the day and at the percentage, because both
 * boundaries are the kind that only show up as an argument with a sales rep.
 */
describe("the customer traffic light", () => {
  const quiet = { recent: money("0"), baseline: money("0") };

  it("holds R5.1's boundaries exactly", () => {
    expect(statusFor({ daysSince: 7, ...quiet }).status).toBe("normal");
    expect(statusFor({ daysSince: 8, ...quiet }).status).toBe("doubtful");
    expect(statusFor({ daysSince: 14, ...quiet }).status).toBe("doubtful");
    expect(statusFor({ daysSince: 15, ...quiet }).status).toBe("critical");
  });

  it("leaves a customer who has never ordered alone", () => {
    // Nothing has been lost, so there is nothing to raise an alarm about.
    expect(statusFor({ daysSince: null, ...quiet }).status).toBe("normal");
  });

  it("flags a customer still inside the window who is buying much less", () => {
    // Ordered yesterday, so R5.1 says they are fine. They used to spend
    // ৳10,000 a month and now spend ৳5,000 — a halving, and the point of R5.3.
    const result = statusFor({
      daysSince: 1,
      recent: money("5000"),
      baseline: money("10000"),
    });
    expect(result).toEqual({ status: "doubtful", volumeDrop: true });
  });

  it("does not flag an ordinary wobble", () => {
    // Down a tenth. That is a quiet fortnight, not a customer leaving.
    expect(
      statusFor({ daysSince: 1, recent: money("9000"), baseline: money("10000") }).status,
    ).toBe("normal");
  });

  it("holds the sensitivity boundary at the taka", () => {
    // 40% off ৳10,000 leaves ৳6,000. Exactly ৳6,000 is not yet a fall.
    expect(
      statusFor({ daysSince: 1, recent: money("6000"), baseline: money("10000") }).status,
    ).toBe("normal");
    expect(
      statusFor({ daysSince: 1, recent: money("5999.99"), baseline: money("10000") }).status,
    ).toBe("doubtful");
  });

  it("says nothing about a customer with no history to compare", () => {
    expect(
      statusFor({ daysSince: 1, recent: money("0"), baseline: money("0") }).status,
    ).toBe("normal");
  });

  it("lets silence outrank the volume rule", () => {
    // Both would fire. "No order for three weeks" is the more useful thing to
    // be told, and it is not a volume drop that needs explaining.
    expect(
      statusFor({ daysSince: 21, recent: money("0"), baseline: money("10000") }),
    ).toEqual({ status: "critical", volumeDrop: false });
  });
});

describe("the activity settings", () => {
  it("falls back rather than throwing on anything malformed", () => {
    for (const junk of [null, undefined, "", 0, [], { doubtfulDays: "7" }]) {
      expect(activityPolicyFrom(junk)).toEqual(DEFAULT_ACTIVITY_POLICY);
    }
  });

  it("refuses a baseline window that cannot contain a comparison", () => {
    // A baseline no longer than the recent window leaves nothing to compare
    // against, and a zero-day window would be a division by zero.
    const policy = activityPolicyFrom({ recentDays: 60, baselineDays: 30 });
    expect(policy.recentDays).toBe(30);
    expect(policy.baselineDays).toBe(90);
  });

  it("keeps a sensible pair", () => {
    const policy = activityPolicyFrom({ recentDays: 14, baselineDays: 56 });
    expect(policy).toMatchObject({ recentDays: 14, baselineDays: 56 });
  });
});
