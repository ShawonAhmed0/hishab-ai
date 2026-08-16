/**
 * Stock quantities as a branded scaled bigint.
 *
 * Six decimal places, because a business weighing paper in KG will happily
 * record 12.5 KG and a recipe will happily consume 0.001235 of a roll per
 * unit. Rate maths rounds to money scale at the very end, once.
 */
import { formatFixed, mulDivRound, parseFixed, pow10 } from "./decimal";
import type { Money } from "./money";

declare const QtyBrand: unique symbol;
export type Qty = bigint & { readonly [QtyBrand]: "qty" };

export const QTY_SCALE = 6;
export const QTY_UNIT = pow10(QTY_SCALE);

export const ZERO_QTY: Qty = 0n as Qty;

export function qty(input: string | number | bigint): Qty {
  return parseFixed(input, QTY_SCALE) as Qty;
}

export function qtyRaw(scaled: bigint): Qty {
  return scaled as Qty;
}

export function addQty(...values: readonly Qty[]): Qty {
  let total = 0n;
  for (const v of values) total += v;
  return total as Qty;
}

export function subQty(a: Qty, b: Qty): Qty {
  return (a - b) as Qty;
}

export function negQty(a: Qty): Qty {
  return -a as Qty;
}

export function absQty(a: Qty): Qty {
  return (a < 0n ? -a : a) as Qty;
}

export function sumQty(values: Iterable<Qty>): Qty {
  let total = 0n;
  for (const v of values) total += v;
  return total as Qty;
}

export function cmpQty(a: Qty, b: Qty): -1 | 0 | 1 {
  return a < b ? -1 : a > b ? 1 : 0;
}

export const isZeroQty = (a: Qty): boolean => a === 0n;
export const isPositiveQty = (a: Qty): boolean => a > 0n;
export const isNegativeQty = (a: Qty): boolean => a < 0n;

export function qtyToDb(a: Qty): string {
  return formatFixed(a, QTY_SCALE, QTY_SCALE);
}

export function qtyFromDb(value: string | number | null | undefined): Qty {
  if (value === null || value === undefined || value === "") return ZERO_QTY;
  return qty(value);
}

/**
 * Line amount = quantity × unit rate, rounded once to money scale.
 *
 * This is the single crossing point between the two scales. Everything that
 * multiplies a quantity by a price goes through here so the rounding rule is
 * defined in exactly one place.
 */
export function multiplyRate(quantity: Qty, rate: Money): Money {
  return mulDivRound(quantity, rate, QTY_UNIT) as Money;
}

/**
 * Quantity × a dimensionless count, e.g. a recipe's per-batch input scaled to
 * the number of batches being run.
 *
 * Both operands are `Qty` so both carry the 1e6 scale; multiplying them
 * directly would square it. The count is the one that gets divided back out.
 */
export function scaleQty(quantity: Qty, count: Qty): Qty {
  return mulDivRound(quantity, count, QTY_UNIT) as Qty;
}

/**
 * Unit rate implied by a total and a quantity — used to derive weighted
 * average cost and landed cost per unit.
 */
export function deriveRate(total: Money, quantity: Qty): Money {
  if (quantity === 0n) return 0n as Money;
  return mulDivRound(total, QTY_UNIT, quantity) as Money;
}

/**
 * Weighted average cost after a stock receipt.
 *
 * Deliberately computed from *values*, not from averaging two rates: the
 * running stock value is the thing the balance sheet has to agree with, so the
 * rate is always derived back out of it rather than the other way round.
 */
export function weightedAverageCost(
  currentQty: Qty,
  currentValue: Money,
  incomingQty: Qty,
  incomingValue: Money,
): { quantity: Qty; value: Money; rate: Money } {
  const quantity = addQty(currentQty, incomingQty);
  const value = (currentValue + incomingValue) as Money;
  return { quantity, value, rate: deriveRate(value, quantity) };
}

export interface QtyFormatOptions {
  /** Unit symbol appended after the number, e.g. "কেজি". */
  unit?: string;
  /** Maximum fraction digits shown. Trailing zeros are trimmed. Default 3. */
  decimals?: number;
}

export function formatQty(a: Qty, options: QtyFormatOptions = {}): string {
  const { unit, decimals = 3 } = options;
  const text = formatFixed(a, QTY_SCALE, decimals)
    .replace(/(\.\d*?)0+$/, "$1")
    .replace(/\.$/, "");
  const [intPart = "0", fracPart] = text.replace("-", "").split(".");
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const body = fracPart ? `${grouped}.${fracPart}` : grouped;
  const sign = a < 0n ? "−" : "";
  return unit ? `${sign}${body} ${unit}` : `${sign}${body}`;
}
