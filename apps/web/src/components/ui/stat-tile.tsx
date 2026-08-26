import type * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import type { Delta, Dictionary, Money } from "@hishabai/shared";
import { MoneyText } from "./money";
import { cn } from "@/lib/utils";

/** The icon chip picks up whatever the figure below it is saying. */
const TONE_TEXT: Record<string, string> = {
  credit: "text-credit",
  debit: "text-debit",
  due: "text-due",
  auto: "text-subtle-foreground",
  neutral: "text-subtle-foreground",
};

/**
 * How this figure moved against the same figure last month.
 *
 * The arrow and the words both carry the direction, so the movement survives
 * greyscale, a colour-blind reader, and a printed page. Colour is the third
 * signal here, never the only one.
 *
 * `good` and the direction are deliberately separate: an expense that rose is
 * an up arrow and bad news, and a tile that paints it green because the number
 * grew tells the shopkeeper the opposite of what happened.
 */
function DeltaChip({ delta, t }: { delta: Delta; t: Dictionary }) {
  const Icon =
    delta.direction === "up" ? ArrowUpRight : delta.direction === "down" ? ArrowDownRight : Minus;

  const label =
    delta.percent === null
      ? t.dashboard.noComparison
      : delta.direction === "flat"
        ? t.dashboard.deltaFlat
        : delta.direction === "up"
          ? t.dashboard.deltaUp(String(Math.abs(delta.percent)))
          : t.dashboard.deltaDown(String(Math.abs(delta.percent)));

  const tone =
    delta.direction === "flat" || delta.percent === null
      ? "text-muted-foreground"
      : delta.good
        ? "text-credit"
        : "text-debit";

  return (
    <p className={cn("mt-1.5 flex items-center gap-1 text-xs font-medium", tone)}>
      <Icon className="size-3.5 shrink-0" aria-hidden />
      <span className="num">{label}</span>
      {/* "আগে কিছু ছিল না" already says what it is measured against; adding
          "আগের সময়ের তুলনায়" after it reads as "nothing before, versus
          before". The caption only earns its place next to a real figure. */}
      {delta.percent === null ? null : (
        <span className="font-normal text-subtle-foreground">{t.dashboard.vsPrevious}</span>
      )}
    </p>
  );
}

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
  delta,
  t,
  href,
  className,
}: {
  label: string;
  value: Money;
  tone?: "neutral" | "credit" | "debit" | "due" | "auto";
  icon?: React.ComponentType<{ className?: string }>;
  footnote?: string;
  /**
   * The same figure a month ago, when comparing it means something.
   *
   * Only for flows. A wallet balance and a stock value are positions, and
   * "12% more cash than last month" invites a conclusion the number does not
   * support — so those tiles carry no chip rather than a misleading one.
   */
  delta?: Delta;
  /** Needed for the chip's wording; a shared component never calls useT(). */
  t?: Dictionary;
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
        {Icon ? (
          <span
            className={cn(
              "flex size-7 shrink-0 items-center justify-center rounded-md bg-surface-sunken",
              TONE_TEXT[tone] ?? "text-subtle-foreground",
            )}
          >
            <Icon className="size-4" aria-hidden />
          </span>
        ) : null}
      </div>
      {/* Steps down on a phone. At the desktop size, four stacked tiles put
          the figure the page is actually about a full screen below the fold. */}
      <MoneyText
        value={value}
        tone={tone}
        size="xl"
        decimals={0}
        className="mt-1.5 block text-2xl sm:mt-2 sm:text-3xl"
      />
      {delta && t ? <DeltaChip delta={delta} t={t} /> : null}
      {footnote ? (
        <p className="mt-1 text-xs text-subtle-foreground">{footnote}</p>
      ) : null}
    </>
  );

  const base = cn(
    // Same card, same arrival and same lift as the dashboard's KPI cards.
    // These sit on fourteen other screens, and two tile treatments in one
    // product reads as two products.
    "tile-rise lift block rounded-xl border border-border bg-surface p-3.5 shadow-card sm:p-4",
    href && "cursor-pointer hover:border-border-strong",
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
        {Icon ? (
          <span
            className={cn(
              "flex size-7 shrink-0 items-center justify-center rounded-md bg-surface-sunken",
              TONE_TEXT[tone] ?? "text-subtle-foreground",
            )}
          >
            <Icon className="size-4" aria-hidden />
          </span>
        ) : null}
      </div>
      <p className={cn("num-lg mt-2 text-2xl font-bold", toneClass)}>
        {value}
        {suffix ? <span className="ml-1 text-base font-medium">{suffix}</span> : null}
      </p>
      {footnote ? <p className="mt-1 text-xs text-subtle-foreground">{footnote}</p> : null}
    </>
  );

  const base = cn(
    "tile-rise lift block rounded-xl border border-border bg-surface p-4 shadow-card",
    href && "cursor-pointer hover:border-border-strong",
  );

  return href ? (
    <Link href={href} className={base}>
      {body}
    </Link>
  ) : (
    <div className={base}>{body}</div>
  );
}
