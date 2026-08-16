import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Bengali date rendering with English digits, matching the numeral decision. */
const BN_MONTHS = [
  "জানুয়ারি",
  "ফেব্রুয়ারি",
  "মার্চ",
  "এপ্রিল",
  "মে",
  "জুন",
  "জুলাই",
  "আগস্ট",
  "সেপ্টেম্বর",
  "অক্টোবর",
  "নভেম্বর",
  "ডিসেম্বর",
];

export function formatDateBn(value: string | Date): string {
  const date = typeof value === "string" ? new Date(`${value}T00:00:00Z`) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return `${date.getUTCDate()} ${BN_MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
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
