"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { cn } from "@/lib/utils";

export interface BarSegment {
  key: string;
  label: string;
  /** Exact, formatted on the server — never re-derived from the percentage. */
  formatted: string;
  /** Share of the whole, computed from the bigints server-side. */
  percent: number;
  /**
   * That share, already worded — "মোট টাকার ৩৮%".
   *
   * Not a formatter passed down: every parametrised message in this app's
   * dictionary is a *function* (Bengali puts the count before a classifier and
   * English does not, so a shared template cannot serve both), and a function
   * cannot cross from a server component to a client one. It is a runtime
   * error the type checker does not see — the same reason the chart hrefs
   * travel inside the data rather than being built by a callback.
   */
  share: string;
  /** A `bg-*` token class, so the bar and its dot come from one palette. */
  tone: string;
  href?: Route;
}

/**
 * Where the money is, as one bar you can interrogate.
 *
 * Four wallet tiles answer "how much is in the bank" and hide the question a
 * shopkeeper actually has, which is what proportion of everything they own is
 * sitting where. One bar answers both at rest — and pointing at any part of it
 * isolates that part, dims the rest, and states its share, which is the
 * follow-up question the proportion immediately raises.
 *
 * The percentages and both captions are computed on the server, from the
 * bigints. Nothing here divides money or words a sentence: this component
 * knows a width and two strings, and the exact figure it prints is the one the
 * ledger formatted.
 */
export function MoneyBar({
  segments,
  emptyLabel,
  className,
}: {
  segments: readonly BarSegment[];
  emptyLabel: string;
  className?: string;
}) {
  const [active, setActive] = React.useState<string | null>(null);
  const drawn = segments.filter((segment) => segment.percent > 0);
  const current = drawn.find((segment) => segment.key === active) ?? null;

  return (
    <div
      className={cn("space-y-3", className)}
      // One handler for the whole block: leaving any part of it clears the
      // isolation, so the bar cannot get stuck highlighted when the pointer
      // exits between two legend cells.
      onMouseLeave={() => setActive(null)}
    >
      {drawn.length > 0 ? (
        <div className="grow-x flex h-2.5 gap-0.5 overflow-hidden rounded-full">
          {drawn.map((segment) => (
            <span
              key={segment.key}
              className={cn(
                "block h-full transition-opacity duration-200 first:rounded-l-full last:rounded-r-full",
                segment.tone,
                active && active !== segment.key ? "opacity-25" : "opacity-100",
              )}
              style={{ width: `${segment.percent}%` }}
              onMouseEnter={() => setActive(segment.key)}
            />
          ))}
        </div>
      ) : (
        <div className="h-2.5 rounded-full bg-surface-sunken" role="presentation" />
      )}

      <dl className="grid grid-cols-2 gap-x-3 gap-y-2.5 lg:grid-cols-4">
        {segments.map((segment) => {
          const dim = active !== null && active !== segment.key;
          const body = (
            <>
              <dt className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                <span className={cn("size-2 shrink-0 rounded-full", segment.tone)} aria-hidden />
                {segment.label}
              </dt>
              <dd className="num mt-0.5 text-sm font-medium">{segment.formatted}</dd>
            </>
          );

          const cls = cn(
            "block min-w-0 rounded-md px-1.5 py-1 -mx-1.5 transition-all duration-200",
            dim ? "opacity-40" : "opacity-100",
            segment.href && "hover:bg-surface-sunken",
          );

          return segment.href ? (
            <Link
              key={segment.key}
              href={segment.href}
              className={cn(
                cls,
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              )}
              onMouseEnter={() => setActive(segment.key)}
              // Keyboard gets the same isolation the pointer does. Without
              // this the highlight is a mouse-only feature, which is how an
              // interaction becomes decoration for half the people using it.
              onFocus={() => setActive(segment.key)}
              onBlur={() => setActive(null)}
            >
              {body}
            </Link>
          ) : (
            <div
              key={segment.key}
              className={cls}
              onMouseEnter={() => setActive(segment.key)}
            >
              {body}
            </div>
          );
        })}
      </dl>

      {/* Reserved height either way, so isolating a segment does not jog the
          card — and with it, everything below the card — by a line. */}
      <p className="h-4 text-xs text-subtle-foreground" aria-live="polite">
        {drawn.length === 0
          ? emptyLabel
          : current
            ? current.share
            : ""}
      </p>
    </div>
  );
}
