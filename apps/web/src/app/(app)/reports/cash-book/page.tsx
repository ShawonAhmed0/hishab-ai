import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight, Banknote, Wallet } from "lucide-react";
import { getCashBook } from "@hishabai/core";
import type { FinancialAccountKind } from "@hishabai/shared";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, EmptyState } from "@/components/ui/card";
import { MoneyText } from "@/components/ui/money";
import { StatTile } from "@/components/ui/stat-tile";
import { MobileCards, MobileRow, TD, TH, THead, TR, TableScroll } from "@/components/ui/table";
import { ReportFrame, periodFrom, reportInputClass } from "@/components/reports/report-frame";
import { dict } from "@/lib/locale.server";
import { sessionWithData } from "@/lib/session";
import { formatDate, formatDateShort } from "@/lib/utils";

export async function generateMetadata() {
  return { title: (await dict()).reports.cashBook };
}

const UUID = /^[0-9a-f-]{36}$/i;

export default async function CashBookPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; wallet?: string }>;
}) {
  const params = await searchParams;
  const period = periodFrom(params);
  const wallet = params.wallet && UUID.test(params.wallet) ? params.wallet : undefined;

  const [{ data }, t] = await Promise.all([
    sessionWithData((scope) =>
      getCashBook(scope, { ...period, ...(wallet ? { financialAccountId: wallet } : {}) }),
    ),
    dict(),
  ]);

  return (
    <ReportFrame
      title={t.reports.cashBook}
      description={t.reports.cashBookDescription}
      period={period}
      filters={
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium">{t.fields.paymentMethod}</span>
          <select
            name="wallet"
            defaultValue={wallet ?? ""}
            className={`${reportInputClass} cursor-pointer`}
          >
            <option value="">{t.reports.allMethods}</option>
            {data.wallets.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </label>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label={t.fields.openingBalance}
          value={data.opening}
          icon={Wallet}
          footnote={t.reports.openingBefore(formatDate(period.from, t))}
        />
        <StatTile
          label={t.reports.totalIn}
          value={data.totals.received}
          tone="credit"
          icon={ArrowDownLeft}
        />
        <StatTile
          label={t.reports.totalOut}
          value={data.totals.paid}
          tone="debit"
          icon={ArrowUpRight}
        />
        <StatTile
          label={t.reports.closingBalance}
          value={data.closing}
          tone="auto"
          icon={Banknote}
          footnote={t.reports.closingFormula}
        />
      </div>

      {/* Each wallet's own running total, which the trigger maintains from the
          very lines listed below — the two have to agree. */}
      {!wallet && data.wallets.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{t.reports.currentBalance}</CardTitle>
          </CardHeader>
          <div className="flex flex-wrap gap-x-6 gap-y-2 px-4 pb-4">
            {data.wallets.map((w) => (
              <span key={w.id} className="flex items-center gap-2 text-sm">
                <Badge tone="neutral">
                  {t.financialAccountKind[w.kind as FinancialAccountKind]}
                </Badge>
                {w.name}
                <MoneyText value={w.balance} size="sm" tone="auto" className="font-medium" />
              </span>
            ))}
          </div>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{t.reports.entryCount(String(data.entries.length))}</CardTitle>
        </CardHeader>

        {data.entries.length === 0 ? (
          <EmptyState
            title={t.reports.noCashMovement}
            hint={t.reports.noCashMovementHint}
          />
        ) : (
          <>
            <div className="hidden md:block">
              <TableScroll>
                <THead>
                  <TR>
                    <TH>{t.fields.date}</TH>
                    <TH>{t.fields.voucherNo}</TH>
                    <TH>{t.fields.paymentMethod}</TH>
                    <TH>{t.fields.description}</TH>
                    <TH numeric>{t.reports.inColumn}</TH>
                    <TH numeric>{t.reports.outColumn}</TH>
                    <TH numeric>{t.reports.balanceColumn}</TH>
                  </TR>
                </THead>
                <tbody>
                  <TR className="bg-surface-sunken">
                    <TD colSpan={6} className="font-medium text-muted-foreground">
                      {t.fields.openingBalance}
                    </TD>
                    <TD numeric>
                      <MoneyText value={data.opening} size="sm" symbol={false} tone="auto" />
                    </TD>
                  </TR>
                  {data.entries.map((entry) => (
                    <TR key={entry.id}>
                      <TD className="whitespace-nowrap text-muted-foreground">
                        {formatDateShort(entry.date)}
                      </TD>
                      <TD>
                        {entry.transactionId ? (
                          <Link
                            href={`/transactions/${entry.transactionId}`}
                            className="num text-primary hover:underline"
                          >
                            {entry.voucherNo}
                          </Link>
                        ) : (
                          <span className="num">{entry.voucherNo ?? "—"}</span>
                        )}
                      </TD>
                      <TD className="text-muted-foreground">{entry.accountName}</TD>
                      <TD className="max-w-[16rem] truncate text-muted-foreground">
                        {entry.narration ??
                          (entry.transactionType
                            ? t.transactionType[entry.transactionType]
                            : "—")}
                      </TD>
                      <TD numeric>
                        {entry.received > 0n ? (
                          <MoneyText value={entry.received} size="sm" symbol={false} tone="credit" />
                        ) : (
                          <span className="text-subtle-foreground">—</span>
                        )}
                      </TD>
                      <TD numeric>
                        {entry.paid > 0n ? (
                          <MoneyText value={entry.paid} size="sm" symbol={false} tone="debit" />
                        ) : (
                          <span className="text-subtle-foreground">—</span>
                        )}
                      </TD>
                      <TD numeric className="font-medium">
                        <MoneyText value={entry.balance} size="sm" symbol={false} tone="auto" />
                      </TD>
                    </TR>
                  ))}
                </tbody>
                <tfoot>
                  <TR className="border-t-2 border-border-strong bg-surface-sunken">
                    <TD colSpan={4} className="font-semibold">
                      {t.reports.closingBalance}
                    </TD>
                    <TD numeric>
                      <MoneyText
                        value={data.totals.received}
                        size="sm"
                        symbol={false}
                        tone="credit"
                        className="font-semibold"
                      />
                    </TD>
                    <TD numeric>
                      <MoneyText
                        value={data.totals.paid}
                        size="sm"
                        symbol={false}
                        tone="debit"
                        className="font-semibold"
                      />
                    </TD>
                    <TD numeric>
                      <MoneyText
                        value={data.closing}
                        size="sm"
                        symbol={false}
                        tone="auto"
                        className="font-bold"
                      />
                    </TD>
                  </TR>
                </tfoot>
              </TableScroll>
            </div>

            <MobileCards>
              {data.entries.map((entry) => {
                const isIn = entry.received > 0n;
                return (
                  <MobileRow
                    key={entry.id}
                    {...(entry.transactionId
                      ? { href: `/transactions/${entry.transactionId}` as const }
                      : {})}
                    title={
                      entry.transactionType
                        ? t.transactionType[entry.transactionType]
                        : (entry.narration ?? t.reports.entry)
                    }
                    subtitle={`${formatDateShort(entry.date)} · ${entry.accountName}`}
                    right={
                      <>
                        <MoneyText
                          value={isIn ? entry.received : entry.paid}
                          size="sm"
                          tone={isIn ? "credit" : "debit"}
                        />
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {t.reports.balanceColumn}{" "}
                          <MoneyText value={entry.balance} size="sm" symbol={false} tone="auto" />
                        </p>
                      </>
                    }
                  />
                );
              })}
            </MobileCards>
          </>
        )}
      </Card>
    </ReportFrame>
  );
}
