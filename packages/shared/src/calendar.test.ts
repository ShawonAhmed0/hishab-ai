import { describe, expect, it } from "vitest";
import { currentMonthRange, todayIso } from "./calendar";

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
