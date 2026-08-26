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
import { dailyAlertsFrom, getCustomerHealth, getDashboard } from "@hishabai/core";
import { currentMonthRange, deltaOf, formatQty, moneyFromDb, qtyFromDb } from "@hishabai/shared";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader, CardTitle, EmptyState } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MoneyText } from "@/components/ui/money";
import { StatTile } from "@/components/ui/stat-tile";
import { MobileCards, MobileRow, TD, TH, THead, TR, TableScroll } from "@/components/ui/table";
import {
  IncomeVsExpenseChart,
  SalesTrendChart,
  type ChartPoint,
} from "@/components/charts/trend-charts";
import { DailyAlertBlock } from "@/components/customers/health";
import { HeroMetric } from "@/components/dashboard/hero-metric";
import { SegmentedTotal } from "@/components/dashboard/segmented-total";
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

  // The two charts answer different questions, so a click on each lands
  // somewhere different: আয় বনাম ব্যয় on that month's লাভ-ক্ষতি, বিক্রয় on that
  // month's বিক্রয় রেজিস্টার.
  const flowData: ChartPoint[] = points.map((p) => ({
    ...p,
    href: `/reports/profit-loss?from=${p.bounds.from}&to=${p.bounds.to}` as Route,
  }));
  const salesData: ChartPoint[] = points.map((p) => ({
    ...p,
    href: `/reports/register?type=sale&from=${p.bounds.from}&to=${p.bounds.to}` as Route,
  }));

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

  /** The month chips under each chart — the drill-down, reachable by keyboard. */
  const monthLinks = (data: ChartPoint[]) => (
    <nav className="mt-3 flex flex-wrap gap-1.5 px-1" aria-label={t.dashboard.lastSixMonths}>
      {data.map((point) => (
        <Link
          key={point.period}
          href={point.href}
          className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors duration-150 hover:border-border-strong hover:text-foreground"
        >
          {t.monthsShort[Number(point.period.slice(5, 7)) - 1]}
        </Link>
      ))}
    </nav>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t.nav.dashboard}</h1>
          <p className="text-sm text-muted-foreground">{t.shell.motto}</p>
        </div>

        {/*
          The range every figure on this page is measured over. A GET form, so
          the chosen period is in the URL: it survives a reload, it can be
          bookmarked, and the deltas below it always say what they are against.
        */}
        <form className="flex flex-wrap items-end gap-2 no-print">
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            {t.dashboard.periodFrom}
            <input
              type="date"
              name="from"
              defaultValue={period.from}
              className="h-9 rounded-md border border-border-strong bg-surface px-2 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            {t.dashboard.periodTo}
            <input
              type="date"
              name="to"
              defaultValue={period.to}
              className="h-9 rounded-md border border-border-strong bg-surface px-2 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
            />
          </label>
          <Button type="submit" variant="secondary" size="sm">
            {t.dashboard.applyRange}
          </Button>
          {/* Printing is how this app makes a PDF — same route the statements
              take, rather than a second layout that could disagree. */}
          <PrintButton />
          <Button asChild size="sm" className="no-print">
            <Link href="/entry">
              <PlusCircle className="size-4" aria-hidden />
              {t.nav.newEntry}
            </Link>
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
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile
            label={t.dashboard.monthIncome}
            value={tiles.monthIncome}
            tone="credit"
            icon={TrendingUp}
            href={monthReport}
            delta={deltaOf(tiles.monthIncome, previous.income)}
            t={t}
          />
          <StatTile
            label={t.dashboard.monthExpense}
            value={tiles.monthExpense}
            tone="debit"
            icon={TrendingDown}
            href={monthReport}
            // Spending less is the good direction, so this goes green when it
            // falls. Painting a cost increase green because the arrow points
            // up would say the opposite of what happened.
            delta={deltaOf(tiles.monthExpense, previous.expense, { higherIsBetter: false })}
            t={t}
          />
          <StatTile
            label={t.dashboard.customerDue}
            value={tiles.customerDue}
            tone="due"
            icon={Users}
            href="/reports/dues?side=receivable"
          />
          <StatTile
            label={t.dashboard.vendorPayable}
            value={tiles.vendorPayable}
            tone="due"
            icon={ReceiptText}
            href="/reports/dues?side=payable"
          />
        </div>
      </section>

      {/* ---- the answer, and how it got there ---- */}
      <div className="grid gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          {flowData.length > 0 ? (
            <HeroMetric
              label={t.dashboard.netProfit}
              value={tiles.netProfit}
              delta={deltaOf(tiles.netProfit, previous.netProfit)}
              caption={t.dashboard.vsPrevious}
              href={monthReport}
              t={t}
              chart={<IncomeVsExpenseChart data={flowData} />}
              footer={
                <>
                  <h3 className="mb-2.5 text-sm font-medium text-muted-foreground">
                    {t.dashboard.balancesHeading}
                  </h3>
                  {/* Where the money actually is. Three tiles answered "how
                      much is in the bank" and hid the proportion. */}
                  <SegmentedTotal
                    emptyLabel={t.dashboard.noBalances}
                    // Stock belongs here with the wallets: for a trader, money
                    // in the godown is money, and separating it invited the
                    // reader to forget it. Four places it can be, one bar.
                    segments={[
                      { key: "cash", label: t.dashboard.cash, value: tiles.cash, tone: "bg-primary", href: "/reports/cash-book?kind=cash" },
                      { key: "bank", label: t.dashboard.bank, value: tiles.bank, tone: "bg-info", href: "/reports/cash-book?kind=bank" },
                      { key: "mfs", label: t.dashboard.mfs, value: tiles.mfs, tone: "bg-accent", href: "/reports/cash-book?kind=mfs" },
                      { key: "stock", label: t.dashboard.stockValue, value: tiles.stockValue, tone: "bg-credit", href: "/reports/stock" },
                    ]}
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

        <Card>
          <CardHeader>
            <CardTitle>{t.dashboard.salesTrend}</CardTitle>
            <Link
              href={`/reports/register?type=sale&from=${period.from}&to=${period.to}` as Route}
              className="text-sm text-primary hover:underline"
            >
              {t.actions.viewAll}
            </Link>
          </CardHeader>
          <CardBody>
            {/*
              An area chart needs two points to draw a line between. With a
              single month it renders an empty plot frame, a legend and one
              dot, which looks like a broken chart rather than a young shop.
              Say what is missing instead.
            */}
            {salesData.length > 1 ? (
              <>
                <SalesTrendChart data={salesData} />
                {monthLinks(salesData)}
              </>
            ) : salesData.length === 1 ? (
              <EmptyState title={t.dashboard.oneMonthOnly} />
            ) : (
              <EmptyState
                title={t.emptyStates.noTransactions}
                hint={t.emptyStates.noTransactionsHint}
              />
            )}
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        {/* ---- recent transactions ---- */}
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>{t.dashboard.recentTransactions}</CardTitle>
            <Link href="/transactions" className="text-sm text-primary hover:underline">
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
                        <TD>
                          <Link
                            href={`/transactions/${row.id}`}
                            className="num text-primary hover:underline"
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
                        <TD className="max-w-[12rem] truncate">{row.partyName ?? "—"}</TD>
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

        <div className="space-y-4">
          {/* ---- R5.4: who has gone quiet, derived this morning ---- */}
          <Suspense fallback={<AlertsSkeleton title={t.activity.dailyTitle} />}>
            <DailyAlerts />
          </Suspense>

          {/* ---- alerts ---- */}
          <Card>
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
          <Card>
            <CardHeader>
              <CardTitle>{t.dashboard.dueCustomers}</CardTitle>
              <Link href="/customers" className="text-sm text-primary hover:underline">
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
