import type * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import type { Delta, Dictionary, Money } from "@hishabai/shared";
import { MoneyText } from "@/components/ui/money";
import { cn } from "@/lib/utils";

/**
 * The one figure the page is about.
 *
 * The dashboard used to open with nine tiles of equal weight, which is a wall
 * of numbers and no answer. A shopkeeper closing up wants one thing first:
 * did the shop make money over this period. Everything else is the detail
 * behind that, so it is quieter and comes after.
 *
 * The chart lives inside this card rather than beside it, because the line and
 * the number are the same claim: one states it, the other shows how it got
 * there. Two cards made them look like two findings.
 */
export function HeroMetric({
  label,
  value,
  delta,
  caption,
  href,
  t,
  chart,
  footer,
}: {
  label: string;
  value: Money;
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

  const label_ =
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
    <section className="rounded-lg border border-border bg-surface shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3 p-4 pb-0">
        <div className="min-w-0">
          <h2 className="text-sm font-medium text-muted-foreground">{label}</h2>
          <MoneyText
            value={value}
            tone="auto"
            decimals={0}
            className="mt-1 block text-3xl font-bold tracking-tight sm:text-4xl"
          />
          <p className={cn("mt-1.5 flex flex-wrap items-center gap-1.5 text-sm", tone)}>
            <Icon className="size-4 shrink-0" aria-hidden />
            <span className="num font-medium">{label_}</span>
            {!delta || delta.percent === null ? null : (
              <span className="font-normal text-subtle-foreground">{caption}</span>
            )}
          </p>
        </div>
        <Link
          href={href}
          className="shrink-0 rounded-md px-2 py-1 text-sm text-primary transition-colors duration-150 hover:bg-primary-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {t.actions.viewAll}
        </Link>
      </div>

      <div className="px-1 pt-2">{chart}</div>

      {footer ? <div className="border-t border-border p-4">{footer}</div> : null}
    </section>
  );
}
