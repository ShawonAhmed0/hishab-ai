"use client";

import { useRouter } from "next/navigation";
import type { Route } from "next";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  formatMoney,
  formatMoneyCompact,
  money,
  type MoneyScaleWords,
} from "@hishabai/shared";
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

const axisMoney = (value: number, scale: MoneyScaleWords) =>
  formatMoneyCompact(money(Math.round(value)), { symbol: false, scale });

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
 * Charts render at their final values immediately.
 *
 * The grow-in animation left bars stuck near zero height while the axis showed
 * the correct scale — a chart that lies about its own numbers. It is also
 * motion for its own sake, which this design direction (motion 3, subtle) does
 * not want and reduced-motion users would drop anyway.
 */
const ANIMATE = false;

export function IncomeVsExpenseChart({ data }: { data: ChartPoint[] }) {
  const t = useT();
  const onSegmentClick = useSegmentClick(data);
  const rows = data.map((d) => ({
    period: d.period,
    income: d.income,
    expense: d.expense,
  }));

  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart
        data={rows}
        margin={{ top: 4, right: 4, bottom: 0, left: -12 }}
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
          tickFormatter={(value: number) => axisMoney(value, t.moneyScale)}
          tick={{ fontSize: 12, fill: AXIS }}
          axisLine={false}
          tickLine={false}
          width={56}
        />
        <Tooltip content={<MoneyTooltip />} cursor={{ fill: "var(--color-surface-sunken)" }} />
        <Legend wrapperStyle={{ fontSize: 13, paddingTop: 8 }} />
        <Bar
          dataKey="income"
          name={t.dashboard.seriesIncome}
          fill="var(--color-credit)"
          radius={[6, 6, 0, 0]}
          maxBarSize={26}
          isAnimationActive={ANIMATE}
        />
        <Bar
          dataKey="expense"
          name={t.dashboard.seriesExpense}
          fill="var(--color-debit)"
          radius={[6, 6, 0, 0]}
          maxBarSize={26}
          isAnimationActive={ANIMATE}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function SalesTrendChart({ data }: { data: ChartPoint[] }) {
  const t = useT();
  const onSegmentClick = useSegmentClick(data);
  const rows = data.map((d) => ({
    period: d.period,
    sales: d.sales,
    profit: d.profit,
  }));

  return (
    <ResponsiveContainer width="100%" height={240}>
      <AreaChart
        data={rows}
        margin={{ top: 4, right: 4, bottom: 0, left: -12 }}
        onClick={onSegmentClick}
        className="cursor-pointer"
      >
        <defs>
          <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.24} />
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
          tickFormatter={(value: number) => axisMoney(value, t.moneyScale)}
          tick={{ fontSize: 12, fill: AXIS }}
          axisLine={false}
          tickLine={false}
          width={56}
        />
        <Tooltip content={<MoneyTooltip />} />
        <Legend wrapperStyle={{ fontSize: 13, paddingTop: 8 }} />
        <Area
          type="monotone"
          dataKey="sales"
          name={t.dashboard.seriesSales}
          stroke="var(--color-primary)"
          strokeWidth={2}
          fill="url(#salesFill)"
          isAnimationActive={ANIMATE}
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
          isAnimationActive={ANIMATE}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
