import type * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import type { Delta, Dictionary } from "@hishabai/shared";
import { CountUp } from "./count-up";
import { Spark } from "./spark";
import { cn } from "@/lib/utils";

const TONE: Record<string, string> = {
  credit: "text-credit",
  debit: "text-debit",
  due: "text-due",
  neutral: "text-foreground",
};

const TONE_EDGE: Record<string, string> = {
  credit: "bg-credit",
  debit: "bg-debit",
  due: "bg-due",
  neutral: "bg-primary",
};

/**
 * A headline figure, what it did, and the shape it did it in.
 *
 * Three things in one card, in the order a shopkeeper asks them: how much,
 * which way, and since when. The tile this replaces stated only the first, so
 * every figure on the dashboard raised a question the dashboard did not
 * answer.
 *
 * A server component that renders two client ones. The counter and the
 * sparkline need no state of their own beyond their own animation, so the data
 * still arrives in one server render and nothing about this card is fetched
 * from the browser.
 */
export function KpiCard<T extends string>({
  label,
  /** Plain taka — `Money` is a bigint and cannot cross to the counter. */
  taka,
  tone = "neutral",
  icon: Icon,
  delta,
  t,
  href,
  series,
  sparkId,
  note,
  /** Position in the row, so the four arrive in sequence rather than at once. */
  index = 0,
}: {
  label: string;
  taka: number;
  tone?: "neutral" | "credit" | "debit" | "due";
  icon?: React.ComponentType<{ className?: string }>;
  delta?: Delta;
  t: Dictionary;
  href?: Route<T>;
  /** The last few periods of this same figure, for the sparkline. */
  series?: readonly number[];
  sparkId?: string;
  /** A second fact, where this figure has no meaningful history to plot. */
  note?: string;
  index?: number;
}) {
  const step = index * 70;

  const DeltaIcon =
    delta?.direction === "up" ? ArrowUpRight : delta?.direction === "down" ? ArrowDownRight : Minus;

  const deltaLabel =
    !delta || delta.percent === null
      ? t.dashboard.noComparison
      : delta.direction === "flat"
        ? t.dashboard.deltaFlat
        : delta.direction === "up"
          ? t.dashboard.deltaUp(String(Math.abs(delta.percent)))
          : t.dashboard.deltaDown(String(Math.abs(delta.percent)));

  const deltaTone =
    !delta || delta.direction === "flat" || delta.percent === null
      ? "text-muted-foreground"
      : delta.good
        ? "text-credit"
        : "text-debit";

  const body = (
    <>
      <span
        className={cn("absolute inset-x-4 top-0 h-0.5 rounded-b-full opacity-75", TONE_EDGE[tone])}
        aria-hidden
      />
      <div className="flex items-start justify-between gap-2 px-4 pt-4 sm:px-5">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        {Icon ? (
          <span
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-sunken",
              TONE[tone],
            )}
          >
            <Icon className="size-4" aria-hidden />
          </span>
        ) : null}
      </div>

      <div className="px-4 sm:px-5">
        <CountUp
          value={taka}
          delayMs={step + 120}
          className={cn("mt-2 block text-[1.75rem] sm:text-[1.875rem]", TONE[tone])}
        />

        {delta ? (
          <p className={cn("mt-1 flex items-center gap-1 text-xs font-medium", deltaTone)}>
            <DeltaIcon className="size-3.5 shrink-0" aria-hidden />
            <span className="num">{deltaLabel}</span>
            {delta.percent === null ? null : (
              <span className="font-normal text-subtle-foreground">{t.dashboard.vsPrevious}</span>
            )}
          </p>
        ) : note ? (
          <p className="mt-1 text-xs text-subtle-foreground">{note}</p>
        ) : null}
      </div>

      {/* The trend runs to both edges of the card. Inset, it would read as a
          third element; bleeding, it reads as the card's own floor. */}
      {series && sparkId ? (
        <div className={cn("mt-2", TONE[tone])}>
          <Spark values={series} id={sparkId} delayMs={step + 320} />
        </div>
      ) : (
        // Cards without a series still have to be the same height, or the row
        // of four develops a step in it.
        <div className="mt-2 h-8" />
      )}
    </>
  );

  const base = cn(
    "rise lift relative block overflow-hidden rounded-xl border border-border bg-surface/95 pb-1 shadow-card",
    href && "cursor-pointer hover:border-border-strong",
  );
  const style = { "--rise-delay": `${step}ms` } as React.CSSProperties;

  return href ? (
    <Link href={href} className={base} style={style}>
      {body}
    </Link>
  ) : (
    <div className={base} style={style}>
      {body}
    </div>
  );
}
