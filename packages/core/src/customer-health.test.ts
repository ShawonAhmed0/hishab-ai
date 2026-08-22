import { describe, expect, it } from "vitest";
import {
  DEFAULT_ACTIVITY_POLICY,
  DEFAULT_CREDIT_POLICY,
  ZERO,
  money,
  type ActivityPolicy,
  type CreditPolicy,
} from "@hishabai/shared";
import { enteredBandToday } from "./activity";
import {
  crossedAgeingToday,
  dailyAlertsFrom,
  reactivationList,
  type CustomerHealth,
  type CustomerHealthView,
} from "./customer-health";
import type { PartyAgeing } from "./ageing";

/**
 * Spec R5.4 and R5.5.
 *
 * The whole point of these two functions is that "who crossed the line today"
 * needs no stored yesterday, so the tests are day-by-day: the answer has to be
 * true on exactly one morning and false on the ones either side of it.
 */

const aged = (daysOverdue: number): PartyAgeing => ({
  oldestUnpaid: daysOverdue > 0 ? "2026-01-01" : null,
  daysOverdue,
  band: daysOverdue >= 60 ? "risky" : daysOverdue >= 30 ? "slow" : "healthy",
});

function customer(overrides: Partial<CustomerHealth> = {}): CustomerHealth {
  const base: CustomerHealth = {
    partyId: "11111111-1111-1111-1111-111111111111",
    name: "কাস্টমার",
    phone: null,
    lastOrderDate: "2026-08-01",
    daysSince: 1,
    orders: 5,
    status: "normal",
    recent: money("10000"),
    baseline: money("10000"),
    volumeDrop: false,
    receivable: ZERO,
    ageing: aged(0),
    enteredToday: null,
    agedIntoToday: null,
    reactivation: false,
    followUp: false,
  };
  return { ...base, ...overrides };
}

function view(
  customers: CustomerHealth[],
  activityPolicy: ActivityPolicy = DEFAULT_ACTIVITY_POLICY,
  creditPolicy: CreditPolicy = DEFAULT_CREDIT_POLICY,
): CustomerHealthView {
  return { today: "2026-08-22", activityPolicy, creditPolicy, customers };
}

describe("who crossed a line today", () => {
  it("names the day a customer turns yellow, and only that day", () => {
    const on = (daysSince: number) => enteredBandToday({ daysSince, volumeDrop: false });
    expect(on(7)).toBeNull();
    expect(on(8)).toBe("doubtful");
    expect(on(9)).toBeNull();
  });

  it("names the day a customer turns red, and only that day", () => {
    const on = (daysSince: number) => enteredBandToday({ daysSince, volumeDrop: false });
    expect(on(14)).toBeNull();
    expect(on(15)).toBe("critical");
    expect(on(16)).toBeNull();
  });

  it("gives a volume drop no crossing day", () => {
    // It depends on two rolling windows that both move, so there is no single
    // morning it became true. R5.4 lists these separately rather than lying
    // about a date.
    expect(enteredBandToday({ daysSince: 2, volumeDrop: true })).toBeNull();
  });

  it("never claims a crossing for a customer who has never ordered", () => {
    expect(enteredBandToday({ daysSince: null, volumeDrop: false })).toBeNull();
  });

  it("names the day a bill crosses each ageing threshold", () => {
    const on = (days: number) => crossedAgeingToday(aged(days), DEFAULT_CREDIT_POLICY);
    expect(on(29)).toBeNull();
    expect(on(30)).toBe("slow");
    expect(on(31)).toBeNull();
    expect(on(59)).toBeNull();
    expect(on(60)).toBe("risky");
    expect(on(61)).toBeNull();
  });

  it("does not call every outstanding party a crossing when a threshold is zero", () => {
    // A company that sets slowPayerDays to 0 would otherwise get its whole
    // debtor list reported as "crossed today", every single morning.
    const policy: CreditPolicy = { creditPeriodDays: 0, slowPayerDays: 0, riskyDays: 0 };
    expect(crossedAgeingToday(aged(0), policy)).toBeNull();
    expect(crossedAgeingToday(aged(12), policy)).toBeNull();
  });
});

describe("the daily alert block", () => {
  it("lists every silent customer, not only today's arrivals", () => {
    // R5.4's headline is "customers likely lost", which is the standing list.
    // A customer who went red last week is still lost this morning.
    const alerts = dailyAlertsFrom(
      view([
        customer({ name: "পুরনো", status: "critical", daysSince: 40 }),
        customer({ name: "নতুন", status: "critical", daysSince: 15, enteredToday: "critical" }),
        customer({ name: "নিয়মিত" }),
      ]),
    );
    // Both, in whatever order the sort put them — the ordering is its own test.
    expect(alerts.likelyLost.map((c) => c.name).sort()).toEqual(["নতুন", "পুরনো"]);
    expect(alerts.enteredCritical.map((c) => c.name)).toEqual(["নতুন"]);
  });

  it("sorts the lost by what they used to buy, not by what they owe", () => {
    // The cost of a lost customer is the trade that stopped. One with a clean
    // ledger is still the most expensive kind to lose.
    const alerts = dailyAlertsFrom(
      view([
        customer({ name: "ছোট", status: "critical", baseline: money("2000"), receivable: money("90000") }),
        customer({ name: "বড়", status: "critical", baseline: money("80000"), receivable: ZERO }),
      ]),
    );
    expect(alerts.likelyLost.map((c) => c.name)).toEqual(["বড়", "ছোট"]);
  });

  it("counts nothing when every customer is ordering", () => {
    expect(dailyAlertsFrom(view([customer(), customer()])).count).toBe(0);
  });

  it("keeps the follow-up list standing after the day they crossed", () => {
    // R5.6 generates the reminder on the crossing. A list that emptied the
    // next morning would lose everyone nobody got round to calling.
    const alerts = dailyAlertsFrom(
      view([
        customer({ name: "গতকালের", status: "doubtful", daysSince: 12, followUp: true }),
        customer({ name: "আজকের", status: "doubtful", daysSince: 8, enteredToday: "doubtful", followUp: true }),
        customer({ name: "ঠিক আছে" }),
      ]),
    );
    expect(alerts.followUps).toHaveLength(2);
    expect(alerts.enteredDoubtful.map((c) => c.name)).toEqual(["আজকের"]);
  });
});

describe("the win-back list", () => {
  it("keeps customers who had a habit and lost it", () => {
    const list = reactivationList(
      view([
        customer({ name: "নিয়মিত ছিল", status: "critical", orders: 9, daysSince: 30, reactivation: true }),
        customer({ name: "একবারের", status: "critical", orders: 1, daysSince: 400, reactivation: false }),
        customer({ name: "এখনও কেনে", orders: 20 }),
      ]),
    );
    expect(list.map((c) => c.name)).toEqual(["নিয়মিত ছিল"]);
  });

  it("puts the longest silence first — that is the call to make today", () => {
    const list = reactivationList(
      view([
        customer({ name: "কাছের", status: "critical", daysSince: 20, reactivation: true }),
        customer({ name: "দূরের", status: "critical", daysSince: 200, reactivation: true }),
      ]),
    );
    expect(list.map((c) => c.name)).toEqual(["দূরের", "কাছের"]);
  });
});
