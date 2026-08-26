"use client";

import dynamic from "next/dynamic";
import type { ChartPoint } from "./trend-charts";

/**
 * The charting library, fetched only once a chart is actually going to be
 * drawn.
 *
 * recharts and its d3 dependencies are roughly half of the dashboard's
 * JavaScript, and the dashboard is the most-visited screen in the app — so
 * every shopkeeper opening their books paid for the plotting engine before a
 * single figure appeared. The tiles, the tables and the money bar do not need
 * it, and on a phone in a shop that difference is seconds.
 *
 * `ssr: false` because the plot measures its own container before it can size
 * itself: rendering it on the server produces a chart with no dimensions,
 * which then has to be thrown away and drawn again on hydration.
 *
 * The placeholder reserves the plot's exact height. Without it the whole card
 * — and everything under it — jumps when the chunk lands.
 */
const PLACEHOLDER = (
  <div
    className="h-[240px] animate-pulse rounded-lg bg-surface-sunken"
    aria-hidden
  />
);

export const IncomeVsExpenseChart = dynamic(
  () => import("./trend-charts").then((m) => m.IncomeVsExpenseChart),
  { ssr: false, loading: () => PLACEHOLDER },
);

export const SalesTrendChart = dynamic(
  () => import("./trend-charts").then((m) => m.SalesTrendChart),
  { ssr: false, loading: () => PLACEHOLDER },
);

export const ProfitTrendChart = dynamic(
  () => import("./trend-charts").then((m) => m.ProfitTrendChart),
  { ssr: false, loading: () => PLACEHOLDER },
);

export type { ChartPoint };
