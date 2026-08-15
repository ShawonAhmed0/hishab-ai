import type * as React from "react";
import type { Money } from "@hishabai/shared";
import { MoneyText } from "./money";
import { cn } from "@/lib/utils";

/**
 * A dashboard tile.
 *
 * The number is the loudest thing on it — spec asks for "large readable
 * numbers", and on a phone the label above it is what makes the number
 * meaningful, so neither is allowed to shrink into the other.
 */
export function StatTile({
  label,
  value,
  tone = "neutral",
  icon: Icon,
  footnote,
  href,
  className,
}: {
  label: string;
  value: Money;
  tone?: "neutral" | "credit" | "debit" | "due" | "auto";
  icon?: React.ComponentType<{ className?: string }>;
  footnote?: string;
  href?: string;
  className?: string;
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        {Icon ? <Icon className="size-4 shrink-0 text-subtle-foreground" aria-hidden /> : null}
      </div>
      <MoneyText value={value} tone={tone} size="xl" decimals={0} className="mt-2 block" />
      {footnote ? (
        <p className="mt-1 text-xs text-subtle-foreground">{footnote}</p>
      ) : null}
    </>
  );

  const base = cn(
    "rounded-lg border border-border bg-surface p-4 shadow-card",
    href && "cursor-pointer transition-colors duration-150 hover:border-border-strong",
    className,
  );

  return href ? (
    <a href={href} className={base}>
      {body}
    </a>
  ) : (
    <div className={base}>{body}</div>
  );
}

/** Layout skeleton with reserved height, so tiles do not shift when they land. */
export function StatTileSkeleton() {
  return (
    <div
      aria-busy="true"
      className="rounded-lg border border-border bg-surface p-4 shadow-card"
    >
      <div className="h-5 w-24 animate-pulse rounded bg-surface-sunken" />
      <div className="mt-3 h-8 w-32 animate-pulse rounded bg-surface-sunken" />
    </div>
  );
}
