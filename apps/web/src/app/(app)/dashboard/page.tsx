import Link from "next/link";
import {
  AlertTriangle,
  Banknote,
  Building,
  Boxes,
  Smartphone,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
  PlusCircle,
  ReceiptText,
} from "lucide-react";
import { getDashboard } from "@hishabai/core";
import { bn, formatQty, moneyFromDb, qtyFromDb } from "@hishabai/shared";
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
import { requireSession } from "@/lib/session";
import { formatDateShort } from "@/lib/utils";

export const metadata = { title: bn.nav.dashboard };

const TYPE_TONE: Record<string, "credit" | "debit" | "info" | "neutral"> = {
  sale: "credit",
  income: "credit",
  customer_payment: "credit",
  purchase: "debit",
  expense: "debit",
  vendor_payment: "debit",
};

export default async function DashboardPage() {
  const session = await requireSession();
  // One round trip for the whole page — tiles, charts, lists and alerts.
  const { tiles, trend, recent, topDueCustomers, lowStock } = await getDashboard(session);

  // Money is a bigint and cannot cross to a client component. Charts get plain
  // taka — exact figures are rendered from the real values in the tiles and
  // tables below.
  const toTaka = (value: bigint) => Number(value) / 10_000;
  const chartData: ChartPoint[] = trend.map((point) => ({
    period: point.period,
    income: toTaka(point.income),
    expense: toTaka(point.expense),
    sales: toTaka(point.sales),
    profit: toTaka(point.profit),
  }));

  const alerts = [
    ...lowStock.map((product) => ({
      key: `stock-${product.id}`,
      tone: "due" as const,
      text: `${product.nameBn} — স্টক ${formatQty(qtyFromDb(product.quantity ?? "0"), {
        unit: product.unitSymbol,
      })}, সর্বনিম্ন ${formatQty(qtyFromDb(product.minStockLevel), { unit: product.unitSymbol })}`,
    })),
    ...(tiles.customerDue > 0n
      ? [
          {
            key: "due",
            tone: "debit" as const,
            text: `কাস্টমারদের কাছে মোট ${topDueCustomers.length} জনের বকেয়া আছে`,
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{bn.nav.dashboard}</h1>
          <p className="text-sm text-muted-foreground">
            একবার লিখুন — বাকিটা HishabAI করবে
          </p>
        </div>
        <Button asChild>
          <Link href="/entry">
            <PlusCircle className="size-4" aria-hidden />
            {bn.nav.newEntry}
          </Link>
        </Button>
      </div>

      {/* ---- money on hand ---- */}
      <section aria-labelledby="balances-heading">
        <h2 id="balances-heading" className="sr-only">
          ব্যালেন্স
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <StatTile label={bn.dashboard.cash} value={tiles.cash} icon={Wallet} />
          <StatTile label={bn.dashboard.bank} value={tiles.bank} icon={Building} />
          <StatTile label={bn.dashboard.mfs} value={tiles.mfs} icon={Smartphone} />
        </div>
      </section>

      {/* ---- this month ---- */}
      <section aria-labelledby="month-heading">
        <h2 id="month-heading" className="sr-only">
          চলতি মাস
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <StatTile
            label={bn.dashboard.monthIncome}
            value={tiles.monthIncome}
            tone="credit"
            icon={TrendingUp}
          />
          <StatTile
            label={bn.dashboard.monthExpense}
            value={tiles.monthExpense}
            tone="debit"
            icon={TrendingDown}
          />
          <StatTile
            label={bn.dashboard.netProfit}
            value={tiles.netProfit}
            tone="auto"
            icon={Banknote}
          />
        </div>
      </section>

      {/* ---- what is owed ---- */}
      <section aria-labelledby="dues-heading">
        <h2 id="dues-heading" className="sr-only">
          বকেয়া ও স্টক
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <StatTile
            label={bn.dashboard.customerDue}
            value={tiles.customerDue}
            tone="due"
            icon={Users}
            href="/customers"
          />
          <StatTile
            label={bn.dashboard.vendorPayable}
            value={tiles.vendorPayable}
            tone="due"
            icon={ReceiptText}
            href="/vendors"
          />
          <StatTile
            label={bn.dashboard.stockValue}
            value={tiles.stockValue}
            icon={Boxes}
            href="/inventory"
          />
        </div>
      </section>

      {/* ---- charts ---- */}
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{bn.dashboard.incomeVsExpense}</CardTitle>
            <span className="text-xs text-muted-foreground">গত ৬ মাস</span>
          </CardHeader>
          <CardBody>
            {chartData.length > 0 ? (
              <IncomeVsExpenseChart data={chartData} />
            ) : (
              <EmptyState
                title={bn.emptyStates.noTransactions}
                hint={bn.emptyStates.noTransactionsHint}
              />
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{bn.dashboard.salesTrend}</CardTitle>
            <span className="text-xs text-muted-foreground">গত ৬ মাস</span>
          </CardHeader>
          <CardBody>
            {chartData.length > 0 ? (
              <SalesTrendChart data={chartData} />
            ) : (
              <EmptyState
                title={bn.emptyStates.noTransactions}
                hint={bn.emptyStates.noTransactionsHint}
              />
            )}
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        {/* ---- recent transactions ---- */}
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>{bn.dashboard.recentTransactions}</CardTitle>
            <Link href="/transactions" className="text-sm text-primary hover:underline">
              {bn.actions.viewAll}
            </Link>
          </CardHeader>

          {recent.length === 0 ? (
            <EmptyState
              icon={ReceiptText}
              title={bn.emptyStates.noTransactions}
              hint={bn.emptyStates.noTransactionsHint}
              action={
                <Button asChild size="sm">
                  <Link href="/entry">{bn.nav.newEntry}</Link>
                </Button>
              }
            />
          ) : (
            <>
              <div className="hidden md:block">
                <TableScroll>
                  <THead>
                    <TR>
                      <TH>{bn.fields.date}</TH>
                      <TH>{bn.fields.voucherNo}</TH>
                      <TH>{bn.fields.type}</TH>
                      <TH>{bn.fields.party}</TH>
                      <TH numeric>{bn.fields.grandTotal}</TH>
                      <TH numeric>{bn.fields.dueAmount}</TH>
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
                            {bn.transactionType[row.type]}
                          </Badge>
                          {row.status === "cancelled" ? (
                            <Badge tone="neutral" className="ml-1">
                              {bn.transactionStatus.cancelled}
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
                    title={row.partyName ?? bn.transactionType[row.type]}
                    subtitle={`${row.voucherNo} · ${formatDateShort(row.date)}`}
                    meta={
                      <Badge tone={TYPE_TONE[row.type] ?? "neutral"}>
                        {bn.transactionType[row.type]}
                      </Badge>
                    }
                    right={
                      <>
                        <MoneyText value={moneyFromDb(row.total)} size="sm" />
                        {moneyFromDb(row.dueAmount) > 0n ? (
                          <p className="mt-0.5 text-xs text-due">
                            বকেয়া{" "}
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
          {/* ---- alerts ---- */}
          <Card>
            <CardHeader>
              <CardTitle>{bn.dashboard.alerts}</CardTitle>
            </CardHeader>
            {alerts.length === 0 ? (
              <EmptyState title={bn.emptyStates.noAlerts} />
            ) : (
              <ul className="divide-y divide-border">
                {alerts.slice(0, 6).map((alert) => (
                  <li key={alert.key} className="flex items-start gap-2.5 px-4 py-3 text-sm">
                    <AlertTriangle
                      className={alert.tone === "debit" ? "mt-0.5 size-4 shrink-0 text-debit" : "mt-0.5 size-4 shrink-0 text-due"}
                      aria-hidden
                    />
                    <span>{alert.text}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* ---- customers who owe ---- */}
          <Card>
            <CardHeader>
              <CardTitle>{bn.dashboard.dueCustomers}</CardTitle>
              <Link href="/customers" className="text-sm text-primary hover:underline">
                {bn.actions.viewAll}
              </Link>
            </CardHeader>
            {topDueCustomers.length === 0 ? (
              <EmptyState title="কারও বকেয়া নেই" />
            ) : (
              <ul className="divide-y divide-border">
                {topDueCustomers.map((customer) => (
                  <li
                    key={customer.id}
                    className="flex items-center justify-between gap-3 px-4 py-2.5"
                  >
                    <span className="min-w-0 truncate text-sm">{customer.name}</span>
                    <MoneyText value={customer.receivable} size="sm" tone="due" symbol={false} />
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
