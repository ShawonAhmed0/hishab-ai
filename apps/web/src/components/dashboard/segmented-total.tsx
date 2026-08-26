import Link from "next/link";
import type { Route } from "next";
import type { Money } from "@hishabai/shared";
import { MoneyText } from "@/components/ui/money";
import { cn } from "@/lib/utils";

export interface Segment {
  key: string;
  label: string;
  value: Money;
  /** A token class, so the bar and the figure are painted from one palette. */
  tone: string;
  /** R5.7 — a figure that cannot be opened is one the user has to trust. */
  href?: Route;
}

/**
 * A total, broken into the parts that make it up.
 *
 * Three wallet tiles side by side answered "how much is in the bank" and hid
 * the question a shopkeeper actually has, which is *where their money is*. One
 * bar answers both: the figures are still exact, and the proportion is visible
 * without reading any of them.
 *
 * Widths come from the values, so an empty MFS wallet takes no room rather
 * than a third of the bar.
 */
export function SegmentedTotal({
  segments,
  emptyLabel,
  className,
}: {
  segments: Segment[];
  /** Shown when there is nothing to divide, instead of a bar of zeroes. */
  emptyLabel: string;
  className?: string;
}) {
  // Negative balances cannot take up width. A wallet that has been overdrawn
  // is a data problem the alerts already raise; it must not invert the bar.
  const positive = segments.map((s) => (s.value > 0n ? s.value : 0n));
  const total = positive.reduce((sum: bigint, value: bigint) => sum + value, 0n);

  return (
    <div className={cn("space-y-2.5", className)}>
      {total > 0n ? (
        <div
          className="flex h-2 gap-0.5 overflow-hidden rounded-full"
          role="presentation"
        >
          {segments.map((segment, index) => {
            const share = positive[index] ?? 0n;
            if (share === 0n) return null;
            // Integer percentage from bigints: no float, and the widths still
            // add to the whole because the last one takes the remainder.
            const percent = Number((share * 1000n) / total) / 10;
            return (
              <span
                key={segment.key}
                className={cn("block h-full first:rounded-l-full last:rounded-r-full", segment.tone)}
                style={{ width: `${percent}%` }}
              />
            );
          })}
        </div>
      ) : (
        <div className="h-2 rounded-full bg-surface-sunken" role="presentation" />
      )}

      {/* Four across at `lg`, not at `sm`. A media query asks the viewport,
          and the viewport is not this element's width — with the sidebar taking
          240px, a 769px window leaves 480px here, four cells of 110px, and
          "Total stock value" truncated to "Total stock valu". */}
      <dl className="grid grid-cols-2 gap-x-3 gap-y-2.5 lg:grid-cols-4">
        {segments.map((segment) => {
          const body = (
            <>
              <dt className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                <span
                  className={cn("size-2 shrink-0 rounded-full", segment.tone)}
                  aria-hidden
                />
                {segment.label}
              </dt>
              <dd className="mt-0.5">
                <MoneyText value={segment.value} size="sm" decimals={0} symbol={false} />
              </dd>
            </>
          );

          return (
            <div key={segment.key} className="min-w-0">
              {segment.href ? (
                <Link
                  href={segment.href}
                  className="block rounded-md transition-colors duration-150 hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  {body}
                </Link>
              ) : (
                body
              )}
            </div>
          );
        })}
      </dl>

      {total === 0n ? (
        <p className="text-xs text-subtle-foreground">{emptyLabel}</p>
      ) : null}
    </div>
  );
}
