"use client";

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
import { formatMoney, formatMoneyCompact, moneyRaw } from "@hishabai/shared";

/**
 * Charts are secondary to the tables, not a substitute for them.
 *
 * Every series is labelled in the legend and every point is readable from the
 * tooltip, so nothing here depends on telling two hues apart — and the same
 * numbers appear as text in the tables below.
 */

export interface ChartPoint {
  period: string;
  income: string;
  expense: string;
  sales: string;
  profit: string;
}

const BN_MONTHS_SHORT = [
  "জানু", "ফেব", "মার্চ", "এপ্রিল", "মে", "জুন",
  "জুলাই", "আগস্ট", "সেপ্ট", "অক্টো", "নভে", "ডিসে",
];

function periodLabel(period: string): string {
  const month = Number(period.slice(5, 7));
  return BN_MONTHS_SHORT[month - 1] ?? period;
}

const axisMoney = (value: number) => formatMoneyCompact(moneyRaw(BigInt(Math.round(value))), { symbol: false });

function MoneyTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { name?: string; value?: number; color?: string; dataKey?: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-border bg-surface p-2.5 shadow-overlay">
      <p className="mb-1 text-xs font-medium text-muted-foreground">
        {label ? periodLabel(label) : ""}
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
              {formatMoney(moneyRaw(BigInt(Math.round(item.value ?? 0))), { decimals: 0 })}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const GRID = "var(--color-border)";
const AXIS = "var(--color-subtle-foreground)";

export function IncomeVsExpenseChart({ data }: { data: ChartPoint[] }) {
  const rows = data.map((d) => ({
    period: d.period,
    আয়: Number(d.income),
    ব্যয়: Number(d.expense),
  }));

  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={rows} margin={{ top: 4, right: 4, bottom: 0, left: -12 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
        <XAxis
          dataKey="period"
          tickFormatter={periodLabel}
          tick={{ fontSize: 12, fill: AXIS }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tickFormatter={axisMoney}
          tick={{ fontSize: 12, fill: AXIS }}
          axisLine={false}
          tickLine={false}
          width={56}
        />
        <Tooltip content={<MoneyTooltip />} cursor={{ fill: "var(--color-surface-sunken)" }} />
        <Legend wrapperStyle={{ fontSize: 13, paddingTop: 8 }} />
        <Bar dataKey="আয়" fill="var(--color-credit)" radius={[3, 3, 0, 0]} maxBarSize={28} />
        <Bar dataKey="ব্যয়" fill="var(--color-debit)" radius={[3, 3, 0, 0]} maxBarSize={28} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function SalesTrendChart({ data }: { data: ChartPoint[] }) {
  const rows = data.map((d) => ({
    period: d.period,
    বিক্রয়: Number(d.sales),
    লাভ: Number(d.profit),
  }));

  return (
    <ResponsiveContainer width="100%" height={240}>
      <AreaChart data={rows} margin={{ top: 4, right: 4, bottom: 0, left: -12 }}>
        <defs>
          <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.24} />
            <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
        <XAxis
          dataKey="period"
          tickFormatter={periodLabel}
          tick={{ fontSize: 12, fill: AXIS }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tickFormatter={axisMoney}
          tick={{ fontSize: 12, fill: AXIS }}
          axisLine={false}
          tickLine={false}
          width={56}
        />
        <Tooltip content={<MoneyTooltip />} />
        <Legend wrapperStyle={{ fontSize: 13, paddingTop: 8 }} />
        <Area
          type="monotone"
          dataKey="বিক্রয়"
          stroke="var(--color-primary)"
          strokeWidth={2}
          fill="url(#salesFill)"
        />
        {/* Dashed, not just a different hue — the two series stay apart in
            greyscale and for colour-blind readers. */}
        <Area
          type="monotone"
          dataKey="লাভ"
          stroke="var(--color-accent)"
          strokeWidth={2}
          strokeDasharray="5 4"
          fill="none"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
