import { formatMoney, formatMoneyCompact, type Money } from "@hishabai/shared";
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
  className,
}: MoneyTextProps) {
  const resolvedTone =
    tone === "auto" ? (value < 0n ? "debit" : value > 0n ? "credit" : "neutral") : tone;

  const text = compact
    ? formatMoneyCompact(value, { symbol })
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
