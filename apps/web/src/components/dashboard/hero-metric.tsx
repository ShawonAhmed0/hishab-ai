import type * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import type { Delta, Dictionary } from "@hishabai/shared";
import { CountUp } from "./count-up";
import { cn } from "@/lib/utils";

/**
 * The one figure the page is about.
 *
 * The dashboard used to open with nine tiles of equal weight, which is a wall
 * of numbers and no answer. A shopkeeper closing up wants one thing first: did
 * the shop make money over this period. Everything else is the detail behind
 * that, so it is quieter and comes after.
 *
 * The charts live inside this card rather than beside it, because the plot and
 * the number are the same claim: one states it, the other shows how it got
 * there. Two cards made them look like two findings.
 */
export function HeroMetric({
  label,
  /** Plain taka — `Money` is a bigint and cannot cross to the counter. */
  taka,
  delta,
  caption,
  href,
  t,
  chart,
  footer,
}: {
  label: string;
  taka: number;
  delta?: Delta;
  caption: string;
  href: Route;
  t: Dictionary;
  chart: React.ReactNode;
  /** The wallet split, or anything else that belongs to the same claim. */
  footer?: React.ReactNode;
}) {
  const Icon =
    delta?.direction === "up"
      ? ArrowUpRight
      : delta?.direction === "down"
        ? ArrowDownRight
        : Minus;

  const deltaLabel =
    !delta || delta.percent === null
      ? t.dashboard.noComparison
      : delta.direction === "flat"
        ? t.dashboard.deltaFlat
        : delta.direction === "up"
          ? t.dashboard.deltaUp(String(Math.abs(delta.percent)))
          : t.dashboard.deltaDown(String(Math.abs(delta.percent)));

  const tone =
    !delta || delta.direction === "flat" || delta.percent === null
      ? "text-muted-foreground"
      : delta.good
        ? "text-credit"
        : "text-debit";

  return (
    <section
      className="rise overflow-hidden rounded-xl border border-border bg-surface shadow-card"
      style={{ "--rise-delay": "300ms" } as React.CSSProperties}
    >
      {/* A wash of the brand behind the headline figure, fading out before the
          plot starts. It marks this card as the one the page is about without
          spending a border, a badge or a second colour on saying so. */}
      {/* The wash alone. A decorative ring used to sit up here too, and it
          landed exactly behind the "সব দেখুন" link — so the one control in
          this header read as a permanently highlighted pill. Ornament that
          collides with a control is not ornament, and the wash was already
          doing the job the ring was added for. */}
      <div className="relative overflow-hidden bg-primary-soft/55">
        <div className="relative flex flex-wrap items-start justify-between gap-3 p-5 pb-4 sm:p-6 sm:pb-5">
          <div className="min-w-0">
            <h2 className="text-sm font-medium text-muted-foreground">{label}</h2>
            <CountUp
              value={taka}
              delayMs={380}
              durationMs={1100}
              className={cn(
                "mt-1.5 block text-4xl font-bold tracking-[-0.035em] sm:text-[2.75rem]",
                taka < 0 ? "text-debit" : taka > 0 ? "text-credit" : "text-foreground",
              )}
            />
            <p className={cn("mt-1.5 flex flex-wrap items-center gap-1.5 text-sm", tone)}>
              <Icon className="size-4 shrink-0" aria-hidden />
              <span className="num font-medium">{deltaLabel}</span>
              {!delta || delta.percent === null ? null : (
                <span className="font-normal text-subtle-foreground">{caption}</span>
              )}
            </p>
          </div>
          <Link
            href={href}
            className="shrink-0 rounded-lg border border-primary/10 bg-surface/55 px-3 py-1.5 text-sm font-medium text-primary-ink shadow-card transition-[background-color,border-color] duration-200 hover:border-primary/20 hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {t.actions.viewAll}
          </Link>
        </div>
      </div>

      {chart}

      {footer ? <div className="border-t border-border p-4 sm:p-5">{footer}</div> : null}
    </section>
  );
}
