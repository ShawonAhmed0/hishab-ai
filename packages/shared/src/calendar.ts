/**
 * "Today" means today in Dhaka.
 *
 * Every date in this app used to come from `new Date().toISOString()`, which is
 * UTC. Bangladesh is UTC+6 with no daylight saving, so between midnight and
 * 6 a.m. local time the whole application quietly believed it was yesterday:
 *
 * - নতুন এন্ট্রি defaulted to the previous day, so a shop cashing up after
 *   closing posted every entry to the wrong date;
 * - the aging report's `asOf` was a day behind;
 * - and worst, on the first of any month before 6 a.m. `currentMonth()`
 *   returned the *previous* month, so the dashboard and every report opened on
 *   August while the user was standing in September.
 *
 * The server has no local timezone worth trusting either — Vercel runs in UTC —
 * so this cannot be left to the host. The business timezone is a property of
 * the business, and for this product that is Asia/Dhaka.
 */

export const BUSINESS_TIME_ZONE = "Asia/Dhaka";

/** en-CA is the locale that formats as YYYY-MM-DD, which is what the db wants. */
const ISO_IN_DHAKA = new Intl.DateTimeFormat("en-CA", {
  timeZone: BUSINESS_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Today's date in Dhaka, as `YYYY-MM-DD`. */
export function todayIso(reference: Date = new Date()): string {
  return ISO_IN_DHAKA.format(reference);
}

export interface DateRange {
  from: string;
  to: string;
}

/**
 * The calendar month containing "now" in Dhaka — what every report opens on.
 *
 * The last day is found by asking for day 0 of the following month, which UTC
 * gets right for any month length; only the *choice* of month has to be made in
 * Dhaka, and it already has been by the time we get here.
 */
export function currentMonthRange(reference: Date = new Date()): DateRange {
  const [year, month] = todayIso(reference).split("-").map(Number) as [number, number];
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const pad = (value: number) => String(value).padStart(2, "0");

  return {
    from: `${year}-${pad(month)}-01`,
    to: `${year}-${pad(month)}-${pad(lastDay)}`,
  };
}
