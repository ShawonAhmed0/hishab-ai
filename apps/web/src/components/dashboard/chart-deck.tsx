"use client";

import * as React from "react";
import Link from "next/link";
import {
  IncomeVsExpenseChart,
  ProfitTrendChart,
  SalesTrendChart,
  type ChartPoint,
} from "@/components/charts/trend-charts";
import { cn } from "@/lib/utils";

export type DeckKind = "flow" | "sales" | "profit";

export interface DeckTab {
  key: DeckKind;
  label: string;
  /**
   * The same months, carrying the drill-down that belongs to *this* question.
   *
   * আয় বনাম ব্যয় opens লাভ-ক্ষতি for the month; বিক্রয় opens the বিক্রয়
   * রেজিস্টার. Built on the server, because a client component guessing at
   * route shapes is how a typed route stops being typed.
   */
  data: ChartPoint[];
}

/**
 * Three questions, one plot area.
 *
 * These were two cards side by side, which spent half the width of the page
 * on charts and still had nowhere to put a third. They answer questions asked
 * one at a time — *did we make money*, *are sales climbing*, *is the margin
 * holding* — so they take turns rather than competing, and the space each one
 * gets is the whole card instead of a third of it.
 *
 * The tabs are real buttons in a `tablist`: arrow keys move between them, and
 * the chart is the panel they own.
 */
export function ChartDeck({
  tabs,
  monthsLabel,
  monthNames,
  emptyState,
  singleMonthState,
}: {
  tabs: readonly DeckTab[];
  monthsLabel: string;
  monthNames: readonly string[];
  emptyState: React.ReactNode;
  /** An area chart needs two points to draw a line between. */
  singleMonthState: React.ReactNode;
}) {
  const [active, setActive] = React.useState<DeckKind>(tabs[0]?.key ?? "flow");
  const current = tabs.find((tab) => tab.key === active) ?? tabs[0];
  const refs = React.useRef<Record<string, HTMLButtonElement | null>>({});

  if (!current) return <>{emptyState}</>;

  const move = (event: React.KeyboardEvent) => {
    const order = tabs.map((tab) => tab.key);
    const at = order.indexOf(active);
    const next =
      event.key === "ArrowRight"
        ? order[(at + 1) % order.length]
        : event.key === "ArrowLeft"
          ? order[(at - 1 + order.length) % order.length]
          : null;
    if (!next) return;
    event.preventDefault();
    setActive(next);
    refs.current[next]?.focus();
  };

  const points = current.data;

  return (
    <div>
      <div
        role="tablist"
        aria-label={monthsLabel}
        onKeyDown={move}
        className="flex flex-wrap gap-1 border-b border-border px-4"
      >
        {tabs.map((tab) => {
          const on = tab.key === active;
          return (
            <button
              key={tab.key}
              ref={(node) => {
                refs.current[tab.key] = node;
              }}
              type="button"
              role="tab"
              id={`deck-tab-${tab.key}`}
              aria-selected={on}
              aria-controls={`deck-panel-${tab.key}`}
              // Only the selected tab is in the tab order; the arrow keys move
              // within the set. That is what makes a tablist one stop rather
              // than three.
              tabIndex={on ? 0 : -1}
              onClick={() => setActive(tab.key)}
              className={cn(
                "relative cursor-pointer px-3 py-2.5 text-sm font-medium transition-colors duration-150",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                on ? "text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label}
              {/* The underline slides in under the chosen tab rather than
                  cutting: the movement is what tells the eye which one it
                  came from. */}
              <span
                className={cn(
                  "absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary transition-transform duration-200",
                  on ? "scale-x-100" : "scale-x-0",
                )}
                aria-hidden
              />
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id={`deck-panel-${current.key}`}
        aria-labelledby={`deck-tab-${current.key}`}
        className="px-1 pt-3"
      >
        {points.length === 0 ? (
          emptyState
        ) : points.length === 1 && current.key !== "flow" ? (
          // A bar chart is readable with one month. A line is not.
          singleMonthState
        ) : (
          <>
            {/* Keyed on the tab so switching remounts the plot and the new
                series draws itself, instead of recharts tweening one shape
                into an unrelated other. */}
            <div key={current.key} className="rise">
              {current.key === "flow" ? (
                <IncomeVsExpenseChart data={points} />
              ) : current.key === "sales" ? (
                <SalesTrendChart data={points} />
              ) : (
                <ProfitTrendChart data={points} />
              )}
            </div>

            {/* A chart segment is a mouse target only, so the same drill-down
                is rendered as real anchors underneath. */}
            <nav className="mt-3 flex flex-wrap gap-1.5 px-3 pb-1" aria-label={monthsLabel}>
              {points.map((point) => (
                <Link
                  key={point.period}
                  href={point.href}
                  className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors duration-150 hover:border-border-strong hover:bg-surface-sunken hover:text-foreground"
                >
                  {monthNames[Number(point.period.slice(5, 7)) - 1]}
                </Link>
              ))}
            </nav>
          </>
        )}
      </div>
    </div>
  );
}
