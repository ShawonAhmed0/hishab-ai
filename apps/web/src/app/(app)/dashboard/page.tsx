import { Suspense } from "react";
import Link from "next/link";
import type { Route } from "next";
import {
  AlertTriangle,
  TrendingDown,
  TrendingUp,
  Users,
  PlusCircle,
  ReceiptText,
} from "lucide-react";
import type { CSSProperties } from "react";
import { dailyAlertsFrom, getCustomerHealth, getDashboard } from "@hishabai/core";
import {
  PRESET_RANGES,
  currentMonthRange,
  deltaOf,
  formatMoney,
  formatQty,
  moneyFromDb,
  negMoney,
  presetRange,
  subMoney,
  qtyFromDb,
} from "@hishabai/shared";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader, CardTitle, EmptyState } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MoneyText } from "@/components/ui/money";
import { MobileCards, MobileRow, TD, TH, THead, TR, TableScroll } from "@/components/ui/table";
import type { ChartPoint } from "@/components/charts/trend-charts";
import { DailyAlertBlock } from "@/components/customers/health";
import { ChartDeck, type DeckTab } from "@/components/dashboard/chart-deck";
import { HeroMetric } from "@/components/dashboard/hero-metric";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { MoneyBar, type BarSegment } from "@/components/dashboard/money-bar";
import { PeriodChips, type PeriodChoice } from "@/components/dashboard/period-chips";
import { PrintButton } from "@/components/ui/print-button";
import { dict } from "@/lib/locale.server";
import { sessionWithData } from "@/lib/session";
import { formatDateShort } from "@/lib/utils";

export async function generateMetadata() {
  return { title: (await dict()).nav.dashboard };
}

const TYPE_TONE: Record<string, "credit" | "debit" | "info" | "neutral"> = {
  sale: "credit",
  income: "credit",
  customer_payment: "credit",
  purchase: "debit",
  expense: "debit",
  vendor_payment: "debit",
};

/**
 * The first and last day of a `YYYY-MM` period.
 *
 * Day 0 of the *next* month is the last day of this one, which is the only
 * form of this that does not need a leap-year table.
 */
function monthBounds(period: string): { from: string; to: string } {
  const year = Number(period.slice(0, 4));
  const month = Number(period.slice(5, 7));
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { from: `${period}-01`, to: `${period}-${String(last).padStart(2, "0")}` };
}

/**
 * R5.4's daily block, streamed.
 *
 * It is its own read — the health derivation walks the journal per party and
 * the dashboard's single round trip should not wait on it. Inside a Suspense
 * boundary the tiles and the tables paint immediately and this arrives when it
 * is ready, rather than holding the most-visited page in the app.
 */
async function DailyAlerts() {
  const [{ data: view }, t] = await Promise.all([
    sessionWithData(getCustomerHealth),
    dict(),
  ]);
  return <DailyAlertBlock alerts={dailyAlertsFrom(view)} t={t} limit={5} />;
}

