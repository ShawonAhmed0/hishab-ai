"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatMoney, money } from "@hishabai/shared";
import { useT } from "@/components/locale-provider";

/**
 * Charts are secondary to the tables, not a substitute for them.
 *
 * Every series is labelled in the legend and every point is readable from the
 * tooltip, so nothing here depends on telling two hues apart — and the same
 * numbers appear as text in the tables below.
 */

/**
 * Chart values are plain taka, not the scaled bigint the ledger uses.
 *
 * A chart does not need sub-paisa precision, and handing recharts values in
 * the hundreds of millions made it mis-scale the axis. Money crosses the
 * server boundary as a number of taka; anything the user must reconcile
 * against a memo is rendered from the exact value elsewhere on the page.
 */
export interface ChartPoint {
  period: string;
  income: number;
  expense: number;
  sales: number;
  profit: number;
  /**
   * Where this month's bar or point leads — spec R5.7.
   *
   * Built on the server and carried in the data rather than derived here: a
   * function prop cannot cross from a server component, and a client component
   * guessing at route shapes is how a typed route stops being typed. The same
   * links are rendered as real anchors under the chart, which is what makes the
   * drill-down reachable without a mouse.
   */
  href: Route;
}

function periodLabel(period: string, months: readonly string[]): string {
  const month = Number(period.slice(5, 7));
  return months[month - 1] ?? period;
}

/**
 * An axis tick is a magnitude, not a sentence.
 *
 * These used to run through `formatMoneyCompact`, which appends the scale word
 * — so every tick read "80 thousand" / "৮০ হাজার" inside a 56px gutter and was
 * clipped to "usand". A tick repeated five times up the side of a chart is the
 * worst place to spend a word: the grouped figure already tells a Bangladeshi
 * reader the magnitude, which is the whole reason this app groups 2-2-3. The
 * headline above the chart is where the compact wording belongs, and it is
 * still there.
 */
const axisMoney = (value: number) =>
  formatMoney(money(Math.round(value)), { symbol: false, decimals: 0 });

function MoneyTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { name?: string; value?: number; color?: string; dataKey?: string }[];
  label?: string;
}) {
  const t = useT();
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-border bg-surface p-2.5 shadow-overlay">
      <p className="mb-1 text-xs font-medium text-muted-foreground">
        {label ? periodLabel(label, t.monthsShort) : ""}
      </p>
      <ul className="space-y-0.5">
        {payload.map((item) => (
          <li key={item.dataKey} className="flex items-center gap-2 text-sm">
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ background: item.color }}
              aria-hidden
            />
            <span className="text-muted-foreground">{item.name}</span>
            <span className="num ml-auto font-medium">
              {formatMoney(money(Math.round(item.value ?? 0)), { decimals: 0 })}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Recharts hands the click back as a label, not as the datum. Looking the
 * point up by period keeps the navigation honest when the series is filtered
 * or reordered.
 */
function useSegmentClick(data: ChartPoint[]) {
  const router = useRouter();
  return (state: { activeLabel?: string | number } | null) => {
    const period = state?.activeLabel;
    if (period === undefined) return;
    const point = data.find((d) => d.period === String(period));
    if (point) router.push(point.href);
  };
}

const GRID = "var(--color-border)";
/** The axis line is not data. It sits behind it. */
const GRID_DASH = "2 6";
const AXIS = "var(--color-subtle-foreground)";

/**
 * Charts grow into their values.
 *
 * This was off, for a real reason: bars used to sit stuck near zero height
 * while the axis already showed the full scale — a chart lying about its own
 * numbers. The cause was a re-render landing mid-animation (a
 * `ResponsiveContainer` resize is one, and it fires on first layout), which
 * restarts recharts' interpolation from wherever it had got to and sometimes
 * never finishes.
 *
 * The fix is to make each chart animate once per dataset: the plot is keyed on
 * the periods it is drawing, so a resize re-renders without resetting the
 * animation, and a genuinely new range gets a fresh one. The duration is kept
 * short enough that the final figures are on screen before anyone has finished
 * reading the headline above them.
 */
const ANIMATE_MS = 750;

function useChartAnimation(): boolean {
  // Start still so the server and the first client paint agree. Motion is
  // enabled after hydration only when the operating-system preference allows
  // it; CSS cannot reach Recharts' JavaScript interpolation loop.
  const [animate, setAnimate] = React.useState(false);

  React.useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setAnimate(!query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  return animate;
}

/** One animation per dataset, not one per render. See `ANIMATE`. */
const seriesKey = (data: { period: string }[]) => data.map((d) => d.period).join(",");

export function IncomeVsExpenseChart({ data }: { data: ChartPoint[] }) {
  const t = useT();
  const animate = useChartAnimation();
  const onSegmentClick = useSegmentClick(data);
  const rows = data.map((d) => ({
    period: d.period,
    income: d.income,
    expense: d.expense,
  }));

  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart
        key={seriesKey(rows)}
        data={rows}
        margin={{ top: 4, right: 16, bottom: 0, left: -4 }}
        onClick={onSegmentClick}
        className="cursor-pointer"
      >
        <CartesianGrid strokeDasharray={GRID_DASH} stroke={GRID} vertical={false} />
        <XAxis
          dataKey="period"
          tickFormatter={(period: string) => periodLabel(period, t.monthsShort)}
          tick={{ fontSize: 12, fill: AXIS }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tickFormatter={axisMoney}
          tick={{ fontSize: 12, fill: AXIS }}
          axisLine={false}
          tickLine={false}
          width={68}
        />
        <Tooltip content={<MoneyTooltip />} cursor={{ fill: "var(--color-surface-sunken)" }} />
        <Legend wrapperStyle={{ fontSize: 13, paddingTop: 8 }} />
        <Bar
          dataKey="income"
          name={t.dashboard.seriesIncome}
          fill="var(--color-credit)"
          radius={[6, 6, 0, 0]}
          maxBarSize={26}
          isAnimationActive={animate}
          animationDuration={ANIMATE_MS}
          animationEasing="ease-out"
        />
        <Bar
          dataKey="expense"
          name={t.dashboard.seriesExpense}
          fill="var(--color-debit)"
          radius={[6, 6, 0, 0]}
          maxBarSize={26}
          isAnimationActive={animate}
          animationDuration={ANIMATE_MS}
          animationBegin={120}
          animationEasing="ease-out"
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function SalesTrendChart({ data }: { data: ChartPoint[] }) {
  const t = useT();
  const animate = useChartAnimation();
  const onSegmentClick = useSegmentClick(data);
  const rows = data.map((d) => ({
    period: d.period,
    sales: d.sales,
    profit: d.profit,
  }));

  return (
    <ResponsiveContainer width="100%" height={240}>
      <AreaChart
        key={seriesKey(rows)}
        data={rows}
        margin={{ top: 4, right: 16, bottom: 0, left: -4 }}
        onClick={onSegmentClick}
        className="cursor-pointer"
      >
        <defs>
          <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
            {/* The fill can be the bright brand — nothing is read off it. */}
            <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.28} />
            <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray={GRID_DASH} stroke={GRID} vertical={false} />
        <XAxis
          dataKey="period"
          tickFormatter={(period: string) => periodLabel(period, t.monthsShort)}
          tick={{ fontSize: 12, fill: AXIS }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tickFormatter={axisMoney}
          tick={{ fontSize: 12, fill: AXIS }}
          axisLine={false}
          tickLine={false}
          width={68}
        />
        <Tooltip content={<MoneyTooltip />} />
        <Legend wrapperStyle={{ fontSize: 13, paddingTop: 8 }} />
        <Area
          type="monotone"
          dataKey="sales"
          name={t.dashboard.seriesSales}
          // The stroke is the data, so it takes the ink: the fill green is
          // 2.2:1 on white and a 2px line of it is not a line anybody sees.
          stroke="var(--color-primary-ink)"
          strokeWidth={2}
          fill="url(#salesFill)"
          isAnimationActive={animate}
          animationDuration={ANIMATE_MS}
          animationEasing="ease-out"
        />
        {/* Dashed, not just a different hue — the two series stay apart in
            greyscale and for colour-blind readers. */}
        <Area
          type="monotone"
          dataKey="profit"
          name={t.dashboard.seriesProfit}
          stroke="var(--color-accent)"
          strokeWidth={2}
          strokeDasharray="5 4"
          fill="none"
          isAnimationActive={animate}
          animationDuration={ANIMATE_MS}
          animationBegin={150}
          animationEasing="ease-out"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/**
 * Profit alone, over the same months.
 *
 * Its own tab rather than a second line on the sales chart, because profit is
 * the only series here that goes negative, and a shared axis with sales — an
 * order of magnitude larger — flattens every loss into the baseline. On its
 * own scale a bad month is visibly a bad month.
 *
 * The zero line is drawn explicitly. On a series that crosses it, the gridline
 * that matters is not "some round number" but the one separating a profit from
 * a loss.
 */
export function ProfitTrendChart({ data }: { data: ChartPoint[] }) {
  const t = useT();
  const animate = useChartAnimation();
  const onSegmentClick = useSegmentClick(data);
  const rows = data.map((d) => ({ period: d.period, profit: d.profit }));
  const anyLoss = rows.some((r) => r.profit < 0);

  return (
    <ResponsiveContainer width="100%" height={240}>
      <AreaChart
        key={seriesKey(rows)}
        data={rows}
        margin={{ top: 4, right: 16, bottom: 0, left: -4 }}
        onClick={onSegmentClick}
        className="cursor-pointer"
      >
        <defs>
          <linearGradient id="profitFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-credit)" stopOpacity={0.3} />
            <stop offset="100%" stopColor="var(--color-credit)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray={GRID_DASH} stroke={GRID} vertical={false} />
        <XAxis
          dataKey="period"
          tickFormatter={(period: string) => periodLabel(period, t.monthsShort)}
          tick={{ fontSize: 12, fill: AXIS }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tickFormatter={axisMoney}
          tick={{ fontSize: 12, fill: AXIS }}
          axisLine={false}
          tickLine={false}
          width={68}
        />
        <Tooltip content={<MoneyTooltip />} />
        {anyLoss ? (
          <ReferenceLine y={0} stroke="var(--color-border-strong)" strokeWidth={1} />
        ) : null}
        <Area
          type="monotone"
          dataKey="profit"
          name={t.dashboard.seriesProfit}
          stroke="var(--color-credit)"
          strokeWidth={2.5}
          fill="url(#profitFill)"
          dot={{ r: 3, strokeWidth: 0, fill: "var(--color-credit)" }}
          activeDot={{ r: 5, strokeWidth: 2, stroke: "var(--color-surface)" }}
          isAnimationActive={animate}
          animationDuration={ANIMATE_MS}
          animationEasing="ease-out"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
