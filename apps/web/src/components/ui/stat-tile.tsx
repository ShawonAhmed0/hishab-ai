import type * as React from "react";
import Link from "next/link";
import type { Route } from "next";
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
export function StatTile<T extends string>({
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
  /**
   * Spec R5.7 — a tile that cannot be opened is a number the user has to take
   * on trust.
   *
   * `Route<T>` and not `string`: this used to render a bare `<a>`, which meant
   * a typo in the path was a 404 somebody found later rather than a build
   * error, and every tile click threw away the client router and reloaded the
   * whole app. Generic for the reason `Link` is — `typedRoutes` infers the
   * literal type of an interpolated path, and a non-generic prop collapses it
   * to `unknown` and rejects every template string.
   */
  href?: Route<T>;
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
    <Link href={href} className={base}>
      {body}
    </Link>
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

/**
 * The same tile for a plain count rather than an amount.
 *
 * Counts are not money and must not be formatted as it — "৩ টি পণ্য" and
 * "৳ ৩" are different claims, and a tile that blurs them on a finance screen
 * is worse than no tile.
 */
export function CountTile<T extends string>({
  label,
  value,
  suffix,
  tone = "neutral",
  icon: Icon,
  footnote,
  href,
}: {
  label: string;
  /** A count, or an already-formatted quantity — anything that is not money. */
  value: React.ReactNode;
  suffix?: string;
  tone?: "neutral" | "credit" | "debit" | "due";
  icon?: React.ComponentType<{ className?: string }>;
  footnote?: string;
  href?: Route<T>;
}) {
  const toneClass =
    tone === "due"
      ? "text-due"
      : tone === "debit"
        ? "text-debit"
        : tone === "credit"
          ? "text-credit"
          : "text-foreground";

  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        {Icon ? <Icon className="size-4 shrink-0 text-subtle-foreground" aria-hidden /> : null}
      </div>
      <p className={cn("num-lg mt-2 text-2xl font-bold", toneClass)}>
        {value}
        {suffix ? <span className="ml-1 text-base font-medium">{suffix}</span> : null}
      </p>
      {footnote ? <p className="mt-1 text-xs text-subtle-foreground">{footnote}</p> : null}
    </>
  );

  const base = cn(
    "rounded-lg border border-border bg-surface p-4 shadow-card",
    href && "cursor-pointer transition-colors duration-150 hover:border-border-strong",
  );

  return href ? (
    <Link href={href} className={base}>
      {body}
    </Link>
  ) : (
    <div className={base}>{body}</div>
  );
}
