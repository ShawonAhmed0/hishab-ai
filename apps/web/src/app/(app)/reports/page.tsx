import Link from "next/link";
import type { Route } from "next";
import {
  Banknote,
  BarChart3,
  Boxes,
  ChevronRight,
  ClipboardList,
  Hourglass,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { currentMonth, getProfitLoss } from "@hishabai/core";
import type { Dictionary, StringKeys } from "@hishabai/shared";
import { Card, CardBody } from "@/components/ui/card";
import { StatTile } from "@/components/ui/stat-tile";
import { dict } from "@/lib/locale.server";
import { sessionWithData } from "@/lib/session";
import { formatDate } from "@/lib/utils";

export async function generateMetadata() {
  return { title: (await dict()).nav.reports };
}

/**
 * Keys rather than strings, for the same reason the nav items hold keys: this
 * array is module state and would otherwise freeze one locale for the life of
 * the server process.
 */
const REPORTS: {
  href: Route;
  title: StringKeys<Dictionary["reports"]>;
  hint: StringKeys<Dictionary["reports"]>;
  icon: typeof BarChart3;
}[] = [
  {
    href: "/reports/profit-loss",
    title: "profitLoss",
    hint: "profitLossHint",
    icon: BarChart3,
  },
  {
    href: "/reports/dues",
    title: "dues",
    hint: "duesHint",
    icon: Hourglass,
  },
  {
    href: "/reports/register",
    title: "register",
    hint: "registerHint",
    icon: ClipboardList,
  },
  {
    href: "/reports/stock",
    title: "stock",
    hint: "stockHint",
    icon: Boxes,
  },
  {
    href: "/reports/cash-book",
    title: "cashBook",
    hint: "cashBookHint",
    icon: Banknote,
  },
];

export default async function ReportsPage() {
  const period = currentMonth();
  const [{ data: pl }, t] = await Promise.all([
    sessionWithData((scope) => getProfitLoss(scope, period)),
    dict(),
  ]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t.nav.reports}</h1>
        <p className="text-sm text-muted-foreground">{t.reports.indexHint}</p>
      </div>

      {/* This month at a glance; every report below opens on the same period. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile
          label={t.dashboard.monthIncome}
          value={pl.totals.income}
          tone="credit"
          icon={TrendingUp}
          footnote={t.reports.rangeLine(formatDate(period.from, t), formatDate(period.to, t))}
        />
        <StatTile
          label={t.dashboard.monthExpense}
          value={pl.totals.expense}
          tone="debit"
          icon={TrendingDown}
          footnote={t.reports.withCogs}
        />
        <StatTile
          label={t.dashboard.netProfit}
          value={pl.totals.netProfit}
          tone="auto"
          icon={BarChart3}
          footnote={pl.totals.netProfit >= 0n ? t.reports.inProfit : t.reports.inLoss}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {REPORTS.map((report) => (
          <Card key={report.href} className="transition-colors hover:border-border-strong">
            <Link href={report.href} className="block">
              <CardBody className="flex items-start gap-3">
                <span className="rounded-md bg-surface-sunken p-2 text-primary">
                  <report.icon className="size-5" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{t.reports[report.title]}</span>
                  <span className="block text-sm text-muted-foreground">{t.reports[report.hint]}</span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-subtle-foreground" aria-hidden />
              </CardBody>
            </Link>
          </Card>
        ))}
      </div>
    </div>
  );
}
