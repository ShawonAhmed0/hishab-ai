import { clsx, type ClassValue } from "clsx";
import { BUSINESS_TIME_ZONE, type Dictionary } from "@hishabai/shared";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * The long date form — "19 আগস্ট 2026" / "19 August 2026".
 *
 * Takes the dictionary rather than a locale so the caller passes what it
 * already has; every screen that shows a date has `t` in scope. Digits stay
 * English in both locales, which is the same numeral decision the money
 * formatter makes.
 */
export function formatDate(value: string | Date, t: Dictionary): string {
  const date = typeof value === "string" ? new Date(`${value}T00:00:00Z`) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return `${date.getUTCDate()} ${t.months[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

/**
 * Date and clock time in Dhaka — "20 আগস্ট 2026, 2:14 PM".
 *
 * The business runs on Dhaka time (`BUSINESS_TIME_ZONE`), not on the browser's,
 * so a shopkeeper checking the books from abroad still sees the hour the entry
 * was actually made at the counter.
 */
export function formatDateTime(value: string | Date, t: Dictionary): string {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";

  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: BUSINESS_TIME_ZONE,
    day: "numeric",
    month: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(date);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  const month = t.months[Number(get("month")) - 1] ?? get("month");
  const clock = `${get("hour")}:${get("minute")} ${get("dayPeriod").toUpperCase()}`;
  return `${get("day")} ${month} ${get("year")}, ${clock}`;
}

export function formatDateShort(value: string | Date): string {
  const date = typeof value === "string" ? new Date(`${value}T00:00:00Z`) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return `${String(date.getUTCDate()).padStart(2, "0")}/${String(
    date.getUTCMonth() + 1,
  ).padStart(2, "0")}/${date.getUTCFullYear()}`;
}

/**
 * Re-exported so callers keep importing dates from one place.
 *
 * It used to be `new Date().toISOString()`, which is UTC — and Dhaka is six
 * hours ahead, so নতুন এন্ট্রি defaulted to *yesterday* for anyone cashing up
 * after midnight. See `packages/shared/src/calendar.ts`.
 */
export { todayIso } from "@hishabai/shared";