/** Only a real ISO date reaches the query; anything else falls back. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const fallback = currentMonthRange();
  const range = {
    from: params.from && ISO_DATE.test(params.from) ? params.from : fallback.from,
    to: params.to && ISO_DATE.test(params.to) ? params.to : fallback.to,
  };
  // A reversed range would return nothing and look like an empty company.
  const period = range.from <= range.to ? range : fallback;

  // One round trip for the whole page — tiles, charts, lists and alerts — and
  // it runs alongside the session lookup rather than after it.
  const [
    {
      data: { tiles, previous, trend, recent, topDueCustomers, lowStock },
    },
    t,
  ] = await Promise.all([sessionWithData((scope) => getDashboard(scope, period)), dict()]);

  // R5.7 — every figure below leads to the ledger detail that produced it, and
  // all of those reports read `journal_lines`, so a cancelled voucher nets to
  // zero on the way down without the drill-down knowing cancellation exists.
  const monthReport = `/reports/profit-loss?from=${period.from}&to=${period.to}` as Route;

  // Money is a bigint and cannot cross to a client component. Charts get plain
  // taka — exact figures are rendered from the real values in the tiles and
  // tables below.
  const toTaka = (value: bigint) => Number(value) / 10_000;
  const points = trend.map((point) => ({
    period: point.period,
    income: toTaka(point.income),
    expense: toTaka(point.expense),
    sales: toTaka(point.sales),
    profit: toTaka(point.profit),
    bounds: monthBounds(point.period),
  }));

  // Each tab answers a different question, so a click on each lands somewhere
  // different: আয় বনাম ব্যয় and লাভ on that month's লাভ-ক্ষতি, বিক্রয় on that
  // month's বিক্রয় রেজিস্টার.
  const withHref = (build: (bounds: { from: string; to: string }) => Route): ChartPoint[] =>
    points.map((point) => ({ ...point, href: build(point.bounds) }));

  const profitLossHref = withHref((b) => `/reports/profit-loss?from=${b.from}&to=${b.to}` as Route);
  const deckTabs: DeckTab[] = [
    { key: "flow", label: t.dashboard.incomeVsExpense, data: profitLossHref },
    {
      key: "sales",
      label: t.dashboard.salesTrend,
      data: withHref((b) => `/reports/register?type=sale&from=${b.from}&to=${b.to}` as Route),
    },
    { key: "profit", label: t.dashboard.profitTrend, data: profitLossHref },
  ];

  // The sparkline under each KPI. `trend` is oldest-first, so these read
  // left-to-right the way the chart below them does.
  const incomeSeries = points.map((point) => point.income);
  const expenseSeries = points.map((point) => point.expense);

  /**
   * The four one-tap ranges, each carrying the dates it resolves to.
   *
   * Resolved on the server against Dhaka's today, so the link is an ordinary
   * dated URL — a preset and a hand-typed range are indistinguishable by the
   * time anything reads them, and "গত মাস" stays meaningful when it is opened
   * next week.
   */
  const presetLabel: Record<(typeof PRESET_RANGES)[number], string> = {
    thisMonth: t.dashboard.thisMonth,
    lastMonth: t.dashboard.rangeLastMonth,
    threeMonths: t.dashboard.rangeThreeMonths,
    thisYear: t.dashboard.rangeThisYear,
  };
  const periodChoices: PeriodChoice[] = PRESET_RANGES.map((preset) => {
    const resolved = presetRange(preset);
    return {
      key: preset,
      label: presetLabel[preset],
      href: `/dashboard?from=${resolved.from}&to=${resolved.to}` as Route,
      active: resolved.from === period.from && resolved.to === period.to,
    };
  });

  /**
   * Where the money is, as shares of one whole.
   *
   * The percentages are worked out here, from the bigints, because the bar is
   * a client component and money does not cross that boundary. It receives a
   * width and an already-formatted caption; it never divides an amount.
   */
  const walletParts = [
    { key: "cash", label: t.dashboard.cash, value: tiles.cash, tone: "bg-primary", href: "/reports/cash-book?kind=cash" as Route },
    { key: "bank", label: t.dashboard.bank, value: tiles.bank, tone: "bg-info", href: "/reports/cash-book?kind=bank" as Route },
    { key: "mfs", label: t.dashboard.mfs, value: tiles.mfs, tone: "bg-accent", href: "/reports/cash-book?kind=mfs" as Route },
    { key: "stock", label: t.dashboard.stockValue, value: tiles.stockValue, tone: "bg-credit", href: "/reports/stock" as Route },
  ];
  // A negative balance cannot take up width. An overdrawn wallet is a data
  // problem the alerts already raise; it must not invert the bar.
  const walletTotal = walletParts.reduce(
    (sum, part) => sum + (part.value > 0n ? part.value : 0n),
    0n,
  );
  const walletSegments: BarSegment[] = walletParts.map((part) => {
    // Integer arithmetic on the bigints, then one division for the width.
    const percent =
      walletTotal > 0n && part.value > 0n
        ? Number((part.value * 1000n) / walletTotal) / 10
        : 0;
    return {
      key: part.key,
      label: part.label,
      formatted: formatMoney(part.value, { decimals: 0, symbol: false }),
      percent,
      // Worded here, not in the bar: `shareOfTotal` is a function, and a
      // function cannot be handed to a client component.
      share: t.dashboard.shareOfTotal(String(Math.round(percent))),
      tone: part.tone,
      href: part.href,
    };
  });

  /**
   * What is owed to the shop against what the shop owes.
   *
   * Two figures on their own invite the reader to do this subtraction in their
   * head and get it wrong; stating it is one line and it is the number that
   * actually describes the position.
   */
  // `subMoney`, not `a - b`: subtracting two `Money` values yields a plain
  // bigint and loses the brand, which is a type error at the next call rather
  // than a wrong number — and this is the call.
  const netDue = subMoney(tiles.customerDue, tiles.vendorPayable);
  const netNote =
    netDue > 0n
      ? t.dashboard.netOwedToYou(formatMoney(netDue, { decimals: 0 }))
      : netDue < 0n
        ? t.dashboard.netYouOwe(formatMoney(negMoney(netDue), { decimals: 0 }))
        : t.dashboard.netSettled;

  const alerts = [
    ...lowStock.map((product) => ({
      key: `stock-${product.id}`,
      tone: "due" as const,
      href: "/inventory?lowOnly=1" as Route,
      text: t.dashboard.lowStockAlert(
        product.nameBn,
        formatQty(qtyFromDb(product.quantity ?? "0"), { unit: product.unitSymbol }),
        formatQty(qtyFromDb(product.minStockLevel), { unit: product.unitSymbol }),
      ),
    })),
    ...(tiles.customerDue > 0n
      ? [
          {
            key: "due",
            tone: "debit" as const,
            href: "/reports/dues?side=receivable" as Route,
            text: t.dashboard.customersOwing(String(topDueCustomers.length)),
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-6">
      <div
        className="rise flex flex-wrap items-end justify-between gap-4"
        style={{ "--rise-delay": "0ms" } as CSSProperties}
      >
        <div className="max-w-2xl">
          <p className="mb-1.5 flex items-center gap-2 text-xs font-semibold text-primary-ink">
            <span className="h-px w-6 bg-primary/50" aria-hidden />
            HishabAI
          </p>
          <h1 className="text-3xl font-bold tracking-tight">{t.nav.dashboard}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t.shell.motto}</p>
        </div>

        <div className="flex flex-wrap items-end gap-2 no-print">
          <PrintButton />
          <Button asChild size="sm">
            <Link href="/entry">
              <PlusCircle className="size-4" aria-hidden />
              {t.nav.newEntry}
            </Link>
          </Button>
        </div>
      </div>

      {/*
        The range every figure on this page is measured over.

        Chips for the four periods a shop actually asks for, and the two date
        inputs beside them for everything else. Both put the dates in the URL,
        so the chosen period survives a reload, can be bookmarked and sent, and
        the deltas below always say what they are measured against.
      */}
      <div
        className="rise flex flex-wrap items-end justify-between gap-4 rounded-xl border border-border bg-surface/90 px-4 py-3.5 shadow-card backdrop-blur no-print"
        style={{ "--rise-delay": "60ms" } as CSSProperties}
      >
        <PeriodChips choices={periodChoices} label={t.dashboard.rangeHeading} />

        <form className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            {t.dashboard.periodFrom}
            <input
              type="date"
              name="from"
              defaultValue={period.from}
              className="h-9 rounded-md border border-border-strong bg-surface px-2 text-sm text-foreground shadow-control transition-colors duration-150 hover:border-subtle-foreground focus-visible:border-primary focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            {t.dashboard.periodTo}
            <input
              type="date"
              name="to"
              defaultValue={period.to}
              className="h-9 rounded-md border border-border-strong bg-surface px-2 text-sm text-foreground shadow-control transition-colors duration-150 hover:border-subtle-foreground focus-visible:border-primary focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
            />
          </label>
          <Button type="submit" variant="secondary" size="sm">
            {t.dashboard.applyRange}
          </Button>
        </form>
      </div>

      {/*
        Four figures, then one answer. This was nine tiles in three rows of
        three, every number the same size: a wall with no hierarchy and nothing
        to look at first. The four here are what a shop checks in passing; the
        hero below is the question they were all circling.
      */}
      <section aria-labelledby="figures-heading">
        <h2 id="figures-heading" className="sr-only">
          {t.dashboard.figuresHeading}
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            index={0}
            label={t.dashboard.monthIncome}
            taka={toTaka(tiles.monthIncome)}
            tone="credit"
            icon={TrendingUp}
            href={monthReport}
            delta={deltaOf(tiles.monthIncome, previous.income)}
            series={incomeSeries}
            sparkId="income"
            t={t}
          />
          <KpiCard
            index={1}
            label={t.dashboard.monthExpense}
            taka={toTaka(tiles.monthExpense)}
            tone="debit"
            icon={TrendingDown}
            href={monthReport}
            // Spending less is the good direction, so this goes green when it
            // falls. Painting a cost increase green because the arrow points
            // up would say the opposite of what happened.
            delta={deltaOf(tiles.monthExpense, previous.expense, { higherIsBetter: false })}
            series={expenseSeries}
            sparkId="expense"
            t={t}
          />
          {/*
            No sparkline and no delta on these two. They are positions, not
            flows: the payload carries no history for them, and "12% more due
            than last month" invites a conclusion the number does not support.

            The net line belongs to the *pair*, so it is stated once, under the
            second of them. On both it read as two findings that happened to
            use identical words.
          */}
          <KpiCard
            index={2}
            label={t.dashboard.customerDue}
            taka={toTaka(tiles.customerDue)}
            tone="due"
            icon={Users}
            href="/reports/dues?side=receivable"
            t={t}
          />
          <KpiCard
            index={3}
            label={t.dashboard.vendorPayable}
            taka={toTaka(tiles.vendorPayable)}
            tone="due"
            icon={ReceiptText}
            href="/reports/dues?side=payable"
            note={netNote}
            t={t}
          />
        </div>
      </section>

      {/* ---- the answer, and how it got there ---- */}
      <div className="grid gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          {points.length > 0 ? (
            <HeroMetric
              label={t.dashboard.netProfit}
              taka={toTaka(tiles.netProfit)}
              delta={deltaOf(tiles.netProfit, previous.netProfit)}
              caption={t.dashboard.vsPrevious}
              href={monthReport}
              t={t}
              chart={
                <ChartDeck
                  tabs={deckTabs}
                  monthsLabel={t.dashboard.lastSixMonths}
                  monthNames={t.monthsShort}
                  emptyState={
                    <EmptyState
                      title={t.emptyStates.noTransactions}
                      hint={t.emptyStates.noTransactionsHint}
                    />
                  }
                  singleMonthState={<EmptyState title={t.dashboard.oneMonthOnly} />}
                />
              }
              footer={
                <>
                  <h3 className="mb-2.5 text-sm font-medium text-muted-foreground">
                    {t.dashboard.balancesHeading}
                  </h3>
                  {/* Where the money actually is. Four tiles answered "how
                      much is in the bank" and hid the proportion; pointing at
                      any part of this isolates it and states its share. */}
                  <MoneyBar
                    segments={walletSegments}
                    emptyLabel={t.dashboard.noBalances}
                  />
                </>
              }
            />
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>{t.dashboard.netProfit}</CardTitle>
              </CardHeader>
              <EmptyState
                icon={ReceiptText}
                title={t.emptyStates.noTransactions}
                hint={t.emptyStates.noTransactionsHint}
                action={
                  <Button asChild size="sm">
                    <Link href="/entry">{t.nav.newEntry}</Link>
                  </Button>
                }
              />
            </Card>
          )}
        </div>

        <div className="space-y-4">
          {/* ---- R5.4: who has gone quiet, derived this morning ---- */}
          <Suspense fallback={<AlertsSkeleton title={t.activity.dailyTitle} />}>
            <DailyAlerts />
          </Suspense>

          {/* ---- alerts ---- */}
          <Card className="rise" style={{ "--rise-delay": "420ms" } as CSSProperties}>
            <CardHeader>
              <CardTitle>{t.dashboard.alerts}</CardTitle>
            </CardHeader>
            {alerts.length === 0 ? (
              <EmptyState title={t.emptyStates.noAlerts} />
            ) : (
              <ul className="divide-y divide-border">
                {alerts.slice(0, 6).map((alert) => (
                  <li key={alert.key} className="text-sm">
                    <Link
                      href={alert.href}
                      className="flex items-start gap-2.5 px-4 py-3 transition-colors duration-150 hover:bg-surface-sunken"
                    >
                      <AlertTriangle
                        className={
                          alert.tone === "debit"
                            ? "mt-0.5 size-4 shrink-0 text-debit"
                            : "mt-0.5 size-4 shrink-0 text-due"
                        }
                        aria-hidden
                      />
                      <span>{alert.text}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* ---- customers who owe ---- */}
          <Card className="rise" style={{ "--rise-delay": "500ms" } as CSSProperties}>
            <CardHeader>
              <CardTitle>{t.dashboard.dueCustomers}</CardTitle>
              <Link href="/customers" className="text-sm text-primary-ink hover:underline">
                {t.actions.viewAll}
              </Link>
            </CardHeader>
            {topDueCustomers.length === 0 ? (
              <EmptyState title={t.emptyStates.noDues} />
            ) : (
              <ul className="divide-y divide-border">
                {topDueCustomers.map((customer) => (
                  <li key={customer.id}>
                    <Link
                      href={`/customers/${customer.id}`}
                      className="flex items-center justify-between gap-3 px-4 py-2.5 transition-colors duration-150 hover:bg-surface-sunken"
                    >
                      <span className="min-w-0 truncate text-sm">{customer.name}</span>
                      <MoneyText
                        value={customer.receivable}
                        size="sm"
                        tone="due"
                        symbol={false}
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      {/* ----------------------------------------------------------------
          Recent entries.

          Full width now, rather than two thirds of a row shared with the
          alerts. It is a nine-column ledger: the space it was given decided
          how much of it could be read without scrolling sideways, and the
          alerts beside it are three short lines that never needed a third of
          the page.
          ---------------------------------------------------------------- */}
      <Card className="rise" style={{ "--rise-delay": "560ms" } as CSSProperties}>
        <CardHeader>
          <CardTitle>{t.dashboard.recentTransactions}</CardTitle>
          <Link href="/transactions" className="text-sm text-primary-ink hover:underline">
            {t.actions.viewAll}
          </Link>
        </CardHeader>

        {recent.length === 0 ? (
          <EmptyState
            icon={ReceiptText}
            title={t.emptyStates.noTransactions}
            hint={t.emptyStates.noTransactionsHint}
            action={
              <Button asChild size="sm">
                <Link href="/entry">{t.nav.newEntry}</Link>
              </Button>
            }
          />
        ) : (
          <>
            <div className="hidden md:block">
              <TableScroll>
                <THead>
                  <TR>
                    <TH>{t.fields.date}</TH>
                    <TH>{t.fields.voucherNo}</TH>
                    <TH>{t.fields.type}</TH>
                    <TH>{t.fields.party}</TH>
                    <TH numeric>{t.fields.grandTotal}</TH>
                    <TH numeric>{t.fields.dueAmount}</TH>
                  </TR>
                </THead>
                <tbody>
                  {recent.map((row) => (
                    <TR key={row.id}>
                      <TD className="whitespace-nowrap text-muted-foreground">
                        {formatDateShort(row.date)}
                      </TD>
                      <TD className="whitespace-nowrap">
                        <Link
                          href={`/transactions/${row.id}`}
                          className="num text-primary-ink hover:underline"
                        >
                          {row.voucherNo}
                        </Link>
                      </TD>
                      <TD>
                        <Badge tone={TYPE_TONE[row.type] ?? "neutral"}>
                          {t.transactionType[row.type]}
                        </Badge>
                        {row.status === "cancelled" ? (
                          <Badge tone="neutral" className="ml-1">
                            {t.transactionStatus.cancelled}
                          </Badge>
                        ) : null}
                      </TD>
                      <TD className="max-w-[14rem] truncate">{row.partyName ?? "—"}</TD>
                      <TD numeric>
                        <MoneyText value={moneyFromDb(row.total)} size="sm" symbol={false} />
                      </TD>
                      <TD numeric>
                        <MoneyText
                          value={moneyFromDb(row.dueAmount)}
                          size="sm"
                          symbol={false}
                          tone={moneyFromDb(row.dueAmount) > 0n ? "due" : "neutral"}
                        />
                      </TD>
                    </TR>
                  ))}
                </tbody>
              </TableScroll>
            </div>

            <MobileCards>
              {recent.map((row) => (
                <MobileRow
                  key={row.id}
                  href={`/transactions/${row.id}`}
                  title={row.partyName ?? t.transactionType[row.type]}
                  subtitle={`${row.voucherNo} · ${formatDateShort(row.date)}`}
                  meta={
                    <Badge tone={TYPE_TONE[row.type] ?? "neutral"}>
                      {t.transactionType[row.type]}
                    </Badge>
                  }
                  right={
                    <>
                      <MoneyText value={moneyFromDb(row.total)} size="sm" />
                      {moneyFromDb(row.dueAmount) > 0n ? (
                        <p className="mt-0.5 text-xs text-due">
                          {t.fields.dueAmount}{" "}
                          <MoneyText
                            value={moneyFromDb(row.dueAmount)}
                            size="sm"
                            tone="due"
                            symbol={false}
                          />
                        </p>
                      ) : null}
                    </>
                  }
                />
              ))}
            </MobileCards>
          </>
        )}
      </Card>
    </div>
  );
}

/** Reserved height, so the column below does not jump when the block lands. */
function AlertsSkeleton({ title }: { title: string }) {
  return (
    <Card aria-busy="true">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardBody className="space-y-2.5">
        <div className="h-4 w-3/4 animate-pulse rounded bg-surface-sunken" />
        <div className="h-4 w-1/2 animate-pulse rounded bg-surface-sunken" />
      </CardBody>
    </Card>
  );
}
