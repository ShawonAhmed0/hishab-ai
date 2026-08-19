/**
 * BDT money as a branded scaled bigint.
 *
 * The brand is deliberate friction: `a + b` on two `Money` values is a type
 * error, so every arithmetic step has to go through a function that knows what
 * scale it is working in. Quantities and amounts can never be silently
 * multiplied together by accident.
 */
import {
  allocate,
  divRound,
  formatFixed,
  mulDivRound,
  parseFixed,
  pow10,
} from "./decimal";

declare const MoneyBrand: unique symbol;
export type Money = bigint & { readonly [MoneyBrand]: "BDT" };

/** Matches `numeric(18, 4)` in Postgres. */
export const MONEY_SCALE = 4;
export const MONEY_UNIT = pow10(MONEY_SCALE);

export const ZERO: Money = 0n as Money;

export function money(input: string | number | bigint): Money {
  return parseFixed(input, MONEY_SCALE) as Money;
}

/** Wrap an already-scaled integer. Use only at trust boundaries. */
export function moneyRaw(scaled: bigint): Money {
  return scaled as Money;
}

export function addMoney(...values: readonly Money[]): Money {
  let total = 0n;
  for (const v of values) total += v;
  return total as Money;
}

export function subMoney(a: Money, b: Money): Money {
  return (a - b) as Money;
}

export function negMoney(a: Money): Money {
  return -a as Money;
}

export function absMoney(a: Money): Money {
  return (a < 0n ? -a : a) as Money;
}

export function sumMoney(values: Iterable<Money>): Money {
  let total = 0n;
  for (const v of values) total += v;
  return total as Money;
}

export function cmpMoney(a: Money, b: Money): -1 | 0 | 1 {
  return a < b ? -1 : a > b ? 1 : 0;
}

export const isZeroMoney = (a: Money): boolean => a === 0n;
export const isPositiveMoney = (a: Money): boolean => a > 0n;
export const isNegativeMoney = (a: Money): boolean => a < 0n;

export function maxMoney(a: Money, b: Money): Money {
  return a >= b ? a : b;
}

export function minMoney(a: Money, b: Money): Money {
  return a <= b ? a : b;
}

/** Clamp to zero — a due or a payment is never allowed to go negative. */
export function clampNonNegative(a: Money): Money {
  return a > 0n ? a : ZERO;
}

/** Scale an amount by a plain ratio, e.g. splitting by percentage. */
export function scaleMoney(a: Money, numerator: bigint, denominator: bigint): Money {
  return mulDivRound(a, numerator, denominator) as Money;
}

/** Distribute a total across weights so the parts sum to the total exactly. */
export function allocateMoney(total: Money, weights: readonly bigint[]): Money[] {
  return allocate(total, weights) as Money[];
}

export function divideMoney(a: Money, divisor: bigint): Money {
  return divRound(a, divisor) as Money;
}

// ---------------------------------------------------------------------------
// Serialisation
// ---------------------------------------------------------------------------

/** Postgres `numeric` wire format — always full scale, never localised. */
export function moneyToDb(a: Money): string {
  return formatFixed(a, MONEY_SCALE, MONEY_SCALE);
}

export function moneyFromDb(value: string | number | null | undefined): Money {
  if (value === null || value === undefined || value === "") return ZERO;
  return money(value);
}

// ---------------------------------------------------------------------------
// Display
// ---------------------------------------------------------------------------

export const TAKA_SIGN = "৳";

export interface MoneyFormatOptions {
  /** Prefix with ৳. Default true. */
  symbol?: boolean;
  /** Fraction digits. Default 2; pass 0 for dashboard tiles. */
  decimals?: number;
  /** Force a leading + on positives — useful in ledgers. Default false. */
  signed?: boolean;
}

/**
 * Bangladeshi grouping: 2,2,3 from the right, so 8000000 reads 80,00,000.
 * Done by hand on the digit string rather than through `Intl`, because passing
 * a large amount through `number` would lose precision before it was grouped.
 */
export function groupBengaliDigits(digits: string): string {
  if (digits.length <= 3) return digits;
  const head = digits.slice(0, -3);
  const tail = digits.slice(-3);
  return `${head.replace(/\B(?=(\d{2})+(?!\d))/g, ",")},${tail}`;
}

export function formatMoney(a: Money, options: MoneyFormatOptions = {}): string {
  const { symbol = true, decimals = 2, signed = false } = options;

  const plain = formatFixed(a, MONEY_SCALE, decimals);
  const negative = plain.startsWith("-");
  const unsigned = negative ? plain.slice(1) : plain;
  const [intPart = "0", fracPart] = unsigned.split(".");

  const grouped = groupBengaliDigits(intPart);
  const body = fracPart ? `${grouped}.${fracPart}` : grouped;

  const sign = negative ? "−" : signed && a > 0n ? "+" : "";
  return symbol ? `${sign}${TAKA_SIGN} ${body}` : `${sign}${body}`;
}

/**
 * A percentage stored at money scale — an expected yield, a margin.
 *
 * Trailing zeros are trimmed, because `90.0000%` is a column heading's idea of
 * ninety percent and nobody else's.
 */
export function formatPercent(a: Money, options: { decimals?: number } = {}): string {
  const { decimals = 2 } = options;
  const text = formatFixed(a, MONEY_SCALE, decimals)
    .replace(/(\.\d*?)0+$/, "$1")
    .replace(/\.$/, "");
  return `${text}%`;
}

const CRORE = 10_000_000n * MONEY_UNIT;
const LAKH = 100_000n * MONEY_UNIT;
const THOUSAND = 1_000n * MONEY_UNIT;

/**
 * The words for the scale steps.
 *
 * Crore and lakh in both locales, never million — the grouping stays 2-2-3,
 * and "2 crore" beside "1,98,58,770" is the same number read aloud, where
 * "20 million" would be a different reading of a differently grouped figure.
 */
export interface MoneyScaleWords {
  crore: string;
  lakh: string;
  thousand: string;
}

const BENGALI_SCALE: MoneyScaleWords = {
  crore: "কোটি",
  lakh: "লাখ",
  thousand: "হাজার",
};

/**
 * Compact form for chart axes and tight cards only — never for a figure the
 * user is expected to reconcile against a memo.
 */
export function formatMoneyCompact(
  a: Money,
  options: { symbol?: boolean; scale?: MoneyScaleWords } = {},
): string {
  const { symbol = true, scale = BENGALI_SCALE } = options;
  const magnitude = a < 0n ? -a : a;
  const sign = a < 0n ? "−" : "";

  const render = (unit: bigint, suffix: string) => {
    const scaled = divRound(magnitude, unit / MONEY_UNIT);
    const digits = formatFixed(scaled, MONEY_SCALE, 1).replace(/\.0$/, "");
    return `${sign}${symbol ? `${TAKA_SIGN} ` : ""}${digits} ${suffix}`;
  };

  if (magnitude >= CRORE) return render(CRORE, scale.crore);
  if (magnitude >= LAKH) return render(LAKH, scale.lakh);
  if (magnitude >= THOUSAND) return render(THOUSAND, scale.thousand);
  return formatMoney(a, { symbol, decimals: 0 });
}
