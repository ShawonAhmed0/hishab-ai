import {
  formatMoney,
  formatMoneyCompact,
  type Money,
  type MoneyScaleWords,
} from "@hishabai/shared";
import { cn } from "@/lib/utils";

export interface MoneyTextProps {
  value: Money;
  /** Colour by sign — credit green, debit red. Off by default. */
  tone?: "auto" | "credit" | "debit" | "due" | "neutral";
  size?: "sm" | "base" | "lg" | "xl";
  symbol?: boolean;
  decimals?: number;
  signed?: boolean;
  compact?: boolean;
  /**
   * The কোটি/লাখ/হাজার words, for `compact`.
   *
   * Passed in rather than read from the locale context, because this component
   * renders inside server components as often as client ones — reaching for
   * `useT()` here threw "useT is on the client" on every report that shows a
   * figure. The caller has the dictionary either way.
   */
  scale?: MoneyScaleWords;
  className?: string;
}

const TONE_CLASS = {
  credit: "text-credit",
  debit: "text-debit",
  due: "text-due",
  neutral: "",
} as const;

const SIZE_CLASS = {
  sm: "text-sm",
  base: "text-base",
  lg: "text-lg",
  xl: "text-3xl",
} as const;

/**
 * The one component that renders currency.
 *
 * Tabular figures, Bangladeshi 2,2,3 grouping, and a real minus sign rather
 * than a hyphen. Colour is applied only alongside a label or sign — never as
 * the only thing distinguishing a credit from a debit.
 */
export function MoneyText({
  value,
  tone = "neutral",
  size = "base",
  symbol = true,
  decimals = 2,
  signed = false,
  compact = false,
  scale,
  className,
}: MoneyTextProps) {
  const resolvedTone =
    tone === "auto" ? (value < 0n ? "debit" : value > 0n ? "credit" : "neutral") : tone;

  const text = compact
    ? formatMoneyCompact(value, { symbol, ...(scale ? { scale } : {}) })
    : formatMoney(value, { symbol, decimals, signed });

  return (
    <span
      className={cn(
        size === "xl" ? "num-lg" : "num",
        SIZE_CLASS[size],
        TONE_CLASS[resolvedTone],
        className,
      )}
    >
      {text}
    </span>
  );
}
