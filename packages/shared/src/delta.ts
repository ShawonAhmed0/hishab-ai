/**
 * How a figure compares with the same figure a period earlier.
 *
 * A number on its own is not information. ৳1,99,000 of income is a good month
 * or a bad one entirely depending on what last month was, and a dashboard that
 * shows only the figure makes the reader carry that memory.
 *
 * Pure, and separate from the query, because the awkward cases are arithmetic
 * rather than SQL: what "up 40%" means when the baseline was zero, and which
 * direction is *good* when the figure is an expense.
 */
import type { Money } from "./money";
import { ZERO } from "./money";

/** Whether the movement is worth reading as good, bad, or neither. */
export type DeltaTone = "up" | "down" | "flat";

export interface Delta {
  /** Signed difference, in the same scale as the figures. */
  amount: Money;
  /**
   * Percentage against the baseline, rounded to one decimal — or null when
   * there is no baseline to be a percentage of.
   *
   * Not zero and not Infinity: "up ∞%" and "up 0%" are both false. A first
   * month of trading has no percentage, and saying so is the honest answer.
   */
  percent: number | null;
  direction: DeltaTone;
  /**
   * Whether this movement is good news.
   *
   * Not the same as the direction: expenses going up is a rise and bad news,
   * and a dashboard that paints it green because the arrow points up is
   * telling the shopkeeper the opposite of what happened.
   */
  good: boolean;
}

/**
 * @param higherIsBetter  false for a cost — an expense going up is a rise, and
 *                        it is not good news.
 */
export function deltaOf(
  current: Money,
  previous: Money,
  { higherIsBetter = true }: { higherIsBetter?: boolean } = {},
): Delta {
  const amount = (current - previous) as Money;
  const direction: DeltaTone = amount > ZERO ? "up" : amount < ZERO ? "down" : "flat";

  // A percentage of nothing is not a large percentage, it is no percentage.
  const percent =
    previous === ZERO
      ? null
      : Math.round((Number(amount) / Math.abs(Number(previous))) * 1000) / 10;

  return {
    amount,
    percent,
    direction,
    good: direction === "flat" ? true : (direction === "up") === higherIsBetter,
  };
}
