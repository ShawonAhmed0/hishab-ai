"use client";

import * as React from "react";
import { formatMoney, money } from "@hishabai/shared";
import { cn } from "@/lib/utils";

/**
 * A figure that arrives rather than appears.
 *
 * Counting up is the one piece of motion on a finance screen that is not
 * decoration: it draws the eye to the number the page is about, and it makes
 * the size of the figure legible as *movement* before the reader has parsed a
 * single digit. It runs once, on mount, and then the number is still.
 *
 * Two things keep it honest:
 *
 * - **Tabular figures, always.** A proportional 1 is narrower than a 9, so a
 *   counter without `.num` jitters the whole row sideways sixty times a second
 *   and drags whatever sits beside it along.
 * - **The last frame is the exact value**, not the last step of the easing.
 *   The final figure a shopkeeper reads has to be the one the ledger holds, so
 *   the animation is over the *display* and the end state is assigned, never
 *   interpolated to.
 *
 * Money is a branded bigint and cannot cross to a client component, so the
 * value arrives as plain taka and is re-formatted here through the same
 * formatter the server uses — the 2-2-3 grouping is not re-implemented.
 */
export function CountUp({
  /** Plain taka. The server has already divided out the money scale. */
  value,
  symbol = true,
  decimals = 0,
  durationMs = 900,
  delayMs = 0,
  className,
}: {
  value: number;
  symbol?: boolean;
  decimals?: number;
  durationMs?: number;
  delayMs?: number;
  className?: string;
}) {
  const format = React.useCallback(
    (n: number) => formatMoney(money(n.toFixed(decimals)), { symbol, decimals }),
    [decimals, symbol],
  );

  // Start at the final value. This is what the server rendered, so the first
  // paint and the hydrated markup agree — a counter that starts at zero
  // hydrates into a mismatch and flashes ৳ 0 on every navigation.
  const [display, setDisplay] = React.useState(value);

  React.useEffect(() => {
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || value === 0) {
      setDisplay(value);
      return;
    }

    let frame = 0;
    let start = 0;
    let timer: ReturnType<typeof setTimeout>;

    const step = (now: number) => {
      if (!start) start = now;
      const elapsed = now - start;
      if (elapsed >= durationMs) {
        // The exact figure, assigned rather than eased into.
        setDisplay(value);
        return;
      }
      // easeOutExpo: nearly all of the distance is covered early, so the
      // number settles instead of crawling the last tenth.
      const p = elapsed / durationMs;
      const eased = 1 - Math.pow(2, -10 * p);
      setDisplay(value * eased);
      frame = requestAnimationFrame(step);
    };

    setDisplay(0);
    timer = setTimeout(() => {
      frame = requestAnimationFrame(step);
    }, delayMs);

    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(frame);
    };
  }, [value, durationMs, delayMs]);

  return (
    <span className={cn("num-lg tabular-nums", className)}>{format(display)}</span>
  );
}
