import { describe, expect, it } from "vitest";
import { currentMonthRange, presetRange, todayIso } from "./calendar";

/**
 * These only ever went wrong between midnight and 6 a.m. Dhaka time, which is
 * why nobody caught it by using the app: the bug was invisible for eighteen
 * hours a day and then quietly dated everything to yesterday.
 */
describe("dates belong to Dhaka, not to UTC", () => {
  it("is already tomorrow in Dhaka when UTC is still on the previous evening", () => {
    // 2026-08-16 20:30 UTC is 2026-08-17 02:30 in Dhaka.
    expect(todayIso(new Date("2026-08-16T20:30:00Z"))).toBe("2026-08-17");
  });

  it("agrees with UTC during the working day", () => {
    expect(todayIso(new Date("2026-08-16T09:00:00Z"))).toBe("2026-08-16");
  });

  it("rolls the month over at Dhaka midnight, not six hours later", () => {
    // The worst version of this: at 1 a.m. on 1 September the dashboard and
    // every report opened on August.
    expect(currentMonthRange(new Date("2026-08-31T19:00:00Z"))).toEqual({
      from: "2026-09-01",
      to: "2026-09-30",
    });
  });

  it("gets the last day right for every month length", () => {
    expect(currentMonthRange(new Date("2026-02-10T12:00:00Z")).to).toBe("2026-02-28");
    expect(currentMonthRange(new Date("2024-02-10T12:00:00Z")).to).toBe("2024-02-29");
    expect(currentMonthRange(new Date("2026-12-10T12:00:00Z")).to).toBe("2026-12-31");
  });

  it("holds the year boundary", () => {
    // 2026-12-31 18:30 UTC is 2027-01-01 00:30 in Dhaka.
    expect(todayIso(new Date("2026-12-31T18:30:00Z"))).toBe("2027-01-01");
    expect(currentMonthRange(new Date("2026-12-31T18:30:00Z"))).toEqual({
      from: "2027-01-01",
      to: "2027-01-31",
    });
  });
});

/**
 * The dashboard's one-tap ranges.
 *
 * Every one of these is month arithmetic, and month arithmetic is wrong at a
 * year boundary until somebody proves otherwise — "last month" in January is
 * the case that catches a naive `month - 1`.
 */
describe("the ranges a shop actually asks for", () => {
  const jan = new Date("2027-01-14T09:00:00Z");

  it("walks back across the new year for last month", () => {
    expect(presetRange("lastMonth", jan)).toEqual({
      from: "2026-12-01",
      to: "2026-12-31",
    });
  });

  it("takes the whole of a 30-day month, not 31 days of it", () => {
    // April has 30 days; asking for day 31 would land in May.
    expect(presetRange("lastMonth", new Date("2026-05-09T09:00:00Z"))).toEqual({
      from: "2026-04-01",
      to: "2026-04-30",
    });
  });

  it("gives February its leap day", () => {
    expect(presetRange("lastMonth", new Date("2028-03-02T09:00:00Z"))).toEqual({
      from: "2028-02-01",
      to: "2028-02-29",
    });
  });

  it("counts three months back from the first of this one, and ends today", () => {
    // Not "ninety days": a shopkeeper comparing months wants whole months,
    // and the current one has not finished, so it ends at today rather than
    // at a month end nobody has reached.
    expect(presetRange("threeMonths", jan)).toEqual({
      from: "2026-11-01",
      to: "2027-01-14",
    });
  });

  it("starts the year at January and stops at today", () => {
    expect(presetRange("thisYear", jan)).toEqual({
      from: "2027-01-01",
      to: "2027-01-14",
    });
  });

  it("agrees with currentMonthRange for this month", () => {
    expect(presetRange("thisMonth", jan)).toEqual(currentMonthRange(jan));
  });

  /** The same Dhaka-vs-UTC trap the rest of this file exists for. */
  it("resolves against Dhaka's today, not UTC's", () => {
    // 2026-12-31 20:00 UTC is already 2027-01-01 02:00 in Dhaka, so "this
    // year" is the new one.
    expect(presetRange("thisYear", new Date("2026-12-31T20:00:00Z"))).toEqual({
      from: "2027-01-01",
      to: "2027-01-01",
    });
  });
});
