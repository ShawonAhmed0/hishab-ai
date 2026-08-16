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
import { bn } from "@hishabai/shared";
import { Card, CardBody } from "@/components/ui/card";
import { StatTile } from "@/components/ui/stat-tile";
import { sessionWithData } from "@/lib/session";
import { formatDateBn } from "@/lib/utils";

export const metadata = { title: bn.nav.reports };

const REPORTS: {
  href: Route;
  title: string;
  hint: string;
  icon: typeof BarChart3;
}[] = [
  {
    href: "/reports/profit-loss",
    title: "লাভ-ক্ষতি",
    hint: "আয়, ব্যয়, মোট মুনাফা ও নিট লাভ — খাত অনুযায়ী",
    icon: BarChart3,
  },
  {
    href: "/reports/dues",
    title: "বকেয়া ও পাওনা",
    hint: "কার টাকা কত দিন ধরে আটকে আছে, বয়স অনুযায়ী ভাগ করা",
    icon: Hourglass,
  },
  {
    href: "/reports/register",
    title: "বিক্রয় ও ক্রয়",
    hint: "কার কাছে কত বিক্রি, কোন পণ্য কত গেল",
    icon: ClipboardList,
  },
  {
    href: "/reports/stock",
    title: "স্টক রিপোর্ট",
    hint: "প্রারম্ভিক, আগমন, নির্গমন ও সমাপনী স্টক",
    icon: Boxes,
  },
  {
    href: "/reports/cash-book",
    title: "ক্যাশ বই",
    hint: "নগদ, ব্যাংক ও MFS-এর প্রতিটি জমা-খরচ",
    icon: Banknote,
  },
];

export default async function ReportsPage() {
  const period = currentMonth();
  const { data: pl } = await sessionWithData((scope) => getProfitLoss(scope, period));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{bn.nav.reports}</h1>
        <p className="text-sm text-muted-foreground">
          প্রতিটি রিপোর্ট খাতা থেকে সরাসরি তৈরি — তারিখ বেছে নিয়ে প্রিন্ট করা যায়
        </p>
      </div>

      {/* This month at a glance; every report below opens on the same period. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile
          label={bn.dashboard.monthIncome}
          value={pl.totals.income}
          tone="credit"
          icon={TrendingUp}
          footnote={`${formatDateBn(period.from)} — ${formatDateBn(period.to)}`}
        />
        <StatTile
          label={bn.dashboard.monthExpense}
          value={pl.totals.expense}
          tone="debit"
          icon={TrendingDown}
          footnote="বিক্রীত পণ্যের ব্যয়সহ"
        />
        <StatTile
          label={bn.dashboard.netProfit}
          value={pl.totals.netProfit}
          tone="auto"
          icon={BarChart3}
          footnote={pl.totals.netProfit >= 0n ? "লাভে আছেন" : "ক্ষতিতে আছেন"}
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
                  <span className="block font-semibold">{report.title}</span>
                  <span className="block text-sm text-muted-foreground">{report.hint}</span>
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
